/**
 * lib/invoicing.js - invoices and credit notes for paid orders, behind one interface with interchangeable adapters.
 *
 * Which adapter runs is the accountant's decision (T13), recorded in the tax policy (lib/taxPolicy.js invoiceRoute):
 *
 *   stripe          Stripe's post-payment invoice for a Checkout payment (invoice_creation on the session). Stripe
 *                   creates and finalises the invoice when the payment succeeds; this adapter records its id, number and
 *                   PDF link on the order, and issues a Stripe credit note when the payment is refunded.
 *   company_ledger  The company's own invoices: an unbroken yearly series (CAI-INV-YYYY-NNNNN, credit notes
 *                   CAI-CN-YYYY-NNNNN) allocated here, the document stored in KV and rendered to PDF by
 *                   lib/invoicePdf.js, archived with the order (lib/orderDocuments.js). Every tax-relevant line comes
 *                   from the order record and the approved policy (seller block, buyer category wording, CZK
 *                   conversion); nothing is assumed. A test-mode order gets a TEST- number in a separate series and a
 *                   NOT A TAX DOCUMENT banner, so the Preview exercises the real route without consuming the series.
 *                   One invoice per order and one credit note per refund are claimed before a number is allocated, so
 *                   a retried webhook never allocates a second number for the same sale.
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

/** KV key of a document numbered by our own ledgers. */
export const ledgerDocKey = (provider, number) => `invoice:${provider}:${number}`;
const LEDGERS = new Set(['sandbox_ledger', 'company_ledger']);
export const isLedgerProvider = (p) => LEDGERS.has(p);

/** Number format of the company ledger. `test` orders use a separate series that never touches the real one. */
export function companyNumber(kind, year, seq, test) {
  return `${test ? 'TEST-' : ''}CAI-${kind === 'credit_note' ? 'CN' : 'INV'}-${year}-${String(seq).padStart(5, '0')}`;
}
const seriesName = (kind, year, test) => `${kind}:company_ledger:${test ? 'test:' : ''}${year}`;

export const INVOICE_STATUS = ['not_configured', 'pending', 'issued', 'failed'];

const idOf = (ref) => (typeof ref === 'string' ? ref : ref?.id) || null;

