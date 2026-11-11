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
import Stripe from 'stripe';
import { casReply } from './kv-cas-fake.mjs';

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
  if (req.method === 'POST' && p === '/v1/credit_notes') return [200, { id: `cn_j${++seq}`, object: 'credit_note', number: `CN-${seq}`, pdf: 'https://pay.stripe.test/cn.pdf' }];
  return [404, { error: { message: `unhandled ${req.method} ${p}` } }];
}

let webhookServer, webhookBase, checkout, success, download, storage, db, orders, downloadToken;
before(async () => {
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
  for (const s of [kvServer, stripeServer, webhookServer]) { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); }
});
beforeEach(() => {
  kv.clear(); sets.clear(); stripeCalls.length = 0; sessions.clear(); invoices.clear(); refunds.clear(); customers.clear();
  customerMode = 'ok'; sessionMode = 'ok';
  for (const k of ['TAX_POLICY_SANDBOX', 'TAX_SANDBOX_INVOICE_ROUTE', 'INVOICE_SANDBOX_FAIL']) delete process.env[k];
  storage.__setBlobSdkForTests(null);
  delete process.env.BLOB_STORE_ID;
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

test('corrective release: a purchase of withdrawn 1.0.3.2 (made before order ids) is offered 1.0.3.4, never the missing package', async () => {
  const email = 'early.buyer@example.test';
  const s = { id: 'cs_test_legacy_1032', object: 'checkout.session', livemode: false, mode: 'payment', status: 'complete', payment_status: 'paid',
    currency: 'usd', amount_subtotal: PRICE, amount_total: PRICE, customer_details: { email }, metadata: { agent_slug: SLUG, sku: PRODUCT.sku, release: '1.0.3.2' } };
  sessions.set(s.id, s);
  const page = await thankYou(s.id);
  assert.match(page.body, /CAI-L4-CI-001_1\.0\.3\.4\.zip/);
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

test('unapproved purchase attempts: concept agents and live keys are refused before any record or Stripe call', async () => {
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
});

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
