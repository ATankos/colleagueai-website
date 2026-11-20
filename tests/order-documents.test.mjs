/**
 * tests/order-documents.test.mjs - the documents a paid order gets (lib/agreementPdf.js, lib/invoicePdf.js,
 * lib/orderDocuments.js, api/order-document.js), checked on the PDFs themselves, not on return codes:
 *   - the agreement confirmation names licensor, licensee, order, product, release, package hash, licence scope and
 *     duration, price, inclusions and exclusions, support, the four accepted documents with version and SHA-256, and
 *     the acceptance evidence; it states that it is a record of an electronic agreement and not a signature;
 *   - what it promises equals the catalogue's published product facts (config/order-documents.json vs
 *     public/agents.html), so the PDF can never promise more than the page;
 *   - a legal version bumped after the purchase does not change the document (the order's versions are used);
 *   - the sandbox invoice and credit note PDFs are marked TEST on their face and carry number, parties, tax wording
 *     and payment reference; an undecided CZK conversion is stated as undecided;
 *   - documents are produced once and recorded; a store failure is recorded, never silently complete;
 *   - a document link opens only for the order's own buyer.
 * Usage: node --test tests/order-documents.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url);
const DOCS = JSON.parse(readFileSync(new URL('config/order-documents.json', ROOT), 'utf8'));

process.env.DOWNLOAD_TOKEN_SECRET = 'order-documents-test-secret';
process.env.BLOB_STORE_ID = 'store_test_documents';
delete process.env.VERCEL_ENV;

// A loopback KV (lib/db.js reads its address at import, so it starts before the modules load).
const kv = new Map();
let kvServer;
let agreementPdf, invoicePdf, orderDocuments, documentStore, downloadToken, storage, endpoint;
before(async () => {
  const http = await import('node:http');
  const { casReply } = await import('./kv-cas-fake.mjs');
  kvServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST') return res.end(JSON.stringify({ result: casReply(kv, JSON.parse(body)) }));
      const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
      if (cmd === 'GET') return res.end(JSON.stringify({ result: kv.get(args[0]) ?? null }));
      if (cmd === 'SET') { if (args.includes('NX') && kv.has(args[0])) return res.end(JSON.stringify({ result: null })); kv.set(args[0], args[1]); return res.end(JSON.stringify({ result: 'OK' })); }
      res.end(JSON.stringify({ result: null }));
    });
  });
  await new Promise((r) => kvServer.listen(0, '127.0.0.1', r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'dummy';
  agreementPdf = await import('../lib/agreementPdf.js');
  invoicePdf = await import('../lib/invoicePdf.js');
  orderDocuments = await import('../lib/orderDocuments.js');
  documentStore = await import('../lib/documentStore.js');
  downloadToken = await import('../lib/downloadToken.js');
  storage = await import('../lib/storage.js');
  endpoint = await import('../api/order-document.js');
});
after(async () => { kvServer.closeAllConnections?.(); await new Promise((r) => kvServer.close(r)); });

/** Text of every page of a PDF, through a real PDF parser (pdf.js). */
async function pdfText(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out += tc.items.map((it) => it.str).join(' ') + '\n';
  }
  const text = out.replace(/\s+/g, ' ');
  // Long tokens (hashes, versions in narrow table cells) wrap across lines: compare without whitespace too.
  const squashed = text.replace(/\s+/g, '');
  const has = (needle) => text.includes(needle) || squashed.includes(String(needle).replace(/\s+/g, ''));
  return { pages: pdf.numPages, text, squashed, has };
}

