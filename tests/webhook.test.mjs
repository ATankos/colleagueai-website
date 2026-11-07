/**
 * tests/webhook.test.mjs — Phase 2: Stripe webhook security, idempotency, attribution.
 * Runs FULLY LOCALLY: in-process fake Upstash KV REST server + the real api/webhook.js handler
 * behind a local http server. Signed payloads built with stripe.webhooks.generateTestHeaderString.
 * NO live Stripe API calls, NO real secrets (the signing secret below is a dummy for local signing).
 * Usage: node --test tests/webhook.test.mjs
 *
 * IMPORTANT: assertions encode the INTENDED behaviour from the go-live spec. Tests that FAIL
 * document real defects (see GO-LIVE-TEST-REPORT.md) and become regression tests once fixed.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import Stripe from 'stripe';
import * as products from '../lib/products.js';

// dummy local-only signing secret (never a real credential)
const SECRET = 'whsec_LOCAL_TEST_HARNESS_DUMMY';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_SECRET_KEY = 'sk_test_LOCAL_DUMMY_NOT_REAL';
process.env.PARTNER_COMMISSION_RATE = '0.20';

// ── fake Upstash KV REST server ──────────────────────────────────────────────
const kvStore = new Map();
export const kvLog = [];
let kvFail = false;
const kvServer = http.createServer((req, res) => {
  const [, cmd, ...rest] = req.url.split('/').map(decodeURIComponent);
  if (kvFail) { res.writeHead(500); return res.end('forced failure'); }
  if (cmd === 'GET') { res.end(JSON.stringify({ result: kvStore.get(rest[0]) ?? null })); return; }
  if (cmd === 'SET') {
    const [key, value, ...flags] = rest;
    if (flags.includes('NX') && kvStore.has(key)) { res.end(JSON.stringify({ result: null })); return; }
    kvStore.set(key, value); kvLog.push({ op: 'SET', key });
    res.end(JSON.stringify({ result: 'OK' })); return;
  }
  if (cmd === 'DEL') { kvStore.delete(rest[0]); kvLog.push({ op: 'DEL', key: rest[0] }); res.end(JSON.stringify({ result: 1 })); return; }
  res.end(JSON.stringify({ result: null }));
});

// ── webhook handler behind a real http server (raw body preserved) ──────────
let handler, appServer, base;
function shimRes(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  return res;
}
before(async () => {
  await new Promise(r => kvServer.listen(0, r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  ({ default: handler } = await import('../api/webhook.js'));
  appServer = http.createServer((req, res) => handler(req, shimRes(res)));
  await new Promise(r => appServer.listen(0, r));
  base = `http://127.0.0.1:${appServer.address().port}`;
});
after(() => { kvServer.close(); appServer.close(); });
beforeEach(() => { kvStore.clear(); kvLog.length = 0; kvFail = false; });

const stripe = new Stripe('sk_test_LOCAL_DUMMY_NOT_REAL');
let evtSeq = 0;
function makeEvent({ type = 'checkout.session.completed', id, sessionId = 'cs_test_1', email = 'buyer@example.com', partner, amount = 120000, metadata = {} } = {}) {
  return {
    id: id ?? `evt_test_${++evtSeq}`,
    object: 'event', type,
    data: { object: { id: sessionId, object: 'checkout.session', amount_total: amount,
      customer_details: { email }, metadata: { agent_slug: 'contract-intelligence-and-register', ...(partner ? { partner } : {}), ...metadata } } },
  };
}
async function deliver(event, { sign = true, badSig = false, timestamp } = {}) {
  const payload = JSON.stringify(event);
  const headers = { 'content-type': 'application/json' };
  if (sign) headers['stripe-signature'] = stripe.webhooks.generateTestHeaderString({
    payload, secret: badSig ? 'whsec_WRONG_DUMMY' : SECRET, ...(timestamp ? { timestamp } : {}) });
  const r = await fetch(base + '/api/webhook', { method: 'POST', headers, body: payload });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const commissionWrites = () => kvLog.filter(w => w.op === 'SET' && w.key.startsWith('partner:reg:'));
/* Partners must now carry an explicit approved status: a registration record on
   its own is not accreditation. Commission accrues to pendingAmount and is held
   as a ledger entry per sale, so it can be reversed on refund or dispute. */
const registerPartner = (code, status = 'approved') => kvStore.set('partner:reg:' + code,
  JSON.stringify({ code, name: 'Test Partner', email: 't@example.com', status,
    commissionRate: 0.20, agreementVersion: 'test-v1', salesCount: 0, pendingAmount: 0 }));

