/**
 * tests/audit-cai-aud-002-006.test.mjs - regression tests for the independent audit findings CAI-AUD-002, -005, -006.
 *
 * 002: interest.js must not derive personal-data keys from a public constant.
 * 005: demo-booking.js rate-limit keys must not contain a plain client address.
 * 006: acceptance.js fingerprints must be keyed by a configured secret, never a public salt.
 * No network and no KV: every assertion runs before any store access.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AV from '../config/availability.json' with { type: 'json' };
import interestHandler, { keyedSecret } from '../api/interest.js';
import { rateLimitKey } from '../api/demo-booking.js';
import { clientFingerprint } from '../lib/acceptance.js';

const ENV = ['INTEREST_COLLECTION_ENABLED', 'INTEREST_DEDUPE_SALT', 'DOWNLOAD_TOKEN_SECRET', 'RATE_LIMIT_SECRET', 'ACCEPTANCE_SALT'];
const saved = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const comingSoon = Object.keys(AV.agents).find((k) => AV.agents[k].publicStatus === 'coming-soon');

function fakeRes() {
  const out = { status: 200, body: null, headers: {} };
  return Object.assign(out, {
    setHeader(k, v) { out.headers[k] = v; },
    status(c) { out.status = c; return out; },
    json(b) { out.body = b; return out; },
    end() { return out; },
  });
}

// ── CAI-AUD-002 ───────────────────────────────────────────────────────────────
test('CAI-AUD-002: no public fallback constant remains in interest.js', () => {
  const src = readFileSync(new URL('../api/interest.js', import.meta.url), 'utf8');
  assert.ok(!src.includes("'colleagueai-interest'"), 'the predictable fallback secret must be removed');
  assert.equal(keyedSecret(), null, 'with nothing configured there is no keyed secret');
});

test('CAI-AUD-002: a registration is refused (503, nothing stored) when no keyed secret is configured', async () => {
  process.env.INTEREST_COLLECTION_ENABLED = 'true';
  assert.ok(comingSoon, 'a coming-soon agent exists in the availability config');
  const res = fakeRes();
  await interestHandler({ method: 'POST', headers: { 'user-agent': 'Mozilla/5.0' }, body: { agent: comingSoon, email: 'a@b.co', company: 'X', consent: true } }, res);
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'interest_not_configured');
});

// ── CAI-AUD-005 ───────────────────────────────────────────────────────────────
test('CAI-AUD-005: the demo-booking rate-limit key does not contain the client address', () => {
  process.env.RATE_LIMIT_SECRET = 'test-secret-not-public';
  const req = { headers: { 'x-forwarded-for': '203.0.113.77, 10.0.0.1' }, socket: {} };
  const key = rateLimitKey(req);
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.ok(!key.includes('203.0.113.77'));
});

test('CAI-AUD-005: the key is stable for one address and differs between addresses', () => {
  process.env.RATE_LIMIT_SECRET = 'test-secret-not-public';
  const a = rateLimitKey({ headers: { 'x-real-ip': '198.51.100.1' }, socket: {} });
  const b = rateLimitKey({ headers: { 'x-real-ip': '198.51.100.1' }, socket: {} });
  const c = rateLimitKey({ headers: { 'x-real-ip': '198.51.100.2' }, socket: {} });
  assert.equal(a, b, 'the same address must count against the same window');
  assert.notEqual(a, c);
});

test('CAI-AUD-005: the key is not a plain unkeyed hash of the address (recomputable from IPv4 space)', () => {
  process.env.RATE_LIMIT_SECRET = 'test-secret-not-public';
  const ip = '198.51.100.9';
  const key = rateLimitKey({ headers: { 'x-real-ip': ip }, socket: {} });
  assert.notEqual(key, createHash('sha256').update(ip).digest('hex').slice(0, 32));
});

// ── CAI-AUD-006 ───────────────────────────────────────────────────────────────
test('CAI-AUD-006: with no secret configured no client fingerprint is recorded', () => {
  assert.equal(clientFingerprint({ headers: { 'x-real-ip': '203.0.113.5' }, socket: {} }), null);
});

test('CAI-AUD-006: with a configured secret the fingerprint is keyed, 24 hex characters, and not the public-salt hash', () => {
  process.env.ACCEPTANCE_SALT = 'a-real-deployment-secret';
  const req = { headers: { 'x-real-ip': '203.0.113.5' }, socket: {} };
  const fp = clientFingerprint(req);
  assert.match(fp, /^[0-9a-f]{24}$/);
  assert.ok(!fp.includes('203.0.113.5'));
  const publicSalt = createHash('sha256').update('colleagueai-acceptance|203.0.113.5').digest('hex').slice(0, 24);
  assert.notEqual(fp, publicSalt, 'the public fallback salt must no longer reproduce the fingerprint');
});
