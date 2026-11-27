/**
 * tests/certificate-integrity.test.mjs - certificate records under concurrency, out-of-order payment events and
 * long histories (corrective follow-up to the four-axis state).
 *
 * Every write to a certificate goes through the compare-and-set loop (updateJson). The fake Upstash below can inject
 * a competing write between a reader's GET and its compare-and-set, which is exactly the race that used to lose data.
 * Usage: node --test tests/certificate-integrity.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { casServe } from './kv-cas-fake.mjs';

const kvStore = new Map();
const lists = new Map();
let interfere = null;   // (key) => void: runs once, just before the next compare-and-set is applied
let kvFail = false;
let rpushFailures = 0; // CAI-AUD-003: make the next N evidence appends fail (simulates a store error mid-issuance)
const kvServer = http.createServer((req, res) => {
  if (kvFail) { res.writeHead(500); return res.end('forced failure'); }
  if (req.method === 'POST') {
    return casServe(kvStore, req, res, { onCommand: (cmd) => { if (interfere) { const f = interfere; interfere = null; f(cmd[3]); } } });
  }
  const [, cmd, ...rest] = req.url.split('/').map(decodeURIComponent);
  const reply = (result) => res.end(JSON.stringify({ result }));
  if (cmd === 'GET') return reply(kvStore.get(rest[0]) ?? null);
  if (cmd === 'SET') {
    const [key, value, ...flags] = rest;
    if (flags.includes('NX') && kvStore.has(key)) return reply(null);
    kvStore.set(key, value); return reply('OK');
  }
  if (cmd === 'RPUSH' && rpushFailures > 0) { rpushFailures--; res.writeHead(500); return res.end('forced rpush failure'); }
  if (cmd === 'RPUSH') { const l = lists.get(rest[0]) || []; l.push(rest[1]); lists.set(rest[0], l); return reply(l.length); }
  if (cmd === 'LRANGE') return reply([...(lists.get(rest[0]) || [])]);
  if (cmd === 'DEL') { kvStore.delete(rest[0]); return reply(1); }
  reply(null);
});

let db, state, certHandler;
before(async () => {
  await new Promise((r) => kvServer.listen(0, r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  db = await import('../lib/db.js');
  state = await import('../lib/certificateState.js');
  ({ default: certHandler } = await import('../api/certificate.js'));
});
after(() => kvServer.close());
beforeEach(() => { kvStore.clear(); lists.clear(); interfere = null; kvFail = false; rpushFailures = 0; });

const sec = (days) => Math.floor(Date.now() / 1000) + days * 86400;
const PRODUCT = {
  previousReleases: [{ version: '1.0.3.6', package: 'a.zip', certifiedAt: '2027-01-10T00:00:00Z' }],
  release: { version: '1.0.4.0', package: 'b.zip', certifiedAt: '2027-02-20T00:00:00Z' },
};
const SUSPEND = { state: 'suspended', reason: 'critical-regression-failed', reference: 'CAI-REG-1', decidedBy: 'FC+IR' };
const issue = (o = {}) => db.issueCertification({ email: 'b@example.com', slug: 'contract-intelligence-and-register', tier: 'L4', subscriptionId: 'sub_1', currentPeriodEnd: sec(30), certifiedVersion: '1.0.4.0', ...o });
const stored = (id) => JSON.parse(kvStore.get(`certification:${id}`));
/** a competing writer: patch the stored JSON at `key` directly, as another process would */
const competing = (mutate) => (key) => { const r = JSON.parse(kvStore.get(key)); mutate(r); kvStore.set(key, JSON.stringify(r)); };

// ── term ────────────────────────────────────────────────────────────────────
test('T1. Active needs a present, valid, unexpired term: missing, unreadable or past terms are never active', () => {
  const now = Date.parse('2027-03-01T00:00:00Z');
  const base = { status: 'active', certifiedVersion: '1.0.4.0' };
  assert.equal(state.subscriptionState({ ...base, validUntil: null }, now), 'lapsed');
  assert.equal(state.subscriptionState({ ...base }, now), 'lapsed');
  assert.equal(state.subscriptionState({ ...base, validUntil: 'soon' }, now), 'lapsed');
  assert.equal(state.subscriptionState({ ...base, validUntil: 1893456000 }, now), 'lapsed', 'a number is not an ISO term');
  assert.equal(state.subscriptionState({ ...base, validUntil: '2027-02-28T23:59:59Z' }, now), 'lapsed');
  assert.equal(state.subscriptionState({ ...base, validUntil: '2027-03-31T00:00:00Z' }, now), 'active');
  assert.equal(state.certificateState({ ...base, validUntil: null }, PRODUCT, now).active, false);
});

test('T2. a certificate issued without a readable period end is not Active until a paid invoice records the term', async () => {
  const c = await issue({ currentPeriodEnd: null });
  assert.equal(db.isCertificationCurrent(stored(c.certificateId), PRODUCT), false);
  await db.renewCertification('sub_1', sec(30));
  assert.equal(db.isCertificationCurrent(stored(c.certificateId), PRODUCT), true);
});

