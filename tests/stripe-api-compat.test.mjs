/**
 * tests/stripe-api-compat.test.mjs - the pinned Stripe API version, and the readers that accept both the
 * legacy and the basil+ payload shapes, and the Checkout Session request that api/checkout.js sends on that
 * version. The readers are pure functions; the checkout tests talk to an in-process fake of the Stripe API on
 * loopback (STRIPE_API_HOST) and to an in-memory fake Upstash (the acceptance record, tests/acceptance.test.mjs),
 * so nothing leaves the machine.
 * Usage: node --test tests/stripe-api-compat.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { STRIPE_API_VERSION } from '../lib/stripe.js';
import { subscriptionPeriodEnd, invoiceSubscriptionId, invoiceSubscriptionPeriodEnd } from '../lib/stripeCompat.js';

// The checkout writes an acceptance record before it calls Stripe, so the handler needs a KV. A plain in-memory
// fake on loopback, started before api/checkout.js (and with it lib/db.js) is first imported.
const kvStore = new Map();
const kvFake = http.createServer((req, res) => {
  const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
  let result = null;
  if (cmd === 'GET') result = kvStore.get(args[0]) ?? null;
  else if (cmd === 'SET') { kvStore.set(args[0], args[1]); result = 'OK'; }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ result }));
});
await new Promise((r) => kvFake.listen(0, '127.0.0.1', r));
kvFake.unref();
process.env.KV_REST_API_URL = `http://127.0.0.1:${kvFake.address().port}`;
process.env.KV_REST_API_TOKEN = 'local-dummy-token';
const LEGAL_SET = JSON.parse(readFileSync(new URL('../config/legal.json', import.meta.url), 'utf8')).set;

test('the pinned API version is the one the installed stripe SDK is built against', () => {
  const src = readFileSync(new URL('../node_modules/stripe/cjs/apiVersion.js', import.meta.url), 'utf8');
  const sdkDefault = /ApiVersion = '([^']+)'/.exec(src)?.[1];
  assert.ok(sdkDefault, 'could not read the SDK default API version');
  assert.equal(STRIPE_API_VERSION, sdkDefault,
    'lib/stripe.js drifted from the SDK default: read the upgrade notes, then change them together');
});

test('subscriptionPeriodEnd reads the legacy top-level field', () => {
  assert.equal(subscriptionPeriodEnd({ current_period_end: 1800000000 }), 1800000000);
});

test('subscriptionPeriodEnd reads the subscription item field (basil and later)', () => {
  assert.equal(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 1800000100 }] } }), 1800000100);
});

test('subscriptionPeriodEnd prefers the legacy field and takes the earliest item period', () => {
  assert.equal(subscriptionPeriodEnd({ current_period_end: 5, items: { data: [{ current_period_end: 9 }] } }), 5);
  assert.equal(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 9 }, { current_period_end: 7 }] } }), 7);
});

test('subscriptionPeriodEnd is null for a bare id, a missing object or a missing period', () => {
  assert.equal(subscriptionPeriodEnd('sub_123'), null);
  assert.equal(subscriptionPeriodEnd(null), null);
  assert.equal(subscriptionPeriodEnd({ items: { data: [] } }), null);
});

test('invoiceSubscriptionId reads the legacy field, as an id or an expanded object', () => {
  assert.equal(invoiceSubscriptionId({ subscription: 'sub_1' }), 'sub_1');
  assert.equal(invoiceSubscriptionId({ subscription: { id: 'sub_2' } }), 'sub_2');
});

test('invoiceSubscriptionId reads parent.subscription_details (basil and later)', () => {
  const inv = { subscription: null, parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_3' } } };
  assert.equal(invoiceSubscriptionId(inv), 'sub_3');
});

test('invoiceSubscriptionId is null for a one-off invoice or another parent type', () => {
  assert.equal(invoiceSubscriptionId({ subscription: null, parent: { type: 'quote_details', quote_details: { quote: 'qt_1' } } }), null);
  assert.equal(invoiceSubscriptionId({}), null);
  assert.equal(invoiceSubscriptionId(null), null);
});

test('invoiceSubscriptionPeriodEnd picks the subscription line, not the first line', () => {
  const inv = {
    lines: { data: [
      { parent: { type: 'invoice_item_details' }, period: { end: 100 } },
      { parent: { type: 'subscription_item_details', subscription_item_details: {} }, period: { end: 200 } },
    ] },
    period_end: 300,
  };
  assert.equal(invoiceSubscriptionPeriodEnd(inv), 200);
});

test('invoiceSubscriptionPeriodEnd reads the legacy subscription line and falls back to the invoice period', () => {
  assert.equal(invoiceSubscriptionPeriodEnd({ lines: { data: [{ type: 'subscription', period: { end: 42 } }] } }), 42);
  assert.equal(invoiceSubscriptionPeriodEnd({ lines: { data: [] }, period_end: 77 }), 77);
  assert.equal(invoiceSubscriptionPeriodEnd({}), null);
});

// ── The Checkout Session request, as the pinned API version accepts it ────────────────────────────────
/* Stripe removed `payment_method_types` from Checkout Session create at API version 2026-09-30.endive: a
   request that still sends it gets a 400 (docs.stripe.com/changelog/endive/2026-09-30/
   remove-payment-method-types-checkout-sessions). The pin is newer than that, so api/checkout.js must send
   `allowed_payment_method_types` instead, or every purchase ends in "Could not start checkout". CI never
   reaches Stripe, so these tests run the real handler against a fake that enforces that one documented rule
   and records what it was sent. */
