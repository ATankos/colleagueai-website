/**
 * tests/kv-namespace.test.mjs - Production and every test deployment share one Redis (Vercel KV), so a Preview
 * or Development deployment must work under its own key prefix and never read or change a production record:
 * a sandbox purchase, refund, partner code or demo request cannot grant, revoke, credit or list anything a live
 * customer or partner can see. Production, and a process outside Vercel (these test suites), keep the
 * unprefixed keys already stored.
 *
 * Runs against an in-process fake of the Upstash REST API on loopback: no network, no secrets, no real KV.
 * Usage: node --test tests/kv-namespace.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';

const strings = new Map();
const sets = new Map();
const lists = new Map();
let log = []; // every request the fake received, in order: { cmd, key }

const kvServer = http.createServer((req, res) => {
  const [, cmd, key, ...rest] = req.url.split('/').map(decodeURIComponent);
  log.push({ cmd, key });
  const reply = (result) => res.end(JSON.stringify({ result }));
  switch (cmd) {
    case 'GET': return reply(strings.get(key) ?? null);
    case 'SET':
      if (rest.includes('NX') && strings.has(key)) return reply(null);
      strings.set(key, rest[0]);
      return reply('OK');
    case 'DEL': return reply(strings.delete(key) ? 1 : 0);
    case 'INCR': { const n = Number(strings.get(key) ?? 0) + 1; strings.set(key, String(n)); return reply(n); }
    case 'EXPIRE': return reply(strings.has(key) ? 1 : 0);
    case 'SADD': { const s = sets.get(key) ?? new Set(); s.add(rest[0]); sets.set(key, s); return reply(1); }
    case 'SMEMBERS': return reply([...(sets.get(key) ?? [])]);
    case 'LPUSH': { const l = lists.get(key) ?? []; l.unshift(rest[0]); lists.set(key, l); return reply(l.length); }
    case 'LRANGE': return reply((lists.get(key) ?? []).slice(Number(rest[0]), Number(rest[1]) + 1));
    default:
      res.writeHead(400);
      return res.end(JSON.stringify({ error: `unsupported command ${cmd}` }));
  }
});

let db;
before(async () => {
  await new Promise((r) => kvServer.listen(0, '127.0.0.1', r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  db = await import('../lib/db.js');
});
after(async () => {
  kvServer.closeAllConnections?.();
  await new Promise((r) => kvServer.close(r));
});
beforeEach(() => { strings.clear(); sets.clear(); lists.clear(); log = []; });

/** Run fn as a function that Vercel started in the given environment (undefined = not on Vercel at all). */
async function inEnv(vercelEnv, fn) {
  const saved = process.env.VERCEL_ENV;
  if (vercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = vercelEnv;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved;
  }
}

const EMAIL = 'buyer@example.test';
const SLUG = 'contract-intelligence-and-register';
const partnerRecord = () => JSON.stringify({
  code: 'ACME', status: 'approved', commissionRate: 10, agreementVersion: '1',
  salesCount: 0, pendingAmount: 0, sessions: [],
});

test('kvNamespace: production and a process outside Vercel are unprefixed, every other Vercel environment is prefixed', async () => {
  assert.equal(await inEnv('production', () => db.kvNamespace()), '');
  assert.equal(await inEnv(undefined, () => db.kvNamespace()), '');
  assert.equal(await inEnv('', () => db.kvNamespace()), '');
  assert.equal(await inEnv('preview', () => db.kvNamespace()), 'preview:');
  assert.equal(await inEnv('development', () => db.kvNamespace()), 'development:');
});

test('production, and a process outside Vercel, keep the unprefixed keys already stored', async () => {
  for (const env of ['production', undefined]) {
    strings.clear();
    await inEnv(env, () => db.grantEntitlement(EMAIL, [SLUG], 'cs_live_1'));
    assert.deepEqual([...strings.keys()], [`entitlement:${EMAIL}`], `unexpected keys for VERCEL_ENV=${env}`);
  }
});

test('a Preview deployment cannot see a production entitlement', async () => {
  await inEnv('production', () => db.grantEntitlement(EMAIL, [SLUG], 'cs_live_1'));
  assert.equal(await inEnv('production', () => db.isEntitled(EMAIL, SLUG)), true);
  assert.equal(await inEnv('preview', () => db.isEntitled(EMAIL, SLUG)), false,
    'DEFECT: a Preview deployment reads production entitlements');
  assert.equal(await inEnv('preview', () => db.getEntitlement(EMAIL)), null);
});

test('a sandbox refund on Preview cannot revoke what production granted', async () => {
  await inEnv('production', () => db.grantEntitlement(EMAIL, [SLUG], 'cs_live_1'));
  const before = strings.get(`entitlement:${EMAIL}`);

  const out = await inEnv('preview', () => db.revokeEntitlement(EMAIL, [SLUG], 'cs_live_1', { refunded: true }));

  assert.equal(out.revoked, false, 'the Preview deployment found an entitlement to revoke');
  assert.equal(strings.get(`entitlement:${EMAIL}`), before, 'DEFECT: a Preview refund rewrote a production entitlement');
  assert.equal(await inEnv('production', () => db.isEntitled(EMAIL, SLUG)), true);
});

test('a sandbox sale on Preview that carries a real partner code credits nobody', async () => {
  const reg = partnerRecord();
  strings.set('partner:reg:ACME', reg); // the production partner

  await assert.rejects(
    inEnv('preview', () => db.recordCommission({
      code: 'ACME', amountGross: 1490000, commissionRate: 10, stripeSessionId: 'cs_test_1', currency: 'USD',
    })),
    /unknown partner code/,
  );

  assert.equal(strings.get('partner:reg:ACME'), reg, 'DEFECT: a Preview sale changed a production partner record');
  assert.deepEqual([...strings.keys()].filter((k) => k.includes('commission')), [],
    'DEFECT: a Preview sale wrote a commission ledger entry');
});

