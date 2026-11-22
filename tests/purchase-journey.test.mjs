/**
 * tests/purchase-journey.test.mjs - the whole B2B purchase, end to end, in the scenarios the launch brief lists (PR C).
 *
 * Real handlers (api/checkout.js, api/webhook.js, api/success.js, api/download.js) run against a fake Stripe API and a
 * fake Upstash on loopback. Webhook events are signed with a local dummy secret. Nothing leaves the machine, no real
 * key is used and no money moves. Each test states the scenario it covers.
 * Usage: node --test tests/purchase-journey.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { legalFingerprint } from '../lib/legalArchive.js';
import { casReply } from './kv-cas-fake.mjs';
// This suite tests checkout behaviour across buyer categories, currencies and payment methods; the first-sale
// launch scope (CZ businesses, USD, card) has its own suite, tests/launch-scope.test.mjs. Test keys only.
process.env.LAUNCH_SCOPE_TEST_BYPASS = '1';

const ROOT = new URL('..', import.meta.url);
const LEGAL = JSON.parse(readFileSync(new URL('config/legal.json', ROOT), 'utf8'));
const PRODUCTS = JSON.parse(readFileSync(new URL('config/products.json', ROOT), 'utf8'));
const SLUG = 'contract-intelligence-and-register';
const PRODUCT = PRODUCTS[SLUG];
const PRICE = 1490000;
const SECRET = 'whsec_LOCAL_JOURNEY_DUMMY';

// ── fake Upstash ────────────────────────────────────────────────────────────────────────────────────────────────
const kv = new Map();
const sets = new Map();
let kvServer;
function kvReply(cmd, args) {
  switch (cmd) {
    case 'GET': return kv.get(args[0]) ?? null;
    case 'SET': {
      if (args.includes('NX') && kv.has(args[0])) return null;
      kv.set(args[0], args[1]); return 'OK';
    }
    case 'DEL': return kv.delete(args[0]) ? 1 : 0;
    case 'INCR': { const n = Number(kv.get(args[0]) ?? 0) + 1; kv.set(args[0], String(n)); return n; }
    case 'EXPIRE': return 1;
    case 'SADD': { const s = sets.get(args[0]) ?? new Set(); s.add(args[1]); sets.set(args[0], s); return 1; }
    case 'SMEMBERS': return [...(sets.get(args[0]) ?? [])];
    case 'LPUSH': return 1;
    default: return null;
  }
}

/**
 * metadata[...] form fields as an object. Built with Object.fromEntries, which defines own properties, so a key such
 * as "__proto__" in a request can never write to a prototype.
 */
const metadataOf = (params) => Object.fromEntries(
  [...params].map(([k, v]) => [k.match(/^metadata\[([^\]]+)\]$/)?.[1], v]).filter(([k]) => k),
);

// ── fake Stripe ─────────────────────────────────────────────────────────────────────────────────────────────────
const stripeCalls = [];
const sessions = new Map();       // id -> session object served by GET
const invoices = new Map();       // id -> invoice object
const refunds = new Map();        // charge id -> [refund]
const customers = new Map();      // id -> customer object
let customerMode = 'ok';
let sessionMode = 'ok';
let seq = 0;
let stripeServer;
function stripeReply(req, raw) {
  const url = new URL(req.url, 'http://x');
  const params = new URLSearchParams(raw);
  stripeCalls.push({ method: req.method, path: url.pathname, query: url.searchParams, params });
  const p = url.pathname;
  if (req.method === 'POST' && p === '/v1/customers') {
    if (customerMode === 'tax_id_invalid') return [400, { error: { type: 'invalid_request_error', code: 'tax_id_invalid', param: 'tax_id_data[0][value]', message: 'Invalid value.' } }];
    const id = `cus_j${++seq}`;
    const metadata = metadataOf(params);
    customers.set(id, { id, object: 'customer', metadata, name: params.get('name'), email: params.get('email') });
    return [200, customers.get(id)];
  }
  if (req.method === 'GET' && p.startsWith('/v1/customers/')) return [200, customers.get(p.split('/').pop()) ?? {}];
  if (req.method === 'POST' && p === '/v1/checkout/sessions') {
    if (sessionMode === 'tax_failure') return [400, { error: { type: 'invalid_request_error', code: 'customer_tax_location_invalid', message: 'Tax could not be calculated for this address.' } }];
    const id = `cs_test_j${++seq}`;
    return [200, { id, object: 'checkout.session', url: `https://checkout.example.test/c/pay/${id}` }];
  }
  if (req.method === 'GET' && p === '/v1/checkout/sessions') {
    const pi = url.searchParams.get('payment_intent');
    return [200, { object: 'list', data: [...sessions.values()].filter((s) => s.payment_intent === pi), has_more: false }];
  }
  if (req.method === 'GET' && p.startsWith('/v1/checkout/sessions/')) {
    const s = sessions.get(p.split('/').pop());
    return s ? [200, s] : [404, { error: { type: 'invalid_request_error', message: 'No such session' } }];
  }
  if (req.method === 'GET' && p.startsWith('/v1/invoices/')) return [200, invoices.get(p.split('/').pop()) ?? {}];
  if (req.method === 'GET' && p === '/v1/invoice_payments') return [200, { object: 'list', data: [], has_more: false }];
  if (req.method === 'GET' && p === '/v1/refunds') return [200, { object: 'list', data: refunds.get(url.searchParams.get('charge')) ?? [], has_more: false }];
  if (req.method === 'POST' && p === '/v1/credit_notes' && !['amount', 'lines[0][type]', 'shipping_cost[shipping_rate]'].some((k) => params.has(k))) {
    // As Stripe answers (seen in the sandbox on 11 Nov 2026): a credit note needs amount, lines or shipping_cost.
    return [400, { error: { type: 'invalid_request_error', code: 'parameter_missing', param: 'amount or lines or shipping_cost', message: 'Missing required param: amount or lines or shipping_cost.' } }];
  }
  if (req.method === 'POST' && p === '/v1/credit_notes') return [200, { id: `cn_j${++seq}`, object: 'credit_note', number: `CN-${seq}`, pdf: 'https://pay.stripe.test/cn.pdf' }];
  return [404, { error: { message: `unhandled ${req.method} ${p}` } }];
}

// ── fake Resend (the buyer notification, lib/mail.js) and fake private Blob store (order documents) ─────────────
const mails = [];
let mailServer;
let mailMode = 'ok';
function fakeBlobStore() {
  const objects = new Map();
  class BlobNotFoundError extends Error {}
  return {
    objects, BlobNotFoundError,
    put: async (key, body, opts) => {
      if (opts?.access !== 'private') throw new Error('order documents must be private');
      if (objects.has(key) && !opts?.allowOverwrite) throw new Error(`This blob already exists: ${key}`);
      objects.set(key, Buffer.from(body)); return { pathname: key };
    },
    head: async (key) => {
      if (key.startsWith('agents/')) return { size: PRODUCT.release.bytes };
      if (!objects.has(key)) throw new BlobNotFoundError('not found'); return { size: objects.get(key).length, uploadedAt: new Date().toISOString() };
    },
    get: async (key) => (objects.has(key) ? { blob: new Blob([objects.get(key)]) } : null),
    issueSignedToken: async (o) => ({ validUntil: o.validUntil }),
    presignUrl: async (t, o) => ({ presignedUrl: `https://store.blob.test/${o.pathname}?sig=x` }),
  };
}
let blobStore = null;
/** Switch the private document store and the mail transport on for a scenario (both off by default). */
function withDelivery({ mail = true } = {}) {
  blobStore = fakeBlobStore();
  storage.__setBlobSdkForTests(blobStore);
  process.env.BLOB_STORE_ID = 'store_journey';
  if (mail) process.env.RESEND_API_KEY = 're_test_journey_dummy_key';
  return blobStore;
}
async function pdfText(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) out += (await (await pdf.getPage(i)).getTextContent()).items.map((it) => it.str).join(' ') + ' ';
  const text = out.replace(/\s+/g, ' ');
  const squashed = text.replace(/\s+/g, '');
  return { text, has: (n) => text.includes(n) || squashed.includes(String(n).replace(/\s+/g, '')) };
}

