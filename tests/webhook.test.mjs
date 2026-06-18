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
      customer_details: { email }, metadata: { agent_slug: 'contract-summarisation-agent', ...(partner ? { partner } : {}), ...metadata } } },
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
const registerPartner = (code) => kvStore.set('partner:reg:' + code,
  JSON.stringify({ code, name: 'Test Partner', email: 't@example.com', salesCount: 0, totalEarned: 0 }));

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
  assert.equal(rec.salesCount, 1, `DEFECT: same session credited ${rec.salesCount} times (totalEarned=${rec.totalEarned})`);
});
// ── 4. one-time vs recurring ────────────────────────────────────────────────
test('4a. checkout.session.completed credits exactly once at PARTNER_COMMISSION_RATE', async () => {
  registerPartner('CAI-RATE');
  await deliver(makeEvent({ partner: 'CAI-RATE', amount: 120000 })); // €1200.00
  const rec = JSON.parse(kvStore.get('partner:reg:CAI-RATE') ?? '{}');
  assert.equal(rec.salesCount, 1);
  assert.equal(rec.totalEarned, 240, `expected 20% of €1200 = 240, got ${rec.totalEarned}`);
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