// ── concurrency ─────────────────────────────────────────────────────────────
test('C1. a decision landing between a renewal\'s read and write survives the renewal', async () => {
  const c = await issue();
  interfere = competing((r) => { r.decision = { state: 'suspended', reason: 'critical-regression-failed', reference: 'X', decidedBy: 'FC+IR' }; });
  const renewed = await db.renewCertification('sub_1', sec(60));
  assert.equal(renewed.decision.state, 'suspended');
  assert.equal(stored(c.certificateId).decision.state, 'suspended');
  assert.equal(db.isCertificationCurrent(stored(c.certificateId), PRODUCT), false);
});

test('C2. a payment event landing between a decision\'s read and write is kept, and the decision is still applied', async () => {
  const c = await issue();
  interfere = competing((r) => { r.status = 'past_due'; r.pastDueSince = new Date().toISOString(); });
  const r = await db.setCertificateDecision(c.certificateId, SUSPEND);
  assert.equal(r.ok, true);
  const s = stored(c.certificateId);
  assert.equal(s.status, 'past_due');
  assert.equal(s.decision.state, 'suspended');
});

test('C3. a deployment report and a lapse racing each other both persist', async () => {
  const c = await issue();
  interfere = competing((r) => { r.status = 'lapsed'; r.lapseReason = 'canceled'; });
  await db.recordDeploymentReport(c.certificateId, { versionInUse: '1.0.4.0' });
  const s = stored(c.certificateId);
  assert.equal(s.status, 'lapsed');
  assert.equal(s.deployment.versionInUse, '1.0.4.0');
});

test('C4. many concurrent payment events, decisions and reports: no update is lost', async () => {
  const c = await issue();
  await Promise.all([
    db.markCertificationPastDue('sub_1'),
    db.recordDeploymentReport(c.certificateId, { versionInUse: '1.0.4.0' }),
    db.renewCertification('sub_1', sec(40)),
    db.setCertificateDecision(c.certificateId, SUSPEND),
    db.renewCertification('sub_1', sec(50)),
    db.recordDeploymentReport(c.certificateId, { versionInUse: '1.0.4.0' }),
  ]);
  const s = stored(c.certificateId);
  assert.equal(s.decision.state, 'suspended');
  assert.equal(s.deployment.versionInUse, '1.0.4.0');
  const events = s.history.map((e) => e.event);
  for (const e of ['issued', 'subscription-past-due', 'subscription-renewed', 'decision', 'deployment-reported']) assert.ok(events.includes(e), e);
  assert.equal(events.length, 7, 'every write landed exactly once');
});

test('C5. two deliveries of the same checkout race: one certificate id, one record', async () => {
  const [a, b] = await Promise.all([issue(), issue()]);
  assert.equal(a.certificateId, b.certificateId);
  assert.equal([...kvStore.keys()].filter((k) => k.startsWith('certification:')).length, 1);
  assert.equal(kvStore.get('cert:sub:sub_1'), a.certificateId);
});

test('C6. a KV failure during a certificate write throws and writes nothing', async () => {
  const c = await issue();
  const before = kvStore.get(`certification:${c.certificateId}`);
  kvFail = true;
  await assert.rejects(() => db.renewCertification('sub_1', sec(90)));
  await assert.rejects(() => db.setCertificateDecision(c.certificateId, SUSPEND));
  kvFail = false;
  assert.equal(kvStore.get(`certification:${c.certificateId}`), before);
});

// ── payment events never undo decisions; out-of-order delivery ──────────────
test('P1. no payment event removes a suspension or a revocation', async () => {
  const c = await issue();
  await db.setCertificateDecision(c.certificateId, SUSPEND);
  await db.markCertificationPastDue('sub_1');
  await db.renewCertification('sub_1', sec(60));
  assert.equal(stored(c.certificateId).decision.state, 'suspended');
  await db.setCertificateDecision(c.certificateId, { state: 'revoked', reason: 'evidence-falsified', reference: 'R', decidedBy: 'FC+IR' });
  await db.renewCertification('sub_1', sec(90));
  await db.lapseCertification('sub_1', 'unpaid');
  await db.renewCertification('sub_1', sec(120));
  assert.equal(stored(c.certificateId).decision.state, 'revoked');
});

test('P2. an older invoice delivered late never shortens the paid-through date', async () => {
  const c = await issue({ currentPeriodEnd: sec(60) });
  const longer = stored(c.certificateId).validUntil;
  await db.renewCertification('sub_1', sec(30));
  assert.equal(stored(c.certificateId).validUntil, longer);
});

test('P3. a cancelled or refunded subscription stays ended; an unpaid one can resume', async () => {
  const c = await issue();
  await db.lapseCertification('sub_1', 'canceled');
  await db.renewCertification('sub_1', sec(60));
  assert.equal(stored(c.certificateId).status, 'lapsed');
  await db.issueCertification({ email: 'b@example.com', slug: 'contract-intelligence-and-register', tier: 'L4', subscriptionId: 'sub_2', currentPeriodEnd: sec(30), certifiedVersion: '1.0.4.0' });
  await db.lapseCertification('sub_2', 'unpaid');
  const resumed = await db.renewCertification('sub_2', sec(60));
  assert.equal(resumed.status, 'active');
});

