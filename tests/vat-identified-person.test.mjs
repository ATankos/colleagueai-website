// Identified person (identifikovaná osoba) and the VAT-status transition: what the seller's status changes on a
// document, what it can never change, and that no status takes effect without its official record.
// Facts used here (DIČ, dates, record references) are TEST DATA, not the company's registration.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const store = new Map();
let kv, inv, tax, pdf;
before(async () => {
  kv = http.createServer((req, res) => {
    const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
    let result = null;
    if (cmd === 'GET') result = store.get(args[0]) ?? null;
    else if (cmd === 'SET') { if (args.includes('NX') && store.has(args[0])) result = null; else { store.set(args[0], args[1]); result = 'OK'; } }
    else if (cmd === 'INCR') { const n = Number(store.get(args[0]) ?? 0) + 1; store.set(args[0], String(n)); result = n; }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ result }));
  });
  await new Promise((r) => kv.listen(0, '127.0.0.1', r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kv.address().port}`;
  process.env.KV_REST_API_TOKEN = 't';
  inv = await import('../lib/invoicing.js');
  tax = await import('../lib/taxPolicy.js');
  pdf = await import('../lib/invoicePdf.js');
});
after(async () => { kv.closeAllConnections?.(); await new Promise((r) => kv.close(r)); });

const IO = { legalName: 'Colleague AI s.r.o.', registrationNumber: '29540852', address: 'Praha', register: 'MS Praha C 448176', vatStatus: 'identified_person', vatId: 'CZ00000000', showVatIdOnDomesticInvoices: null };
const order = (over = {}) => ({
  id: 'ord_20261201_' + Math.random().toString(16).slice(2, 14).padEnd(12, '0'), mode: 'live',
  buyer: { company: 'Zkušební a.s.', country: 'CZ', registrationNumber: '12345679', taxId: null },
  product: { name: 'Contract Intelligence & Register', sku: 'CAI-L4-CI-001', release: '1.0.3.6' }, price: { currency: 'usd', unitAmount: 1490000 },
  facts: { currency: 'usd', amountSubtotal: 1490000, amountTax: 0, amountTotal: 1490000, paidAt: '2026-12-01T10:00:00Z', fulfilledAt: '2026-12-01T10:00:05Z' },
  tax: { category: 'cz_business', applied: true, invoiceNote: 'ACCOUNTANT WORDING (test)', seller: IO }, stripe: { paymentIntentId: 'pi_t' }, ...over,
});
const text = (m) => [...m.seller, ...m.header.flat(), ...m.totals.flat()].join('\n');

test('identified person, domestic buyer: no VAT line amount, no DIČ, no taxable-supply wording', () => {
  const doc = { number: 'CAI-INV-2026-00001', issuedAt: '2026-12-01T10:00:06Z', seller: IO, buyer: order().buyer, product: order().product, currency: 'usd', subtotal: 1490000, tax: 0, total: 1490000, taxTreatment: { category: 'cz_business', applied: true, invoiceNote: 'ACCOUNTANT WORDING (test)' } };
  const t = text(pdf.invoiceModel({ doc, order: order() }));
  assert.ok(!t.includes('DIČ'), 'DIČ is not printed on a domestic invoice unless the approved policy says so');
  assert.ok(t.includes('VAT\nnot charged'));
  assert.ok(t.includes('Date of supply') && !t.includes('Date of taxable supply'));
  const shown = tax.sellerPresentation({ ...IO, showVatIdOnDomesticInvoices: true }, { domestic: true });
  assert.equal(shown.showVatId, true, 'the accountant may decide to show it (T7)');
  assert.equal(shown.chargesVat, false);
});

test('identified person, foreign buyer: the DIČ is printed (it is the number used for those supplies)', () => {
  assert.equal(tax.sellerPresentation(IO, { domestic: false }).showVatId, true);
  assert.equal(tax.sellerPresentation({ ...IO, vatStatus: 'not_registered' }, { domestic: false }).showVatId, false);
});

test('a seller that is not a VAT payer never issues a taxed invoice: the ledger fails closed before numbering', async () => {
  const before = store.get('seq:invoice:company_ledger:2026');
  const r = await inv.ensureInvoice({ route: 'company_ledger', order: order({ facts: { ...order().facts, amountTax: 312900, amountTotal: 1802900 } }), now: new Date('2026-12-01T10:00:06Z') });
  assert.equal(r.status, 'failed');
  assert.equal(r.reason, 'tax_charged_by_non_vat_payer');
  assert.equal(store.get('seq:invoice:company_ledger:2026'), before, 'no number consumed');
});

test('test orders never consume the real series', async () => {
  const r = await inv.ensureInvoice({ route: 'company_ledger', order: order({ mode: 'test' }), now: new Date('2026-12-01T10:00:06Z') });
  assert.match(r.number, /^TEST-CAI-INV-2026-\d{5}$/);
  assert.equal(store.get('seq:invoice:company_ledger:2026') ?? null, null);
});

test('policy wording cannot present an identified person as a VAT payer, or a domestic supply as recipient-accounted', () => {
  const p = structuredClone(tax.TAX_POLICY);
  p.treatments.cz_business = { action: 'sell', invoiceNote: 'Faktura - daňový doklad' };
  assert.ok(tax.policyErrors(p).some((e) => e.includes('cz_business wording presents the seller as a VAT payer')));
  p.treatments.cz_business = { action: 'sell', invoiceNote: 'Daň odvede zákazník.' };
  assert.ok(tax.policyErrors(p).some((e) => e.includes('customer accounts for the tax')));
  p.checkout.stripeTax = true;
  assert.ok(tax.policyErrors(p).some((e) => e.includes('stripeTax must be false')));
});

test('a reported status is not an official record: the committed policy fails closed', () => {
  const e = tax.policyErrors(tax.TAX_POLICY);
  assert.equal(tax.TAX_POLICY.seller.vatStatus, 'identified_person');
  // 25 Nov 2026: the DIČ is stated by founder decision; the policy still fails closed on the missing official facts.
  assert.equal(tax.TAX_POLICY.seller.vatId, 'CZ29540852');
  for (const k of ['vatEffectiveFrom', 'officialRecord', 'vatStatusHistory']) assert.ok(e.some((x) => x.includes(k)), k);
  assert.equal(tax.liveTaxBlocked('sk_live_x'), true);
});

test('transition: no status takes effect on a date by itself; a verified change needs a re-approved policy', () => {
  const p = structuredClone(tax.TAX_POLICY);
  p.seller.vatStatusHistory = [
    { status: 'identified_person', effectiveFrom: '2026-01-01', verified: true, evidenceReference: 'TEST RECORD 1' },
    { status: 'vat_payer', effectiveFrom: '2027-01-01', verified: false, evidenceReference: null },
  ];
  assert.equal(tax.sellerStatusOn(p, '2027-06-01').status, 'identified_person', 'an unverified planned registration never applies');
  p.seller.vatStatusHistory[1] = { status: 'vat_payer', effectiveFrom: '2027-01-01', verified: true, evidenceReference: 'TEST RECORD 2' };
  assert.equal(tax.sellerStatusOn(p, '2026-12-31').status, 'identified_person');
  assert.equal(tax.sellerStatusOn(p, '2027-01-01').status, 'vat_payer');
  assert.ok(tax.policyErrors(p, { now: new Date('2027-01-02') }).some((x) => x.includes('re-approve the policy')), 'treatments approved for the old status do not carry over');
  p.seller.vatStatusHistory[1].evidenceReference = null;
  assert.ok(tax.policyErrors(p).some((x) => x.includes('verified without effectiveFrom and evidenceReference')));
});

test('historical invoices are immutable: a later status change does not rewrite an issued document', async () => {
  const o = order();
  const r = await inv.ensureInvoice({ route: 'company_ledger', order: o, now: new Date('2026-12-01T10:00:06Z') });
  const key = inv.ledgerDocKey('company_ledger', r.number);
  const stored = store.get(key);
  // The order is later re-processed with a seller block of a VAT payer (as after a 2027 registration).
  const again = await inv.ensureInvoice({ route: 'company_ledger', order: { ...o, invoice: undefined, tax: { ...o.tax, seller: { ...IO, vatStatus: 'vat_payer' } } }, now: new Date('2027-01-05T00:00:00Z') });
  assert.equal(again.number, r.number, 'the same document, not a new one');
  assert.equal(store.get(key), stored, 'stored bytes unchanged');
  const model = pdf.invoiceModel({ doc: JSON.parse(stored), order: { ...o, tax: { ...o.tax, seller: { ...IO, vatStatus: 'vat_payer' } } } });
  assert.ok(text(model).includes('VAT\nnot charged'), 'the PDF follows the seller block recorded on the document');
});
