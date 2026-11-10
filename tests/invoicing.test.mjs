/**
 * tests/invoicing.test.mjs - invoice and credit-note adapters, and payout reconciliation (PR B).
 *
 * The adapters are idempotent on the order, fail closed with a reason instead of throwing, and never invent an
 * invoice when invoicing is not configured. Reconciliation matches each balance transaction to its order and checks
 * the rows add up to the payout. Fake Stripe client objects and a fake Upstash on loopback; nothing leaves the machine.
 * Usage: node --test tests/invoicing.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

const store = new Map();
let kvServer, inv, rec;
before(async () => {
  kvServer = http.createServer((req, res) => {
    const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
    let result = null;
    if (cmd === 'GET') result = store.get(args[0]) ?? null;
    else if (cmd === 'SET') { if (args.includes('NX') && store.has(args[0])) result = null; else { store.set(args[0], args[1]); result = 'OK'; } }
    else if (cmd === 'INCR') { const n = Number(store.get(args[0]) ?? 0) + 1; store.set(args[0], String(n)); result = n; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ result }));
  });
  await new Promise((r) => kvServer.listen(0, '127.0.0.1', r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  delete process.env.VERCEL_ENV;
  inv = await import('../lib/invoicing.js');
  rec = await import('../lib/reconciliation.js');
});
after(async () => { kvServer.closeAllConnections?.(); await new Promise((r) => kvServer.close(r)); });
beforeEach(() => { store.clear(); delete process.env.INVOICE_SANDBOX_FAIL; });

const ORDER = {
  id: 'ord_20261110_0123456789ab', buyer: { company: 'Beispiel Werke GmbH', country: 'DE', taxId: { value: 'DE123456789', type: 'eu_vat' } },
  product: { slug: 'contract-intelligence-and-register', sku: 'CAI-L4-CI-001', release: '1.0.3.4' },
  price: { currency: 'usd', unitAmount: 1490000 }, facts: { amountSubtotal: 1490000, amountTax: 0, amountTotal: 1490000, currency: 'usd' },
  tax: { category: 'eu_business_vat_verified' }, creditNotes: [],
};
const NOW = new Date('2026-11-10T12:00:00Z');

function fakeStripe({ invoice, failRetrieve = false, failCredit = false } = {}) {
  const calls = [];
  return {
    calls,
    invoices: { retrieve: async (id) => { calls.push(['invoices.retrieve', id]); if (failRetrieve) throw new Error('timeout'); return invoice; } },
    creditNotes: {
      create: async (params, opts) => {
        calls.push(['creditNotes.create', params, opts]);
        if (failCredit) throw new Error('credit note refused');
        return { id: 'cn_1', number: 'INV-0001-CN-01', pdf: 'https://pay.stripe.test/cn_1.pdf' };
      },
    },
  };
}

test('no invoice route (policy not approved): nothing is created and the order says invoicing is not configured', async () => {
  assert.deepEqual(await inv.ensureInvoice({ route: null, order: ORDER }), { status: 'not_configured', provider: null });
});

test('Stripe route: the post-payment invoice on the session is recorded with its number and PDF', async () => {
  const stripe = fakeStripe({ invoice: { id: 'in_1', status: 'paid', number: 'CAI-0001', invoice_pdf: 'https://pay.stripe.test/in_1.pdf', hosted_invoice_url: 'https://invoice.stripe.test/in_1', currency: 'usd', total: 1490000, total_taxes: [] } });
  const out = await inv.ensureInvoice({ route: 'stripe', order: ORDER, session: { invoice: 'in_1' }, stripe, now: NOW });
  assert.deepEqual({ status: out.status, id: out.id, number: out.number, pdf: out.pdfUrl, hosted: out.hostedUrl },
    { status: 'issued', id: 'in_1', number: 'CAI-0001', pdf: 'https://pay.stripe.test/in_1.pdf', hosted: 'https://invoice.stripe.test/in_1' });
  // already issued: returned as stored, no second lookup
  const again = await inv.ensureInvoice({ route: 'stripe', order: { ...ORDER, invoice: out }, session: { invoice: 'in_1' }, stripe });
  assert.equal(again, out);
  assert.equal(stripe.calls.length, 1);
});

test('Stripe route: a session that does not name its invoice yet is pending; a failed lookup is failed; neither is issued', async () => {
  const missing = await inv.ensureInvoice({ route: 'stripe', order: ORDER, session: { invoice: null }, stripe: fakeStripe(), now: NOW });
  assert.equal(missing.status, 'pending');
  assert.equal(missing.reason, 'awaiting_invoice');
  const lookup = await inv.ensureInvoice({ route: 'stripe', order: ORDER, session: { invoice: 'in_9' }, stripe: fakeStripe({ failRetrieve: true }), now: NOW });
  assert.equal(lookup.status, 'failed');
  assert.equal(lookup.reason, 'invoice_lookup_failed');
});

test('an unfinished Stripe invoice (no number yet) stays pending', async () => {
  const out = await inv.ensureInvoice({ route: 'stripe', order: ORDER, session: { invoice: 'in_2' }, stripe: fakeStripe({ invoice: { id: 'in_2', status: 'open', number: null } }) });
  assert.equal(out.status, 'pending');
});

test('sandbox ledger (test adapter): its own TEST series, sequential, and a forced failure is reported', async () => {
  const a = await inv.ensureInvoice({ route: 'sandbox_ledger', order: ORDER, now: NOW });
  const b = await inv.ensureInvoice({ route: 'sandbox_ledger', order: { ...ORDER, id: 'ord_20261110_0123456789ac' }, now: NOW });
  assert.equal(a.number, 'TEST-INV-2026-0001');
  assert.equal(b.number, 'TEST-INV-2026-0002');
  assert.equal(a.test, true);
  const stored = JSON.parse(store.get('invoice:sandbox_ledger:TEST-INV-2026-0001'));
  assert.equal(stored.orderId, ORDER.id);
  assert.equal(stored.buyer.taxId.value, 'DE123456789');
  process.env.INVOICE_SANDBOX_FAIL = '1';
  const failed = await inv.ensureInvoice({ route: 'sandbox_ledger', order: ORDER, now: NOW });
  assert.equal(failed.status, 'failed');
});

test('the Czech invoicing route fails closed until its adapter is built for the chosen tool', async () => {
  const out = await inv.ensureInvoice({ route: 'czech_tool', order: ORDER, now: NOW });
  assert.equal(out.status, 'failed');
  assert.equal(out.reason, 'adapter_not_configured');
});

test('credit notes: one per refund, linked to the Stripe refund, only for an issued invoice', async () => {
  const issued = { status: 'issued', provider: 'stripe', id: 'in_1', number: 'CAI-0001' };
  const stripe = fakeStripe();
  const cn = await inv.ensureCreditNote({ route: 'stripe', order: { ...ORDER, invoice: issued }, refund: { id: 're_1', amount: 1490000 }, stripe, now: NOW });
  assert.equal(cn.status, 'issued');
  assert.equal(cn.number, 'INV-0001-CN-01');
  const [, params, opts] = stripe.calls[0];
  assert.deepEqual(params.refunds, [{ refund: 're_1', amount_refunded: 1490000 }]);
  assert.equal(params.invoice, 'in_1');
  assert.equal(params.metadata.order_id, ORDER.id);
  assert.equal(opts.idempotencyKey, 'credit-note-re_1', 'a retried event cannot create a second credit note');
  assert.deepEqual(await inv.ensureCreditNote({ route: 'stripe', order: { ...ORDER, invoice: issued, creditNotes: [cn] }, refund: { id: 're_1', amount: 1490000 }, stripe }), { skipped: 'already_issued' });
  assert.deepEqual(await inv.ensureCreditNote({ route: 'stripe', order: ORDER, refund: { id: 're_2', amount: 100 }, stripe }), { skipped: 'no_invoice' });
  const failed = await inv.ensureCreditNote({ route: 'stripe', order: { ...ORDER, invoice: issued }, refund: { id: 're_3', amount: 100 }, stripe: fakeStripe({ failCredit: true }) });
  assert.equal(failed.status, 'failed');
});

test('sandbox credit notes are numbered in their own TEST series, once per refund', async () => {
  const issued = { status: 'issued', provider: 'sandbox_ledger', id: 'TEST-INV-2026-0001', number: 'TEST-INV-2026-0001' };
  const a = await inv.ensureCreditNote({ route: 'sandbox_ledger', order: { ...ORDER, invoice: issued }, refund: { id: 're_s1', amount: 1490000 }, now: NOW });
  const again = await inv.ensureCreditNote({ route: 'sandbox_ledger', order: { ...ORDER, invoice: issued }, refund: { id: 're_s1', amount: 1490000 }, now: NOW });
  assert.equal(a.number, 'TEST-CN-2026-0001');
  assert.equal(again.number, 'TEST-CN-2026-0001');
});

test('reconciliation: every balance transaction is matched to its order and the rows add up to the payout', () => {
  const order = { ...ORDER, invoice: { number: 'CAI-0001' }, creditNotes: [{ refundId: 're_1', number: 'CAI-0001-CN-01' }] };
  const bts = [
    { id: 'txn_1', type: 'charge', amount: 1490000, fee: 21900, net: 1468100, currency: 'usd', source: { id: 'ch_1', object: 'charge', metadata: { order_id: ORDER.id } } },
    { id: 'txn_2', type: 'refund', amount: -1490000, fee: 0, net: -1490000, currency: 'usd', source: { id: 're_1', object: 'refund', charge: { id: 'ch_1', metadata: { order_id: ORDER.id } } } },
    { id: 'txn_3', type: 'charge', amount: 500, fee: 30, net: 470, currency: 'usd', source: { id: 'ch_x', object: 'charge', metadata: {} } },
  ];
  const result = rec.reconcilePayout({ payout: { id: 'po_1', amount: -21430, currency: 'usd' }, balanceTransactions: bts, orders: { [ORDER.id]: order } });
  assert.equal(result.matchesPayout, true);
  assert.equal(result.rows[0].invoiceNumber, 'CAI-0001');
  assert.equal(result.rows[1].creditNoteNumber, 'CAI-0001-CN-01');
  assert.equal(result.unmatched.length, 1, 'a charge with no order is listed, not dropped');
  assert.equal(result.unmatched[0].source, 'ch_x');
  const csv = rec.toCsv(result);
  assert.match(csv.split('\n')[0], /^balanceTransaction,type,created/);
  assert.match(csv, /Beispiel Werke GmbH/);
  assert.equal(rec.reconcilePayout({ payout: { id: 'po_2', amount: 1 }, balanceTransactions: bts, orders: {} }).matchesPayout, false);
});
