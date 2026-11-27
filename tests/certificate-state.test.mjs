/**
 * tests/certificate-state.test.mjs - the four-axis certificate state (Continuous Certification v1.0, MCL CAI-D17-03).
 *
 * The property tested first, because it is the commercial and legal risk: an active payment subscription must
 * NEVER by itself produce the public claim "Colleague AI Certified — Active".
 *
 * Part A: pure rules (lib/certificateState.js). Part B: lifecycle writes against an in-process fake KV (lib/db.js),
 * including that history is preserved and the perpetual licence is untouched. Part C: the public endpoint.
 * Usage: node --test tests/certificate-state.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { casServe } from './kv-cas-fake.mjs';
import {
  certificateState, subscriptionState, releaseCurrency, decisionState, deploymentState, decisionChangeError,
  currentCertifiedRelease, SUBSCRIPTION_STATES, CURRENCY_STATES, DECISION_STATES,
} from '../lib/certificateState.js';

const DAY = 86400000;
const now = Date.parse('2027-03-01T00:00:00Z');
const rel = (version, extra = {}) => ({ version, package: `pkg-${version.replaceAll('.', '')}.zip`, releasedAt: '2027-01-01T00:00:00Z', ...extra });
const PRODUCT = {
  previousReleases: [rel('1.0.3.6', { certifiedAt: '2027-01-10T00:00:00Z' }), rel('1.0.3.7', { certifiedAt: '2027-02-01T00:00:00Z', withdrawnAt: '2027-02-10T00:00:00Z' })],
  release: rel('1.0.4.0', { certifiedAt: '2027-02-20T00:00:00Z' }),
};
const UNCERTIFIED = { release: rel('1.0.3.6') };
const base = (o = {}) => ({ certificateId: 'CAI-L4-0A1B2C3D', status: 'active', validUntil: new Date(now + 30 * DAY).toISOString(), certifiedVersion: '1.0.4.0', ...o });

// ── A. pure rules ───────────────────────────────────────────────────────────
test('A1. an active payment subscription on a release that was never certified is NOT active', () => {
  const s = certificateState(base({ certifiedVersion: '1.0.3.6' }), UNCERTIFIED, now);
  assert.equal(s.subscription, 'active');
  assert.equal(s.releaseCurrency, 'not-certified');
  assert.equal(s.active, false);
  assert.notEqual(s.label, 'Colleague AI Certified — Active');
});

test('A2. "Active" needs all three axes: exactly one combination out of 4 × 4 × 4 produces the claim', () => {
  const fixtures = {
    subscription: { active: {}, past_due: { status: 'past_due' }, cancelled: { status: 'cancelled' }, lapsed: { status: 'lapsed' } },
    currency: { current: { certifiedVersion: '1.0.4.0' }, superseded: { certifiedVersion: '1.0.3.6' }, withdrawn: { certifiedVersion: '1.0.3.7' }, 'not-certified': { certifiedVersion: '9.9.9' } },
    decision: { valid: {}, suspended: { decision: { state: 'suspended', reason: 'critical-regression-failed' } }, revoked: { decision: { state: 'revoked', reason: 'evidence-falsified' } }, discontinued: { decision: { state: 'discontinued', reason: 'package-discontinued' } } },
  };
  let actives = 0;
  for (const [sk, so] of Object.entries(fixtures.subscription)) for (const [ck, co] of Object.entries(fixtures.currency)) for (const [dk, dobj] of Object.entries(fixtures.decision)) {
    const s = certificateState(base({ ...so, ...co, ...dobj }), PRODUCT, now);
    assert.equal(s.subscription, sk); assert.equal(s.releaseCurrency, ck); assert.equal(s.decision, dk);
    if (s.active) { actives += 1; assert.deepEqual([sk, ck, dk], ['active', 'current', 'valid']); }
    else assert.notEqual(s.label, 'Colleague AI Certified — Active', `${sk}/${ck}/${dk}`);
  }
  assert.equal(actives, 1);
  assert.deepEqual([...SUBSCRIPTION_STATES].sort(), Object.keys(fixtures.subscription).sort());
  assert.deepEqual([...CURRENCY_STATES].sort(), Object.keys(fixtures.currency).sort());
  assert.deepEqual([...DECISION_STATES].sort(), Object.keys(fixtures.decision).sort());
});

test('A3. currency: the current certified release skips withdrawn releases; superseded names the current one', () => {
  assert.equal(currentCertifiedRelease(PRODUCT).version, '1.0.4.0');
  assert.equal(currentCertifiedRelease({ previousReleases: [...PRODUCT.previousReleases, PRODUCT.release], release: rel('1.0.5.0') }).version, '1.0.4.0', 'an uncertified newer release does not supersede');
  const s = certificateState(base({ certifiedVersion: '1.0.3.6' }), PRODUCT, now);
  assert.equal(s.releaseCurrency, 'superseded');
  assert.match(s.label, /Superseded — current certified release is 1\.0\.4\.0/);
});

test('A4. fail closed: unknown status, missing product, missing version, malformed decision, expired term', () => {
  assert.equal(subscriptionState(base({ status: 'trialing' }), now), 'lapsed');
  assert.equal(subscriptionState(base({ validUntil: new Date(now - 1).toISOString() }), now), 'lapsed');
  assert.equal(subscriptionState(base({ validUntil: 'not-a-date' }), now), 'lapsed');
  assert.equal(releaseCurrency(base(), null), 'not-certified');
  assert.equal(releaseCurrency(base({ certifiedVersion: null }), PRODUCT), 'not-certified');
  assert.equal(decisionState(base({ decision: { state: 'whatever' } })), 'suspended');
  assert.equal(certificateState(base({ decision: { state: 'whatever' } }), PRODUCT, now).active, false);
  assert.equal(certificateState(null, PRODUCT, now).active, false);
});

test('A5. the customer-reported deployment never changes the claim and is never presented as verified', () => {
  const reported = certificateState(base({ deployment: { versionInUse: '1.0.3.6', reportedAt: '2027-02-25T00:00:00Z' } }), PRODUCT, now);
  assert.equal(reported.active, true);
  assert.deepEqual(reported.deployment, { state: 'reported', versionInUse: '1.0.3.6', reportedAt: '2027-02-25T00:00:00Z', verifiedByColleagueAI: false });
  assert.equal(deploymentState(base({ deployment: { versionInUse: '<script>' } })).state, 'not-reported');
});

test('A6. decision rules: terminal states are final, adverse decisions need a public reason and a reference', () => {
  const v = base();
  const ok = { state: 'suspended', reason: 'critical-vulnerability-unmitigated', reference: 'CAI-VUL-1', decidedBy: 'FC+IR' };
  assert.equal(decisionChangeError(v, ok), null);
  assert.equal(decisionChangeError(v, { ...ok, reason: 'because I said so' }), 'reason-required');
  assert.equal(decisionChangeError(v, { ...ok, reference: '' }), 'reference-required');
  assert.equal(decisionChangeError(v, { ...ok, decidedBy: '' }), 'decided-by-required');
  assert.equal(decisionChangeError(v, { state: 'valid', reference: 'x' }), 'no-change');
  assert.equal(decisionChangeError(base({ decision: { state: 'suspended' } }), { state: 'valid', reference: 'R-1' }), null);
  assert.equal(decisionChangeError(base({ decision: { state: 'suspended' } }), { state: 'valid' }), 'reinstate-needs-suspension-and-reference');
  for (const t of ['revoked', 'discontinued']) {
    assert.equal(decisionChangeError(base({ decision: { state: t } }), { state: 'valid', reference: 'R' }), 'terminal');
    assert.equal(decisionChangeError(base({ decision: { state: t } }), ok), 'terminal');
  }
  assert.equal(decisionChangeError(v, { state: 'paused' }), 'unknown-state');
});

test('A7. only enumerated reason categories are exposed; free text never is', () => {
  const s = certificateState(base({ decision: { state: 'suspended', reason: 'Customer X leaked their tenant', note: 'internal' } }), PRODUCT, now);
  assert.equal(s.decisionReason, null);
  assert.ok(!JSON.stringify(s).includes('Customer X'));
});

// ── B. lifecycle writes (fake KV) ───────────────────────────────────────────
const kvStore = new Map();
const kvServer = http.createServer((req, res) => {
  const [, cmd, ...rest] = req.url.split('/').map(decodeURIComponent);
  if (req.method === 'POST') return casServe(kvStore, req, res);
  if (cmd === 'GET') return res.end(JSON.stringify({ result: kvStore.get(rest[0]) ?? null }));
  if (cmd === 'SET') {
    const [key, value, ...flags] = rest;
    if (flags.includes('NX') && kvStore.has(key)) return res.end(JSON.stringify({ result: null }));
    kvStore.set(key, value); return res.end(JSON.stringify({ result: 'OK' }));
  }
  if (cmd === 'DEL') { kvStore.delete(rest[0]); return res.end(JSON.stringify({ result: 1 })); }
  res.end(JSON.stringify({ result: null }));
});
let db, certHandler, releaseAccess;
before(async () => {
  await new Promise((r) => kvServer.listen(0, r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  db = await import('../lib/db.js');
  releaseAccess = await import('../lib/releaseAccess.js');
  ({ default: certHandler } = await import('../api/certificate.js'));
});
after(() => kvServer.close());
beforeEach(() => kvStore.clear());

const SLUG = 'contract-intelligence-and-register';
const issue = (v = '1.0.3.6') => db.issueCertification({ email: 'buyer@example.com', slug: SLUG, tier: 'L4', subscriptionId: 'sub_1', currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86400, certifiedVersion: v });
const SUSPEND = { state: 'suspended', reason: 'critical-regression-failed', reference: 'CAI-REG-7', decidedBy: 'FC+IR', note: 'internal detail' };

test('B1. a payment renewal never lifts a suspension or a revocation', async () => {
  const c = await issue();
  assert.equal((await db.setCertificateDecision(c.certificateId, SUSPEND)).ok, true);
  const renewed = await db.renewCertification('sub_1', Math.floor(Date.now() / 1000) + 60 * 86400);
  assert.equal(renewed.status, 'active');
  assert.equal(renewed.decision.state, 'suspended');
  assert.equal(db.isCertificationCurrent(renewed, PRODUCT), false);
  await db.setCertificateDecision(c.certificateId, { state: 'revoked', reason: 'evidence-falsified', reference: 'CAI-D17-9', decidedBy: 'FC+IR' });
  await db.renewCertification('sub_1', Math.floor(Date.now() / 1000) + 90 * 86400);
  assert.equal((await db.getCertification(c.certificateId)).decision.state, 'revoked');
  assert.equal((await db.setCertificateDecision(c.certificateId, { state: 'valid', reference: 'R' })).error, 'terminal');
});

test('B2. history keeps every lifecycle event, in order, including the version certified at issue', async () => {
  const c = await issue('1.0.3.6');
  await db.markCertificationPastDue('sub_1');
  await db.renewCertification('sub_1', Math.floor(Date.now() / 1000) + 30 * 86400);
  await db.setCertificateDecision(c.certificateId, SUSPEND);
  await db.setCertificateDecision(c.certificateId, { state: 'valid', reference: 'CAI-REG-7-closed', decidedBy: 'FC+IR' });
  await db.recordDeploymentReport(c.certificateId, { versionInUse: '1.0.3.6' });
  await db.lapseCertification('sub_1', 'cancelled');
  const h = (await db.getCertification(c.certificateId)).history;
  assert.deepEqual(h.map((e) => e.event), ['issued', 'subscription-past-due', 'subscription-renewed', 'decision', 'decision', 'deployment-reported', 'subscription-ended']);
  assert.equal(h[0].certifiedVersion, '1.0.3.6');
  assert.ok(h.every((e) => Number.isFinite(Date.parse(e.at))));
});

test('B3. payment events cannot rewrite the certified version, the decision or the history', async () => {
  const c = await issue('1.0.3.6');
  await db.setCertificateDecision(c.certificateId, SUSPEND);
  // renewCertification only passes subscription fields, but the guard is in patchBySubscription itself:
  const after = await db.lapseCertification('sub_1', 'cancelled');
  assert.equal(after.certifiedVersion, '1.0.3.6');
  assert.equal(after.decision.state, 'suspended');
  assert.ok(after.history.length >= 3);
});

test('B4. adoption moves to a newer certified release only, keeps the old one in history, and makes the claim current', async () => {
  const c = await issue('1.0.3.6');
  assert.equal((await db.adoptCertifiedRelease(c.certificateId, '1.0.3.7', PRODUCT)).error, 'not-a-certified-release', 'withdrawn release');
  assert.equal((await db.adoptCertifiedRelease(c.certificateId, '1.0.3.6', PRODUCT)).error, 'not-newer', 'same version');
  const r = await db.adoptCertifiedRelease(c.certificateId, '1.0.4.0', PRODUCT);
  assert.equal(r.ok, true);
  assert.equal(r.record.certifiedVersion, '1.0.4.0');
  const last = r.record.history.at(-1);
  assert.deepEqual([last.event, last.from, last.to], ['release-adopted', '1.0.3.6', '1.0.4.0']);
  assert.equal(db.isCertificationCurrent(r.record, PRODUCT), true);
  await db.lapseCertification('sub_1', 'cancelled');
  assert.equal((await db.adoptCertifiedRelease(c.certificateId, '1.0.4.0', PRODUCT)).error, 'subscription-not-active');
});

test('B5. suspension and revocation never touch the perpetual licence or the downloads it gives', async () => {
  await db.grantEntitlement('buyer@example.com', [SLUG], 'cs_1');
  const c = await issue();
  await db.setCertificateDecision(c.certificateId, { state: 'revoked', reason: 'evidence-falsified', reference: 'X', decidedBy: 'FC+IR' });
  assert.equal(await db.isEntitled('buyer@example.com', SLUG), true);
  const cert = await db.getCertification(c.certificateId);
  // Download coverage stays a payment matter (what the subscriber paid for), not a certification claim.
  assert.equal(releaseAccess.certificationCoverage(cert).kind, 'all');
});

test('B6. deployment reports are validated and stored as customer-reported', async () => {
  const c = await issue();
  assert.equal((await db.recordDeploymentReport(c.certificateId, { versionInUse: '1.0<img>' })).error, 'bad-version');
  const r = await db.recordDeploymentReport(c.certificateId, { versionInUse: '1.0.3.6' });
  assert.equal(r.record.deployment.source, 'customer');
  assert.equal((await db.setCertificateDecision('CAI-L4-FFFFFFFF', SUSPEND)).error, 'not-found');
});

// ── C. public endpoint ──────────────────────────────────────────────────────
function invoke(query) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = JSON.stringify(o); resolve(this); return this; }, send(b) { this.body = b; resolve(this); return this; } };
    certHandler({ query }, res);
  });
}

test('C1. the endpoint shows the four axes and publishes no history, note, email or subscription id', async () => {
  const c = await issue();
  await db.setCertificateDecision(c.certificateId, SUSPEND);
  await db.recordDeploymentReport(c.certificateId, { versionInUse: '1.0.3.6' });
  const j = await invoke({ id: c.certificateId, format: 'json' });
  const body = JSON.parse(j.body);
  assert.equal(body.current, false);
  assert.equal(body.state.decision, 'suspended');
  assert.equal(body.state.decisionReason, 'critical-regression-failed');
  assert.equal(body.state.deployment.verifiedByColleagueAI, false);
  for (const s of ['buyer@example.com', 'sub_1', 'internal detail', 'history', 'decidedBy', 'CAI-REG-7']) assert.ok(!j.body.includes(s), `leaks ${s}`);
  const h = await invoke({ id: c.certificateId });
  assert.match(h.body, /Suspended — not currently certified/);
  assert.match(h.body, /reported by the holder; not verified by Colleague AI/);
  assert.doesNotMatch(h.body, /Colleague AI Certified — Active/);
  assert.equal(h.headers['cache-control'], 'no-store');
});