// ── 1. signature enforcement ────────────────────────────────────────────────
test('1a. no signature header → 400, no KV writes', async () => {
  const r = await deliver(makeEvent(), { sign: false });
  assert.equal(r.status, 400);
  assert.equal(kvLog.length, 0);
});
test('1b. invalid signature → 400, no KV writes', async () => {
  const r = await deliver(makeEvent(), { badSig: true });
  assert.equal(r.status, 400);
  assert.equal(kvLog.length, 0);
});
test('1c. valid signature → 2xx (raw body verified before parsing)', async () => {
  const r = await deliver(makeEvent());
  assert.ok(r.status >= 200 && r.status < 300, `got ${r.status}`);
});
// ── 2. replay tolerance ─────────────────────────────────────────────────────
test('2. valid signature but stale timestamp (>tolerance) → rejected', async () => {
  const stale = Math.floor(Date.now() / 1000) - 600; // 10 min old, default tolerance 300s
  const r = await deliver(makeEvent(), { timestamp: stale });
  assert.equal(r.status, 400, `stale-timestamped event accepted with ${r.status}`);
});
// ── 3. idempotency ──────────────────────────────────────────────────────────
test('3a. same event.id delivered twice → commission written exactly once, second still 2xx', async () => {
  registerPartner('CAI-TESTPART');
  const evt = makeEvent({ id: 'evt_dup_1', partner: 'CAI-TESTPART', sessionId: 'cs_dup_1' });
  const r1 = await deliver(evt); const r2 = await deliver(evt);
  assert.equal(r1.status, 200); assert.equal(r2.status, 200);
  assert.equal(commissionWrites().length, 1,
    `DEFECT: duplicate event.id credited partner twice (${commissionWrites().length} commission writes)`);
});
test('3b. two different events for the same checkout session → no double-crediting', async () => {
  registerPartner('CAI-TESTPART');
  await deliver(makeEvent({ id: 'evt_s1', partner: 'CAI-TESTPART', sessionId: 'cs_same' }));
  await deliver(makeEvent({ id: 'evt_s2', partner: 'CAI-TESTPART', sessionId: 'cs_same' }));
  const rec = JSON.parse(kvStore.get('partner:reg:CAI-TESTPART') ?? '{}');
  assert.equal(rec.salesCount, 1, `DEFECT: same session credited ${rec.salesCount} times (pendingAmount=${rec.pendingAmount})`);
});
// ── 4. one-time vs recurring ────────────────────────────────────────────────
test('4a. checkout.session.completed credits exactly once at PARTNER_COMMISSION_RATE', async () => {
  registerPartner('CAI-RATE');
  await deliver(makeEvent({ partner: 'CAI-RATE', amount: 120000 })); // €1200.00
  const rec = JSON.parse(kvStore.get('partner:reg:CAI-RATE') ?? '{}');
  assert.equal(rec.salesCount, 1);
  assert.equal(rec.pendingAmount, 240, `expected 20% of €1200 = 240, got ${rec.pendingAmount}`);
});
test('4b. invoice.paid (subscription renewal) → handler ignores it: renewals are UNCREDITED (revenue rule check)', async () => {
  const evt = makeEvent({ type: 'invoice.paid', partner: 'CAI-RENEW' });
  const r = await deliver(evt);
  assert.equal(r.status, 200);
  // The coded royalty rule: ONLY checkout.session.completed credits. This assertion documents it.
  assert.equal(commissionWrites().length, 0, 'invoice.paid unexpectedly credited');
});
// ── 5. attribution edge cases ───────────────────────────────────────────────
test('5a. partner ref present → KV record contains code + session id', async () => {
  registerPartner('CAI-ABC12345');
  await deliver(makeEvent({ partner: 'CAI-ABC12345', sessionId: 'cs_attr_1' }));
  const rec = JSON.parse(kvStore.get('partner:reg:CAI-ABC12345') ?? 'null');
  assert.ok(rec, 'no partner record written');
  assert.ok(rec.sessions.includes('cs_attr_1'));
});
test('5b. no partner ref → clean entitlement, no partner writes, no crash', async () => {
  const r = await deliver(makeEvent({ email: 'clean@example.com' }));
  assert.equal(r.status, 200);
  assert.equal(commissionWrites().length, 0);
  assert.ok(kvStore.has('entitlement:clean@example.com'));
});
test('5c. malformed/oversized partner ref → sanitized or rejected, never stored raw', async () => {
  const evil = 'A'.repeat(5000) + '/<script>"\n';
  await deliver(makeEvent({ partner: evil }));
  const rawKeys = [...kvStore.keys()].filter(k => k.startsWith('partner:reg:'));
  const stored = rawKeys[0]?.slice('partner:reg:'.length) ?? '';
  assert.ok(stored.length <= 64 && !/[<>"\n\/]/.test(stored),
    `DEFECT: oversized/malformed ref stored raw (len=${stored.length})`);
});
// ── 6. unknown event types ──────────────────────────────────────────────────
test('6. unknown event type → 2xx and ZERO side effects', async () => {
  const r = await deliver(makeEvent({ type: 'customer.created' }));
  assert.equal(r.status, 200);
  assert.equal(kvLog.length, 0, `unknown event caused ${kvLog.length} KV writes`);
});
// ── 7. KV failure path ──────────────────────────────────────────────────────
test('7. KV write failure → handler must return non-2xx so Stripe retries (200 = silent royalty loss)', async () => {
  kvFail = true;
  const r = await deliver(makeEvent({ partner: 'CAI-FAILKV' }));
  assert.ok(r.status < 200 || r.status >= 300,
    `DEFECT: handler returned ${r.status} while KV write was dropped — Stripe will never retry`);
});
// ── 8. accreditation gating ─────────────────────────────────────────────────
test('8. unregistered/non-accredited partner code must NOT accrue commission (no gate = High finding)', async () => {
  await deliver(makeEvent({ partner: 'CAI-NEVERSEEN' })); // code never registered
  const rec = kvStore.get('partner:reg:CAI-NEVERSEEN');
  assert.equal(rec, undefined,
    `DEFECT: no accreditation gate — unknown code earned a commission stub: ${String(rec).slice(0, 120)}`);
});

// ── 9. retry journey: failure → 500 → Stripe redelivers → processed exactly once ──
test('9. KV outage then recovery: redelivered event is processed (claims released), credited once', async () => {
  kvFail = true;
  const evt = makeEvent({ id: 'evt_retry_1', partner: 'CAI-RETRY', sessionId: 'cs_retry_1' });
  const r1 = await deliver(evt);
  assert.ok(r1.status >= 500, `first delivery during outage should 5xx, got ${r1.status}`);
  kvFail = false;
  registerPartner('CAI-RETRY');
  const r2 = await deliver(evt); // Stripe retry
  assert.equal(r2.status, 200);
  const rec = JSON.parse(kvStore.get('partner:reg:CAI-RETRY') ?? '{}');
  assert.equal(rec.salesCount, 1, 'retry must credit exactly once');
  const r3 = await deliver(evt); // further redelivery = duplicate
  assert.equal(r3.status, 200);
  assert.equal(JSON.parse(kvStore.get('partner:reg:CAI-RETRY')).salesCount, 1, 'third delivery must not re-credit');
});

test('9. a REGISTERED but UNAPPROVED partner must not accrue commission', async () => {
  registerPartner('CAI-NOTAPPROVED', 'pending');
  await deliver(makeEvent({ partner: 'CAI-NOTAPPROVED', amount: 120000 }));
  const rec = JSON.parse(kvStore.get('partner:reg:CAI-NOTAPPROVED') ?? '{}');
  assert.ok(!rec.pendingAmount,
    `DEFECT: unapproved partner accrued ${rec.pendingAmount} — a registration record is not accreditation`);
  assert.equal(kvStore.has('commission:cs_test'), false, 'no ledger entry may be written for an unapproved partner');
});

// ── 10. refund path: session resolution from a live-shaped charge event ──────
/* A real charge.refunded event has NO checkout_session_id anywhere: the session
   id does not exist yet when checkout.js writes payment_intent_data.metadata,
   and the event's payment_intent field is a bare id string. The handler must
   resolve the session via the Stripe API (sessions.list by payment_intent) or
   every refund silently keeps the commission and the entitlement. These tests
   run against an in-process fake of that API (STRIPE_API_HOST) — nothing
   leaves the machine. */
import { before as before10 } from 'node:test';

let stripeApiServer;
let stripeApiMode = 'ok'; // 'ok' | 'empty' | 'fail'
const stripeSessionsById = new Map(); // sessions the success page retrieves by id (section 12)
before10(async () => {
  stripeApiServer = http.createServer((req, res) => {
    if (req.url.startsWith('/v1/checkout/sessions/') && req.method === 'GET') {
      const id = decodeURIComponent(req.url.split('/')[4].split('?')[0]);
      const s = stripeSessionsById.get(id);
      res.setHeader('content-type', 'application/json');
      if (!s) { res.writeHead(404); return res.end('{"error":{"message":"No such checkout.session"}}'); }
      return res.end(JSON.stringify(s));
    }
    if (req.url.startsWith('/v1/checkout/sessions') && req.method === 'GET') {
      if (stripeApiMode === 'fail') { res.writeHead(500); return res.end('{"error":{"message":"forced"}}'); }
      const u = new URL(req.url, 'http://x');
      const pi = u.searchParams.get('payment_intent');
      const data = (stripeApiMode === 'ok' && pi === 'pi_refund_1')
        ? [{ id: 'cs_refund_1', object: 'checkout.session', payment_intent: pi,
             customer_details: { email: 'buyer@example.com' },
             metadata: { agent_slug: 'contract-intelligence-and-register', tier: 'L4' } }]
        : [];
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ object: 'list', data, has_more: false, url: '/v1/checkout/sessions' }));
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(r => stripeApiServer.listen(0, r));
  process.env.STRIPE_API_HOST = `http://127.0.0.1:${stripeApiServer.address().port}`;
});
after(() => { stripeApiServer && stripeApiServer.close(); });

function makeChargeEvent({ type = 'charge.refunded', id, pi = 'pi_refund_1', refunded = true,
  amount = 120000, amountRefunded = 120000, email = 'buyer@example.com', metadata = {} } = {}) {
  return {
    id: id ?? `evt_charge_${++evtSeq}`, object: 'event', type,
    data: { object: { id: 'ch_test_1', object: 'charge', payment_intent: pi, refunded,
      amount, amount_refunded: amountRefunded, billing_details: { email }, metadata } },
  };
}

const seedCommission = (sessionId) => kvStore.set('commission:' + sessionId, JSON.stringify({
  stripeSessionId: sessionId, code: 'CAI-REFUND', amountGross: 120000, commission: 240,
  currency: 'USD', state: 'pending', createdAt: new Date().toISOString() }));

test('10a. full refund with only a payment_intent id → session resolved, commission reversed, entitlement revoked', async () => {
  stripeApiMode = 'ok';
  kvStore.set('entitlement:buyer@example.com', JSON.stringify({
    email: 'buyer@example.com', slugs: ['contract-intelligence-and-register'], stripeSessionIds: ['cs_refund_1'] }));
  seedCommission('cs_refund_1');

  const r = await deliver(makeChargeEvent({}));
  assert.equal(r.status, 200);
  const ledger = JSON.parse(kvStore.get('commission:cs_refund_1'));
  assert.equal(ledger.state, 'reversed',
    `DEFECT: refund arrived but the commission stayed "${ledger.state}" — session was not resolved from the payment intent`);
  const ent = JSON.parse(kvStore.get('entitlement:buyer@example.com'));
  assert.deepEqual(ent.slugs, [],
    'DEFECT: full refund must revoke the entitlement for the refunded agent');
});

test('10b. charge with no payment_intent and no metadata → acknowledged, ledger untouched', async () => {
  stripeApiMode = 'ok';
  seedCommission('cs_orphan_1');
  const r = await deliver(makeChargeEvent({ pi: null }));
  assert.equal(r.status, 200);
  assert.equal(r.body.commission, 'no-session-reference');
  assert.equal(JSON.parse(kvStore.get('commission:cs_orphan_1')).state, 'pending', 'unrelated ledger entries must not change');
});

test('10c. Stripe API outage during lookup → 5xx so Stripe retries instead of dropping the reversal', async () => {
  stripeApiMode = 'fail';
  const r = await deliver(makeChargeEvent({}));
  assert.ok(r.status >= 500, `expected retryable 5xx during API outage, got ${r.status}`);
  stripeApiMode = 'ok';
});

test('10d. explicit checkout_session_id in charge metadata still resolves without an API call', async () => {
  stripeApiMode = 'fail'; // API down — metadata path must not need it
  kvStore.set('entitlement:buyer@example.com', JSON.stringify({
    email: 'buyer@example.com', slugs: ['contract-intelligence-and-register'] }));
  seedCommission('cs_direct_1');
  const r = await deliver(makeChargeEvent({
    metadata: { checkout_session_id: 'cs_direct_1', agent_slug: 'contract-intelligence-and-register' } }));
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(kvStore.get('commission:cs_direct_1')).state, 'reversed');
  stripeApiMode = 'ok';
});