const LEGAL_AT_ORDER = {
  terms: { version: '2026-06-13', sha256: 'a'.repeat(64), archive: 'legal/archive/terms/2026-06-13.html' },
  licence: { version: '2026-06-13', sha256: 'b'.repeat(64), archive: 'legal/archive/licence/2026-06-13.html' },
  refund: { version: '1.0 (2026-07-09)', sha256: 'c'.repeat(64), archive: 'legal/archive/refund/1.0-2026-07-09.html' },
  privacy: { version: '2026-06-13', sha256: 'd'.repeat(64), archive: 'legal/archive/privacy/2026-06-13.html' },
};
const paidOrder = (over = {}) => ({
  id: 'ord_20261120_abcdef123456', mode: 'test', createdAt: '2026-11-20T18:00:00.000Z', status: 'fulfilled',
  product: { slug: 'contract-intelligence-and-register', sku: 'CAI-L4-CI-001', release: '1.0.3.6', tier: 'L4', name: 'ColleagueAI Contract Intelligence & Register' },
  price: { currency: 'usd', unitAmount: 1490000, quantity: 1 },
  buyer: { company: 'Vzorová Průmyslová a.s.', registrationNumber: '12345678', country: 'CZ', taxId: { value: 'CZ12345678', type: 'eu_vat' }, tenant: 'vzorova-prumyslova.example', contact: { name: 'Jana Nováková', email: 'nakup@vzorova.example' }, signatory: { name: 'Jana Nováková', role: 'Jednatelka' } },
  acceptance: { id: 'acc_0123456789abcdef01234567', legalSet: '2026-07-09', acceptedAt: '2026-11-20T18:00:01.000Z', documents: LEGAL_AT_ORDER },
  payment: { lane: 'card' },
  tax: { policyVersion: 'sandbox-2026-11-10', policyStatus: 'sandbox', category: 'cz_business', applied: true, action: 'sell', invoiceNote: 'TEST - domestic treatment not decided', invoiceRoute: 'sandbox_ledger', seller: { legalName: 'Colleague AI s.r.o.', registrationNumber: '29540852', register: 'Městský soud v Praze, C 448176', address: 'Školská 1736/12, Nové Město, 110 00 Praha 1, Czech Republic', vatStatus: 'sandbox', vatId: null } },
  stripe: { sessionId: 'cs_test_doc1', paymentIntentId: 'pi_doc1', customerId: 'cus_doc1' },
  facts: { paidAt: '2026-11-20T18:05:00.000Z', fulfilledAt: '2026-11-20T18:05:01.000Z', currency: 'usd', amountSubtotal: 1490000, amountTax: 0, amountTotal: 1490000, billingCountry: 'CZ', purchaseEmail: 'nakup@vzorova.example' },
  invoice: { status: 'issued', provider: 'sandbox_ledger', id: 'TEST-INV-2026-0001', number: 'TEST-INV-2026-0001', test: true },
  events: [], ...over,
});
const acceptanceRecord = { consents: { authority: true, terms: true, delivery: true }, clientHash: 'f00dcafe0123', userAgent: 'Mozilla/5.0 (test)', lang: 'en', acceptedAt: '2026-11-20T18:00:01.000Z' };

test('agreement confirmation PDF: every required element is on the page, and it is a record, not a signature', async () => {
  const { model, bytes } = await agreementPdf.buildAgreementPdf({ order: paidOrder(), acceptance: acceptanceRecord, now: new Date('2026-11-20T18:05:02Z') });
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
  const { pages, text, has } = await pdfText(bytes);
  assert.ok(pages >= 2);
  for (const needle of [
    'Licence Agreement Confirmation', 'Colleague AI s.r.o.', 'Školská 1736/12', 'Company ID (IČO) 29540852',           // licensor
    'Vzorová Průmyslová a.s.', 'Business registration number 12345678', 'Czechia (CZ)', 'VAT / tax ID CZ12345678',   // licensee
    model.reference, 'ord_20261120_abcdef123456', 'acc_0123456789abcdef01234567', 'pi_doc1',                        // references
    'CAI-L4-CI-001', '1.0.3.6', 'CAI-L4-CI-001_1.0.3.6.zip', '69b3067694fdb27952f66addae17b45836dddfd3965bae6f5e6fe2b', // product + hash
    'single-tenant licence', 'vzorova-prumyslova.example (as stated by the Licensee at order)', 'Perpetual for the licensed tenant', // scope, tenant, duration
    'USD 14,900.00', 'TEST MODE - no real payment',                                                                   // price, mode
    DOCS.products['contract-intelligence-and-register'].includes.slice(0, 60), DOCS.products['contract-intelligence-and-register'].excludes.slice(0, 60),
    'Support by e-mail (hello@colleagueai.ai)', 'including security defects', 'New feature releases are not included', // support + security updates
    'Terms of Service', 'Software & Agent Licence', 'Refund Policy', 'Privacy Policy', '2026-06-13', '1.0 (2026-07-09)', 'a'.repeat(64), 'd'.repeat(64), // documents
    'Electronic acceptance (click-through)', 'Jana Nováková, Jednatelka', 'Confirmed: authorised to enter into this agreement', 'right of withdrawal lapses', // evidence
    '2026-11-20 18:00:01 UTC', 'f00dcafe0123', 'not a new acceptance', 'No handwritten or qualified electronic signature',
  ]) assert.ok(has(needle), `missing in PDF text: ${needle}`);
  assert.ok(!/signed by|digitally signed|e-signature applied/i.test(text), 'no signature claim');
});

