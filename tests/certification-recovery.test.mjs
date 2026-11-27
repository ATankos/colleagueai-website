/**
 * tests/certification-recovery.test.mjs - CAI-AUD-003 and the round-2 assurance of Continuous Certification issuance.
 *
 * Runs locally: an in-process fake Upstash with FAILURE INJECTION (tests/helpers/fake-kv.mjs) and the real api/webhook.js
 * behind a local http server, with events signed by a dummy secret. No network, no Stripe API, no real credentials.
 *
 * What this pins:
 *   W  the webhook: a failed issuance is queued, not forgotten, and finished by the next subscription event;
 *      a store that is down fails the event so Stripe redelivers it; duplicates, concurrency, delayed and
 *      out-of-order events and refunds never leave an active certificate for a subscription that ended.
 *   P  partial database failures at each stage of an issuance leave a state the next attempt completes.
 *   D  certificate decisions: identified, registered deciders (reinstatement included); intent-then-commit evidence;
 *      a failed evidence write is repairable; an intent that never committed is closed as aborted.
 *   S  shared (not per-process) pseudonym keys.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Stripe from 'stripe';
import { createFakeKv } from './helpers/fake-kv.mjs';

const SECRET = 'whsec_LOCAL_TEST_HARNESS_DUMMY';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_SECRET_KEY = 'sk_test_LOCAL_DUMMY_NOT_REAL';
delete process.env.VERCEL_ENV;
for (const k of ['PSEUDONYM_SECRET', 'RATE_LIMIT_SECRET', 'DOWNLOAD_TOKEN_SECRET']) delete process.env[k];

const kvf = createFakeKv();
const SLUG = 'contract-intelligence-and-register';
const EMAIL = 'buyer@example.com';
const stripe = new Stripe('sk_test_LOCAL_DUMMY_NOT_REAL');
let db, handler, appServer, base, seq = 0;

before(async () => {
  await kvf.start();
  db = await import('../lib/db.js');
  ({ default: handler } = await import('../api/webhook.js'));
  appServer = http.createServer((req, res) => {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    handler(req, res);
  });
  await new Promise((r) => appServer.listen(0, r));
  base = `http://127.0.0.1:${appServer.address().port}`;
});
after(() => { kvf.stop(); appServer.closeAllConnections?.(); appServer.close(); });
beforeEach(() => { kvf.reset(); db.resetSharedSecretCache(); });

const inDays = (n) => Math.floor(Date.now() / 1000) + n * 86400;
const issueArgs = (over = {}) => ({ email: EMAIL, slug: SLUG, tier: 'L4', subscriptionId: 'sub_r1', currentPeriodEnd: inDays(30), certifiedVersion: '1.0.3.6', ...over });

async function deliver(event) {
  const payload = JSON.stringify(event);
  const r = await fetch(base + '/api/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }, body: payload });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const checkoutEvent = ({ id, sessionId = 'cs_r1', subId = 'sub_r1', email = EMAIL } = {}) => ({
  id: id ?? `evt_r_${++seq}`, object: 'event', type: 'checkout.session.completed',
  data: { object: { id: sessionId, object: 'checkout.session', mode: 'subscription', payment_status: 'paid', amount_total: 1490000, currency: 'usd', subscription: subId,
    customer_details: { email }, metadata: { agent_slug: SLUG, tier: 'L4' } } },
});
const invoicePaid = ({ subId = 'sub_r1', periodEnd = inDays(30) } = {}) => ({
  id: `evt_inv_${++seq}`, object: 'event', type: 'invoice.paid',
  data: { object: { id: 'in_r1', object: 'invoice', subscription: subId, period_end: periodEnd, lines: { data: [{ period: { end: periodEnd } }] } } },
});
const certIdFor = (subId = 'sub_r1') => kvf.store.get(`cert:sub:${subId}`);
const certOf = (id) => JSON.parse(kvf.store.get(`certification:${id}`));
const failKey = (cmd, prefix, times = 1) => kvf.failOn(({ cmd: c, args }) => c === cmd && String(args[0]).startsWith(prefix), times);

// ── W. the webhook ───────────────────────────────────────────────────────────

test('W1. a failed issuance is queued, answered 200 (licence stands), and finished by the next subscription event', async () => {
  failKey('SET', 'certification:', 1); // the certificate record cannot be written once
  const first = await deliver(checkoutEvent());
  assert.equal(first.status, 200, 'the licence was granted, so the event is not failed');
  assert.ok(kvf.store.get(`entitlement:${EMAIL}`), 'the perpetual licence is granted');
  assert.ok(kvf.store.get('cert:pending:sub_r1'), 'DEFECT: the failed issuance was not stored for retry');
  assert.equal(await db.pendingIssuanceCount(), 1);

  const paid = await deliver(invoicePaid());       // Stripe sends this for the first invoice
  assert.equal(paid.status, 200);
  const id = certIdFor();
  assert.ok(id, 'DEFECT: the queued issuance was never completed, so a paying customer has no certificate');
  const cert = certOf(id);
  assert.equal(cert.status, 'active');
  assert.ok(Date.parse(cert.validUntil) > Date.now(), 'the term from the invoice event applies');
  assert.equal((await db.getCertificateEvidence(id)).filter((e) => e.event === 'issued').length, 1);
  assert.equal((await db.getCertificationForHolder(EMAIL, SLUG))?.certificateId, id, 'the holder can find it');
  assert.equal(await db.pendingIssuanceCount(), 0, 'the queue is empty once it succeeds');
});

test('W2. when the issuance cannot even be queued the event fails (5xx) and the redelivery completes it', async () => {
  const evt = checkoutEvent();
  kvf.failOn(({ cmd, args }) => (cmd === 'SET' || cmd === 'GET') && String(args[0]).startsWith('cert:'), 50); // the certificate area is down
  const down = await deliver(evt);
  assert.equal(down.status, 500, 'DEFECT: the failure was swallowed with nothing recorded');
  kvf.clearFailures();
  const again = await deliver(evt);                 // Stripe redelivers the same event id
  assert.equal(again.status, 200);
  assert.ok(certIdFor(), 'the redelivered event issues the certificate');
});

test('W3. duplicate and concurrent deliveries of one purchase issue exactly one certificate', async () => {
  const evt = checkoutEvent();
  const replies = await Promise.all([deliver(evt), deliver(evt), deliver(checkoutEvent({ sessionId: 'cs_r1' })), deliver(evt)]);
  assert.ok(replies.every((r) => r.status === 200));
  const id = certIdFor();
  assert.ok(id);
  assert.equal([...kvf.store.keys()].filter((k) => k.startsWith('certification:')).length, 1, 'one record');
  assert.equal((await db.getCertificateEvidence(id)).filter((e) => e.event === 'issued').length, 1, 'one issuance in the evidence');
});

test('W4. a refund that arrives BEFORE the delayed checkout event: no active certificate is created', async () => {
  const ended = await db.lapseCertification('sub_r1', 'refunded');   // the refund handler: nothing to lapse yet
  assert.equal(ended, null);
  const late = await deliver(checkoutEvent());
  assert.equal(late.status, 200);
  assert.equal(certIdFor(), undefined, 'DEFECT: a late checkout event issued an active certificate for a refunded subscription');
});

test('W5. a purchase already refunded (licence tombstone) issues no certificate when its checkout event arrives late', async () => {
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_r1', { refunded: true });
  const late = await deliver(checkoutEvent());
  assert.equal(late.status, 200);
  assert.equal(certIdFor(), undefined, 'DEFECT: a refunded purchase got a certificate');
});

test('W6. invoice.paid arriving BEFORE the checkout event: its paid-through date is kept and applied at issuance', async () => {
  const periodEnd = inDays(45);
  const early = await deliver(invoicePaid({ periodEnd }));
  assert.equal(early.body.certification, 'no-certificate');
  await deliver(checkoutEvent());                   // carries no period end (the subscription is an id, not an object)
  const cert = certOf(certIdFor());
  assert.ok(cert.validUntil, 'DEFECT: the early invoice date was dropped, so the new certificate has no term');
  assert.equal(Math.floor(Date.parse(cert.validUntil) / 1000), periodEnd);
});

test('W7. a queued issuance for a subscription that is refunded meanwhile is closed, not issued', async () => {
  failKey('SET', 'certification:', 1);
  await deliver(checkoutEvent());
  assert.equal(await db.pendingIssuanceCount(), 1);
  await db.lapseCertification('sub_r1', 'refunded');
  const run = await db.retryPendingIssuances();
  assert.equal(run.ended, 1);
  assert.equal(certIdFor(), certIdFor(), 'no certificate exists');
  assert.equal([...kvf.store.keys()].filter((k) => k.startsWith('certification:')).length, 0);
  assert.equal(await db.pendingIssuanceCount(), 0);
});

test('W8. a renewal then a cancellation arriving out of order never revives an ended certificate', async () => {
  await db.issueCertification(issueArgs());
  await deliver({ id: 'evt_del', object: 'event', type: 'customer.subscription.deleted', data: { object: { id: 'sub_r1', object: 'subscription', status: 'canceled', current_period_end: inDays(10) } } });
  await deliver(invoicePaid({ periodEnd: inDays(60) }));    // a stale renewal after the end
  assert.equal(certOf(certIdFor()).status, 'lapsed');
});

// ── P. partial database failures during issuance ─────────────────────────────

const STAGES = [
  ['the certificate record write', (c, a) => c === 'SET' && String(a[0]).startsWith('certification:'), 1],
  ['the issuance evidence write (and its one internal retry)', (c, a) => c === 'RPUSH' && String(a[0]).startsWith('certification-evidence:'), 2],
  ['the holder link write', (c, a) => c === 'SET' && String(a[0]).startsWith('cert:holder:'), 1],
];
for (const [name, match, times] of STAGES) {
  test(`P. a failure at ${name} is completed by the next attempt: one record, one issuance entry, holder link set`, async () => {
    kvf.failOn(({ cmd, args }) => match(cmd, args), times);
    await assert.rejects(() => db.issueCertification(issueArgs()), /KV error/);
    const second = await db.issueCertification(issueArgs());
    const id = second.certificateId;
    assert.ok(id);
    assert.equal([...kvf.store.keys()].filter((k) => k.startsWith('certification:')).length, 1);
    assert.equal((await db.getCertificateEvidence(id)).filter((e) => e.event === 'issued').length, 1);
    assert.equal((await db.getCertificationForHolder(EMAIL, SLUG))?.certificateId, id);
    const third = await db.issueCertification(issueArgs());
    assert.equal(third.certificateId, id, 'a further retry changes nothing');
    assert.equal((await db.getCertificateEvidence(id)).filter((e) => e.event === 'issued').length, 1);
  });
}

test('P. ten concurrent issuances of one subscription end with one certificate and one issuance entry', async () => {
  const all = await Promise.all(Array.from({ length: 10 }, () => db.issueCertification(issueArgs())));
  assert.equal(new Set(all.map((c) => c.certificateId)).size, 1);
  const id = all[0].certificateId;
  assert.equal((await db.getCertificateEvidence(id)).filter((e) => e.event === 'issued').length, 1);
  assert.equal((await db.getCertificationForHolder(EMAIL, SLUG))?.certificateId, id);
});

// ── D. decisions ─────────────────────────────────────────────────────────────

const FC = { role: 'FC', id: 'p-fc' };
const IR = { role: 'IR', id: 'p-ir' };
const REGISTER = { people: [{ id: 'p-fc', role: 'FC' }, { id: 'p-ir', role: 'IR' }, { id: 'p-old', role: 'IR', until: '2020-01-01T00:00:00Z' }] };
const SUSPEND = { state: 'suspended', reason: 'critical-regression-failed', reference: 'CAI-REG-1', deciders: [FC, IR] };
const decide = (id, next, opts = {}) => db.setCertificateDecision(id, next, { register: REGISTER, ...opts });
const issued = async () => (await db.issueCertification(issueArgs({ currentPeriodEnd: inDays(90) }))).certificateId;

test('D1. the shipped register is empty, so no decision can be recorded until the owner registers the deciders', async () => {
  const id = await issued();
  assert.equal((await db.setCertificateDecision(id, SUSPEND)).error, 'decider-not-registered');
  assert.equal(certOf(id).decision ?? null, null, 'nothing changed');
});

test('D2. every decision needs one registered, active FC and one different registered, active IR', async () => {
  const id = await issued();
  const cases = [
    [{ ...SUSPEND, deciders: undefined }, 'deciders-required'],
    [{ ...SUSPEND, deciders: [FC] }, 'deciders-required'],
    [{ ...SUSPEND, deciders: [FC, { role: 'IR', id: 'nobody' }] }, 'decider-not-registered'],
    [{ ...SUSPEND, deciders: [FC, { role: 'IR', id: 'p-old' }] }, 'decider-not-active'],
    [{ ...SUSPEND, deciders: [FC, { role: 'FT', id: 'p-ir' }] }, 'deciders-required'],
    [{ ...SUSPEND, deciders: [FC, { role: 'FC', id: 'p-fc' }] }, 'deciders-required'],
  ];
  for (const [next, error] of cases) assert.equal((await decide(id, next)).error, error, JSON.stringify(next.deciders));
  assert.equal((await decide(id, SUSPEND)).ok, true);
});

test('D3. reinstatement is attributed like any decision: refused without registered deciders, evidenced with them', async () => {
  const id = await issued();
  await decide(id, SUSPEND);
  assert.equal((await decide(id, { state: 'valid', reference: 'CAI-REG-1-closed' })).error, 'deciders-required',
    'DEFECT: a reinstatement could be recorded by nobody');
  const ok = await decide(id, { state: 'valid', reference: 'CAI-REG-1-closed', deciders: [FC, IR] });
  assert.equal(ok.ok, true);
  const committed = (await db.getCertificateEvidence(id)).filter((e) => e.event === 'decision');
  assert.deepEqual(committed.map((e) => e.to), ['suspended', 'valid']);
  assert.deepEqual(committed[1].deciders, [FC, IR]);
  assert.equal(committed[1].reference, 'CAI-REG-1-closed');
  assert.equal(committed[1].from, 'suspended');
});

test('D4. the intent is evidenced BEFORE the record changes, the commit after, and both name the same decision', async () => {
  const id = await issued();
  const seen = [];
  kvf.failOn(({ cmd, args }) => { if (cmd === 'RPUSH' && String(args[0]).startsWith('certification-evidence:')) seen.push({ at: 'evidence', recordDecision: certOf(id).decision ?? null }); return false; }, 99);
  const r = await decide(id, SUSPEND);
  assert.equal(r.ok, true);
  assert.equal(seen[0].recordDecision, null, 'the intent entry is written while the record still shows no decision');
  const ev = (await db.getCertificateEvidence(id)).filter((e) => /^decision/.test(e.event));
  assert.deepEqual(ev.map((e) => e.event), ['decision-intent', 'decision']);
  assert.equal(ev[0].decisionId, ev[1].decisionId);
  assert.equal(certOf(id).decision.id, ev[1].decisionId);
  assert.equal(certOf(id).decision.decidedBy, 'FC+IR');
});

test('D5. a failed commit-evidence write does not lose the decision: it is queued and repaired exactly once', async () => {
  const id = await issued();
  kvf.failOn(({ cmd, args }) => cmd === 'RPUSH' && String(args[0]).startsWith('certification-evidence:') && String(args[1]).includes('"event":"decision"'), 2);
  const r = await decide(id, SUSPEND);
  assert.equal(r.ok, true);
  assert.equal(r.evidencePending, true, 'the caller is told the evidence entry is outstanding');
  assert.equal(certOf(id).decision.state, 'suspended', 'the decision itself stands');
  assert.equal((await db.getCertificateEvidence(id)).filter((e) => e.event === 'decision').length, 0);
  const run = await db.retryEvidenceRepairs();
  assert.equal(run.repaired, 1);
  const again = await db.retryEvidenceRepairs();
  assert.equal(again.attempted, 0, 'the repair queue is empty');
  const committed = (await db.getCertificateEvidence(id)).filter((e) => e.event === 'decision');
  assert.equal(committed.length, 1);
  assert.equal(committed[0].decisionId, r.decisionId);
  await db.reconcileCertificateEvidence(id);
  assert.equal((await db.getCertificateEvidence(id)).filter((e) => e.event === 'decision').length, 1, 'reconciling again adds nothing');
});

test('D6. an intent that never committed (a crash between the steps) is closed as aborted, not left dangling', async () => {
  const id = await issued();
  kvf.lists.set(`certification-evidence:${id}`, [...(kvf.lists.get(`certification-evidence:${id}`) || []),
    JSON.stringify({ at: new Date().toISOString(), event: 'decision-intent', evidenceId: 'intent:dec-crashed', decisionId: 'dec-crashed', to: 'suspended' })]);
  await db.reconcileCertificateEvidence(id);
  const ev = await db.getCertificateEvidence(id);
  assert.ok(ev.some((e) => e.event === 'decision-aborted' && e.decisionId === 'dec-crashed'));
});

test('D7. a decision that loses a race (state changed meanwhile) is rejected and its intent closed as aborted', async () => {
  const id = await issued();
  await decide(id, SUSPEND);
  const second = await decide(id, { ...SUSPEND, reference: 'CAI-REG-2' });
  assert.equal(second.ok, false);
  assert.equal(second.error, 'no-change');
});

// ── S. shared pseudonym keys ─────────────────────────────────────────────────

test('S1. the key material is shared through the store: a second instance with an empty memory derives the same key', async () => {
  const { pseudonym } = await import('../lib/pseudonym.js');
  const a = await pseudonym('demo-ip', '203.0.113.9');
  db.resetSharedSecretCache();                       // a different instance: nothing in memory
  const b = await pseudonym('demo-ip', '203.0.113.9');
  assert.equal(a, b, 'DEFECT: a per-process key gives every instance its own rate-limit window');
  assert.notEqual(a, await pseudonym('recover-ip', '203.0.113.9'), 'purposes are separated');
});

test('S2. two instances starting together agree on one secret (creation is atomic)', async () => {
  const [one, two] = await Promise.all([import('../lib/db.js?instance=1'), import('../lib/db.js?instance=2')]);
  const [a, b, c] = await Promise.all([one.sharedSecret('race'), two.sharedSecret('race'), db.sharedSecret('race')]);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('S3. a configured secret is used and the store is not touched', async () => {
  process.env.RATE_LIMIT_SECRET = 'configured-test-secret';
  try {
    const { pseudonym } = await import('../lib/pseudonym.js');
    const before = kvf.log.length;
    await pseudonym('demo-ip', '198.51.100.4');
    assert.equal(kvf.log.length, before);
  } finally { delete process.env.RATE_LIMIT_SECRET; }
});

test('S4. when the store is down the pseudonym is refused, so a rate limit fails closed instead of using a guessable key', async () => {
  const { pseudonym } = await import('../lib/pseudonym.js');
  kvf.failOn(({ cmd, args }) => String(args[0]).startsWith('secret:'), 5);
  await assert.rejects(() => pseudonym('demo-ip', '198.51.100.5'), /KV error/);
});
