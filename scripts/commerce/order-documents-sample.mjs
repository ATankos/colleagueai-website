#!/usr/bin/env node
// Render the order documents for a fixture order with synthetic data, for review and for the release evidence
// library. Pure: lib/agreementPdf.js and lib/invoicePdf.js are called on a record written here; no KV, no Stripe,
// no network, nothing is sent anywhere.
//
//   node scripts/commerce/order-documents-sample.mjs <out-dir>
//
// Output: licence-agreement-confirmation.pdf, invoice-TEST-INV-2026-0001.pdf, credit-note-TEST-CN-2026-0001.pdf,
// agreement-model.json and SHA256SUMS.txt. The documents of a real order are produced by lib/orderDocuments.js from
// the stored order; this script shows what they look like.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { buildAgreementPdf } from '../../lib/agreementPdf.js';
import { invoiceModel, creditNoteModel, renderInvoicePdf, invoiceFileName, creditNoteFileName } from '../../lib/invoicePdf.js';

const out = process.argv[2];
if (!out) { console.error('Usage: node scripts/commerce/order-documents-sample.mjs <out-dir>'); process.exit(2); }

const order = {
  id: 'ord_20261120_000000sample', mode: 'test', createdAt: '2026-11-20T18:00:00.000Z', status: 'fulfilled',
  product: { slug: 'contract-intelligence-and-register', sku: 'CAI-L4-CI-001', release: '1.0.3.6', tier: 'L4', name: 'ColleagueAI Contract Intelligence & Register' },
  price: { currency: 'usd', unitAmount: 1490000, quantity: 1 },
  buyer: { company: 'Vzorová Průmyslová a.s.', registrationNumber: '12345678', country: 'CZ', taxId: { value: 'CZ12345678', type: 'eu_vat' }, tenant: 'vzorova-prumyslova.example', contact: { name: 'Jana Nováková', email: 'nakup@vzorova.example' }, signatory: { name: 'Jana Nováková', role: 'Jednatelka' } },
  acceptance: { id: 'acc_000000000000000000sample', legalSet: '2026-07-09', acceptedAt: '2026-11-20T18:00:01.000Z', documents: {
    terms: { version: '2026-06-13', sha256: '0'.repeat(64), archive: 'legal/archive/terms/2026-06-13.html' },
    licence: { version: '2026-06-13', sha256: '1'.repeat(64), archive: 'legal/archive/licence/2026-06-13.html' },
    refund: { version: '1.0 (2026-07-09)', sha256: '2'.repeat(64), archive: 'legal/archive/refund/1.0-2026-07-09.html' },
    privacy: { version: '2026-06-13', sha256: '3'.repeat(64), archive: 'legal/archive/privacy/2026-06-13.html' } } },
  payment: { lane: 'card' },
  tax: { policyVersion: 'sandbox-2026-11-10', policyStatus: 'sandbox', category: 'cz_business', applied: true, action: 'sell', invoiceNote: 'TEST - domestic treatment not decided', invoiceRoute: 'sandbox_ledger',
    seller: { legalName: 'Colleague AI s.r.o.', registrationNumber: '29540852', register: 'Městský soud v Praze, C 448176', address: 'Školská 1736/12, Nové Město, 110 00 Praha 1, Czech Republic', vatStatus: 'sandbox', vatId: null } },
  stripe: { sessionId: 'cs_test_sample', paymentIntentId: 'pi_sample', customerId: 'cus_sample' },
  facts: { paidAt: '2026-11-20T18:05:00.000Z', fulfilledAt: '2026-11-20T18:05:01.000Z', currency: 'usd', amountSubtotal: 1490000, amountTax: 0, amountTotal: 1490000, billingCountry: 'CZ' },
  invoice: { status: 'issued', provider: 'sandbox_ledger', id: 'TEST-INV-2026-0001', number: 'TEST-INV-2026-0001', test: true },
};
const acceptance = { consents: { authority: true, terms: true, delivery: true }, clientHash: 'sample0000ff', userAgent: 'Mozilla/5.0 (sample)', lang: 'en', acceptedAt: order.acceptance.acceptedAt };
const ledger = { number: 'TEST-INV-2026-0001', provider: 'sandbox_ledger', test: true, issuedAt: '2026-11-20T18:05:00.500Z', orderId: order.id, seller: order.tax.seller, buyer: order.buyer, product: order.product, currency: 'usd', subtotal: 1490000, tax: 0, total: 1490000, taxTreatment: order.tax };
const refund = { status: 'issued', provider: 'sandbox_ledger', refundId: 're_sample', id: 'TEST-CN-2026-0001', number: 'TEST-CN-2026-0001', amount: 1490000, invoiceNumber: 'TEST-INV-2026-0001', test: true, issuedAt: '2026-11-21T09:00:00.000Z' };

mkdirSync(out, { recursive: true });
const files = {};
const { model, bytes } = await buildAgreementPdf({ order, acceptance });
files['licence-agreement-confirmation.pdf'] = Buffer.from(bytes);
files[invoiceFileName(ledger.number)] = Buffer.from(await renderInvoicePdf(invoiceModel({ doc: ledger, order })));
files[creditNoteFileName(refund.number)] = Buffer.from(await renderInvoicePdf(creditNoteModel({ entry: refund, invoiceDoc: ledger, order })));
files['agreement-model.json'] = Buffer.from(JSON.stringify(model, null, 2));
const sums = [];
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(join(out, name), buf);
  sums.push(`${createHash('sha256').update(buf).digest('hex')}  ${name}`);
}
writeFileSync(join(out, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
console.log(sums.join('\n'));
