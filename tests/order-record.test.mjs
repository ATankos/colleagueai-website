/**
 * tests/order-record.test.mjs - buyer identification and one order id across every record (PR A).
 *
 * The order-confirmation POST must identify the buyer company (legal name, registration number where it has one,
 * country, VAT / tax ID where it has one, a purchasing contact and email, the person accepting and their role), create
 * one order id, and write that id into the acceptance record, the order record, the Stripe Customer, the Checkout
 * Session (metadata + client_reference_id) and the PaymentIntent metadata, so refunds and disputes find the order.
 *
 * Runs the real handler against a fake Stripe API and a fake Upstash on loopback; nothing leaves the machine.
 * Usage: node --test tests/order-record.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { casServe } from './kv-cas-fake.mjs';

const ROOT = new URL('..', import.meta.url);
const LEGAL = JSON.parse(readFileSync(new URL('config/legal.json', ROOT), 'utf8'));
const PRODUCTS = JSON.parse(readFileSync(new URL('config/products.json', ROOT), 'utf8'));
const SLUG = 'contract-intelligence-and-register';

const store = new Map();
const stripeCalls = [];
let stripeMode = 'ok';
let kvServer, stripeServer, checkout, orders;

before(async () => {
  kvServer = http.createServer((req, res) => {
    if (req.method === 'POST') return casServe(store, req, res);
    const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
    let result = null;
    if (cmd === 'GET') result = store.get(args[0]) ?? null;
    else if (cmd === 'SET') {
      if (args.includes('NX') && store.has(args[0])) result = null;
      else { store.set(args[0], args[1]); result = 'OK'; }
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ result }));
  });
  stripeServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      stripeCalls.push({ path: req.url, params: new URLSearchParams(raw) });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/v1/customers') {
        if (stripeMode === 'tax_id_invalid') {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: { type: 'invalid_request_error', code: 'tax_id_invalid', param: 'tax_id_data[0][value]', message: 'Invalid value for eu_vat.' } }));
        }
        return res.end(JSON.stringify({ id: 'cus_fake_order', object: 'customer' }));
      }
      if (req.url === '/v1/checkout/sessions') {
        if (stripeMode === 'session_error') {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'boom' } }));
        }
        return res.end(JSON.stringify({ id: 'cs_fake_order', object: 'checkout.session', url: 'https://checkout.example.test/c/pay/cs_fake_order' }));
      }
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise((r) => kvServer.listen(0, '127.0.0.1', r));
  await new Promise((r) => stripeServer.listen(0, '127.0.0.1', r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  process.env.STRIPE_API_HOST = `http://127.0.0.1:${stripeServer.address().port}`;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_never_sent_to_stripe';
  delete process.env.CHECKOUT_ENABLED;
  delete process.env.VERCEL_ENV;
  ({ default: checkout } = await import('../api/checkout.js'));
  orders = await import('../lib/orders.js');
});

after(async () => {
  for (const s of [kvServer, stripeServer]) { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); }
});

beforeEach(async () => { await new Promise((r) => setTimeout(r, 20)); store.clear(); stripeCalls.length = 0; stripeMode = 'ok'; });

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.writeHead = (c, h = {}) => { r.statusCode = c; for (const [k, v] of Object.entries(h)) r.headers[k.toLowerCase()] = v; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  return r;
}

const CZ_BUYER = {
  agent: SLUG, method: 'card', lang: 'en', ref: 'campaign-7',
  company: 'Vzorová Průmyslová a.s.', reg_number: '12345678', country: 'CZ', tax_id: 'CZ 1234 5678',
  contact_name: 'Petr Nákupčí', email: 'Nakup@Vzorova.example',
  name: 'Jana Nováková', role: 'Jednatelka',
  authority: 'on', terms: 'on', delivery: 'on', legal_set: LEGAL.set,
};

async function post(body) {
  const res = mockRes();
  await checkout({ method: 'POST', body, query: {}, headers: { host: 'shop.example.test', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'test-agent' } }, res);
  return res;
}
const records = (prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => JSON.parse(v));
const call = (path) => stripeCalls.find((c) => c.path === path);

test('the confirmation page asks for every buyer identifier, and still has exactly three unticked boxes', async () => {
  const res = mockRes();
  await checkout({ method: 'GET', query: { agent: SLUG, method: 'card' }, headers: { host: 'shop.example.test' } }, res);
  assert.equal(res.statusCode, 200);
  for (const name of ['company', 'reg_number', 'country', 'tax_id', 'contact_name', 'email', 'name', 'role']) {
    assert.match(res.body, new RegExp(`name="${name}"`), `field ${name}`);
  }
  assert.match(res.body, /<select name="country" required/);
  assert.match(res.body, new RegExp(`SKU ${PRODUCTS[SLUG].sku}`));
  const boxes = res.body.match(/<input type="checkbox"[^>]*>/g) || [];
  assert.equal(boxes.length, 3);
  assert.equal(stripeCalls.length, 0);
});

for (const [missing, field] of [['country', 'country'], ['email', 'email'], ['role', 'role']]) {
  test(`POST without ${missing} is refused and marks that field; no record, no Stripe call`, async () => {
    const body = { ...CZ_BUYER };
    delete body[missing];
    const res = await post(body);
    assert.equal(res.statusCode, 400);
    assert.match(res.body, new RegExp(`name="${field}"[^>]*aria-invalid="true"|<select name="${field}" required aria-invalid="true"`));
    assert.equal(stripeCalls.length, 0);
    assert.equal(records('order:').length, 0);
  });
}

test('a VAT number from another EU state than the chosen country is refused before Stripe is called', async () => {
  const res = await post({ ...CZ_BUYER, country: 'DE', tax_id: 'FR12345678901' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /does not match the format for the country chosen/);
  assert.equal(stripeCalls.length, 0);
});

test('a valid order: one order id in the order record, the acceptance record, the Customer, the session and the PaymentIntent', async () => {
  const res = await post(CZ_BUYER);
  assert.equal(res.statusCode, 303, String(res.body).slice(0, 300));
  const [order] = records('order:');
  const [acc] = records('acceptance:');
  assert.ok(orders.isOrderId(order.id), order.id);
  assert.equal(acc.orderId, order.id);
  assert.equal(order.acceptance.id, acc.id);
  assert.equal(order.acceptance.legalSet, LEGAL.set);
  // Per document: the version, the fingerprint of its text and its archived copy (lib/legalArchive.js).
  for (const [k, d] of Object.entries(LEGAL.documents)) {
    assert.deepEqual(acc.legalDocuments[k], { version: d.version, sha256: d.sha256, archive: d.archive }, k);
    assert.match(d.sha256, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(order.acceptance.documents, acc.legalDocuments, 'the order names the same texts as the acceptance');
  assert.deepEqual(order.buyer, {
    company: 'Vzorová Průmyslová a.s.', registrationNumber: '12345678', country: 'CZ',
    taxId: { value: 'CZ12345678', type: 'eu_vat' },
    contact: { name: 'Petr Nákupčí', email: 'nakup@vzorova.example' },
    signatory: { name: 'Jana Nováková', role: 'Jednatelka' },
  });
  assert.deepEqual(acc.buyer, order.buyer, 'the acceptance keeps the buyer as declared');
  assert.equal(order.product.sku, PRODUCTS[SLUG].sku);
  assert.equal(order.product.release, PRODUCTS[SLUG].release.version);
  assert.deepEqual(order.price, { currency: 'usd', unitAmount: 1490000, quantity: 1 });
  assert.equal(order.mode, 'test');

  const cust = call('/v1/customers').params;
  assert.equal(cust.get('name'), 'Vzorová Průmyslová a.s.');
  assert.equal(cust.get('email'), 'nakup@vzorova.example');
  assert.equal(cust.get('metadata[order_id]'), order.id);
  assert.equal(cust.get('metadata[registration_number]'), '12345678');
  assert.equal(cust.get('metadata[declared_country]'), 'CZ');
  assert.equal(cust.get('tax_id_data[0][type]'), 'eu_vat');
  assert.equal(cust.get('tax_id_data[0][value]'), 'CZ12345678');

  const sess = call('/v1/checkout/sessions').params;
  assert.equal(sess.get('customer'), 'cus_fake_order');
  assert.equal(sess.get('client_reference_id'), order.id);
  assert.equal(sess.get('metadata[order_id]'), order.id);
  assert.equal(sess.get('metadata[ref]'), 'campaign-7', 'the storefront ref is kept in metadata');
  assert.equal(sess.get('payment_intent_data[metadata][order_id]'), order.id, 'charges, refunds and disputes carry it');
  assert.equal(sess.get('metadata[sku]'), PRODUCTS[SLUG].sku);
  assert.equal(sess.get('metadata[release]'), PRODUCTS[SLUG].release.version);
  assert.equal(sess.get('tax_id_collection[enabled]'), 'true');
  assert.equal(sess.get('customer_update[name]'), 'auto');
  assert.equal(sess.get('customer_update[address]'), 'auto');
  assert.equal(sess.get('billing_address_collection'), 'required');

  await new Promise((r) => setTimeout(r, 20));
  const bound = await orders.getOrder(order.id);
  assert.equal(bound.stripe.sessionId, 'cs_fake_order');
  assert.equal(bound.stripe.customerId, 'cus_fake_order');
  assert.equal(bound.status, 'checkout_open');
});

test('a business without a VAT ID is still a business: accepted, nothing sent to Stripe as a tax ID', async () => {
  const res = await post({ ...CZ_BUYER, country: 'DE', tax_id: '', reg_number: 'HRB 12345' });
  assert.equal(res.statusCode, 303);
  const [order] = records('order:');
  assert.equal(order.buyer.taxId, null);
  assert.equal(order.buyer.country, 'DE');
  assert.equal(call('/v1/customers').params.get('tax_id_data[0][type]'), null);
});

test('a non-EU tax ID is kept as declared and is not sent as a Stripe tax ID', async () => {
  const res = await post({ ...CZ_BUYER, country: 'US', tax_id: '12-3456789', reg_number: '' });
  assert.equal(res.statusCode, 303);
  const [order] = records('order:');
  assert.deepEqual(order.buyer.taxId, { value: '123456789', type: null });
  const cust = call('/v1/customers').params;
  assert.equal(cust.get('tax_id_data[0][type]'), null);
  assert.equal(cust.get('metadata[declared_tax_id]'), '123456789');
});

test('a VAT ID Stripe rejects returns the form with that field marked; no session; the order says why', async () => {
  stripeMode = 'tax_id_invalid';
  const res = await post({ ...CZ_BUYER, tax_id: 'CZ99999999' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /Stripe did not accept this VAT \/ tax ID/);
  assert.ok(!call('/v1/checkout/sessions'), 'no session was created');
  const [order] = records('order:');
  assert.equal(order.status, 'checkout_failed');
  assert.equal(order.facts.checkoutFailure, 'tax_id_invalid');
});

test('a Stripe failure while opening checkout leaves the order marked failed, never open', async () => {
  stripeMode = 'session_error';
  const res = await post(CZ_BUYER);
  assert.equal(res.statusCode, 502);
  const [order] = records('order:');
  assert.equal(order.status, 'checkout_failed');
});

test('order facts are applied once per source and the status follows the facts, whatever their order', () => {
  const base = { id: 'ord_20261110_000000000000', facts: {}, events: [] };
  const disputed = orders.applyOnce(base, { sourceId: 'evt_d', type: 'charge.dispute.created', facts: { dispute: { status: 'needs_response' } } });
  assert.equal(orders.orderStatus(disputed), 'disputed');
  const paidAfter = orders.applyOnce(disputed, { sourceId: 'evt_p', type: 'checkout.session.completed', facts: { paidAt: 'x', fulfilledAt: 'y' } });
  assert.equal(orders.orderStatus(paidAfter), 'disputed', 'a late payment confirmation does not hide the open dispute');
  assert.equal(orders.applyOnce(paidAfter, { sourceId: 'evt_p' }), null, 'a redelivered event changes nothing');
  const won = orders.applyOnce(paidAfter, { sourceId: 'evt_w', facts: { dispute: { status: 'won' } } });
  assert.equal(orders.orderStatus(won), 'fulfilled');
  const refunded = orders.applyOnce(won, { sourceId: 'evt_r', facts: { refunded: { amount: 1490000, full: true } } });
  assert.equal(orders.orderStatus(refunded), 'refunded');
});

test('roles and company names written the way buyers write them are accepted; markup is not', async () => {
  const { validateAcceptance } = await import('../lib/acceptance.js');
  const LEGAL_SET = JSON.parse(readFileSync(new URL('config/legal.json', ROOT), 'utf8')).set;
  const base = { company: 'Vzorová Průmyslová a.s.', country: 'CZ', email: 'nakup@vzorova.example', name: 'Jana Nováková', authority: 'on', terms: 'on', delivery: 'on', legal_set: LEGAL_SET };
  for (const role of ['Jednatel (CEO)', 'Director (Finance)', 'Head of Procurement', 'CFO', 'Director, Finance & Ops', 'Prokurist/in']) {
    const r = validateAcceptance({ ...base, role });
    assert.ok(r.ok, `${role}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.value.buyer.signatory.role, role);
  }
  for (const role of ['', '(CEO)', '<b>CEO</b>', 'CEO"; DROP', 'x'.repeat(61)]) {
    assert.ok(!validateAcceptance({ ...base, role }).ok, `${role} refused`);
  }
});
