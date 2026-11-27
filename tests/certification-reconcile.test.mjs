/**
 * tests/certification-reconcile.test.mjs - founder decision (Round 3): daily certificate reconciliation with failure alerts.
 * The report must name BOTH pending issuances and outstanding evidence repairs; the cron endpoint is inactive until
 * CRON_SECRET is set; alerts carry counts only. Local only: fake Upstash, fake Resend.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createFakeKv } from './helpers/fake-kv.mjs';

delete process.env.VERCEL_ENV;
for (const k of ['CRON_SECRET', 'OPS_ALERT_EMAIL', 'RESEND_API_KEY']) delete process.env[k];
const kvf = createFakeKv();
const mails = [];
let db, rec, handler, resend;
const EMAIL = 'holder@example.com';
const SLUG = 'contract-intelligence-and-register';
const REGISTER = { people: [{ id: 'p-fc', role: 'FC' }, { id: 'p-ir', role: 'IR' }] };
const SUSPEND = { state: 'suspended', reason: 'critical-regression-failed', reference: 'CAI-REG-1', deciders: [{ role: 'FC', id: 'p-fc' }, { role: 'IR', id: 'p-ir' }] };

before(async () => {
  await kvf.start();
  resend = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => { mails.push(JSON.parse(body)); res.setHeader('content-type', 'application/json'); res.end('{"id":"m1"}'); });
  });
  await new Promise((r) => resend.listen(0, r));
  process.env.RESEND_API_URL = `http://127.0.0.1:${resend.address().port}`;
  db = await import('../lib/db.js');
  rec = await import('../lib/certificationReconcile.js');
  ({ default: handler } = await import('../api/certification-reconcile.js'));
});
after(() => { kvf.stop(); resend.close(); });
beforeEach(() => { kvf.reset(); mails.length = 0; for (const k of ['CRON_SECRET', 'OPS_ALERT_EMAIL', 'RESEND_API_KEY']) delete process.env[k]; });

function call(method = 'GET', auth) {
  return new Promise((resolve) => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); return this; } };
    handler({ method, headers: auth ? { authorization: auth } : {} }, res);
  });
}
const inDays = (n) => Math.floor(Date.now() / 1000) + n * 86400;
const failKey = (cmd, prefix, times, contains) => kvf.failOn(({ cmd: c, args }) => c === cmd && String(args[0]).startsWith(prefix) && (!contains || String(args[1]).includes(contains)), times);

/** One queued issuance and one queued evidence repair, the two kinds of outstanding work. */
async function outstandingWork() {
  await db.recordPendingIssuance({ email: EMAIL, slug: SLUG, tier: 'L4', subscriptionId: 'sub_q1', currentPeriodEnd: inDays(30) }, new Error('KV error'));
  const { certificateId } = await db.issueCertification({ email: 'b2@example.com', slug: SLUG, tier: 'L4', subscriptionId: 'sub_q2', currentPeriodEnd: inDays(30) });
  failKey('RPUSH', 'certification-evidence:', 2, '"event":"decision"');
  const r = await db.setCertificateDecision(certificateId, SUSPEND, { register: REGISTER });
  assert.equal(r.evidencePending, true, 'precondition: one evidence repair is queued');
}

test('the status report names pending issuances AND outstanding evidence repairs, and changes nothing', async () => {
  await outstandingWork();
  const s = await rec.reconcileCertificates({ apply: false });
  assert.equal(s.mode, 'status');
  assert.equal(s.pendingIssuances, 1);
  assert.equal(s.evidenceRepairs, 1, 'DEFECT: the status view did not report outstanding evidence repairs');
  assert.equal(s.oldestPendingDays, 0, 'the age of the oldest queued issuance is reported (counts only)');
  const rec0 = JSON.parse(kvf.store.get('cert:pending:sub_q1'));
  kvf.store.set('cert:pending:sub_q1', JSON.stringify({ ...rec0, firstFailedAt: new Date(Date.now() - 8 * 86400000).toISOString() }));
  assert.equal((await rec.reconcileCertificates({ apply: false })).oldestPendingDays, 8);
  assert.equal(s.ok, false);
  assert.equal((await rec.reconcileCertificates({ apply: false })).pendingIssuances, 1, 'status mode changed nothing');
});

test('a run completes both kinds of work and reports ok', async () => {
  await outstandingWork();
  const r = await rec.reconcileCertificates({ apply: true });
  assert.equal(r.issuing.issued, 1);
  assert.equal(r.repairs.repaired, 1);
  assert.equal(r.pendingIssuances, 0);
  assert.equal(r.evidenceRepairs, 0);
  assert.equal(r.oldestPendingDays, null);
  assert.equal(r.ok, true);
});

test('a repair that keeps failing is counted, kept in the queue and reported (not silently skipped)', async () => {
  await outstandingWork();
  failKey('RPUSH', 'certification-evidence:', 99);
  const r = await rec.reconcileCertificates({ apply: true });
  assert.equal(r.repairs.failed, 1);
  assert.equal(r.evidenceRepairs, 1);
  assert.equal(r.ok, false);
});

test('the cron endpoint is inactive until CRON_SECRET is set, and refuses wrong credentials and other methods', async () => {
  assert.equal((await call('GET', 'Bearer anything')).status, 503);
  process.env.CRON_SECRET = 'cron-secret-for-tests-0123456789';
  assert.equal((await call('GET')).status, 401);
  assert.equal((await call('GET', 'Bearer wrong-secret-for-tests-01234567')).status, 401);
  assert.equal((await call('POST', `Bearer ${process.env.CRON_SECRET}`)).status, 405);
  const ok = await call('GET', `Bearer ${process.env.CRON_SECRET}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.alert.alerted, false);
});

test('outstanding work raises an alert: log always, email only when configured, counts only', async () => {
  await outstandingWork();
  failKey('RPUSH', 'certification-evidence:', 99);
  process.env.CRON_SECRET = 'cron-secret-for-tests-0123456789';
  const logOnly = await call('GET', `Bearer ${process.env.CRON_SECRET}`);
  assert.deepEqual(logOnly.body.alert.channels, ['log']);
  assert.equal(mails.length, 0);
  process.env.OPS_ALERT_EMAIL = 'ops@example.com';
  process.env.RESEND_API_KEY = 're_test_dummy';
  const mailed = await call('GET', `Bearer ${process.env.CRON_SECRET}`);
  assert.deepEqual(mailed.body.alert.channels, ['log', 'email']);
  assert.equal(mails.length, 1);
  const text = JSON.stringify(mails[0]);
  assert.match(text, /Outstanding evidence repairs: 1/);
  assert.doesNotMatch(text, /holder@example\.com|b2@example\.com|CAI-L4-/, 'no customer address or certificate id in the alert');
  assert.doesNotMatch(JSON.stringify(mailed.body), /@example\.com/, 'the response holds counts only');
});

test('a store outage fails the run (500) and still alerts', async () => {
  process.env.CRON_SECRET = 'cron-secret-for-tests-0123456789';
  kvf.failOn(() => true, 999);
  const r = await call('GET', `Bearer ${process.env.CRON_SECRET}`);
  assert.equal(r.status, 500);
  assert.equal(r.body.ok, false);
});

test('vercel.json schedules the job once a day at the endpoint (Production only, per Vercel)', async () => {
  const { readFileSync } = await import('node:fs');
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const job = (v.crons || []).find((c) => c.path === '/api/certification-reconcile');
  assert.ok(job, 'cron entry missing');
  assert.match(job.schedule, /^\d{1,2} \d{1,2} \* \* \*$/, 'exactly one run per day');
});