const PAYMENT_METHOD_TYPES_REMOVED_IN = '2026-09-30';

async function withFakeStripe(run) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const params = new URLSearchParams(raw);
      const version = String(req.headers['stripe-version'] || '');
      seen.push({ method: req.method, path: req.url, version, params });
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' && req.url === '/v1/customers') {
        return res.end(JSON.stringify({ id: 'cus_fake_1', object: 'customer' }));
      }
      if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
        const sendsRemovedParam = [...params.keys()].some((k) => k === 'payment_method_types' || k.startsWith('payment_method_types['));
        if (sendsRemovedParam && version.slice(0, 10) >= PAYMENT_METHOD_TYPES_REMOVED_IN) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: { type: 'invalid_request_error', param: 'payment_method_types',
            message: 'Received unknown parameter: payment_method_types' } }));
        }
        return res.end(JSON.stringify({ id: 'cs_fake_1', object: 'checkout.session', url: 'https://checkout.example.test/c/pay/cs_fake_1' }));
      }
      res.writeHead(404);
      res.end('{"error":{"message":"not found"}}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const keys = ['STRIPE_API_HOST', 'STRIPE_SECRET_KEY', 'CHECKOUT_ENABLED'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.STRIPE_API_HOST = `http://127.0.0.1:${server.address().port}`;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_never_sent_to_stripe';
  delete process.env.CHECKOUT_ENABLED;
  try {
    return await run(seen);
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.writeHead = (c, h = {}) => { r.statusCode = c; for (const [k, v] of Object.entries(h)) r.headers[k.toLowerCase()] = v; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  return r;
}

async function buy(query) {
  const { default: checkout } = await import('../api/checkout.js');
  const res = mockRes();
  // The buyer's submission of the confirmation page (lib/acceptance.js), which is what creates the session.
  await checkout({
    method: 'POST',
    body: { agent: 'contract-intelligence-and-register', company: 'Compat Test Co', name: 'Compat Tester',
      authority: 'on', terms: 'on', delivery: 'on', legal_set: LEGAL_SET, ...query },
    query: {},
    headers: { host: 'shop.example.test' },
  }, res);
  return res;
}

const sessionCall = (seen) => seen.find((c) => c.path === '/v1/checkout/sessions');
const allowedTypes = (call) => [0, 1, 2, 3].map((i) => call.params.get(`allowed_payment_method_types[${i}]`)).filter(Boolean);
const sendsRemovedParam = (call) => [...call.params.keys()].some((k) => k.startsWith('payment_method_types'));

test('the fake Stripe enforces the documented rule, so the checkout tests below would catch the old request', () => withFakeStripe(async () => {
  const post = (version, body) => fetch(`${process.env.STRIPE_API_HOST}/v1/checkout/sessions`, {
    method: 'POST', headers: { 'stripe-version': version, 'content-type': 'application/x-www-form-urlencoded' }, body });
  assert.equal((await post(STRIPE_API_VERSION, 'payment_method_types[0]=card')).status, 400);
  assert.equal((await post('2026-08-26.dahlia', 'payment_method_types[0]=card')).status, 200, 'older API versions still accept it');
  assert.equal((await post(STRIPE_API_VERSION, 'allowed_payment_method_types[0]=card')).status, 200);
}));

test('checkout, card lane: licence only goes out as allowed_payment_method_types on the pinned version', () => withFakeStripe(async (seen) => {
  const res = await buy({ method: 'card', cert: '0' });
  assert.equal(res.statusCode, 303, `expected a redirect to Stripe Checkout, got ${res.statusCode} ${JSON.stringify(res.body)}`);
  assert.equal(res.headers.location, 'https://checkout.example.test/c/pay/cs_fake_1');
  const call = sessionCall(seen);
  assert.equal(call.version, STRIPE_API_VERSION, 'the request must go out on the pinned API version');
  assert.equal(call.params.get('mode'), 'payment');
  assert.deepEqual(allowedTypes(call), ['card', 'link']);
  assert.equal(sendsRemovedParam(call), false, 'payment_method_types is removed from this API version');
}));

test('checkout, card lane: with Continuous Certification attached the session is a subscription and the same rule holds', () => withFakeStripe(async (seen) => {
  const res = await buy({ method: 'card' });
  assert.equal(res.statusCode, 303, `got ${res.statusCode} ${JSON.stringify(res.body)}`);
  const call = sessionCall(seen);
  assert.equal(call.params.get('mode'), 'subscription');
  assert.deepEqual(allowedTypes(call), ['card', 'link']);
  assert.equal(sendsRemovedParam(call), false);
}));

test('checkout, bank lane: a customer is created first and only bank transfer is allowed', () => withFakeStripe(async (seen) => {
  const res = await buy({ method: 'bank' });
  assert.equal(res.statusCode, 303, `got ${res.statusCode} ${JSON.stringify(res.body)}`);
  assert.deepEqual(seen.map((c) => c.path), ['/v1/customers', '/v1/checkout/sessions']);
  const call = sessionCall(seen);
  assert.equal(call.params.get('customer'), 'cus_fake_1');
  assert.deepEqual(allowedTypes(call), ['customer_balance']);
  assert.equal(call.params.get('payment_method_options[customer_balance][funding_type]'), 'bank_transfer');
  assert.equal(call.params.get('payment_method_options[customer_balance][bank_transfer][type]'), 'us_bank_transfer');
  assert.equal(sendsRemovedParam(call), false);
}));

test('checkout, no method chosen: bank transfer, card and Link are all allowed', () => withFakeStripe(async (seen) => {
  const res = await buy({});
  assert.equal(res.statusCode, 303, `got ${res.statusCode} ${JSON.stringify(res.body)}`);
  const call = sessionCall(seen);
  assert.deepEqual(allowedTypes(call), ['customer_balance', 'card', 'link']);
  assert.equal(call.params.get('mode'), 'payment', 'bank transfer cannot ride on a subscription, so no certification is attached');
  assert.equal(sendsRemovedParam(call), false);
}));
