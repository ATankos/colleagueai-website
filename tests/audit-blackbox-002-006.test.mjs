/* Black-box reproduction of CAI-AUD-002, -005, -006: uses only exports that also exist on origin/main, so the same file
 * fails there (REPRODUCED) and passes on the fix. Round 3 independent verification. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createFakeKv } from './helpers/fake-kv.mjs';
for (const k of ['INTEREST_DEDUPE_SALT', 'DOWNLOAD_TOKEN_SECRET', 'ACCEPTANCE_SALT', 'RATE_LIMIT_SECRET', 'VERCEL_ENV']) delete process.env[k];
const kvf = createFakeKv();
before(() => kvf.start()); after(() => kvf.stop());
const call = (handler, req) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { resolve({ status: this.statusCode, body: o }); return this; }, end() { resolve({ status: this.statusCode }); return this; } };
  handler(req, res);
});
test('AUD-005: the demo-booking rate-limit key never stores the raw client IP', async () => {
  const { default: h } = await import('../api/demo-booking.js');
  await call(h, { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.77', 'content-type': 'application/json' }, socket: {},
    body: { email: 'a@example.com', company: 'X', preferredDate: '2027-01-10', timeZone: 'UTC' } });
  const keys = [...kvf.store.keys()];
  assert.ok(!keys.some((k) => k.includes('203.0.113.77')), `REPRODUCED: raw IP in store key: ${keys.filter((k) => k.includes('203.0.113.77'))}`);
});
test('AUD-006: the acceptance fingerprint cannot be recomputed from an IP with a public salt', async () => {
  const { clientFingerprint } = await import('../lib/acceptance.js');
  const fp = clientFingerprint({ headers: { 'x-real-ip': '198.51.100.4' }, socket: {} });
  const recomputed = crypto.createHash('sha256').update('colleagueai-acceptance|198.51.100.4').digest('hex').slice(0, 24);
  assert.notEqual(fp, recomputed, 'REPRODUCED: anyone can recompute the fingerprint from a guessed IP');
});
test('AUD-002: no email-derived interest key is derived from a public constant', async () => {
  const src = (await import('node:fs')).readFileSync('api/interest.js', 'utf8');
  assert.doesNotMatch(src, /\|\| 'colleagueai-interest'/, 'REPRODUCED: public fallback constant keys an email-derived marker');
});