// ── 11. Continuous Certification lifecycle through the webhook ──────────────
/* The commercial promise is that the agent licence is perpetual and only the
   certification is rented. These tests pin that at the webhook boundary, where
   a wrong branch would quietly take away something the customer bought. */
function makeSubEvent({ type, id, subId = 'sub_cert_1', status = 'active',
  periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400 } = {}) {
  const object = type.startsWith('invoice')
    ? { id: 'in_1', object: 'invoice', subscription: subId, period_end: periodEnd,
        lines: { data: [{ period: { end: periodEnd } }] } }
    : { id: subId, object: 'subscription', status, current_period_end: periodEnd };
  return { id: id ?? `evt_sub_${++evtSeq}`, object: 'event', type, data: { object } };
}

const seedCert = (subId = 'sub_cert_1', overrides = {}) => {
  const cert = { certificateId: 'CAI-L4-AABBCCDD', email: 'buyer@example.com',
    agentSlug: 'contract-intelligence-and-register', tier: 'L4', certifiedVersion: '1.0',
    status: 'active', subscriptionId: subId,
    issuedAt: new Date().toISOString(), validUntil: null, ...overrides };
  kvStore.set(`certification:${cert.certificateId}`, JSON.stringify(cert));
  kvStore.set(`cert:sub:${subId}`, cert.certificateId);
  return cert;
};