test('a Preview deployment cannot claim, or release, a Stripe id that production holds', async () => {
  assert.equal(await inEnv('production', () => db.claimSession('cs_shared_1')), true);

  assert.equal(await inEnv('preview', () => db.claimSession('cs_shared_1')), true,
    'the Preview deployment must have its own claim, not production\'s');
  await inEnv('preview', () => db.releaseClaims('evt_1', 'cs_shared_1'));

  assert.equal(await inEnv('production', () => db.claimSession('cs_shared_1')), false,
    'DEFECT: a Preview release removed the claim production holds, so a live sale could be fulfilled twice');
});

test('every Redis command a Preview deployment sends is scoped to preview:', async () => {
  strings.set('preview:partner:reg:ACME', partnerRecord());
  const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
  const quiet = async (fn) => { // recordWithheldSale prints an operator alert to stderr by design
    const orig = console.error;
    console.error = () => {};
    try { return await fn(); } finally { console.error = orig; }
  };

  await inEnv('preview', async () => {
    // entitlements: grant, read, refund, restore
    await db.grantEntitlement(EMAIL, [SLUG], 'cs_test_1');
    await db.getEntitlement(EMAIL);
    await db.isEntitled(EMAIL, SLUG);
    await db.isSessionRevoked(EMAIL, 'cs_test_1');
    await db.sessionAlreadyFulfilled(EMAIL, 'cs_test_1', SLUG);
    await db.revokeEntitlement(EMAIL, [SLUG], 'cs_test_1', { refunded: true });
    await db.grantEntitlement(EMAIL, [SLUG], 'cs_test_9');
    await db.revokeEntitlement(EMAIL, [SLUG], 'cs_test_9');
    await db.restoreEntitlement(EMAIL, [SLUG], 'cs_test_9');
    // rate limiter (the first hit creates the counter with SET NX EX, the second counts it with INCR) and webhook claims
    assert.equal(await db.rateLimit('demo:203.0.113.9', 1, 60), true);
    assert.equal(await db.rateLimit('demo:203.0.113.9', 1, 60), false);
    await db.claimEvent('evt_1');
    await db.claimSession('cs_test_1');
    await db.releaseClaims('evt_1', 'cs_test_1');
    // partner ledger
    const sale = { code: 'ACME', amountGross: 1490000, commissionRate: 10, currency: 'USD' };
    await db.recordCommission({ ...sale, stripeSessionId: 'cs_test_1' });
    await db.listCommissions('ACME');
    await db.getPartnerStats('ACME');
    await db.approveCommission('cs_test_1', { force: true });
    await db.markCommissionPaid('cs_test_1', 'PAYOUT-1');
    await db.recordCommission({ ...sale, stripeSessionId: 'cs_test_3' });
    await db.reverseCommission('cs_test_3', 'refund');
    await db.restoreCommission('cs_test_3', 'dispute-won');
    // withheld sale and inbound leads
    await quiet(() => db.recordWithheldSale({ sessionId: 'cs_test_2', reason: 'sandbox', source: 'webhook' }));
    await db.saveLead('demo', { name: 'Test' });
    await db.listLeads('demo');
    // continuous certification
    const cert = await db.issueCertification({ email: EMAIL, slug: SLUG, tier: 'L4', subscriptionId: 'sub_1', currentPeriodEnd: exp });
    await db.getCertification(cert.certificateId);
    await db.getCertificationBySubscription('sub_1');
    await db.getCertificationForHolder(EMAIL, SLUG);
    await db.renewCertification('sub_1', exp);
    await db.markCertificationPastDue('sub_1');
    await db.lapseCertification('sub_1');
  });

  assert.ok(log.length > 40, `the sweep only sent ${log.length} commands`);
  assert.deepEqual(log.filter((c) => !c.key.startsWith('preview:')), [],
    'DEFECT: a Preview deployment sent a command on an unprefixed (production) key');
  const used = new Set(log.map((c) => c.cmd));
  for (const cmd of ['GET', 'SET', 'DEL', 'INCR', 'EXPIRE', 'SADD', 'SMEMBERS', 'LPUSH', 'LRANGE']) {
    assert.ok(used.has(cmd), `the sweep no longer exercises ${cmd}, so it cannot vouch for it`);
  }
  assert.deepEqual([...strings.keys()].filter((k) => !k.startsWith('preview:')), [],
    'DEFECT: an unprefixed key was written during a Preview run');
});

test('lib/db.js talks to Redis from one place, so no command can skip the prefix', () => {
  const src = readFileSync(new URL('../lib/db.js', import.meta.url), 'utf8');
  assert.equal((src.match(/\bfetch\(/g) || []).length, 1,
    'a second fetch( in lib/db.js would bypass kv() and its namespace');
});

test('nothing else in api/ or lib/ reads the Redis credentials', () => {
  const offenders = [];
  for (const dir of ['../api/', '../lib/']) {
    const root = new URL(dir, import.meta.url);
    for (const rel of readdirSync(root, { recursive: true })) {
      if (!/\.(c|m)?js$/.test(rel) || rel.endsWith('lib/db.js') || rel === 'db.js') continue;
      const text = readFileSync(new URL(rel, root), 'utf8');
      if (/KV_REST_API|UPSTASH_REDIS|REDIS_URL|KV_URL/.test(text)) offenders.push(`${dir}${rel}`);
    }
  }
  assert.deepEqual(offenders, [], 'another module builds its own Redis client and would bypass the namespace');
});
