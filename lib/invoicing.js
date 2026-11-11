/**
 * lib/invoicing.js - invoices and credit notes for paid orders, behind one interface with interchangeable adapters.
 *
 * Which adapter runs is the accountant's decision (T13), recorded in the tax policy (lib/taxPolicy.js invoiceRoute):
 *
 *   stripe          Stripe's post-payment invoice for a Checkout payment (invoice_creation on the session). Stripe
 *                   creates and finalises the invoice when the payment succeeds; this adapter records its id, number and
 *                   PDF link on the order, and issues a Stripe credit note when the payment is refunded.
 *   czech_tool      A Czech invoicing system (for example Fakturoid or iDoklad). Not built: it needs the accountant's
 *                   choice of tool and its API credentials. Selecting it fails closed (status 'failed', reason
 *                   'adapter_not_configured') so a sale is never left without an invoice silently.
 *   sandbox_ledger  TEST ADAPTER. Stands in for a Czech invoicing system in the Stripe sandbox: it numbers documents
 *                   in its own series (TEST-INV-YYYY-NNNN, TEST-CN-YYYY-NNNN) and stores them in KV. Used only with
 *                   the sandbox policy fixture and a test key.
 *   (none)          Policy not approved: no invoice is created and the order says so ('not_configured').
 *
 * Every function is idempotent on the order: an invoice already recorded is returned as it is, and a credit note is
 * created once per Stripe refund id. Callers store the returned section on the order (lib/orders.js).
 */
import { nextSequence, setJson, getJson } from './db.js';

export const INVOICE_STATUS = ['not_configured', 'pending', 'issued', 'failed'];

const idOf = (ref) => (typeof ref === 'string' ? ref : ref?.id) || null;

function stripeInvoiceSection(inv) {
  return {
    status: inv.status === 'paid' && inv.number ? 'issued' : 'pending',
    provider: 'stripe', id: inv.id, number: inv.number ?? null,
    pdfUrl: inv.invoice_pdf ?? null, hostedUrl: inv.hosted_invoice_url ?? null,
    currency: inv.currency ?? null, total: inv.total ?? null, tax: inv.tax ?? (inv.total_taxes ? inv.total_taxes.reduce((a, t) => a + (t.amount || 0), 0) : null),
  };
}

/**
 * Make sure a paid order has its invoice. Returns the invoice section to store on the order. Never throws for an
 * expected failure: the section says 'failed' with a reason, and the caller decides (the webhook retries, the page
 * says the invoice follows).
 */
export async function ensureInvoice({ route, order, session = null, stripe = null, now = new Date() }) {
  const current = order?.invoice;
  if (current?.status === 'issued' && current.provider === route) return current;
  if (!route) return { status: 'not_configured', provider: null };

  if (route === 'stripe') {
    const invoiceId = idOf(session?.invoice) || current?.id || null;
    if (!invoiceId) {
      return { status: 'failed', provider: 'stripe', reason: 'no_invoice_on_session', at: now.toISOString() };
    }
    try {
      const inv = typeof session?.invoice === 'object' && session.invoice?.number ? session.invoice : await stripe.invoices.retrieve(invoiceId);
      return stripeInvoiceSection(inv);
    } catch (err) {
      return { status: 'failed', provider: 'stripe', id: invoiceId, reason: 'invoice_lookup_failed', detail: String(err?.message || err).slice(0, 200), at: now.toISOString() };
    }
  }

  if (route === 'sandbox_ledger') {
    if (process.env.INVOICE_SANDBOX_FAIL === '1') {
      return { status: 'failed', provider: 'sandbox_ledger', reason: 'forced_failure', at: now.toISOString() };
    }
    const year = now.getUTCFullYear();
    const seq = await nextSequence(`invoice:sandbox_ledger:${year}`);
    const number = `TEST-INV-${year}-${String(seq).padStart(4, '0')}`;
    const doc = {
      number, kind: 'invoice', provider: 'sandbox_ledger', test: true, issuedAt: now.toISOString(),
      orderId: order.id, seller: order.tax?.seller ?? null, buyer: order.buyer, product: order.product,
      currency: order.facts?.currency ?? order.price?.currency, subtotal: order.facts?.amountSubtotal ?? order.price?.unitAmount,
      tax: order.facts?.amountTax ?? 0, total: order.facts?.amountTotal ?? order.price?.unitAmount,
      taxTreatment: order.tax ?? null,
    };
    // Written once: a retry that lost its first reply finds the number already used and takes the next one, which a
    // real numbering system would also do; the order keeps the first one it recorded (see the caller).
    await setJson(`invoice:sandbox_ledger:${number}`, doc, { onlyIfAbsent: true });
    return { status: 'issued', provider: 'sandbox_ledger', id: number, number, pdfUrl: null, hostedUrl: null, test: true };
  }

  if (route === 'czech_tool') {
    return { status: 'failed', provider: 'czech_tool', reason: 'adapter_not_configured', at: now.toISOString() };
  }
  return { status: 'failed', provider: String(route), reason: 'unknown_route', at: now.toISOString() };
}

/**
 * A credit note for a refund of an invoiced order, once per refund id. Returns the credit note entry to append to
 * order.creditNotes, { skipped: reason } when none is due, or { status: 'failed', reason } on a failure the caller
 * should retry.
 */
export async function ensureCreditNote({ route, order, refund, stripe = null, now = new Date() }) {
  if (!refund?.id || !(refund.amount > 0)) return { skipped: 'no_refund' };
  if ((order?.creditNotes ?? []).some((c) => c.refundId === refund.id && c.status === 'issued')) return { skipped: 'already_issued' };
  if (order?.invoice?.status !== 'issued') return { skipped: 'no_invoice' };
  if (!route) return { skipped: 'not_configured' };

  if (route === 'stripe' && order.invoice.provider === 'stripe') {
    try {
      const cn = await stripe.creditNotes.create({
        invoice: order.invoice.id,
        refunds: [{ refund: refund.id, amount_refunded: refund.amount }],
        memo: `Refund for order ${order.id}`,
        metadata: { order_id: order.id, refund_id: refund.id },
      }, { idempotencyKey: `credit-note-${refund.id}` });
      return { status: 'issued', provider: 'stripe', refundId: refund.id, id: cn.id, number: cn.number ?? null, amount: refund.amount, pdfUrl: cn.pdf ?? null };
    } catch (err) {
      return { status: 'failed', provider: 'stripe', refundId: refund.id, reason: 'credit_note_failed', detail: String(err?.message || err).slice(0, 200), at: now.toISOString() };
    }
  }

  if (route === 'sandbox_ledger' && order.invoice.provider === 'sandbox_ledger') {
    const existing = await getJson(`invoice:sandbox_ledger:cn-for:${refund.id}`);
    if (existing) return existing;
    const year = now.getUTCFullYear();
    const seq = await nextSequence(`credit_note:sandbox_ledger:${year}`);
    const number = `TEST-CN-${year}-${String(seq).padStart(4, '0')}`;
    const entry = { status: 'issued', provider: 'sandbox_ledger', refundId: refund.id, id: number, number, amount: refund.amount, invoiceNumber: order.invoice.number, test: true, issuedAt: now.toISOString() };
    await setJson(`invoice:sandbox_ledger:cn-for:${refund.id}`, entry, { onlyIfAbsent: true });
    return entry;
  }

  return { status: 'failed', provider: route, refundId: refund.id, reason: 'invoice_from_another_provider', at: now.toISOString() };
}