test('11a. checkout of a subscription session issues a certificate alongside the licence', async () => {
  registerPartner('CAI-CERT');
  const evt = makeEvent({ sessionId: 'cs_cert_1', partner: 'CAI-CERT' });
  evt.data.object.subscription = 'sub_from_checkout';
  const r = await deliver(evt);
  assert.equal(r.status, 200);

  const certId = kvStore.get('cert:sub:sub_from_checkout');
  assert.ok(certId, 'DEFECT: a subscription checkout produced no certificate');
  const cert = JSON.parse(kvStore.get(`certification:${certId}`));
  assert.equal(cert.status, 'active');
  assert.equal(cert.agentSlug, 'contract-intelligence-and-register');
  const ent = JSON.parse(kvStore.get('entitlement:buyer@example.com'));
  assert.ok(ent.slugs.includes('contract-intelligence-and-register'), 'the perpetual licence must still be granted');
});

test('11b. a one-time (non-subscription) checkout issues NO certificate', async () => {
  await deliver(makeEvent({ sessionId: 'cs_plain_1' }));
  const certs = [...kvStore.keys()].filter((k) => k.startsWith('certification:'));
  assert.equal(certs.length, 0, 'buying the agent alone must not mint a certificate');
  assert.ok(kvStore.get('entitlement:buyer@example.com'), 'but the licence is still granted');
});