test('a tenant not given at order is stated as not given, never invented; missing consents are stated as NOT RECORDED', async () => {
  const order = paidOrder({ buyer: { ...paidOrder().buyer, tenant: null } });
  const { text } = await pdfText((await agreementPdf.buildAgreementPdf({ order, acceptance: null })).bytes);
  assert.ok(text.includes('No tenant identifier was given at order'));
  assert.ok(text.includes('NOT RECORDED'), 'without the acceptance record the consents are not asserted');
});

test('what the PDF says the purchase includes equals the published product facts on the catalogue page', () => {
  const html = readFileSync(new URL('public/agents.html', ROOT), 'utf8');
  const m = html.match(/window\.PRODUCT_FACTS=(\{.*?\});\s*window\.CAI_PRICING/s);
  assert.ok(m, 'public/agents.html carries PRODUCT_FACTS');
  const facts = Object.fromEntries(JSON.parse(m[1])['contract-intelligence-and-register'].en);
  const ours = DOCS.products['contract-intelligence-and-register'];
  assert.equal(ours.includes, facts['What USD 14,900 includes']);
  assert.equal(ours.excludes, facts['What it does not include']);
  assert.equal(ours.delivery, facts['How it is delivered']);
});

test('a legal version bumped after the purchase does not change the agreement confirmation: the order\'s own versions are used', async () => {
  const live = JSON.parse(readFileSync(new URL('config/legal.json', ROOT), 'utf8'));
  const order = paidOrder();
  // The live config says terms are at some version; the order says it accepted 2026-06-13 with fingerprint aaaa…
  const first = await pdfText((await agreementPdf.buildAgreementPdf({ order, acceptance: acceptanceRecord })).bytes);
  assert.ok(first.has('a'.repeat(64)));
  assert.ok(!first.has(live.documents.terms.sha256), 'the live fingerprint is not in the document unless the order recorded it');
  // A buyer who accepted a later set gets that set, nothing else.
  const later = paidOrder({ acceptance: { ...order.acceptance, legalSet: '2027-01-01', documents: { ...LEGAL_AT_ORDER, terms: { version: '2027-01-01', sha256: 'e'.repeat(64), archive: 'legal/archive/terms/2027-01-01.html' } } } });
  const t2 = await pdfText((await agreementPdf.buildAgreementPdf({ order: later, acceptance: acceptanceRecord })).bytes);
  assert.ok(t2.has('2027-01-01') && t2.has('e'.repeat(64)) && !t2.has('a'.repeat(64)));
});

test('sandbox invoice and credit-note PDFs: marked TEST on their face, with number, parties, tax wording, payment reference and an undecided CZK conversion', async () => {
  const order = paidOrder();
  const doc = { number: 'TEST-INV-2026-0001', kind: 'invoice', provider: 'sandbox_ledger', test: true, issuedAt: '2026-11-20T18:05:00.500Z', orderId: order.id, seller: order.tax.seller, buyer: order.buyer, product: order.product, currency: 'usd', subtotal: 1490000, tax: 0, total: 1490000, taxTreatment: order.tax };
  const inv = await pdfText(await invoicePdf.renderInvoicePdf(invoicePdf.invoiceModel({ doc, order })));
  for (const n of ['TEST INVOICE TEST-INV-2026-0001', 'NOT A TAX DOCUMENT', 'Colleague AI s.r.o.', 'Vzorová Průmyslová a.s.', 'VAT / tax ID CZ12345678', 'Invoice date 2026-11-20', 'Date of taxable supply 2026-11-20', 'pi_doc1', 'USD 14,900.00', 'TEST - domestic treatment not decided', 'Accounting conversion to CZK: not shown', 'decision T8']) {
    assert.ok(inv.has(n), `invoice missing: ${n}`);
  }
  assert.ok(!/Tax ID \(DIČ\)/.test(inv.text), 'no DIČ while the seller is not registered');
  const entry = { status: 'issued', provider: 'sandbox_ledger', refundId: 're_doc1', id: 'TEST-CN-2026-0001', number: 'TEST-CN-2026-0001', amount: 1490000, invoiceNumber: 'TEST-INV-2026-0001', test: true, issuedAt: '2026-11-21T09:00:00.000Z' };
  const cn = await pdfText(await invoicePdf.renderInvoicePdf(invoicePdf.creditNoteModel({ entry, invoiceDoc: doc, order })));
  for (const n of ['TEST CREDIT NOTE TEST-CN-2026-0001', 'Corrects invoice TEST-INV-2026-0001', 're_doc1', '-USD 14,900.00', 'NOT A TAX DOCUMENT']) assert.ok(cn.has(n), `credit note missing: ${n}`);
  // With an approved conversion recorded on the ledger entry it is shown with its source and date.
  const withRate = invoicePdf.invoiceModel({ doc: { ...doc, conversion: { rate: '21.345', amountCzk: 31804050, source: 'ČNB', date: '2026-11-20' } }, order });
  assert.match(withRate.conversion[0], /CZK 318,040\.50 at 21\.345 USD\/CZK \(ČNB, 2026-11-20\)/);
});