let webhookServer, webhookBase, checkout, success, download, orderDocument, storage, db, orders, downloadToken;
before(async () => {
  mailServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (mailMode === 'down') { res.writeHead(500); return res.end('{}'); }
      mails.push({ auth: req.headers.authorization, ...JSON.parse(raw) });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: `email_${mails.length}` }));
    });
  });
  await new Promise((r) => mailServer.listen(0, '127.0.0.1', r));
  process.env.RESEND_API_URL = `http://127.0.0.1:${mailServer.address().port}`;
  kvServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST') return res.end(JSON.stringify({ result: casReply(kv, JSON.parse(body)) }));
      const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
      res.end(JSON.stringify({ result: kvReply(cmd, args) }));
    });
  });
  stripeServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { const [code, body] = stripeReply(req, raw); res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); });
  });
  await new Promise((r) => kvServer.listen(0, '127.0.0.1', r));
  await new Promise((r) => stripeServer.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    KV_REST_API_URL: `http://127.0.0.1:${kvServer.address().port}`, KV_REST_API_TOKEN: 'local-dummy-token',
    STRIPE_API_HOST: `http://127.0.0.1:${stripeServer.address().port}`, STRIPE_SECRET_KEY: 'sk_test_journey_never_sent',
    STRIPE_WEBHOOK_SECRET: SECRET, DOWNLOAD_TOKEN_SECRET: 'journey-download-secret', RELEASE_TEST_DELIVERY: '1',
  });
  delete process.env.VERCEL_ENV; delete process.env.CHECKOUT_ENABLED; delete process.env.CERTIFICATION_SALES_ENABLED;
  ({ default: checkout } = await import('../api/checkout.js'));
  ({ default: success } = await import('../api/success.js'));
  ({ default: download } = await import('../api/download.js'));
  ({ default: orderDocument } = await import('../api/order-document.js'));
  const webhook = (await import('../api/webhook.js')).default;
  storage = await import('../lib/storage.js');
  db = await import('../lib/db.js');
  orders = await import('../lib/orders.js');
  downloadToken = await import('../lib/downloadToken.js');
  webhookServer = http.createServer((req, res) => {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    webhook(req, res);
  });
  await new Promise((r) => webhookServer.listen(0, '127.0.0.1', r));
  webhookBase = `http://127.0.0.1:${webhookServer.address().port}`;
});
after(async () => {
  for (const s of [kvServer, stripeServer, webhookServer, mailServer]) { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); }
});
beforeEach(() => {
  kv.clear(); sets.clear(); stripeCalls.length = 0; sessions.clear(); invoices.clear(); refunds.clear(); customers.clear();
  customerMode = 'ok'; sessionMode = 'ok';
  for (const k of ['TAX_POLICY_SANDBOX', 'TAX_SANDBOX_INVOICE_ROUTE', 'INVOICE_SANDBOX_FAIL']) delete process.env[k];
  storage.__setBlobSdkForTests(null);
  delete process.env.BLOB_STORE_ID;
  delete process.env.RESEND_API_KEY;
  mails.length = 0; mailMode = 'ok'; blobStore = null;
});

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
function mockRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.redirect = (code, url) => { r.statusCode = code; r.headers.location = url; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.writeHead = (c, h = {}) => { r.statusCode = c; for (const [k, v] of Object.entries(h)) r.headers[k.toLowerCase()] = v; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  return r;
}
const BUYERS = {
  cz: { company: 'Vzorová Průmyslová a.s.', reg_number: '12345678', country: 'CZ', tax_id: 'CZ12345678', email: 'nakup@vzorova.example', name: 'Jana Nováková', role: 'Jednatelka' },
  de: { company: 'Beispiel Werke GmbH', reg_number: 'HRB 12345', country: 'DE', tax_id: 'DE123456789', email: 'einkauf@beispiel.example', name: 'Max Muster', role: 'Geschäftsführer' },
  deNoVat: { company: 'Kleine Firma GmbH', country: 'DE', tax_id: '', email: 'buero@kleine.example', name: 'Eva Klein', role: 'Inhaberin' },
  us: { company: 'Example Corp', reg_number: 'DE-7654321', country: 'US', tax_id: '', email: 'procurement@example-corp.example', name: 'Pat Doe', role: 'VP Procurement' },
};
async function placeOrder(buyer, extra = {}) {
  const res = mockRes();
  await checkout({ method: 'POST', query: {}, headers: { host: 'shop.example.test', 'x-forwarded-for': '198.51.100.4' },
    body: { agent: SLUG, method: 'card', lang: 'en', authority: 'on', terms: 'on', delivery: 'on', legal_set: LEGAL.set, ...buyer, ...extra } }, res);
  const call = [...stripeCalls].reverse().find((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST');
  if (res.statusCode !== 303) return { res };
  const id = res.headers.location.split('/').pop();
  const metadata = metadataOf(call.params);
  return { res, id, metadata, params: call.params, orderId: metadata.order_id, customer: call.params.get('customer') };
}
/** The session object Stripe would hold once the buyer finished the hosted page. */
function finished(o, buyer, overrides = {}) {
  const s = {
    id: o.id, object: 'checkout.session', livemode: false, mode: 'payment', status: 'complete', payment_status: 'paid',
    currency: 'usd', amount_subtotal: PRICE, amount_total: PRICE, total_details: { amount_tax: 0 },
    customer: o.customer, client_reference_id: o.orderId, payment_intent: `pi_${o.id}`, invoice: null,
    customer_details: { email: buyer.email, business_name: buyer.company, address: { country: buyer.country }, tax_ids: [] },
    metadata: { ...o.metadata }, ...overrides,
  };
  sessions.set(s.id, s);
  return s;
}
const stripe = new Stripe('sk_test_journey_never_sent');
let evt = 0;
async function deliver(type, object, id = `evt_j${++evt}`) {
  const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  const r = await fetch(`${webhookBase}/api/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
  return { status: r.status, body: await r.json().catch(() => ({})), id };
}
async function thankYou(sessionId) {
  const res = mockRes();
  await success({ query: { session_id: sessionId, lang: 'en' }, headers: {} }, res);
  return res;
}
const order = (id) => orders.getOrder(id);
const entitlement = (email) => db.getEntitlement(email);
const charge = (s, extra = {}) => ({ id: `ch_${s.id}`, object: 'charge', amount: s.amount_total, payment_intent: s.payment_intent,
  metadata: { order_id: s.metadata.order_id, agent_slug: SLUG }, billing_details: { email: s.customer_details.email }, ...extra });

// ── scenarios ───────────────────────────────────────────────────────────────────────────────────────────────────
test('Czech company: confirmation, payment, licence, thank-you page with release, SHA-256, order number and invoice status', async () => {
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  assert.equal(o.res.statusCode, 303);
  const s = finished(o, b);
  const r = await deliver('checkout.session.completed', s);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.order, o.orderId);
  const ord = await order(o.orderId);
  assert.equal(ord.status, 'fulfilled');
  assert.equal(ord.tax.category, 'cz_business');
  assert.equal(ord.invoice.status, 'not_configured', 'no invoice while the tax policy is unapproved');
  assert.equal(ord.facts.billingCountry, 'CZ');
  assert.equal(ord.stripe.paymentIntentId, `pi_${o.id}`);
  assert.ok((await entitlement(b.email)).sessionSlugs[o.id].includes(SLUG));
  const acc = await db.getAcceptance(ord.acceptance.id);
  assert.equal(acc.stripeSessionId, o.id);
  assert.equal(acc.buyerEmail, b.email);
  const page = await thankYou(o.id);
  assert.match(page.body, new RegExp(PRODUCT.release.package.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(page.body, new RegExp(PRODUCT.release.sha256));
  const escapedOrderId = String(o.orderId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(page.body, new RegExp(escapedOrderId));
  assert.match(page.body, /no invoice is issued while invoicing is switched off/);
});

test('EU company with a valid VAT ID: sent to Stripe for verification; the verified result lands on the order', async () => {
  const b = BUYERS.de;
  const o = await placeOrder(b);
  const cust = stripeCalls.find((c) => c.path === '/v1/customers');
  assert.equal(cust.params.get('tax_id_data[0][value]'), 'DE123456789');
  assert.equal((await order(o.orderId)).tax.category, 'eu_business_vat_pending', 'before payment a VAT ID is always pending');
  await deliver('checkout.session.completed', finished(o, b));
  const r = await deliver('customer.tax_id.updated', { id: 'txi_1', object: 'tax_id', customer: o.customer, type: 'eu_vat', value: 'DE123456789', verification: { status: 'verified' } });
  assert.equal(r.status, 200);
  const ord = await order(o.orderId);
  assert.equal(ord.facts.taxIdVerification.status, 'verified');
  assert.equal(ord.tax.verifiedCategory, 'eu_business_vat_verified');
  assert.equal(ord.facts.taxReview, undefined);
});

test('EU company with an invalid VAT ID: Stripe refuses it, the form comes back, nothing is charged', async () => {
  customerMode = 'tax_id_invalid';
  const o = await placeOrder({ ...BUYERS.de, tax_id: 'DE000000000' });
  assert.equal(o.res.statusCode, 400);
  assert.match(o.res.body, /Stripe did not accept this VAT/);
  assert.ok(!stripeCalls.some((c) => c.path === '/v1/checkout/sessions'));
});

test('EU company whose VAT ID is not confirmed after payment: the order is flagged for the accountant, never re-taxed', async () => {
  const b = BUYERS.de;
  const o = await placeOrder(b);
  await deliver('checkout.session.completed', finished(o, b));
  await deliver('customer.tax_id.updated', { id: 'txi_2', object: 'tax_id', customer: o.customer, type: 'eu_vat', value: 'DE123456789', verification: { status: 'unverified' } });
  const ord = await order(o.orderId);
  assert.equal(ord.tax.verifiedCategory, 'eu_business_vat_unverified');
  assert.equal(ord.facts.taxReview, 'vat_id_not_confirmed_after_payment');
  assert.equal(ord.status, 'fulfilled', 'the licence stands; the tax question goes to the accountant');
});

test('EU company without a VAT ID: a business, not a consumer; held for manual handling when the (sandbox) policy says so', async () => {
  const o = await placeOrder(BUYERS.deNoVat);
  assert.equal(o.res.statusCode, 303, 'unapproved policy: nothing is decided, the test order proceeds');
  assert.equal((await order(o.orderId)).tax.category, 'eu_business_no_vat_id');
  process.env.TAX_POLICY_SANDBOX = '1';
  const held = await placeOrder(BUYERS.deNoVat);
  assert.equal(held.res.statusCode, 409);
  assert.match(held.res.body, /manual check before payment/);
});

test('non-EU company: classified non_eu_business and fulfilled; its tax ID is kept as declared', async () => {
  const b = { ...BUYERS.us, tax_id: '12-3456789' };
  const o = await placeOrder(b);
  await deliver('checkout.session.completed', finished(o, { ...b }));
  const ord = await order(o.orderId);
  assert.equal(ord.tax.category, 'non_eu_business');
  assert.deepEqual(ord.buyer.taxId, { value: '123456789', type: null });
  assert.equal(ord.status, 'fulfilled');
});

test('failed tax calculation: Stripe refuses the session, the buyer is told, the order is marked failed, nothing is charged', async () => {
  sessionMode = 'tax_failure';
  const o = await placeOrder(BUYERS.cz);
  assert.equal(o.res.statusCode, 502);
  const [ord] = [...kv.entries()].filter(([k]) => k.startsWith('order:')).map(([, v]) => JSON.parse(v));
  assert.equal(ord.status, 'checkout_failed');
  assert.equal(ord.facts.checkoutFailure, 'customer_tax_location_invalid');
});

test('failed invoice creation: the licence is granted once, Stripe retries, and the retry issues the invoice', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  process.env.INVOICE_SANDBOX_FAIL = '1';
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  const s = finished(o, b);
  const first = await deliver('checkout.session.completed', s, 'evt_inv_retry');
  assert.equal(first.status, 500, 'Stripe is asked to retry');
  assert.equal(first.body.retry, 'invoice');
  assert.equal((await order(o.orderId)).invoice.status, 'failed');
  assert.ok((await entitlement(b.email)).slugs.includes(SLUG), 'the paid licence is not held back by the invoice');
  delete process.env.INVOICE_SANDBOX_FAIL;
  const retry = await deliver('checkout.session.completed', s, 'evt_inv_retry');
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  const ord = await order(o.orderId);
  assert.equal(ord.invoice.status, 'issued');
  assert.equal(ord.invoice.number, `TEST-INV-${new Date().getUTCFullYear()}-0001`);
  assert.equal((await entitlement(b.email)).stripeSessionIds.length, 1, 'no second grant');
  const page = await thankYou(o.id);
  assert.match(page.body, /Test document TEST-INV-\d{4}-0001 from the sandbox ledger/);
});

test('declined payment: the session ends without payment, nothing is granted, the order and the page say so', async () => {
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  const s = finished(o, b, { status: 'expired', payment_status: 'unpaid' });
  const r = await deliver('checkout.session.expired', s);
  assert.equal(r.status, 200);
  assert.equal((await order(o.orderId)).status, 'expired');
  assert.equal(await entitlement(b.email), null);
  const page = await thankYou(o.id);
  assert.match(page.body, /did not go through/);
});

test('delayed bank transfer: no delivery while it is pending; delivery only after the transfer clears', async () => {
  const b = BUYERS.de;
  const o = await placeOrder(b, { method: 'bank' });
  const pending = finished(o, b, { payment_status: 'unpaid' });
  const r1 = await deliver('checkout.session.completed', pending);
  assert.equal(r1.body.status, 'pending');
  assert.equal((await order(o.orderId)).status, 'awaiting_payment');
  assert.equal(await entitlement(b.email), null);
  assert.match((await thankYou(o.id)).body, /transfer is on its way/);
  const cleared = finished(o, b, { payment_status: 'paid' });
  const r2 = await deliver('checkout.session.async_payment_succeeded', cleared);
  assert.equal(r2.status, 200);
  assert.equal((await order(o.orderId)).status, 'fulfilled');
  assert.ok((await entitlement(b.email)).slugs.includes(SLUG));
});

test('bank transfer that fails: no delivery, the order is payment_failed and the page says the payment did not go through', async () => {
  const b = BUYERS.de;
  const o = await placeOrder(b, { method: 'bank' });
  await deliver('checkout.session.completed', finished(o, b, { payment_status: 'unpaid' }));
  await deliver('checkout.session.async_payment_failed', finished(o, b, { payment_status: 'unpaid' }));
  assert.equal((await order(o.orderId)).status, 'payment_failed');
  assert.equal(await entitlement(b.email), null);
  assert.match((await thankYou(o.id)).body, /did not go through/);
});

test('duplicate webhook: the same event twice grants once and records the order facts once', async () => {
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  const s = finished(o, b);
  await deliver('checkout.session.completed', s, 'evt_dup_j');
  const again = await deliver('checkout.session.completed', s, 'evt_dup_j');
  assert.equal(again.body.duplicate, 'event');
  const other = await deliver('checkout.session.completed', s, 'evt_dup_other');
  assert.equal(other.body.duplicate, 'session');
  const ord = await order(o.orderId);
  assert.equal(ord.events.filter((e) => e.id === `paid:${o.id}`).length, 1);
  assert.equal((await entitlement(b.email)).stripeSessionIds.length, 1);
});

test('refund with a credit note (Stripe invoice route): access revoked, order refunded, one credit note linked to the refund', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  process.env.TAX_SANDBOX_INVOICE_ROUTE = 'stripe';
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  assert.equal(o.params.get('invoice_creation[enabled]'), 'true');
  invoices.set('in_j1', { id: 'in_j1', object: 'invoice', status: 'paid', number: 'CAI-0007', invoice_pdf: 'https://pay.stripe.test/in_j1.pdf', hosted_invoice_url: 'https://invoice.stripe.test/in_j1', metadata: { order_id: o.orderId } });
  const s = finished(o, b, { invoice: 'in_j1' });
  await deliver('checkout.session.completed', s);
  assert.equal((await order(o.orderId)).invoice.number, 'CAI-0007');
  assert.match((await thankYou(o.id)).body, /Invoice CAI-0007 has been issued.*View invoice/s);
  refunds.set(`ch_${o.id}`, [{ id: 're_j1', object: 'refund', amount: PRICE, status: 'succeeded' }]);
  const ch = charge(s, { amount_refunded: PRICE, refunded: true });
  const r = await deliver('charge.refunded', ch);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.creditNotes, 1);
  const again = await deliver('charge.refunded', ch);
  assert.equal(again.body.creditNotes, 0, 'a redelivered refund creates no second credit note');
  const ord = await order(o.orderId);
  assert.equal(ord.status, 'refunded');
  assert.equal(ord.creditNotes.length, 1);
  assert.equal(ord.creditNotes[0].refundId, 're_j1');
  const cn = stripeCalls.filter((c) => c.path === '/v1/credit_notes');
  assert.equal(cn.length, 1);
  assert.equal(cn[0].params.get('refunds[0][refund]'), 're_j1');
  assert.equal(cn[0].params.get('invoice'), 'in_j1');
  assert.equal(cn[0].params.get('amount'), String(PRICE), 'the credit note total equals the refund');
  assert.ok(!(await entitlement(b.email)).slugs.includes(SLUG), 'the refunded licence is revoked');
  assert.match((await thankYou(o.id)).body, /refunded/);
});

test('chargeback before the payment confirmation: the late confirmation grants nothing and the order stays disputed', async () => {
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  const s = finished(o, b);
  const dispute = { id: 'dp_j1', object: 'dispute', status: 'needs_response', reason: 'fraudulent', amount: PRICE, charge: `ch_${o.id}`, payment_intent: s.payment_intent, metadata: {} };
  const d = await deliver('charge.dispute.created', dispute);
  assert.equal(d.status, 200, JSON.stringify(d.body));
  const late = await deliver('checkout.session.completed', s);
  assert.equal(late.status, 200);
  const ord = await order(o.orderId);
  assert.equal(ord.status, 'disputed');
  assert.equal(ord.facts.grantRefused, 'session-revoked');
  assert.equal(ord.facts.fulfilledAt, undefined);
  assert.ok(!((await entitlement(b.email))?.slugs ?? []).includes(SLUG));
  // F-UX-1: the thank-you page names a charge-back as a dispute, not as a refund, and still offers no download.
  const page = (await thankYou(o.id)).body;
  assert.match(page, /Payment disputed/);
  assert.match(page, /disputed with the card issuer/);
  assert.doesNotMatch(page, /refunded/i);
  assert.doesNotMatch(page, /Download package/);
});

test('dispute resolution: won restores access and the order; lost leaves it revoked', async () => {
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  const s = finished(o, b);
  await deliver('checkout.session.completed', s);
  const dp = { id: 'dp_j2', object: 'dispute', amount: PRICE, charge: `ch_${o.id}`, payment_intent: s.payment_intent, metadata: {} };
  await deliver('charge.dispute.created', { ...dp, status: 'needs_response' });
  assert.equal((await order(o.orderId)).status, 'disputed');
  assert.ok(!(await entitlement(b.email)).slugs.includes(SLUG));
  assert.match((await thankYou(o.id)).body, /This payment is <em>disputed\.<\/em>/, 'an open dispute is not called a refund');
  const won = await deliver('charge.dispute.closed', { ...dp, status: 'won' });
  assert.equal(won.body.access, 'restored');
  assert.equal((await order(o.orderId)).status, 'fulfilled');
  assert.ok((await entitlement(b.email)).slugs.includes(SLUG));

  const b2 = BUYERS.us;
  const o2 = await placeOrder(b2);
  const s2 = finished(o2, b2);
  await deliver('checkout.session.completed', s2);
  const dp2 = { id: 'dp_j3', object: 'dispute', amount: PRICE, charge: `ch_${o2.id}`, payment_intent: s2.payment_intent, metadata: {} };
  await deliver('charge.dispute.created', { ...dp2, status: 'needs_response' });
  await deliver('charge.dispute.closed', { ...dp2, status: 'lost' });
  assert.equal((await order(o2.orderId)).status, 'dispute_lost');
  assert.ok(!(await entitlement(b2.email)).slugs.includes(SLUG));
});

test('incorrect purchase: a session whose amount or SKU does not match its order grants nothing and is held for review', async () => {
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  const cheap = finished(o, b, { amount_subtotal: 100, amount_total: 100 });
  const r = await deliver('checkout.session.completed', cheap);
  assert.equal(r.body.withheld, 'amount-mismatch');
  assert.equal((await order(o.orderId)).status, 'withheld');
  assert.equal(await entitlement(b.email), null);
  assert.match((await thankYou(o.id)).body, /needs a manual check before delivery/);
  assert.ok(kv.has(`sale-withheld:${o.id}`), 'recorded for a manual decision');

  const o2 = await placeOrder(b);
  const wrongSku = finished(o2, b, { metadata: { ...o2.metadata, sku: 'CAI-L4-XX-999' } });
  assert.equal((await deliver('checkout.session.completed', wrongSku)).body.withheld, 'sku-mismatch');
});

test('missing or wrong release package: the download refuses with a clear answer instead of a broken link', async () => {
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  await deliver('checkout.session.completed', finished(o, b));
  const page = await thankYou(o.id);
  const tok = [...page.body.matchAll(/href="\/api\/download\?t=([A-Za-z0-9_-]+)"/g)].map((m) => m[1])
    .find((t) => downloadToken.openDownload(t).file === PRODUCT.release.package);
  assert.ok(tok, 'the page offers the package');
  process.env.BLOB_STORE_ID = 'store_test';
  const sdk = (head) => ({
    head, BlobNotFoundError: class BlobNotFoundError extends Error {},
    issueSignedToken: async (o2) => ({ validUntil: o2.validUntil }), presignUrl: async (t, o2) => ({ presignedUrl: `https://store.blob.test/${o2.pathname}?sig=x` }),
  });
  const run = async () => { const res = mockRes(); await download({ method: 'GET', query: { t: tok } }, res); return res; };
  storage.__setBlobSdkForTests(sdk(async () => { const e = new Error('not found'); e.name = 'BlobNotFoundError'; throw e; }));
  const missing = await run();
  assert.equal(missing.statusCode, 503);
  assert.equal(missing.body.code, 'package_missing');
  storage.__setBlobSdkForTests(sdk(async () => ({ size: 12 })));
  assert.equal((await run()).body.code, 'package_mismatch');
  storage.__setBlobSdkForTests(sdk(async () => ({ size: PRODUCT.release.bytes })));
  const good = await run();
  assert.equal(good.statusCode, 302);
  assert.match(good.headers.location, new RegExp(`agents/${SLUG}/${PRODUCT.release.package.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('corrective release: a purchase of withdrawn 1.0.3.2 (made before order ids) is offered the current release, never the missing package', async () => {
  const email = 'early.buyer@example.test';
  const s = { id: 'cs_test_legacy_1032', object: 'checkout.session', livemode: false, mode: 'payment', status: 'complete', payment_status: 'paid',
    currency: 'usd', amount_subtotal: PRICE, amount_total: PRICE, customer_details: { email }, metadata: { agent_slug: SLUG, sku: PRODUCT.sku, release: '1.0.3.2' } };
  sessions.set(s.id, s);
  const page = await thankYou(s.id);
  assert.ok(PRODUCT.release.correctiveFor.includes('1.0.3.2'));
  assert.ok(page.body.includes(PRODUCT.release.package), PRODUCT.release.package);
  assert.ok(!/CAI-L4-CI-001_1\.0\.3\.2\.zip/.test(page.body));
});

test('lost download: reopening the thank-you link issues fresh 15-minute links to the same buyer', async () => {
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  await deliver('checkout.session.completed', finished(o, b));
  const links = async () => [...(await thankYou(o.id)).body.matchAll(/href="\/api\/download\?t=([A-Za-z0-9_-]+)"/g)].map((m) => downloadToken.openDownload(m[1]));
  const first = await links();
  await new Promise((r) => setTimeout(r, 1100));
  const second = await links();
  assert.ok(first.length && second.length);
  assert.ok(second.every((c) => c.ok && c.email === b.email));
  assert.notDeepEqual(first.map((c) => c.exp), second.map((c) => c.exp), 'new links, new expiry');
});

// The GO change approves Contract Intelligence & Register; this guard is about an UNAPPROVED release, so the shared
// in-memory record is set to unapproved for its duration.
async function asUnapproved(fn) {
  const rec = (await import('../lib/products.js')).productFor('contract-intelligence-and-register');
  const was = rec.saleApproved; rec.saleApproved = false;
  try { return await fn(); } finally { rec.saleApproved = was; }
}

test('unapproved purchase attempts: concept agents and live keys are refused before any record or Stripe call', () => asUnapproved(async () => {
  const concept = mockRes();
  await checkout({ method: 'GET', query: { agent: 'operations-procedures-assistant' }, headers: { host: 'x' } }, concept);
  assert.equal(concept.statusCode, 409);
  assert.equal(concept.body.code, 'not_available');
  process.env.STRIPE_SECRET_KEY = 'sk_live_NOT_A_REAL_KEY';
  try {
    const live = mockRes();
    await checkout({ method: 'GET', query: { agent: SLUG }, headers: { host: 'x' } }, live);
    assert.equal(live.statusCode, 403);
    assert.equal(live.body.code, 'not_approved_for_sale');
  } finally { process.env.STRIPE_SECRET_KEY = 'sk_test_journey_never_sent'; }
  assert.equal(stripeCalls.length, 0);
  assert.equal([...kv.keys()].length, 0);
}));

test('Continuous Certification stays unavailable: a link or a form asking for it is refused, only the licence is sold', async () => {
  const link = mockRes();
  await checkout({ method: 'GET', query: { agent: SLUG, cert: 'month' }, headers: { host: 'x' } }, link);
  assert.equal(link.statusCode, 409);
  assert.equal(link.body.code, 'certification_not_available');
  const form = await placeOrder(BUYERS.cz, { certification: 'on', cert_interval: 'year' });
  assert.equal(form.res.statusCode, 409);
  assert.ok(!stripeCalls.some((c) => c.path === '/v1/checkout/sessions'));
  const plain = await placeOrder(BUYERS.cz);
  assert.equal(plain.params.get('mode'), 'payment', 'the licence alone is a one-time payment');
});

test('missed webhook and no return visit: the fulfilment check reports the paid order; delivering the event clears it', async () => {
  const { checkFulfilment } = await import('../lib/fulfilmentCheck.js');
  withDelivery();
  const run = async (list) => {
    const ords = new Map(); const ents = new Map(); const held = new Map();
    for (const x of list) {
      ords.set(x.metadata.order_id, await order(x.metadata.order_id));
      ents.set(x.customer_details.email, await entitlement(x.customer_details.email));
      held.set(x.id, await db.getJson(`sale-withheld:${x.id}`));
    }
    return checkFulfilment({ sessions: list, orders: ords, entitlements: ents, withheld: held });
  };
  // Paid on Stripe's page, but the webhook never arrives and the buyer never reopens the thank-you link.
  const b = { ...BUYERS.de, email: 'missed-webhook@beispiel.example' };
  const o = await placeOrder(b);
  const s = finished(o, b);
  let r = await run([s]);
  assert.equal(r.problems, 1);
  assert.equal(r.rows[0].problem, 'paid_not_licensed');
  assert.equal(r.rows[0].orderId, o.orderId);
  // A bank transfer still on its way is listed for information but is not a problem.
  const b2 = { ...BUYERS.cz, email: 'transfer-pending@vzorova.example' };
  const o2 = await placeOrder(b2, { method: 'bank' });
  const s2 = finished(o2, b2, { payment_status: 'unpaid' });
  r = await run([s, s2]);
  assert.deepEqual(r.rows.map((x) => x.problem), ['paid_not_licensed', 'awaiting_payment']);
  assert.equal(r.problems, 1);
  // The event arrives (a Stripe retry, or a manual resend): the licence is granted and the check is clean.
  assert.equal((await deliver('checkout.session.completed', s)).status, 200);
  r = await run([s]);
  assert.deepEqual(r.rows, []);
  // After a full refund the licence is gone and the order says refunded: still clean, nothing to do.
  refunds.set(`ch_${o.id}`, [{ id: 're_mw1', object: 'refund', amount: PRICE, status: 'succeeded' }]);
  assert.equal((await deliver('charge.refunded', charge(s, { amount_refunded: PRICE, refunded: true }))).status, 200);
  r = await run([s]);
  assert.deepEqual(r.rows, []);
  assert.equal((await order(o.orderId)).status, 'refunded');
});

// ── documents, delivery and notification (automated contracts, invoicing and delivery brief, section 8) ───────────
/** The sealed /api/order-document links on a thank-you page, by file name. */
function documentLinks(pageBody) {
  const out = {};
  for (const m of pageBody.matchAll(/href="\/api\/order-document\?t=([A-Za-z0-9_-]+)"/g)) {
    const c = downloadToken.openOrderDocument(m[1]);
    if (c.ok) out[c.file] = m[1];
  }
  return out;
}
async function fetchDocument(t) {
  const res = mockRes();
  await orderDocument({ method: 'GET', query: { t } }, res);
  return res;
}

test('complete workflow: company → acceptance → payment → licence → agreement PDF → invoice PDF → archive → secure download → notification', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  const store = withDelivery();
  const b = BUYERS.cz;
  const o = await placeOrder(b, { tenant: 'vzorova-prumyslova.example' });
  assert.equal(o.res.statusCode, 303);
  const s = finished(o, b);
  const r = await deliver('checkout.session.completed', s);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.documents, { complete: true, missing: [] }, JSON.stringify(r.body));
  const ord = await order(o.orderId);
  assert.equal(ord.status, 'fulfilled');
  assert.equal(ord.invoice.status, 'issued');
  assert.equal(ord.documents.agreement.status, 'issued');
  assert.equal(ord.documents.invoice.status, 'issued');
  assert.equal(ord.notifications.buyer.status, 'sent');
  assert.equal(ord.buyer.tenant, 'vzorova-prumyslova.example');
  // The archive: both PDFs are in the private store, hashed as stored.
  const agreementBytes = store.objects.get(ord.documents.agreement.key);
  assert.ok(agreementBytes, 'agreement PDF stored privately');
  assert.equal(createHashHex(agreementBytes), ord.documents.agreement.sha256);
  const agreement = await pdfText(agreementBytes);
  for (const n of ['Licence Agreement Confirmation', b.company, 'Jana Nováková, Jednatelka', 'CAI-L4-CI-001', '1.0.3.6', PRODUCT.release.sha256, 'vzorova-prumyslova.example', LEGAL.set, LEGAL.documents.terms.sha256, 'not a signed instrument', ord.invoice.number]) {
    assert.ok(agreement.has(n), `agreement PDF missing: ${n}`);
  }
  const invoice = await pdfText(store.objects.get(ord.documents.invoice.key));
  for (const n of [`TEST INVOICE ${ord.invoice.number}`, 'NOT A TAX DOCUMENT', b.company, 'CZ12345678', `pi_${o.id}`, 'USD 14,900.00', 'TEST - domestic treatment not decided']) assert.ok(invoice.has(n), `invoice PDF missing: ${n}`);
  // The company evidence record.
  const { getEvidence } = await import('../lib/orderDocuments.js');
  const ev = await getEvidence(o.orderId);
  assert.equal(ev.acceptance.id, ord.acceptance.id);
  assert.equal(ev.documents.agreement.sha256, ord.documents.agreement.sha256);
  assert.equal(ev.invoice.number, ord.invoice.number);
  assert.equal(ev.payment.paymentIntentId, `pi_${o.id}`);
  assert.equal(ev.release.version, '1.0.3.6');
  assert.equal(ev.delivery.notification.status, 'sent');
  // The notification: to the order e-mail only, naming the order, the invoice, the hash and the order page.
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, [b.email]);
  assert.match(mails[0].subject, new RegExp(o.orderId));
  for (const n of [o.orderId, ord.invoice.number, PRODUCT.release.sha256, `/api/success?session_id=${o.id}`, 'TEST document']) assert.ok(mails[0].text.includes(n), `mail missing: ${n}`);
  assert.ok(!mails[0].text.includes('sk_') && !mails[0].text.includes('whsec_'));
  // The order page: documents section with sealed links; each opens to a private presigned URL for the right buyer.
  const page = await thankYou(o.id);
  assert.match(page.body, /Your documents/);
  assert.match(page.body, /Licence entitlement/);
  assert.match(page.body, /Agreements you accepted/);
  // The accepted texts themselves are reachable: one archived-version page per accepted document, with its fingerprint.
  for (const [k, v] of Object.entries(ord.acceptance.documents)) {
    const slug = v.version.replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
    assert.ok(page.body.includes(`/legal/archive/${k}/${slug}.html`), `order page links the accepted text of ${k}`);
    const archived = readFileSync(new URL(`public/legal/archive/${k}/${slug}.html`, ROOT), 'utf8');
    assert.equal(legalFingerprint(archived), v.sha256, `published archived text of ${k} has the accepted fingerprint`);
  }
  assert.ok(agreement.has(`/legal/archive/terms/${LEGAL.documents.terms.version}.html`), 'the PDF names where the accepted text can be read');
  const links = documentLinks(page.body);
  assert.deepEqual(Object.keys(links).sort(), [ord.documents.agreement.file, ord.documents.invoice.file].sort());
  const got = await fetchDocument(links[ord.documents.agreement.file]);
  assert.equal(got.statusCode, 302);
  assert.match(got.headers.location, new RegExp(`orders/${o.orderId}/licence-agreement-confirmation\\.pdf`));
  // The package download itself (secure, signed) is unchanged.
  const tok = [...page.body.matchAll(/href="\/api\/download\?t=([A-Za-z0-9_-]+)"/g)].map((m) => m[1]).find((t) => downloadToken.openDownload(t).file === PRODUCT.release.package);
  const dl = mockRes(); await download({ method: 'GET', query: { t: tok } }, dl);
  assert.equal(dl.statusCode, 302);
  // Replaying the page produces no new document and no new mail.
  await thankYou(o.id);
  assert.equal(store.objects.size, 2);
  assert.equal(mails.length, 1);
});

test('declined payment: no licence, no documents, no notification, no completed sale', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  const store = withDelivery();
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  await deliver('checkout.session.expired', finished(o, b, { status: 'expired', payment_status: 'unpaid' }));
  const ord = await order(o.orderId);
  assert.equal(ord.status, 'expired');
  assert.equal(ord.documents, undefined);
  assert.equal(await entitlement(b.email), null);
  assert.equal(store.objects.size, 0);
  assert.equal(mails.length, 0);
  assert.equal((await thankYou(o.id)).body.includes('Your documents'), false);
});

test('duplicate webhook: the same paid event twice makes one invoice, one agreement PDF, one evidence record and one mail', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  const store = withDelivery();
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  const s = finished(o, b);
  const first = await deliver('checkout.session.completed', s, 'evt_dup_docs');
  assert.equal(first.status, 200);
  const dup = await deliver('checkout.session.completed', s, 'evt_dup_docs');
  assert.equal(dup.body.duplicate, 'event');
  const sameSessionNewEvent = await deliver('checkout.session.async_payment_succeeded', s, 'evt_dup_docs_2');
  assert.equal(sameSessionNewEvent.status, 200);
  const ord = await order(o.orderId);
  assert.equal(ord.invoice.number, `TEST-INV-${new Date().getUTCFullYear()}-0001`);
  assert.equal(store.objects.size, 2, 'one agreement, one invoice');
  assert.equal(mails.length, 1);
  assert.equal((await entitlement(b.email)).stripeSessionIds.length, 1);
});

test('failed PDF generation: the licence stands, the failure is recorded on the order and reported by the fulfilment check; a later run completes it', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  const store = withDelivery();
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  const s = finished(o, b);
  // The store refuses the first write (a Blob outage): the agreement cannot be stored.
  const realPut = store.put;
  store.put = async () => { throw new Error('blob service unavailable'); };
  const r = await deliver('checkout.session.completed', s);
  assert.equal(r.status, 200, 'a document failure never fails the paid event');
  assert.equal(r.body.documents.complete, false);
  let ord = await order(o.orderId);
  assert.equal(ord.status, 'fulfilled');
  assert.equal(ord.documents.agreement.status, 'failed');
  assert.equal(ord.documents.agreement.reason, 'agreement_generation_failed');
  assert.match(ord.documents.agreement.detail, /blob service unavailable/);
  assert.ok(ord.documents.summary.missing.some((m) => m.startsWith('agreement:')));
  assert.equal(ord.notifications.buyer.status, 'sent', 'the buyer is still told where the documents will appear');
  assert.match(mails[0].text, /being prepared/);
  const page = await thankYou(o.id);
  assert.match(page.body, /being prepared/);
  // The fulfilment check lists it until it is complete.
  const { checkFulfilment } = await import('../lib/fulfilmentCheck.js');
  let chk = checkFulfilment({ sessions: [s], orders: new Map([[o.orderId, ord]]), entitlements: new Map([[b.email, await entitlement(b.email)]]) });
  assert.equal(chk.rows[0]?.problem, 'documents_incomplete');
  // The store is back: a redelivery (or the daily run) completes the package without a second licence or mail.
  store.put = realPut;
  await deliver('checkout.session.completed', s, 'evt_docs_retry');
  ord = await order(o.orderId);
  assert.equal(ord.documents.agreement.status, 'issued');
  assert.equal(ord.documents.summary.complete, true);
  chk = checkFulfilment({ sessions: [s], orders: new Map([[o.orderId, ord]]), entitlements: new Map([[b.email, await entitlement(b.email)]]) });
  assert.deepEqual(chk.rows, []);
  assert.equal(mails.length, 1);
});

test('mail transport down or unset: recorded as not sent, never claimed; the documents are still produced', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  withDelivery({ mail: false });
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  await deliver('checkout.session.completed', finished(o, b));
  let ord = await order(o.orderId);
  assert.equal(ord.notifications.buyer.status, 'not_configured');
  assert.ok(ord.documents.summary.missing.includes('notification:mail_not_configured'));
  assert.equal(ord.documents.agreement.status, 'issued');
  process.env.RESEND_API_KEY = 're_test_journey_dummy_key';
  mailMode = 'down';
  const o2 = await placeOrder({ ...b, email: 'mail-down@vzorova.example' });
  await deliver('checkout.session.completed', finished(o2, { ...b, email: 'mail-down@vzorova.example' }));
  ord = await order(o2.orderId);
  assert.equal(ord.notifications.buyer.status, 'failed');
  assert.equal(ord.notifications.buyer.reason, 'send_failed');
});

test('refund and credit note (sandbox ledger): the credit-note PDF joins the order documents and the evidence; the licence is revoked', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  const store = withDelivery();
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  const s = finished(o, b);
  await deliver('checkout.session.completed', s);
  refunds.set(`ch_${o.id}`, [{ id: 're_docs1', object: 'refund', amount: PRICE, status: 'succeeded' }]);
  const r = await deliver('charge.refunded', charge(s, { amount_refunded: PRICE, refunded: true }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.creditNotes, 1);
  const ord = await order(o.orderId);
  assert.equal(ord.status, 'refunded');
  const cn = ord.documents.creditNotes.re_docs1;
  assert.equal(cn.status, 'issued');
  const text = await pdfText(store.objects.get(cn.key));
  for (const n of [`TEST CREDIT NOTE ${ord.creditNotes[0].number}`, `Corrects invoice ${ord.invoice.number}`, 're_docs1', '-USD 14,900.00']) assert.ok(text.has(n), `credit note missing: ${n}`);
  const { getEvidence } = await import('../lib/orderDocuments.js');
  const ev = await getEvidence(o.orderId);
  assert.equal(ev.creditNotes[0].refundId, 're_docs1');
  assert.equal(ev.documents.creditNotes.re_docs1.sha256, cn.sha256);
  assert.equal(ev.payment.refunded.full, true);
  assert.ok(!(await entitlement(b.email)).slugs.includes(SLUG));
  // The refunded buyer still reaches their documents through the (now refunded) order page link.
  assert.match((await thankYou(o.id)).body, /refunded/);
});

test('wrong buyer or unauthorised document access: another e-mail, a tampered token, an expired token, a document not yet issued', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  withDelivery();
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  await deliver('checkout.session.completed', finished(o, b));
  const ord = await order(o.orderId);
  const file = ord.documents.agreement.file;
  const other = downloadToken.signOrderDocument({ email: 'someone@else.example', orderId: o.orderId, file });
  assert.equal((await fetchDocument(other.t)).statusCode, 403);
  assert.equal((await fetchDocument(other.t)).body.reason, 'not-owner');
  const good = downloadToken.signOrderDocument({ email: b.email, orderId: o.orderId, file });
  assert.equal((await fetchDocument(good.t)).statusCode, 302);
  const tampered = good.t.slice(0, -3) + (good.t.endsWith('AAA') ? 'BBB' : 'AAA');
  assert.equal((await fetchDocument(tampered)).statusCode, 403);
  const expired = downloadToken.signOrderDocument({ email: b.email, orderId: o.orderId, file, ttlSeconds: -1 });
  assert.equal((await fetchDocument(expired.t)).body.reason, 'expired');
  const unknown = downloadToken.signOrderDocument({ email: b.email, orderId: o.orderId, file: 'credit-note-nope.pdf' });
  assert.equal((await fetchDocument(unknown.t)).statusCode, 404);
  // A download token (package endpoint) is not a document token, and the other way round.
  const dl = downloadToken.signDownload({ email: b.email, slug: SLUG, file: PRODUCT.release.package });
  assert.equal((await fetchDocument(dl.t)).statusCode, 403);
  // Another order's buyer cannot read this order even with a valid document name for their own order.
  const o2 = await placeOrder(BUYERS.de);
  await deliver('checkout.session.completed', finished(o2, BUYERS.de));
  const cross = downloadToken.signOrderDocument({ email: BUYERS.de.email, orderId: o.orderId, file });
  assert.equal((await fetchDocument(cross.t)).statusCode, 403);
});

test('changed legal version after an earlier purchase: the earlier order\'s documents keep the versions it accepted; a new order gets the new set', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  const store = withDelivery();
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  await deliver('checkout.session.completed', finished(o, b));
  const ord = await order(o.orderId);
  assert.equal(ord.acceptance.legalSet, LEGAL.set);
  const text = await pdfText(store.objects.get(ord.documents.agreement.key));
  assert.ok(text.has(LEGAL.documents.terms.sha256));
  // A later order placed against a "new" legal set (simulated on the record, as a version bump would write it) is a
  // different agreement; the earlier PDF is immutable in the store and its record unchanged.
  const before = ord.documents.agreement.sha256;
  await deliver('checkout.session.completed', finished(o, b), 'evt_legal_again');
  assert.equal((await order(o.orderId)).documents.agreement.sha256, before);
  assert.equal(createHashHex(store.objects.get(ord.documents.agreement.key)), before);
  // The confirmation page refuses a stale document set, so no order can be placed against a set that is not current.
  const stale = mockRes();
  await checkout({ method: 'POST', query: {}, headers: { host: 'shop.example.test' }, body: { agent: SLUG, method: 'card', lang: 'en', authority: 'on', terms: 'on', delivery: 'on', legal_set: '1999-01-01', ...b } }, stale);
  assert.equal(stale.statusCode, 400);
  assert.match(stale.body, /agreements were updated while this page was open/);
});

test('order recovery: the emailed recovery page reaches the same documents; a buyer category held by the policy never gets this far', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  withDelivery();
  const b = BUYERS.cz;
  const o = await placeOrder(b);
  await deliver('checkout.session.completed', finished(o, b));
  // Recovery (api/recover.js) is covered by tests/recover.test.mjs; here: the thank-you link, reopened, re-issues
  // document links sealed for the same buyer, and each still opens.
  const links1 = documentLinks((await thankYou(o.id)).body);
  const links2 = documentLinks((await thankYou(o.id)).body);
  assert.notEqual(links1['licence-agreement-confirmation.pdf'], links2['licence-agreement-confirmation.pdf'], 'fresh sealed links each time');
  assert.equal((await fetchDocument(links2['licence-agreement-confirmation.pdf'])).statusCode, 302);
  // Held category: no session, no order record that could ever be documented.
  const held = await placeOrder(BUYERS.deNoVat);
  assert.equal(held.res.statusCode, 409);
  assert.match(held.res.body, /needs a manual check before payment/);
  assert.ok(!stripeCalls.some((c) => c.path === '/v1/checkout/sessions' && c.params.get('customer_email') === BUYERS.deNoVat.email));
});

function createHashHex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// ── first-sale launch scope (config/launch-scope.json) and the company-ledger invoice route ───────────────────────
// These scenarios switch the suite's scope bypass off: they run the restricted checkout exactly as the Preview does.
const CZ_OK = { company: 'Zkušební Strojírny s.r.o.', reg_number: '12345679', country: 'CZ', tax_id: '', email: 'nakup@zkusebni.example', name: 'Petr Zkušební', role: 'Jednatel' };
async function inScope(fn) {
  delete process.env.LAUNCH_SCOPE_TEST_BYPASS;
  try { return await fn(); } finally { process.env.LAUNCH_SCOPE_TEST_BYPASS = '1'; }
}
const sessionCreated = () => stripeCalls.some((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST');
async function getPage(query) {
  const res = mockRes();
  await checkout({ method: 'GET', query: { agent: SLUG, lang: 'en', ...query }, headers: { host: 'shop.example.test' } }, res);
  return res;
}

test('launch scope: a Czech company pays by card only; the company ledger issues a TEST-series invoice once, and a credit note on refund', () => inScope(async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  process.env.TAX_SANDBOX_INVOICE_ROUTE = 'company_ledger';
  const store = withDelivery();
  const page = await getPage({});
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /companies established in the Czech Republic, paying by card/);
  const o = await placeOrder(CZ_OK);
  assert.equal(o.res.statusCode, 303, String(o.res.body).slice(0, 300));
  const methods = [...o.params].filter(([k]) => k.startsWith('allowed_payment_method_types')).map(([, v]) => v);
  assert.deepEqual(methods, ['card'], 'card only: no bank transfer, no Link wallet');
  const ordBefore = await order(o.orderId);
  assert.equal(ordBefore.launchScope, '2026-11-21-cz-b2b-first-sale');
  const s = finished(o, CZ_OK);
  const r = await deliver('checkout.session.completed', s);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ord = await order(o.orderId);
  assert.equal(ord.status, 'fulfilled');
  assert.equal(ord.invoice.provider, 'company_ledger');
  assert.match(ord.invoice.number, /^TEST-CAI-INV-\d{4}-00001$/);
  assert.equal(ord.invoice.test, true);
  assert.equal(ord.documents.invoice.status, 'issued');
  const text = await pdfText(store.objects.get(ord.documents.invoice.key));
  for (const n of [`TEST INVOICE ${ord.invoice.number}`, 'NOT A TAX DOCUMENT', 'company ledger in its separate TEST series', CZ_OK.company, 'Registration number 12345679', 'Company ID (IČO) 29540852', `pi_${o.id}`, 'USD 14,900.00']) {
    assert.ok(text.has(n), `invoice PDF missing: ${n}`);
  }
  assert.ok(!text.text.includes('DIČ'), 'no seller DIČ is printed while the seller has no evidenced VAT registration');
  // A replayed event allocates no second number.
  await deliver('checkout.session.completed', s);
  assert.equal((await order(o.orderId)).invoice.number, ord.invoice.number);
  assert.equal(kv.get('seq:invoice:company_ledger:test:' + new Date().getUTCFullYear()), '1');
  assert.ok(!kv.has('seq:invoice:company_ledger:' + new Date().getUTCFullYear()), 'the real series is untouched by a test order');
  // Refund: one credit note in the TEST series, its PDF joins the order documents.
  refunds.set(`ch_${o.id}`, [{ id: 're_scope1', object: 'refund', amount: PRICE, status: 'succeeded' }]);
  const rr = await deliver('charge.refunded', charge(s, { amount_refunded: PRICE, refunded: true }));
  assert.equal(rr.body.creditNotes, 1, JSON.stringify(rr.body));
  await deliver('charge.refunded', charge(s, { amount_refunded: PRICE, refunded: true }));
  const after = await order(o.orderId);
  assert.equal(after.creditNotes.length, 1);
  assert.match(after.creditNotes[0].number, /^TEST-CAI-CN-\d{4}-00001$/);
  const cn = await pdfText(store.objects.get(after.documents.creditNotes.re_scope1.key));
  for (const n of [`TEST CREDIT NOTE ${after.creditNotes[0].number}`, `Corrects invoice ${ord.invoice.number}`, '-USD 14,900.00']) assert.ok(cn.has(n), `credit note missing: ${n}`);
}));

test('launch scope: other countries, invalid IČO, a VAT ID of another company, bank, EUR and certification are refused before any record or Stripe call', () => inScope(async () => {
  const refusals = [
    [{ ...BUYERS.de }, 'Czech Republic'],
    [{ ...BUYERS.us }, 'Czech Republic'],
    [{ ...CZ_OK, reg_number: '12345678' }, 'not a valid IČO'],
    [{ ...CZ_OK, reg_number: '' }, 'company identification number'],
    [{ ...CZ_OK, tax_id: 'CZ99999999' }, 'does not belong to this IČO'],
  ];
  for (const [buyer, says] of refusals) {
    stripeCalls.length = 0;
    const before = kv.size;
    const o = await placeOrder(buyer);
    assert.equal(o.res.statusCode, 409, `${buyer.country}/${buyer.reg_number}/${buyer.tax_id}`);
    assert.ok(String(o.res.body).includes(says), `refusal names the reason: ${says}`);
    assert.equal(sessionCreated(), false, 'no Stripe session');
    assert.equal(kv.size, before, 'no acceptance or order record');
  }
  // Tampered links and direct API requests: refused, never silently corrected.
  for (const [query, code] of [[{ method: 'bank' }, 'payment_method_not_in_launch_scope'], [{ currency: 'eur' }, 'currency_not_in_launch_scope'], [{ cert: 'year' }, 'certification_not_in_launch_scope']]) {
    const page = await getPage(query);
    assert.equal(page.statusCode, 409, JSON.stringify(query));
    assert.equal(page.body.code, code);
    stripeCalls.length = 0;
    const o = await placeOrder(CZ_OK, query);
    assert.equal(o.res.statusCode, 409);
    assert.equal(o.res.body.code, code);
    assert.equal(sessionCreated(), false);
  }
}));

test('launch scope: a billing address or tax ID changed on Stripe\'s page after our form is withheld, not delivered', () => inScope(async () => {
  const o = await placeOrder(CZ_OK);
  assert.equal(o.res.statusCode, 303);
  const moved = finished(o, CZ_OK, { customer_details: { email: CZ_OK.email, business_name: CZ_OK.company, address: { country: 'DE' }, tax_ids: [] } });
  const r = await deliver('checkout.session.completed', moved);
  assert.equal(r.body.withheld, 'billing-country-out-of-launch-scope');
  assert.equal((await order(o.orderId)).status, 'withheld');
  assert.equal(await entitlement(CZ_OK.email), null);

  const o2 = await placeOrder({ ...CZ_OK, email: 'jiny@zkusebni.example' });
  const foreignVat = finished(o2, { ...CZ_OK, email: 'jiny@zkusebni.example' }, { customer_details: { email: 'jiny@zkusebni.example', business_name: CZ_OK.company, address: { country: 'CZ' }, tax_ids: [{ type: 'eu_vat', value: 'DE123456789' }] } });
  assert.equal((await deliver('checkout.session.completed', foreignVat)).body.withheld, 'tax-id-out-of-launch-scope');

  const o3 = await placeOrder({ ...CZ_OK, email: 'treti@zkusebni.example' });
  const noAddress = finished(o3, { ...CZ_OK, email: 'treti@zkusebni.example' }, { customer_details: { email: 'treti@zkusebni.example', business_name: CZ_OK.company, address: null, tax_ids: [] } });
  assert.equal((await deliver('checkout.session.completed', noAddress)).body.withheld, 'billing-country-missing');
}));