test('11c. invoice.paid renews the term; invoice.payment_failed only marks past_due', async () => {
  seedCert();
  const paid = await deliver(makeSubEvent({ type: 'invoice.paid' }));
  assert.equal(paid.status, 200);
  assert.equal(paid.body.certification, 'renewed');
  assert.equal(JSON.parse(kvStore.get('certification:CAI-L4-AABBCCDD')).status, 'active');

  const failed = await deliver(makeSubEvent({ type: 'invoice.payment_failed' }));
  assert.equal(failed.body.certification, 'past_due');
  const cert = JSON.parse(kvStore.get('certification:CAI-L4-AABBCCDD'));
  assert.equal(cert.status, 'past_due');
  assert.notEqual(cert.status, 'lapsed', 'a retryable payment failure must not end the certification');
});

test('11d. subscription deletion lapses the certificate and LEAVES the licence intact', async () => {
  seedCert();
  kvStore.set('entitlement:buyer@example.com', JSON.stringify({
    email: 'buyer@example.com', slugs: ['contract-intelligence-and-register'] }));

  const r = await deliver(makeSubEvent({ type: 'customer.subscription.deleted' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.certification, 'lapsed');
  assert.equal(JSON.parse(kvStore.get('certification:CAI-L4-AABBCCDD')).status, 'lapsed');

  const ent = JSON.parse(kvStore.get('entitlement:buyer@example.com'));
  assert.deepEqual(ent.slugs, ['contract-intelligence-and-register'],
    'DEFECT: cancelling Continuous Certification revoked the perpetual agent licence');
});

test('11e. subscription.updated to a dead status lapses; back to active renews', async () => {
  seedCert();
  await deliver(makeSubEvent({ type: 'customer.subscription.updated', status: 'unpaid' }));
  assert.equal(JSON.parse(kvStore.get('certification:CAI-L4-AABBCCDD')).status, 'lapsed');

  const back = await deliver(makeSubEvent({ type: 'customer.subscription.updated', status: 'active' }));
  assert.equal(back.body.certification, 'active');
  assert.equal(JSON.parse(kvStore.get('certification:CAI-L4-AABBCCDD')).status, 'active');
});

test('11f. lifecycle events for an unknown subscription are acknowledged, not retried forever', async () => {
  const r = await deliver(makeSubEvent({ type: 'invoice.paid', subId: 'sub_unknown' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.certification, 'no-certificate');
});

test('11g. a KV outage during a certification write returns 5xx so Stripe retries', async () => {
  seedCert();
  kvFail = true;
  const r = await deliver(makeSubEvent({ type: 'invoice.paid' }));
  assert.ok(r.status >= 500, `expected retryable 5xx, got ${r.status}`);
});

// ── 12. live money: only a release approved for sale may be unlocked ────────
/* config/products.json holds one release, contract-intelligence-and-register, with
   saleApproved: false. Test-mode money keeps working; live money is withheld and
   recorded for a manual refund. Nothing in this section moves money. */
const UNAPPROVED = 'contract-intelligence-and-register';
const BUYER = 'live-buyer@example.com';
const entitled = (slug, email = BUYER) => {
  const raw = kvStore.get('entitlement:' + email);
  return Boolean(raw) && JSON.parse(raw).slugs.includes(slug);
};
function sessionEvent({ sessionId, slug = UNAPPROVED, livemode, paymentStatus = 'paid', amount = 120000,
  type = 'checkout.session.completed', email = BUYER }) {
  return { id: `evt_${sessionId}_${++evtSeq}`, object: 'event', type, livemode,
    data: { object: { id: sessionId, object: 'checkout.session', livemode, payment_status: paymentStatus,
      amount_total: amount, currency: 'usd', status: 'complete', customer_details: { email },
      subscription: null, metadata: { agent_slug: slug } } } };
}
function disputeEvent({ type, sessionId, status = 'won', livemode, slug = UNAPPROVED, email = BUYER }) {
  return { id: `evt_${type}_${sessionId}_${++evtSeq}`, object: 'event', type, livemode,
    data: { object: { id: `dp_${sessionId}`, object: 'dispute', status, livemode, amount: 120000, currency: 'usd',
      payment_intent: 'pi_' + sessionId,
      metadata: { checkout_session_id: sessionId, agent_slug: slug, email } } } };
}
const refundEvent = (sessionId) => makeChargeEvent({ email: BUYER,
  metadata: { checkout_session_id: sessionId, agent_slug: UNAPPROVED } });

/* The success page is the other place a paid session becomes access. Called in-process
   with the same shim as the webhook; its Stripe lookup goes to the fake above. */
async function getSuccess(sessionId) {
  const { default: successHandler } = await import('../api/success.js');
  const server = http.createServer((req, res) => {
    req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.send = (body) => { res.end(body); return res; };
    successHandler(req, res);
  });
  await new Promise((r) => server.listen(0, r));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/success?session_id=${encodeURIComponent(sessionId)}`);
    return { status: r.status, html: await r.text() };
  } finally {
    server.close(); server.closeAllConnections?.();
  }
}

test('12a. a paid LIVE checkout for an unapproved release grants nothing and leaves a withheld record', async () => {
  const r = await deliver(sessionEvent({ sessionId: 'cs_live_a', livemode: true }));
  assert.equal(r.status, 200, 'answer 200 so Stripe does not keep retrying a sale that is held on purpose');
  assert.equal(r.body.withheld, 'not-approved-for-sale');
  assert.equal(entitled(UNAPPROVED), false, 'DEFECT: a live payment for an unapproved release unlocked the agent');
  assert.equal(kvStore.has('stripe:session:cs_live_a'), false, 'a withheld session must not leave a fulfilment claim');
  const rec = JSON.parse(kvStore.get('sale-withheld:cs_live_a') ?? 'null');
  assert.ok(rec, 'no withheld-sale record for the owner to refund from');
  assert.equal(rec.reason, 'not-approved-for-sale');
  assert.equal(rec.email, undefined, 'the buyer email must not be copied into the record');
});

test('12b. a LIVE session where no money was taken is withheld too', async () => {
  /* Approve the release for this test only, so the approval rule passes and the money check is what withholds it. */
  const rec = products.productFor(UNAPPROVED);
  rec.saleApproved = true;
  try {
    const r = await deliver(sessionEvent({ sessionId: 'cs_live_b', livemode: true,
      paymentStatus: 'no_payment_required', amount: 0 }));
    assert.equal(r.body.withheld, 'no-payment-taken');
    assert.equal(entitled(UNAPPROVED), false, 'a session with no payment must not unlock an agent');
  } finally {
    rec.saleApproved = false;
  }
});

test('12c. a test-mode purchase of the same release still grants: test checkout keeps working', async () => {
  const r = await deliver(sessionEvent({ sessionId: 'cs_test_c', livemode: false }));
  assert.equal(r.status, 200);
  assert.equal(r.body.withheld, undefined);
  assert.equal(entitled(UNAPPROVED), true);
});

test('12d. a LIVE retired slug of the unapproved release is withheld as the current product', async () => {
  const r = await deliver(sessionEvent({ sessionId: 'cs_live_d', livemode: true, slug: 'contract-summarisation-agent' }));
  assert.equal(r.body.withheld, 'not-approved-for-sale');
  assert.equal(entitled(UNAPPROVED), false);
});

test('12e. a LIVE agent with no approved record is withheld too (default-deny)', async () => {
  const r = await deliver(sessionEvent({ sessionId: 'cs_live_e', livemode: true, slug: 'onboarding-agent' }));
  assert.equal(r.body.withheld, 'not-approved-for-sale');
  assert.equal(entitled('onboarding-agent'), false, 'live money must not unlock a catalogue agent without an approved record');
  assert.ok(kvStore.has('sale-withheld:cs_live_e'), 'the withheld sale is recorded for the owner');
});

test('12l. a LIVE re-delivery of a session that already fulfilled is not withheld or recorded as a new sale', async () => {
  kvStore.set('stripe:session:cs_live_l', '1');
  const r = await deliver(sessionEvent({ sessionId: 'cs_live_l', livemode: true, slug: 'onboarding-agent' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.withheld, undefined, 'a session that already fulfilled is not re-judged');
  assert.equal(kvStore.has('sale-withheld:cs_live_l'), false, 'no withheld record for a purchase that was already fulfilled');
});

test('12m. a LIVE purchase completed before the rule, already entitled, is fulfilled as before', async () => {
  kvStore.set('entitlement:' + BUYER, JSON.stringify({ email: BUYER, slugs: ['onboarding-agent'],
    sessionSlugs: { cs_live_m: ['onboarding-agent'] } }));
  const r = await deliver(sessionEvent({ sessionId: 'cs_live_m', livemode: true, slug: 'onboarding-agent' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.withheld, undefined);
  assert.equal(kvStore.has('sale-withheld:cs_live_m'), false, 'a completed purchase must not be recorded as withheld');
  assert.equal(kvStore.has('stripe:session:cs_live_m'), true, 'the webhook still fulfils it, as before');
  assert.equal(entitled('onboarding-agent'), true);
});

test('12f. the success page does not grant a LIVE payment for an unapproved release either', async () => {
  stripeApiMode = 'ok';
  stripeSessionsById.set('cs_live_f', { id: 'cs_live_f', object: 'checkout.session', livemode: true,
    payment_status: 'paid', amount_total: 120000, currency: 'usd', status: 'complete',
    customer_details: { email: BUYER }, metadata: { agent_slug: UNAPPROVED } });
  const page = await getSuccess('cs_live_f');
  assert.equal(page.status, 200);
  assert.equal(entitled(UNAPPROVED), false, 'DEFECT: the success page granted a withheld live payment');
  assert.ok(!page.html.includes('/api/download'), 'the success page must not offer a download for it');
  assert.ok(kvStore.has('sale-withheld:cs_live_f'), 'the redirect path records the withheld sale too');
});

test('12g. the success page still grants a test-mode purchase of the same release', async () => {
  stripeApiMode = 'ok';
  stripeSessionsById.set('cs_test_g', { id: 'cs_test_g', object: 'checkout.session', livemode: false,
    payment_status: 'paid', amount_total: 120000, currency: 'usd', status: 'complete',
    customer_details: { email: BUYER }, metadata: { agent_slug: UNAPPROVED } });
  const page = await getSuccess('cs_test_g');
  assert.equal(page.status, 200);
  assert.equal(entitled(UNAPPROVED), true);
});

test('12n. reopening the thank-you link for a LIVE purchase completed before the rule keeps it and records nothing', async () => {
  stripeApiMode = 'ok';
  kvStore.set('entitlement:' + BUYER, JSON.stringify({ email: BUYER, slugs: ['onboarding-agent'],
    sessionSlugs: { cs_live_n: ['onboarding-agent'] } }));
  stripeSessionsById.set('cs_live_n', { id: 'cs_live_n', object: 'checkout.session', livemode: true,
    payment_status: 'paid', amount_total: 120000, currency: 'usd', status: 'complete',
    customer_details: { email: BUYER }, metadata: { agent_slug: 'onboarding-agent' } });
  const page = await getSuccess('cs_live_n');
  assert.equal(page.status, 200);
  assert.equal(kvStore.has('sale-withheld:cs_live_n'), false, 'a completed purchase must not be recorded as withheld');
  assert.equal(entitled('onboarding-agent'), true);
});

test('12h. a dispute the merchant WINS puts the purchase back', async () => {
  assert.equal((await deliver(sessionEvent({ sessionId: 'cs_disp_h', livemode: false }))).status, 200);
  assert.equal(entitled(UNAPPROVED), true, 'precondition: granted');
  const created = await deliver(disputeEvent({ type: 'charge.dispute.created', sessionId: 'cs_disp_h', status: 'needs_response', livemode: false }));
  assert.equal(created.status, 200);
  assert.equal(entitled(UNAPPROVED), false, 'precondition: revoked while the dispute is open');
  const closed = await deliver(disputeEvent({ type: 'charge.dispute.closed', sessionId: 'cs_disp_h', status: 'won', livemode: false }));
  assert.equal(closed.status, 200);
  assert.equal(closed.body.access, 'restored');
  assert.equal(entitled(UNAPPROVED), true, 'DEFECT: dispute won but the buyer lost the agent for good');
});

test('12i. a dispute LOST keeps the purchase revoked', async () => {
  await deliver(sessionEvent({ sessionId: 'cs_disp_i', livemode: false }));
  await deliver(disputeEvent({ type: 'charge.dispute.created', sessionId: 'cs_disp_i', status: 'needs_response', livemode: false }));
  const closed = await deliver(disputeEvent({ type: 'charge.dispute.closed', sessionId: 'cs_disp_i', status: 'lost', livemode: false }));
  assert.equal(closed.body.commission, 'dispute-lost-already-reversed');
  assert.equal(entitled(UNAPPROVED), false);
});

test('12j. a purchase refunded, then disputed and WON, stays revoked (the money already went back)', async () => {
  await deliver(sessionEvent({ sessionId: 'cs_disp_j', livemode: false }));
  assert.equal((await deliver(refundEvent('cs_disp_j'))).status, 200);
  assert.equal(entitled(UNAPPROVED), false, 'precondition: the refund revoked it');
  await deliver(disputeEvent({ type: 'charge.dispute.created', sessionId: 'cs_disp_j', status: 'needs_response', livemode: false }));
  const closed = await deliver(disputeEvent({ type: 'charge.dispute.closed', sessionId: 'cs_disp_j', status: 'won', livemode: false }));
  assert.equal(closed.body.access, 'refunded');
  assert.equal(entitled(UNAPPROVED), false, 'DEFECT: a refunded purchase came back after a dispute win');
});

test('12k. a won dispute on a LIVE unapproved release does not restore access', async () => {
  kvStore.set('entitlement:' + BUYER, JSON.stringify({ email: BUYER, slugs: [],
    revokedSessionIds: ['cs_disp_k'], sessionSlugs: { cs_disp_k: [UNAPPROVED] } }));
  const closed = await deliver(disputeEvent({ type: 'charge.dispute.closed', sessionId: 'cs_disp_k', status: 'won', livemode: true }));
  assert.equal(closed.body.access, 'not-approved-for-sale');
  assert.equal(entitled(UNAPPROVED), false);
});

test('12o. a won dispute on a LIVE purchase of a catalogue agent with no record restores it (a dispute is not a sale)', async () => {
  kvStore.set('entitlement:' + BUYER, JSON.stringify({ email: BUYER, slugs: [],
    revokedSessionIds: ['cs_disp_o'], sessionSlugs: { cs_disp_o: ['onboarding-agent'] } }));
  const closed = await deliver(disputeEvent({ type: 'charge.dispute.closed', sessionId: 'cs_disp_o', status: 'won', livemode: true, slug: 'onboarding-agent' }));
  assert.equal(closed.body.access, 'restored');
  assert.equal(entitled('onboarding-agent'), true);
});

// ── 13. API version compatibility: basil+ payload shapes through the webhook ──
/* A webhook endpoint keeps the API version it was created with, so the same event can arrive in the legacy
   shape (top-level subscription fields) or the basil+ shape (the period moved onto the subscription item, and
   the invoice's subscription moved under parent). Both must renew, past-due and lapse the certificate. A
   one-off invoice must still be ignored. */
const basilInvoice = (type, { subId = 'sub_cert_1', periodEnd } = {}) => ({
  id: `evt_basil_inv_${++evtSeq}`, object: 'event', type,
  data: { object: { id: 'in_basil_1', object: 'invoice', subscription: null,
    parent: { type: 'subscription_details', subscription_details: { subscription: subId } },
    lines: { data: [{ parent: { type: 'subscription_item_details',
      subscription_item_details: { subscription: subId, subscription_item: 'si_1' } }, period: { end: periodEnd } }] },
    period_end: periodEnd } },
});
const basilSub = (type, { subId = 'sub_cert_1', status = 'active', periodEnd } = {}) => ({
  id: `evt_basil_sub_${++evtSeq}`, object: 'event', type,
  data: { object: { id: subId, object: 'subscription', status,
    items: { object: 'list', data: [{ id: 'si_1', object: 'subscription_item', current_period_end: periodEnd }] } } },
});
const CERT = 'certification:CAI-L4-AABBCCDD';
const inDays = (d) => Math.floor(Date.now() / 1000) + d * 86400;

test('13a. basil+ invoice.paid renews the certificate to the subscription period end', async () => {
  seedCert();
  const periodEnd = inDays(45);
  const r = await deliver(basilInvoice('invoice.paid', { periodEnd }));
  assert.equal(r.status, 200);
  assert.equal(r.body.certification, 'renewed', `DEFECT: basil+ invoice not matched to its subscription (${JSON.stringify(r.body)})`);
  assert.equal(JSON.parse(kvStore.get(CERT)).validUntil, new Date(periodEnd * 1000).toISOString());
});

test('13b. basil+ invoice.payment_failed marks past_due, not lapsed', async () => {
  seedCert();
  const r = await deliver(basilInvoice('invoice.payment_failed', { periodEnd: inDays(1) }));
  assert.equal(r.body.certification, 'past_due', `DEFECT: basil+ payment failure not matched (${JSON.stringify(r.body)})`);
  assert.equal(JSON.parse(kvStore.get(CERT)).status, 'past_due');
});

test('13c. basil+ subscription.updated (active) takes the term from the subscription item', async () => {
  seedCert();
  const periodEnd = inDays(60);
  const r = await deliver(basilSub('customer.subscription.updated', { status: 'active', periodEnd }));
  assert.equal(r.body.certification, 'active');
  assert.equal(JSON.parse(kvStore.get(CERT)).validUntil, new Date(periodEnd * 1000).toISOString());
});

test('13d. basil+ subscription.deleted lapses the certificate and leaves the licence intact', async () => {
  seedCert();
  kvStore.set('entitlement:buyer@example.com', JSON.stringify({
    email: 'buyer@example.com', slugs: ['contract-intelligence-and-register'] }));
  const r = await deliver(basilSub('customer.subscription.deleted', { periodEnd: inDays(30) }));
  assert.equal(r.body.certification, 'lapsed');
  assert.deepEqual(JSON.parse(kvStore.get('entitlement:buyer@example.com')).slugs, ['contract-intelligence-and-register'],
    'DEFECT: lapsing the certificate revoked the perpetual licence');
});

test('13e. a renewal whose period end cannot be read keeps the term already on the certificate', async () => {
  const kept = '2030-01-01T00:00:00.000Z';
  seedCert('sub_cert_1', { validUntil: kept });
  const r = await deliver(basilInvoice('invoice.paid', { periodEnd: undefined }));
  assert.equal(r.body.certification, 'renewed');
  assert.equal(JSON.parse(kvStore.get(CERT)).validUntil, kept, 'the known term must not be cleared');
});

test('13f. a one-off invoice in the basil+ shape is still ignored', async () => {
  seedCert();
  const evt = { id: `evt_oneoff_${++evtSeq}`, object: 'event', type: 'invoice.paid',
    data: { object: { id: 'in_oneoff', object: 'invoice', subscription: null,
      parent: { type: 'quote_details', quote_details: { quote: 'qt_1' } } } } };
  const r = await deliver(evt);
  assert.equal(r.body.certification, 'no-subscription');
  assert.equal(JSON.parse(kvStore.get(CERT)).status, 'active');
});

test('13g. a basil+ subscription checkout records the subscription item period end', async () => {
  const periodEnd = inDays(30);
  const evt = makeEvent({ sessionId: 'cs_basil_cert_1' });
  evt.data.object.subscription = { id: 'sub_basil_checkout', object: 'subscription',
    items: { object: 'list', data: [{ id: 'si_2', object: 'subscription_item', current_period_end: periodEnd }] } };
  const r = await deliver(evt);
  assert.equal(r.status, 200);
  const certId = kvStore.get('cert:sub:sub_basil_checkout');
  assert.ok(certId, 'a basil+ subscription checkout produced no certificate');
  assert.equal(JSON.parse(kvStore.get(`certification:${certId}`)).validUntil, new Date(periodEnd * 1000).toISOString());
});