/** An in-memory Blob store with the SDK surface lib/documentStore.js uses. */
function fakeBlob() {
  const objects = new Map();
  class BlobNotFoundError extends Error {}
  const sdk = {
    objects, BlobNotFoundError,
    put: async (key, body, opts) => {
      if (opts?.access !== 'private') throw new Error('documents must be private');
      if (objects.has(key) && !opts?.allowOverwrite) throw new Error(`This blob already exists, use allowOverwrite: ${key}`);
      objects.set(key, Buffer.from(body)); return { pathname: key, url: `https://store.blob.test/${key}` };
    },
    head: async (key) => { if (!objects.has(key)) throw new BlobNotFoundError('not found'); return { size: objects.get(key).length, uploadedAt: '2026-11-20T18:05:03.000Z' }; },
    get: async (key) => (objects.has(key) ? { blob: new Blob([objects.get(key)]) } : null),
    issueSignedToken: async (o) => ({ validUntil: o.validUntil }),
    presignUrl: async (t, o) => ({ presignedUrl: `https://store.blob.test/${o.pathname}?sig=x` }),
  };
  return sdk;
}

test('document store: private, write-once, read-back by hash', async () => {
  const sdk = fakeBlob();
  storage.__setBlobSdkForTests(sdk);
  const bytes = Buffer.from('%PDF-1.7 fake');
  const first = await documentStore.putOrderDocument('ord_20261120_abcdef123456', 'x.pdf', bytes);
  assert.equal(first.stored, true);
  assert.equal(first.sha256, createHash('sha256').update(bytes).digest('hex'));
  const second = await documentStore.putOrderDocument('ord_20261120_abcdef123456', 'x.pdf', Buffer.from('other'));
  assert.equal(second.exists, true, 'a second write never overwrites');
  assert.equal((await documentStore.getOrderDocument('ord_20261120_abcdef123456', 'x.pdf')).toString(), '%PDF-1.7 fake');
  assert.throws(() => documentStore.orderDocumentKey('ord_20261120_abcdef123456', '../etc/passwd'), /invalid file name/);
  assert.throws(() => documentStore.orderDocumentKey('nope', 'x.pdf'), /invalid order id/);
  storage.__setBlobSdkForTests(null);
});