/** The invoice section of an order, from a Stripe invoice object. */
export function stripeInvoiceSection(inv) {
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
export async function ensureInvoice({ route, order, session = null, stripe = null, now = new Date(), conversion = null }) {
  const current = order?.invoice;
  if (current?.status === 'issued' && current.provider === route) return current;
  if (!route) return { status: 'not_configured', provider: null };

  if (route === 'stripe') {
    const invoiceId = idOf(session?.invoice) || current?.id || null;
    if (!invoiceId) {
      // Stripe creates the post-payment invoice as the payment completes; the session may not name it yet. The
      // invoice.paid event (metadata.order_id) records it then. An order still pending later is a reconciliation item.
      return { status: 'pending', provider: 'stripe', reason: 'awaiting_invoice', at: now.toISOString() };
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

  if (route === 'company_ledger') return companyLedgerInvoice({ order, now, conversion });

  if (route === 'czech_tool') {
    return { status: 'failed', provider: 'czech_tool', reason: 'adapter_not_configured', at: now.toISOString() };
  }
  return { status: 'failed', provider: String(route), reason: 'unknown_route', at: now.toISOString() };
}

const sectionOf = (doc) => ({ status: 'issued', provider: 'company_ledger', id: doc.number, number: doc.number, pdfUrl: null, hostedUrl: null, ...(doc.test ? { test: true } : {}) });

/**
 * The company ledger's invoice for a paid order. The order is claimed first (invoice:company_ledger:order:<id>), then
 * the number is allocated and the document written; a retry that finds the claim returns the same document, or
 * 'pending' while the first attempt is still writing it.
 */
async function companyLedgerInvoice({ order, now, conversion }) {
  const at = now.toISOString();
  if (!order?.id) return { status: 'failed', provider: 'company_ledger', reason: 'no_order', at };
  if (!order.facts?.paidAt) return { status: 'failed', provider: 'company_ledger', reason: 'not_paid', at };
  if (!order.tax?.seller?.legalName || !order.tax?.seller?.registrationNumber) return { status: 'failed', provider: 'company_ledger', reason: 'seller_not_recorded', at };
  // A seller that is not a VAT payer never invoices VAT. A taxed order for such a seller is a configuration error:
  // fail closed before a number is allocated.
  if (order.tax.seller.vatStatus !== 'vat_payer' && Number(order.facts.amountTax || 0) > 0) return { status: 'failed', provider: 'company_ledger', reason: 'tax_charged_by_non_vat_payer', at };
  const test = order.mode !== 'live';
  const claimKey = `invoice:company_ledger:order:${order.id}`;
  const claimed = await setJson(claimKey, { status: 'allocating', at }, { onlyIfAbsent: true });
  if (!claimed) {
    const claim = await getJson(claimKey);
    if (claim?.number) {
      const doc = await getJson(ledgerDocKey('company_ledger', claim.number));
      if (doc) return sectionOf(doc);
    }
    return { status: 'pending', provider: 'company_ledger', reason: 'allocation_in_progress', at };
  }
  const year = now.getUTCFullYear();
  const seq = await nextSequence(seriesName('invoice', year, test));
  const number = companyNumber('invoice', year, seq, test);
  const f = order.facts;
  const doc = {
    number, kind: 'invoice', provider: 'company_ledger', test, issuedAt: at,
    orderId: order.id, seller: order.tax.seller, buyer: order.buyer, product: order.product,
    currency: f.currency ?? order.price?.currency, subtotal: f.amountSubtotal ?? order.price?.unitAmount,
    tax: f.amountTax ?? 0, total: f.amountTotal ?? order.price?.unitAmount,
    taxTreatment: { policyVersion: order.tax.policyVersion, policyStatus: order.tax.policyStatus, category: order.tax.category, applied: order.tax.applied, invoiceNote: order.tax.invoiceNote ?? null },
    paidAt: f.paidAt ?? null, fulfilledAt: f.fulfilledAt ?? null,
    payment: { provider: 'stripe', paymentIntentId: order.stripe?.paymentIntentId ?? null, sessionId: order.stripe?.sessionId ?? null },
    ...(conversion ? { conversion } : {}),
  };
  await setJson(ledgerDocKey('company_ledger', number), doc, { onlyIfAbsent: true });
  await setJson(claimKey, { status: 'issued', number, at });
  return sectionOf(doc);
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
      // Stripe requires one of amount, lines or shipping_cost. `amount` is the credit note's total; linking the existing
      // refund for the same amount satisfies "refunds + credits + out-of-band = post-payment amount" on a paid invoice.
      // The idempotency key carries a version and the amount: Stripe replays a stored error for the same key, so a key
      // that once failed (v1, without amount: 400 parameter_missing) must not be reused by the corrected request.
      const cn = await stripe.creditNotes.create({
        invoice: order.invoice.id,
        amount: refund.amount,
        refunds: [{ refund: refund.id, amount_refunded: refund.amount }],
        memo: `Refund for order ${order.id}`,
        metadata: { order_id: order.id, refund_id: refund.id },
      }, { idempotencyKey: `credit-note-v2-${refund.id}-${refund.amount}` });
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

  if (route === 'company_ledger' && order.invoice.provider === 'company_ledger') {
    const claimKey = `invoice:company_ledger:cn-for:${refund.id}`;
    const claimed = await setJson(claimKey, { status: 'allocating', at: now.toISOString() }, { onlyIfAbsent: true });
    if (!claimed) {
      const claim = await getJson(claimKey);
      if (claim?.entry) return claim.entry;
      return { status: 'failed', provider: 'company_ledger', refundId: refund.id, reason: 'allocation_in_progress', at: now.toISOString() };
    }
    const test = order.mode !== 'live';
    const year = now.getUTCFullYear();
    const seq = await nextSequence(seriesName('credit_note', year, test));
    const number = companyNumber('credit_note', year, seq, test);
    const entry = { status: 'issued', provider: 'company_ledger', refundId: refund.id, id: number, number, amount: refund.amount, invoiceNumber: order.invoice.number, issuedAt: now.toISOString(), ...(test ? { test: true } : {}) };
    await setJson(ledgerDocKey('company_ledger', number), { ...entry, kind: 'credit_note', orderId: order.id }, { onlyIfAbsent: true });
    await setJson(claimKey, { status: 'issued', entry });
    return entry;
  }

  return { status: 'failed', provider: route, refundId: refund.id, reason: 'invoice_from_another_provider', at: now.toISOString() };
}