// ── evidence preserved beyond the bounded history ───────────────────────────
test('E1. issuance facts and significant decisions survive any number of later events', async () => {
  const c = await issue({ certifiedVersion: '1.0.3.6' });
  const issuance = stored(c.certificateId).issuance;
  assert.deepEqual(Object.keys(issuance).sort(), ['agentSlug', 'at', 'certifiedVersion', 'tier', 'validUntil']);
  await db.setCertificateDecision(c.certificateId, SUSPEND);
  await db.setCertificateDecision(c.certificateId, { state: 'valid', reference: 'CAI-REG-1-closed', decidedBy: 'FC+IR' });
  await db.adoptCertifiedRelease(c.certificateId, '1.0.4.0', PRODUCT);
  for (let i = 0; i < 210; i += 1) await db.recordDeploymentReport(c.certificateId, { versionInUse: '1.0.4.0' });
  const s = stored(c.certificateId);
  assert.equal(s.history.length, 200, 'the operational history stays bounded');
  assert.ok(!s.history.some((e) => e.event === 'issued'), 'the first events have rolled off the bounded history');
  assert.deepEqual(s.issuance, issuance, 'issuance facts are unchanged');
  const ev = await db.getCertificateEvidence(c.certificateId);
  assert.deepEqual(ev.map((e) => e.event), ['issued', 'decision', 'decision', 'release-adopted']);
  assert.equal(ev[0].certifiedVersion, '1.0.3.6');
  assert.equal(ev[1].to, 'suspended');
  assert.equal(ev[3].to, '1.0.4.0');
});

test('E2. payment events cannot rewrite issuance facts, the certified version or the holder', async () => {
  const c = await issue();
  const before = stored(c.certificateId);
  // renewCertification only sends subscription fields; the guard sits in the patch itself, whatever a caller passes.
  await db.renewCertification('sub_1', sec(60));
  const s = stored(c.certificateId);
  for (const k of ['issuance', 'issuedAt', 'certifiedVersion', 'email', 'agentSlug', 'tier', 'subscriptionId', 'certificateId']) assert.deepEqual(s[k], before[k], k);
});

// ── negative ────────────────────────────────────────────────────────────────
test('N1. unknown certificates and invalid inputs are refused without writing anything', async () => {
  assert.equal((await db.setCertificateDecision('CAI-L4-00000000', SUSPEND)).error, 'not-found');
  assert.equal((await db.recordDeploymentReport('CAI-L4-00000000', { versionInUse: '1.0' })).error, 'not-found');
  assert.equal(await db.renewCertification('sub_none', sec(10)), null);
  const c = await issue();
  assert.equal((await db.setCertificateDecision(c.certificateId, { ...SUSPEND, reason: 'free text' })).error, 'reason-required');
  assert.equal(stored(c.certificateId).decision, undefined);
  assert.equal((await db.getCertificateEvidence(c.certificateId)).length, 1, 'a refused decision leaves no evidence entry');
  assert.equal([...kvStore.keys()].filter((k) => k.startsWith('certification:')).length, 1);
});

test('N2. the public endpoint never exposes the evidence log or issuance internals', async () => {
  const c = await issue();
  await db.setCertificateDecision(c.certificateId, SUSPEND);
  const body = await new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status() { return this; }, json(o) { resolve(JSON.stringify(o)); return this; }, send(b) { resolve(b); return this; } };
    certHandler({ query: { id: c.certificateId, format: 'json' } }, res);
  });
  for (const s of ['issuance', 'history', 'CAI-REG-1', 'FC+IR', 'b@example.com', 'sub_1']) assert.ok(!body.includes(s), s);
});

// CAI-AUD-003: partial issuance. The certificate record is written, then the issuance evidence and the holder link.
// A store failure between them used to leave a certificate with no issuance evidence and no way for the holder to find
// it, because the webhook retry returned the existing record untouched.
test('CAI-AUD-003: a retry after a failed evidence write completes the issuance evidence and the holder link', async () => {
  const args = { email: 'holder@example.com', slug: 'contract-intelligence-and-register', tier: 'L4', subscriptionId: 'sub_partial', currentPeriodEnd: sec(30), certifiedVersion: '1.0.3.6' };
  rpushFailures = 2; // the internal retry also fails, so the first issuance throws after the record is written
  await assert.rejects(() => db.issueCertification(args));
  const retried = await db.issueCertification(args);
  const cert = retried.certificate ?? retried;
  const id = cert.certificateId;
  const evidence = await db.getCertificateEvidence(id);
  assert.ok(evidence.some((e) => e.event === 'issued'), 'the issuance must be evidenced after the retry');
  assert.equal(await db.getCertificationForHolder(args.email, args.slug).then((c) => c?.certificateId), id, 'the holder must be able to find the certificate');
});
