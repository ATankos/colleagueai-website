/**
 * tests/acceptance.test.mjs - legal acceptance is evidence, not a query parameter.
 *
 * Holds the line that /api/checkout never creates a Stripe Checkout Session unless the buyer has
 * submitted the server-rendered confirmation form (company, declaring name, three unticked boxes ticked,
 * current document set), and that an acceptance record naming the document versions exists in KV and
 * is referenced from the session's metadata before any money can move.
 *
 * Runs the real handler against a fake Stripe API and a fake Upstash on loopback; nothing leaves the machine.
 * Usage: node --test tests/acceptance.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { casServe } from './kv-cas-fake.mjs';

const ROOT = new URL('..', import.meta.url);
const LEGAL = JSON.parse(readFileSync(new URL('config/legal.json', ROOT), 'utf8'));
const SLUG = 'contract-intelligence-and-register';

const store = new Map();
let kvDown = false;
const stripeCalls = [];
let kvServer, stripeServer, checkout, db, acceptance;

before(async () => {
  kvServer = http.createServer((req, res) => {
    if (kvDown) { res.writeHead(500); return res.end('{"error":"down"}'); }
    if (req.method === 'POST') return casServe(store, req, res);
    const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
    let result = null;
    if (cmd === 'GET') result = store.get(args[0]) ?? null;
    else if (cmd === 'SET') { store.set(args[0], args[1]); result = 'OK'; }
    else if (cmd === 'EXPIRE' || cmd === 'LPUSH') result = 1;
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
      if (req.url === '/v1/checkout/sessions') return res.end(JSON.stringify({ id: 'cs_fake_acc', object: 'checkout.session', url: 'https://checkout.example.test/c/pay/cs_fake_acc' }));
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
  db = await import('../lib/db.js');
  acceptance = await import('../lib/acceptance.js');
});

after(async () => {
  for (const s of [kvServer, stripeServer]) { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); }
});

beforeEach(async () => { await new Promise((r) => setTimeout(r, 30)); store.clear(); stripeCalls.length = 0; kvDown = false; });

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.writeHead = (c, h = {}) => { r.statusCode = c; for (const [k, v] of Object.entries(h)) r.headers[k.toLowerCase()] = v; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  return r;
}

const GOOD_FORM = {
  agent: SLUG, method: 'card', cert: '0', lang: 'en',
  company: 'Example Industries s.r.o.', name: 'Jana Nováková',
  authority: 'on', terms: 'on', delivery: 'on', legal_set: LEGAL.set,
};

async function get(query) {
  const res = mockRes();
  await checkout({ method: 'GET', query: { agent: SLUG, ...query }, headers: { host: 'shop.example.test' } }, res);
  return res;
}
async function post(body) {
  const res = mockRes();
  await checkout({ method: 'POST', body, query: {}, headers: { host: 'shop.example.test', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'test-agent' } }, res);
  return res;
}
const acceptances = () => [...store.entries()].filter(([k]) => k.startsWith('acceptance:')).map(([, v]) => JSON.parse(v));
const sessionCall = () => stripeCalls.find((c) => c.path === '/v1/checkout/sessions');

test('GET renders the confirmation page: every agreement with its version, three UNTICKED boxes, no Stripe call', async () => {
  const res = await get({ method: 'card', cert: '0' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  for (const d of Object.values(LEGAL.documents)) {
    assert.ok(res.body.includes(d.path), `links ${d.path}`);
    assert.ok(res.body.includes(`version ${d.version}`), `shows version of ${d.title}`);
  }
  const boxes = res.body.match(/<input type="checkbox"[^>]*>/g) || [];
  assert.equal(boxes.length, 3, 'authority, terms, delivery');
  for (const b of boxes) assert.ok(!/checked/.test(b), `box must start unticked: ${b}`);
  assert.equal(stripeCalls.length, 0, 'showing the page never creates a session');
  assert.equal(acceptances().length, 0);
});

test('an old storefront link with terms=accepted is NOT treated as acceptance', async () => {
  const res = await get({ method: 'card', cert: '0', terms: 'accepted' });
  assert.equal(res.statusCode, 200, 'it lands on the confirmation page');
  assert.equal(stripeCalls.length, 0);
  assert.equal(acceptances().length, 0);
});

for (const missing of ['authority', 'terms', 'delivery', 'company', 'name']) {
  test(`POST without ${missing} is refused with the form again; no record, no session`, async () => {
    const body = { ...GOOD_FORM };
    delete body[missing];
    const res = await post(body);
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /role="alert"/);
    assert.equal(stripeCalls.length, 0);
    assert.equal(acceptances().length, 0);
  });
}

test('POST against a superseded document set is refused (page was open while the agreements changed)', async () => {
  const res = await post({ ...GOOD_FORM, legal_set: '2000-01-01' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /agreements were updated/);
  assert.equal(stripeCalls.length, 0);
});

test('valid POST: record written first, session created with acceptance id + versions, record bound to the session', async () => {
  const res = await post(GOOD_FORM);
  assert.equal(res.statusCode, 303, `got ${res.statusCode} ${String(res.body).slice(0, 200)}`);
  assert.equal(res.headers.location, 'https://checkout.example.test/c/pay/cs_fake_acc');
  const [rec] = acceptances();
  assert.ok(rec, 'acceptance record stored');
  assert.match(rec.id, /^acc_[0-9a-f]{24}$/);
  assert.equal(rec.legalSet, LEGAL.set);
  assert.equal(rec.legalVersions, acceptance.legalVersionString());
  assert.equal(rec.buyerCompany, 'Example Industries s.r.o.');
  assert.equal(rec.declaredBy, 'Jana Nováková');
  assert.deepEqual(rec.consents, { authority: true, terms: true, delivery: true });
  assert.equal(rec.agentSlug, SLUG);
  assert.ok(rec.release, 'records the release version sold');
  assert.ok(rec.clientHash && !JSON.stringify(rec).includes('203.0.113.7'), 'stores a salted hash, never the address');
  const call = sessionCall();
  assert.equal(call.params.get('metadata[acceptance_id]'), rec.id);
  assert.equal(call.params.get('metadata[legal_set]'), LEGAL.set);
  assert.equal(call.params.get('metadata[legal_versions]'), acceptance.legalVersionString());
  assert.equal(call.params.get('metadata[buyer_company]'), 'Example Industries s.r.o.');
  assert.equal(call.params.get('payment_intent_data[metadata][acceptance_id]'), rec.id, 'refund/dispute events can find it too');
  assert.equal(call.params.get('billing_address_collection'), 'required');
  assert.match(call.params.get('custom_text[submit][message]'), new RegExp(rec.id));
  await new Promise((r) => setTimeout(r, 20)); // the bind is fire-and-forget
  assert.equal((await db.getAcceptance(rec.id)).stripeSessionId, 'cs_fake_acc');
});

test('Stripe consent_collection is requested only when the Dashboard Terms URL is declared configured', async () => {
  await post(GOOD_FORM);
  assert.equal(sessionCall().params.get('consent_collection[terms_of_service]'), null);
  stripeCalls.length = 0;
  process.env.STRIPE_TOS_CONSENT = '1';
  try {
    await post(GOOD_FORM);
    assert.equal(sessionCall().params.get('consent_collection[terms_of_service]'), 'required');
  } finally { delete process.env.STRIPE_TOS_CONSENT; }
});

test('subscription lane carries the acceptance on subscription_data too', async () => {
  process.env.CERTIFICATION_SALES_ENABLED = '1';
  let res;
  try { res = await post({ ...GOOD_FORM, cert: '', certification: 'on', cert_interval: 'month' }); } finally { delete process.env.CERTIFICATION_SALES_ENABLED; }
  assert.equal(res.statusCode, 303);
  const call = sessionCall();
  assert.equal(call.params.get('mode'), 'subscription');
  const id = call.params.get('subscription_data[metadata][acceptance_id]');
  assert.match(id, /^acc_[0-9a-f]{24}$/);
  assert.equal(call.params.get('metadata[acceptance_id]'), id);
  assert.ok(acceptances().some((r) => r.id === id && r.certification?.interval === 'month' && r.certification?.optIn === true),
    'the record names the certification the buyer opted into');
});

test('if the acceptance cannot be stored, no money is taken: 503 and no Stripe call', async () => {
  kvDown = true;
  const res = await post(GOOD_FORM);
  assert.equal(res.statusCode, 503);
  assert.equal(stripeCalls.length, 0);
});

test('the bound record gains the buyer email from fulfilment, keeping what was accepted', async () => {
  const rec = await db.recordAcceptance({ legalSet: LEGAL.set, buyerCompany: 'X Ltd', consents: { terms: true } });
  const bound = await db.bindAcceptance(rec.id, { stripeSessionId: 'cs_1', buyerEmail: 'buyer@example.com' });
  assert.equal(bound.buyerEmail, 'buyer@example.com');
  assert.equal(bound.buyerCompany, 'X Ltd');
  assert.equal(bound.acceptedAt, rec.acceptedAt);
  assert.equal(await db.getAcceptance('not-an-id'), null);
});

test('config/legal.json versions match the live legal pages (bump both together)', () => {
  for (const [key, d] of Object.entries(LEGAL.documents)) {
    const file = d.path === '/license' ? 'license' : d.path.slice(1);
    const html = readFileSync(new URL(`public/${file}.html`, ROOT), 'utf8');
    assert.ok(html.includes(d.pageMarker), `${key}: public/${file}.html no longer says "${d.pageMarker}" - bump config/legal.json`);
  }
});

test('the storefront no longer builds checkout links that claim acceptance', () => {
  for (const f of ['public/agents.html']) {
    const src = readFileSync(new URL(f, ROOT), 'utf8');
    assert.ok(!src.includes("'&terms=accepted'"), `${f} still appends terms=accepted`);
  }
});
