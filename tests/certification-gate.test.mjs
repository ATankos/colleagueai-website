/**
 * tests/certification-gate.test.mjs - Continuous Certification is opt-in and gated (finding LR-23).
 *
 * The first commercial launch sells the perpetual licence only. Until CERTIFICATION_SALES_ENABLED=1:
 *   - checkout creates payment-mode sessions only, with no recurring line item;
 *   - any request that asks for certification (form opt-in, cert=month|year|1 in a link or direct API call)
 *     is refused server-side with 409 certification_not_available, before any record or Stripe call.
 * With the gate on, a subscription is created only from an UNTICKED-by-default box on the POSTed confirmation
 * form, and the page states the recurring price, frequency, automatic renewal and cancellation before payment.
 *
 * Runs the real handler on loopback fakes of Stripe and Upstash; nothing leaves the machine.
 * Usage: node --test tests/certification-gate.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { casServe } from './kv-cas-fake.mjs';

const ROOT = new URL('..', import.meta.url);
const LEGAL = JSON.parse(readFileSync(new URL('config/legal.json', ROOT), 'utf8'));
const PRICING = JSON.parse(readFileSync(new URL('config/pricing.json', ROOT), 'utf8'));
const SLUG = 'contract-intelligence-and-register';
const L4 = PRICING.tiers.L4;

const store = new Map();
const stripeCalls = [];
let kvServer, stripeServer, checkout;

before(async () => {
  kvServer = http.createServer((req, res) => {
    if (req.method === 'POST') return casServe(store, req, res);
    const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
    let result = null;
    if (cmd === 'GET') result = store.get(args[0]) ?? null;
    else if (cmd === 'SET') { store.set(args[0], args[1]); result = 'OK'; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ result }));
  });
  stripeServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      stripeCalls.push({ path: req.url, params: new URLSearchParams(raw) });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/v1/customers') return res.end(JSON.stringify({ id: 'cus_fake_1', object: 'customer' }));
      if (req.url === '/v1/checkout/sessions') return res.end(JSON.stringify({ id: 'cs_fake_gate', object: 'checkout.session', url: 'https://checkout.example.test/c/pay/cs_fake_gate' }));
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
  delete process.env.CERTIFICATION_SALES_ENABLED;
  ({ default: checkout } = await import('../api/checkout.js'));
});

after(async () => {
  for (const s of [kvServer, stripeServer]) { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); }
});

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 20)); // let a previous test's fire-and-forget bind land first
  store.clear(); stripeCalls.length = 0; delete process.env.CERTIFICATION_SALES_ENABLED;
});

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.writeHead = (c, h = {}) => { r.statusCode = c; for (const [k, v] of Object.entries(h)) r.headers[k.toLowerCase()] = v; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  return r;
}
const FORM = { agent: SLUG, method: 'card', lang: 'en', company: 'Gate Test Company s.r.o.', name: 'Petra Testova', role: 'Director', country: 'CZ', email: 'petra@example.test',
  authority: 'on', terms: 'on', delivery: 'on', legal_set: LEGAL.set };
async function get(query) {
  const res = mockRes();
  await checkout({ method: 'GET', query: { agent: SLUG, ...query }, headers: { host: 'shop.example.test' } }, res);
  return res;
}
async function post(body) {
  const res = mockRes();
  await checkout({ method: 'POST', body, query: {}, headers: { host: 'shop.example.test' } }, res);
  return res;
}
const session = () => stripeCalls.find((c) => c.path === '/v1/checkout/sessions');
const records = () => [...store.entries()].filter(([k]) => k.startsWith('acceptance:')).map(([, v]) => JSON.parse(v));
const recurringIntervals = (call) => [0, 1, 2].map((i) => call.params.get(`line_items[${i}][price_data][recurring][interval]`)).filter(Boolean);
const withGate = async (fn) => { process.env.CERTIFICATION_SALES_ENABLED = '1'; try { return await fn(); } finally { delete process.env.CERTIFICATION_SALES_ENABLED; } };

// ── Gate OFF (default): licence only ────────────────────────────────────────────────────────────
test('gate off: the confirmation page offers no certification and says so', async () => {
  const res = await get({ method: 'card' });
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /name="certification"/);
  assert.match(res.body, /perpetual licence only/);
  assert.match(res.body, /not yet open for subscription/);
  assert.equal((res.body.match(/type="checkbox"/g) || []).length, 3);
});

for (const method of ['card', 'bank']) {
  test(`gate off, ${method} lane: a confirmed order is a payment-mode session with no recurring line`, async () => {
    const res = await post({ ...FORM, method });
    assert.equal(res.statusCode, 303, String(res.body).slice(0, 200));
    const call = session();
    assert.equal(call.params.get('mode'), 'payment');
    assert.deepEqual(recurringIntervals(call), []);
    assert.equal(call.params.get('metadata[certification]'), null);
    assert.equal(records()[0].certification, null);
  });
}

for (const interval of ['month', 'year']) {
  test(`gate off: a ticked certification opt-in (${interval}) is refused server-side; no record, no Stripe call`, async () => {
    const res = await post({ ...FORM, certification: 'on', cert_interval: interval });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'certification_not_available');
    assert.equal(stripeCalls.length, 0);
    assert.equal(records().length, 0);
  });
}

for (const cert of ['month', 'year', '1', 'true', 'on']) {
  test(`gate off: a direct link or API call with cert=${cert} is refused`, async () => {
    assert.equal((await get({ method: 'card', cert })).statusCode, 409);
    const res = await post({ ...FORM, cert });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'certification_not_available');
    assert.equal(stripeCalls.length, 0);
  });
}

test('gate off: old links with cert=0 still buy the licence only', async () => {
  assert.equal((await get({ method: 'card', cert: '0' })).statusCode, 200);
  const res = await post({ ...FORM, cert: '0' });
  assert.equal(res.statusCode, 303);
  assert.equal(session().params.get('mode'), 'payment');
});

// ── Gate ON: explicit opt-in only ───────────────────────────────────────────────────────────────
test('gate on: the opt-in is an unticked box with recurring price, frequency, renewal and cancellation stated', () => withGate(async () => {
  const res = await get({ method: 'card' });
  assert.equal(res.statusCode, 200);
  const box = res.body.match(/<input type="checkbox" name="certification"[^>]*>/);
  assert.ok(box, 'certification box missing');
  assert.doesNotMatch(box[0], /checked/, 'the certification box must start unticked');
  assert.ok(res.body.includes('$249 per month'), 'monthly price');
  assert.ok(res.body.includes('$2,490 per year'), 'annual price');
  assert.equal(L4.monthlyCents, 24900); assert.equal(L4.annualCents, 249000);
  assert.match(res.body, /renews automatically until cancelled/);
  assert.match(res.body, /Cancel at any time/);
  assert.match(res.body, /never affects your perpetual licence/);
  assert.match(res.body, /not third-party accreditation/);
  assert.ok(res.body.includes(`version ${LEGAL.certification.version}`), 'certification terms version shown');
}));

test('gate on: no tick means no subscription', () => withGate(async () => {
  const res = await post(FORM);
  assert.equal(res.statusCode, 303);
  assert.equal(session().params.get('mode'), 'payment');
  assert.equal(records()[0].certification, null);
}));

for (const [interval, cents] of [['month', L4.monthlyCents], ['year', L4.annualCents]]) {
  test(`gate on: a ticked ${interval}ly opt-in creates a subscription at the stated price and records the consent`, () => withGate(async () => {
    const res = await post({ ...FORM, certification: 'on', cert_interval: interval });
    assert.equal(res.statusCode, 303, String(res.body).slice(0, 200));
    const call = session();
    assert.equal(call.params.get('mode'), 'subscription');
    assert.deepEqual(recurringIntervals(call), [interval]);
    assert.equal(call.params.get('line_items[1][price_data][unit_amount]'), String(cents));
    assert.equal(call.params.get('metadata[certification]'), interval);
    const rec = records()[0];
    assert.deepEqual(rec.certification, { interval, unitCents: cents, optIn: true, termsVersion: LEGAL.certification.version });
  }));
}

test('gate on: certification with bank transfer is refused, never silently dropped', () => withGate(async () => {
  const res = await post({ ...FORM, method: 'bank', certification: 'on', cert_interval: 'month' });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'certification_needs_card');
  assert.equal(stripeCalls.length, 0);
  const page = await get({ method: 'bank' });
  assert.doesNotMatch(page.body, /name="certification"/, 'the bank lane does not offer certification');
}));

test('gate on: a link cannot pre-select certification; it is chosen on the page only', () => withGate(async () => {
  const res = await get({ method: 'card', cert: 'month' });
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body.match(/<input type="checkbox" name="certification"[^>]*>/)[0], /checked/);
  assert.doesNotMatch(res.body, /name="cert" value=/, 'cert is not carried into the form');
}));

// ── Regression: PR #497 legal acceptance still holds with the opt-in ─────────────────────────────
test('regression #497: a ticked opt-in without the legal confirmations is refused and nothing is stored', () => withGate(async () => {
  const res = await post({ ...FORM, terms: undefined, certification: 'on', cert_interval: 'year' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /role="alert"/);
  assert.match(res.body.match(/<input type="checkbox" name="certification"[^>]*>/)[0], /checked/, 'the buyer\'s choice is kept on the re-shown form');
  assert.equal(stripeCalls.length, 0);
  assert.equal(records().length, 0);
}));

test('the storefront never sends a certification parameter', () => {
  const src = readFileSync(new URL('public/agents.html', ROOT), 'utf8');
  const fn = src.match(/function checkoutUrl\(slug,ref\)\{[\s\S]*?\n  \}/)[0];
  assert.doesNotMatch(fn, /cert|interval|certification/);
});
