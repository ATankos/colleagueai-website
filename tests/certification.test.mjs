/**
 * tests/certification.test.mjs — Continuous Certification: lifecycle, separation
 * from the perpetual licence, and the privacy contract of the public certificate.
 *
 * Runs FULLY LOCALLY against an in-process fake Upstash KV REST server. No Stripe
 * calls, no secrets. Usage: node --test tests/certification.test.mjs
 *
 * The property that matters most commercially is tested first: a lapsed
 * subscription must NEVER take away the agent the customer bought outright.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

const kvStore = new Map();
let kvFail = false;
const kvServer = http.createServer((req, res) => {
  const [, cmd, ...rest] = req.url.split('/').map(decodeURIComponent);
  if (kvFail) { res.writeHead(500); return res.end('forced failure'); }
  if (cmd === 'GET') return res.end(JSON.stringify({ result: kvStore.get(rest[0]) ?? null }));
  if (cmd === 'SET') {
    const [key, value, ...flags] = rest;
    if (flags.includes('NX') && kvStore.has(key)) return res.end(JSON.stringify({ result: null }));
    kvStore.set(key, value);
    return res.end(JSON.stringify({ result: 'OK' }));
  }
  if (cmd === 'DEL') { kvStore.delete(rest[0]); return res.end(JSON.stringify({ result: 1 })); }
  res.end(JSON.stringify({ result: null }));
});

let db, certHandler;
before(async () => {
  await new Promise((r) => kvServer.listen(0, r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  db = await import('../lib/db.js');
  ({ default: certHandler } = await import('../api/certificate.js'));
});
after(() => kvServer.close());
beforeEach(() => { kvStore.clear(); kvFail = false; });

const HOUR = 3600;
const nowSec = () => Math.floor(Date.now() / 1000);

async function issue({ email = 'buyer@example.com', slug = 'contract-summarisation-agent',
  tier = 'L4', subscriptionId = 'sub_1', periodEnd = nowSec() + 30 * 24 * HOUR } = {}) {
  return db.issueCertification({ email, slug, tier, subscriptionId, currentPeriodEnd: periodEnd });
}

// ── 1. the licence/certification separation ─────────────────────────────────
test('1. a lapsed certification does NOT touch the perpetual download entitlement', async () => {
  await db.grantEntitlement('buyer@example.com', ['contract-summarisation-agent'], 'cs_1');
  const cert = await issue();

  await db.lapseCertification('sub_1', 'cancelled');

  const after = await db.getCertification(cert.certificateId);
  assert.equal(after.status, 'lapsed');
  assert.equal(await db.isEntitled('buyer@example.com', 'contract-summarisation-agent'), true,
    'DEFECT: cancelling the subscription removed access to a package the customer bought outright');
});

// ── 2. privacy contract of the public record ────────────────────────────────
test('2. the public certificate exposes no personal data', async () => {
  const cert = await issue({ email: 'ceo@acme-bank.example' });
  const pub = db.publicCertificate(cert);

  const serialized = JSON.stringify(pub).toLowerCase();
  for (const leak of ['ceo@acme-bank.example', 'acme', 'email', 'customer', 'sub_1']) {
    assert.ok(!serialized.includes(leak), `DEFECT: public certificate leaks "${leak}": ${serialized}`);
  }
  assert.deepEqual(Object.keys(pub).sort(),
    ['agentSlug', 'certificateId', 'certifiedVersion', 'issuedAt', 'status', 'tier', 'validUntil'].sort());
});

test('2b. certificate ids are unguessable and carry no personal data', async () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(db.newCertificateId('L4'));
  assert.equal(ids.size, 200, 'certificate ids must not collide');
  for (const id of ids) assert.match(id, /^CAI-L4-[0-9A-F]{8}$/);
});

// ── 3. lifecycle ────────────────────────────────────────────────────────────
test('3a. issuing is idempotent per subscription (a redelivered event mints no second id)', async () => {
  const first = await issue();
  const second = await issue();
  assert.equal(second.certificateId, first.certificateId);
  const minted = [...kvStore.keys()].filter((k) => k.startsWith('certification:'));
  assert.equal(minted.length, 1, `DEFECT: ${minted.length} certificates for one subscription`);
});

test('3b. paid invoice renews the term and clears past_due', async () => {
  const cert = await issue({ periodEnd: nowSec() + HOUR });
  await db.markCertificationPastDue('sub_1');
  assert.equal((await db.getCertification(cert.certificateId)).status, 'past_due');

  const renewed = await db.renewCertification('sub_1', nowSec() + 60 * 24 * HOUR);
  assert.equal(renewed.status, 'active');
  assert.equal(renewed.pastDueSince, null);
  assert.ok(db.isCertificationCurrent(renewed));
});

test('3c. a failed payment marks past_due but does not lapse — Stripe is still retrying', async () => {
  await issue();
  const cert = await db.markCertificationPastDue('sub_1');
  assert.equal(cert.status, 'past_due');
  assert.equal(db.isCertificationCurrent(cert), false, 'past_due must not read as currently certified');
  assert.notEqual(cert.status, 'lapsed');
});

test('3d. an expired term is not current even while the record still says active', async () => {
  const cert = await issue({ periodEnd: nowSec() - HOUR });
  assert.equal(cert.status, 'active');
  assert.equal(db.isCertificationCurrent(cert), false,
    'DEFECT: a certificate past its validUntil must never verify as current');
});

test('3e. lifecycle writes for an unknown subscription return null rather than inventing a record', async () => {
  assert.equal(await db.renewCertification('sub_does_not_exist', nowSec() + HOUR), null);
  assert.equal(await db.lapseCertification('sub_does_not_exist'), null);
  assert.equal([...kvStore.keys()].filter((k) => k.startsWith('certification:')).length, 0);
});

test('3f. holder lookup finds the certificate without storing the email in the key', async () => {
  const cert = await issue();
  const found = await db.getCertificationForHolder('BUYER@example.com', 'contract-summarisation-agent');
  assert.equal(found.certificateId, cert.certificateId, 'holder lookup must be case-insensitive');
  for (const k of kvStore.keys()) {
    assert.ok(!k.includes('buyer@example.com'), `DEFECT: KV key exposes the holder email: ${k}`);
  }
});

// ── 4. the verification endpoint ────────────────────────────────────────────
function invoke(query) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {}, body: '',
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { this.body = JSON.stringify(o); resolve(this); return this; },
      send(b) { this.body = b; resolve(this); return this; },
    };
    certHandler({ query }, res);
  });
}

test('4a. valid id verifies as active and returns the scope statement', async () => {
  const cert = await issue();
  const r = await invoke({ id: cert.certificateId, format: 'json' });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.valid, true);
  assert.equal(body.current, true);
  assert.ok(/not accreditation, attestation or certification by any third party/i.test(body.scope),
    'the verification response must carry the not-third-party scope statement');
  assert.ok(!r.body.includes('buyer@example.com'), 'endpoint must never return the holder email');
});

test('4b. lapsed certificate verifies as NOT current, and says the licence is unaffected', async () => {
  const cert = await issue();
  await db.lapseCertification('sub_1', 'cancelled');
  const r = await invoke({ id: cert.certificateId });
  assert.equal(r.statusCode, 200);
  assert.ok(/not currently certified|Lapsed/i.test(r.body));
  assert.ok(/licence to the agent package is unaffected/i.test(r.body));
});

test('4c. malformed, missing and unknown ids fail cleanly without leaking existence', async () => {
  assert.equal((await invoke({ format: 'json' })).statusCode, 400);
  assert.equal((await invoke({ id: 'not-a-certificate', format: 'json' })).statusCode, 400);
  assert.equal((await invoke({ id: 'CAI-L4-DEADBEEF', format: 'json' })).statusCode, 404);
});

test('4d. ids are accepted case-insensitively (people retype them from PDFs)', async () => {
  const cert = await issue();
  const r = await invoke({ id: cert.certificateId.toLowerCase(), format: 'json' });
  assert.equal(r.statusCode, 200);
  assert.equal(JSON.parse(r.body).certificateId, cert.certificateId);
});

test('4e. KV outage answers 503, never a false "no such certificate"', async () => {
  const cert = await issue();
  kvFail = true;
  const r = await invoke({ id: cert.certificateId, format: 'json' });
  assert.equal(r.statusCode, 503,
    'DEFECT: a storage outage must not be reported as an invalid certificate');
});