test('order-document links: only the order\'s buyer, only issued documents, never without the secret; download tokens do not cross over', async () => {
  const order = paidOrder({ documents: { agreement: { status: 'issued', file: 'licence-agreement-confirmation.pdf', key: 'orders/ord_20261120_abcdef123456/licence-agreement-confirmation.pdf', sha256: 'ab', bytes: 1 }, invoice: { status: 'waiting', reason: 'invoice_pending' } } });
  assert.equal(endpoint.buyerOwnsOrder(order, 'NAKUP@vzorova.example'), true);
  assert.equal(endpoint.buyerOwnsOrder(order, 'someone@else.example'), false);
  assert.deepEqual(Object.keys(endpoint.issuedDocuments(order)), ['licence-agreement-confirmation.pdf']);
  const good = downloadToken.signOrderDocument({ email: 'nakup@vzorova.example', orderId: order.id, file: 'licence-agreement-confirmation.pdf' });
  assert.equal(downloadToken.openOrderDocument(good.t).ok, true);
  assert.equal(downloadToken.openDownload(good.t).ok, false, 'a document token does not open the package endpoint');
  const dl = downloadToken.signDownload({ email: 'nakup@vzorova.example', slug: 'contract-intelligence-and-register', file: 'dossier.pdf' });
  assert.equal(downloadToken.openOrderDocument(dl.t).ok, false, 'a download token does not open a document');
  const tampered = good.t.slice(0, -4) + (good.t.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal(downloadToken.openOrderDocument(tampered).reason, 'bad-token');
  const secret = process.env.DOWNLOAD_TOKEN_SECRET;
  delete process.env.DOWNLOAD_TOKEN_SECRET;
  assert.equal(downloadToken.openOrderDocument(good.t).reason, 'server-misconfigured');
  process.env.DOWNLOAD_TOKEN_SECRET = secret;
});

test('ensureOrderDocuments: produced once, recorded with hashes, evidence written; a store failure is recorded and the summary says what is missing', async () => {
  // The loopback KV holds the order, the acceptance and the ledger document.
  kv.clear();
  const order = paidOrder();
  kv.set(`order:${order.id}`, JSON.stringify(order));
  kv.set(`acceptance:${order.acceptance.id}`, JSON.stringify({ id: order.acceptance.id, ...acceptanceRecord }));
  kv.set('invoice:sandbox_ledger:TEST-INV-2026-0001', JSON.stringify({ number: 'TEST-INV-2026-0001', provider: 'sandbox_ledger', test: true, issuedAt: '2026-11-20T18:05:00.500Z', orderId: order.id, seller: order.tax.seller, buyer: order.buyer, product: order.product, currency: 'usd', subtotal: 1490000, tax: 0, total: 1490000, taxTreatment: order.tax }));
  try {
    // 1. No document store: nothing is produced, and the order says so.
    storage.__setBlobSdkForTests(null);
    const saved = process.env.BLOB_STORE_ID; delete process.env.BLOB_STORE_ID;
    let o = await orderDocuments.ensureOrderDocuments({ orderId: order.id, now: new Date('2026-11-20T18:05:03Z') });
    assert.equal(o.documents.agreement.status, 'failed');
    assert.equal(o.documents.agreement.reason, 'storage_not_configured');
    assert.equal(o.documents.summary.complete, false);
    assert.ok(o.documents.summary.missing.includes('agreement:storage_not_configured'));
    process.env.BLOB_STORE_ID = saved;
    // 2. With the store: both documents, hashed as stored, once.
    const sdk = fakeBlob();
    storage.__setBlobSdkForTests(sdk);
    o = await orderDocuments.ensureOrderDocuments({ orderId: order.id, now: new Date('2026-11-20T18:05:04Z') });
    assert.equal(o.documents.agreement.status, 'issued', JSON.stringify(o.documents));
    assert.equal(o.documents.invoice.status, 'issued', JSON.stringify(o.documents.invoice));
    assert.equal(o.documents.invoice.file, 'invoice-TEST-INV-2026-0001.pdf');
    const stored = sdk.objects.get(o.documents.agreement.key);
    assert.equal(createHash('sha256').update(stored).digest('hex'), o.documents.agreement.sha256);
    assert.ok((await pdfText(stored)).has('Licence Agreement Confirmation'));
    assert.deepEqual(o.documents.summary.missing, [], 'invoice issued, agreement issued, no notification attempted yet');
    const evidence = await orderDocuments.getEvidence(order.id);
    assert.equal(evidence.documents.agreement.sha256, o.documents.agreement.sha256);
    assert.equal(evidence.invoice.number, 'TEST-INV-2026-0001');
    assert.equal(evidence.payment.paymentIntentId, 'pi_doc1');
    assert.equal(evidence.release.sha256, '69b3067694fdb27952f66addae17b45836dddfd3965bae6f5e6fe2bdd25dbd50');
    assert.equal(evidence.acceptance.documents.terms.sha256, 'a'.repeat(64));
    // 3. Run again: nothing new is written.
    const puts = sdk.objects.size;
    const again = await orderDocuments.ensureOrderDocuments({ orderId: order.id, now: new Date('2026-11-20T18:06:00Z') });
    assert.equal(sdk.objects.size, puts);
    assert.equal(again.documents.agreement.sha256, o.documents.agreement.sha256);
    // 4. A record write lost after the object was stored: the retry reads the stored object back and records its hash.
    kv.set(`order:${order.id}`, JSON.stringify({ ...order, documents: undefined }));
    const recovered = await orderDocuments.ensureOrderDocuments({ orderId: order.id, now: new Date('2026-11-20T18:07:00Z') });
    assert.equal(recovered.documents.agreement.reused, true);
    assert.equal(recovered.documents.agreement.sha256, o.documents.agreement.sha256);
  } finally {
    storage.__setBlobSdkForTests(null);
  }
});
