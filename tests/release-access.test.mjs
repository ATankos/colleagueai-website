/* tests/release-access.test.mjs — version-specific entitlements (certification gate G9, owner brief 10 Nov 2026).
 *
 * The rule: a perpetual licence covers the release that was bought, for good. A LATER release is available only
 * through Continuous Certification (every release while it is current; after it ends, the releases published on or
 * before the last paid day; nothing for a refunded certification). Buying an earlier version never unlocks later
 * certified releases by itself, and no rule here takes back the release that was bought.
 *
 * The policy is tested on synthetic release histories (no change to config/products.json), then the download
 * endpoint, the grant and the thank-you page are tested against the real product record. No network: KV is an
 * in-memory stub and Stripe is never reached.
 */
import test from 'node:test';
import assert from 'node:assert';
import { casReply } from './kv-cas-fake.mjs';

process.env.KV_REST_API_URL = 'http://kv.test';
process.env.KV_REST_API_TOKEN = 'test-token';
process.env.DOWNLOAD_TOKEN_SECRET = 'test-download-secret';
for (const k of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_ENDPOINT', 'R2_BUCKET_NAME', 'BLOB_STORE_ID', 'BLOB_READ_WRITE_TOKEN', 'VERCEL_ENV']) delete process.env[k];

const store = new Map();
global.fetch = async (url, init) => {
  if (init?.method === 'POST') return { ok: true, json: async () => ({ result: casReply(store, JSON.parse(init.body)) }) };
  const [cmd, ...args] = String(url).replace('http://kv.test/', '').split('/').map(decodeURIComponent);
  let result = null;
  if (cmd === 'GET') result = store.has(args[0]) ? store.get(args[0]) : null;
  else if (cmd === 'SET') { store.set(args[0], args.slice(1).join('/')); result = 'OK'; }
  return { ok: true, json: async () => ({ result }) };
};

const access = await import('../lib/releaseAccess.js');
const products = await import('../lib/products.js');
const db = await import('../lib/db.js');
const { signDownload, openDownload } = await import('../lib/downloadToken.js');
const download = (await import('../api/download.js')).default;
const { deliveryHtml } = await import('../api/success.js');

const SLUG = 'contract-intelligence-and-register';
const OLD_SLUG = 'contract-summarisation-agent';
const DAY = 86400000;

// A synthetic history: 1.0.3.2 sold first, 1.1.0 released later as a certified release.
const PRODUCT = {
  legacyEntitlementVersion: '1.0.3.2',
  previousReleases: [{ version: '1.0.3.2', package: 'CAI-L4-CI-001_1.0.3.2.zip', sha256: 'a'.repeat(64), releasedAt: '2026-11-09' }],
  release: { version: '1.1.0', package: 'CAI-L4-CI-001_1.1.0.zip', sha256: 'b'.repeat(64), releasedAt: '2027-03-01' },
};
const NOW = Date.parse('2027-03-15T12:00:00Z');
const bought = (versions) => ({
  email: 'b@example.com',
  slugs: [SLUG],
  sessionSlugs: Object.fromEntries(Object.keys(versions).map((sid) => [sid, [SLUG]])),
  sessionReleases: Object.fromEntries(Object.entries(versions).map(([sid, v]) => [sid, { [SLUG]: v }])),
});
const versionsOf = (args) => access.releasesAvailable({ product: PRODUCT, slug: SLUG, now: NOW, ...args }).map((r) => r.version);
const cert = (fields) => ({ certificateId: 'CAI-L4-TEST', agentSlug: SLUG, status: 'active', validUntil: new Date(NOW + 20 * DAY).toISOString(), ...fields });

// ── Policy ───────────────────────────────────────────────────────────────────

test('a perpetual buyer of 1.0.3.2 keeps 1.0.3.2 and does not get the later 1.1.0 without certification', () => {
  const ent = bought({ cs_1: '1.0.3.2' });
  assert.deepEqual(versionsOf({ entitlement: ent }), ['1.0.3.2']);
  assert.equal(access.releaseToDeliver({ product: PRODUCT, entitlement: ent, slug: SLUG, now: NOW }).version, '1.0.3.2');
});

test('an active, in-term certification adds every later release; the release bought stays', () => {
  const ent = bought({ cs_1: '1.0.3.2' });
  assert.deepEqual(versionsOf({ entitlement: ent, certification: cert({}) }), ['1.0.3.2', '1.1.0']);
  assert.equal(access.releaseToDeliver({ product: PRODUCT, entitlement: ent, slug: SLUG, certification: cert({}), now: NOW }).version, '1.1.0');
});

test('after a lapse, releases published on or before the last paid day stay; later ones do not', () => {
  const ent = bought({ cs_1: '1.0.3.2' });
  const endedBefore = cert({ status: 'lapsed', lapseReason: 'canceled', validUntil: '2027-02-01T00:00:00Z' });
  const endedAfter = cert({ status: 'lapsed', lapseReason: 'canceled', validUntil: '2027-03-10T00:00:00Z' });
  assert.deepEqual(versionsOf({ entitlement: ent, certification: endedBefore }), ['1.0.3.2'], '1.1.0 came out after the paid term');
  assert.deepEqual(versionsOf({ entitlement: ent, certification: endedAfter }), ['1.0.3.2', '1.1.0'], '1.1.0 came out while paid');
});

test('an active certificate past its term counts as lapsed at its end date, not as current', () => {
  const ent = bought({ cs_1: '1.0.3.2' });
  const outOfTerm = cert({ status: 'active', validUntil: '2027-02-15T00:00:00Z' });
  assert.deepEqual(versionsOf({ entitlement: ent, certification: outOfTerm }), ['1.0.3.2']);
});

test('a failed payment (past due) covers releases up to the paid-through day only', () => {
  const ent = bought({ cs_1: '1.0.3.2' });
  assert.deepEqual(versionsOf({ entitlement: ent, certification: cert({ status: 'past_due', validUntil: '2027-02-20T00:00:00Z' }) }), ['1.0.3.2']);
  assert.deepEqual(versionsOf({ entitlement: ent, certification: cert({ status: 'past_due', validUntil: '2027-03-20T00:00:00Z' }) }), ['1.0.3.2', '1.1.0']);
});

test('a refunded certification covers nothing; the licence still gives the release bought', () => {
  const ent = bought({ cs_1: '1.0.3.2' });
  const refunded = cert({ status: 'lapsed', lapseReason: 'refunded', validUntil: '2027-04-01T00:00:00Z' });
  assert.deepEqual(versionsOf({ entitlement: ent, certification: refunded }), ['1.0.3.2']);
});

test('certification is never sold alone: without a licence, an active certificate gives no release', () => {
  assert.deepEqual(versionsOf({ entitlement: null, certification: cert({}) }), []);
  const refundedLicence = { ...bought({ cs_1: '1.0.3.2' }), slugs: [], revokedSessionIds: ['cs_1'] };
  assert.deepEqual(versionsOf({ entitlement: refundedLicence, certification: cert({}) }), []);
});

test('two purchases of two releases give both; refunding the later one keeps the earlier one', () => {
  const ent = bought({ cs_1: '1.0.3.2', cs_2: '1.1.0' });
  assert.deepEqual(versionsOf({ entitlement: ent }), ['1.0.3.2', '1.1.0']);
  assert.deepEqual(versionsOf({ entitlement: { ...ent, revokedSessionIds: ['cs_2'] } }), ['1.0.3.2']);
});

test('a corrective release for the version bought goes to its buyers without certification; a feature release does not', () => {
  const withFix = {
    ...PRODUCT,
    previousReleases: [...PRODUCT.previousReleases, { version: '1.0.3.3', package: 'CAI-L4-CI-001_1.0.3.3.zip', releasedAt: '2026-12-01', correctiveFor: ['1.0.3.2'] }],
  };
  const ent = bought({ cs_1: '1.0.3.2' });
  const list = access.releasesAvailable({ product: withFix, entitlement: ent, slug: SLUG, now: NOW }).map((r) => r.version);
  assert.deepEqual(list, ['1.0.3.2', '1.0.3.3'], 'the defect fix is part of the licence; 1.1.0 is not');
  const refunded = { ...ent, slugs: [], revokedSessionIds: ['cs_1'] };
  assert.deepEqual(access.releasesAvailable({ product: withFix, entitlement: refunded, slug: SLUG, now: NOW }), [], 'no licence, no fix');
});

test('records written before version pinning count as the legacy release, and the operator grant as the current one', () => {
  assert.deepEqual(versionsOf({ entitlement: { email: 'x@example.com', slugs: [OLD_SLUG], stripeSessionIds: ['cs_old'] } }), ['1.0.3.2'], 'no sessionSlugs');
  assert.deepEqual(versionsOf({ entitlement: { slugs: [SLUG], sessionSlugs: { cs_old: [SLUG] } } }), ['1.0.3.2'], 'no sessionReleases');
  assert.deepEqual(versionsOf({ entitlement: { slugs: ['*'] } }), ['1.1.0'], 'operator grant');
  const noLegacySet = { ...PRODUCT, legacyEntitlementVersion: undefined };
  assert.equal(access.legacyVersion(noLegacySet), '1.0.3.2', 'without the setting: the earliest listed release');
});

test('the release a session bought: its recorded metadata when that release is listed, else the current release', () => {
  assert.equal(access.releaseVersionForSession({ metadata: { release: '1.0.3.2' } }, PRODUCT), '1.0.3.2');
  assert.equal(access.releaseVersionForSession({ metadata: { release: '9.9' } }, PRODUCT), '1.1.0');
  assert.equal(access.releaseVersionForSession({ metadata: {} }, PRODUCT), '1.1.0');
});

test('release history: oldest first, current record wins, malformed entries ignored, versions compared numerically', () => {
  const list = products.productReleases({ ...PRODUCT, previousReleases: [...PRODUCT.previousReleases, { version: '1.1.0', package: 'stale.zip' }, { version: 'x', package: 'bad.zip' }] });
  assert.deepEqual(list.map((r) => [r.version, r.package]), [['1.0.3.2', 'CAI-L4-CI-001_1.0.3.2.zip'], ['1.1.0', 'CAI-L4-CI-001_1.1.0.zip']]);
  assert.equal(products.compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(products.compareVersions('1.1', '1.1.0'), 0);
});

// ── Grant, download and thank-you page against the real product record ────────

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.redirect = (c, u) => { r.statusCode = c; r.headers.location = u; return r; };
  return r;
}
async function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const STORAGE = { RELEASE_TEST_DELIVERY: '1', R2_ACCESS_KEY_ID: 'AKIATEST', R2_SECRET_ACCESS_KEY: 's', R2_PUBLIC_ENDPOINT: 'https://r2.example.test', R2_BUCKET_NAME: 'bk' };
const CURRENT = products.productFor(SLUG).release;
async function requestPackage(email) {
  const tok = signDownload({ email, slug: SLUG, file: CURRENT.package, ttlSeconds: 300 });
  const res = mockRes();
  await download({ method: 'GET', query: { t: tok.t } }, res);
  return res;
}

test('grant records the release each purchase bought, once: a later grant of the same session cannot move it', async () => {
  const email = 'pin@example.com';
  const first = await db.grantEntitlement(email, [SLUG], 'cs_pin', { release: CURRENT.version });
  assert.deepEqual(first.sessionReleases, { cs_pin: { [SLUG]: CURRENT.version } });
  const again = await db.grantEntitlement(email, [SLUG], 'cs_pin', { release: '9.9.9' });
  assert.deepEqual(again.sessionReleases, { cs_pin: { [SLUG]: CURRENT.version } }, 'first recorded version is kept');
  assert.equal(again.updatedAt, first.updatedAt, 'a repeat grant writes nothing');
});

test('download: the buyer of the current release gets its package', () => withEnv(STORAGE, async () => {
  const email = 'current@example.com';
  await db.grantEntitlement(email, [SLUG], 'cs_cur', { release: CURRENT.version });
  const res = await requestPackage(email);
  assert.equal(res.statusCode, 302);
  assert.match(res.headers.location, new RegExp(`/agents/${SLUG}/${CURRENT.package.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
}));

test('download: a buyer of an earlier release is refused the later package without certification, and gets it with one', () => withEnv(STORAGE, async () => {
  const email = 'earlier@example.com';
  await db.grantEntitlement(email, [SLUG], 'cs_early', { release: '1.0.3.1' }); // bought before the current release
  const refused = await requestPackage(email);
  assert.equal(refused.statusCode, 403);
  assert.equal(refused.body.code, 'release_not_covered');

  await db.issueCertification({ email, slug: SLUG, tier: 'L4', subscriptionId: 'sub_g9', currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86400, certifiedVersion: '1.0.3.1' });
  const allowed = await requestPackage(email);
  assert.equal(allowed.statusCode, 302, 'an active certification covers the later release');

  await db.lapseCertification('sub_g9', 'refunded');
  const afterRefund = await requestPackage(email);
  assert.equal(afterRefund.statusCode, 403, 'a refunded certification covers nothing');
}));

test('download: a lapsed certificate keeps releases published while it was paid, and the release bought is never touched', () => withEnv(STORAGE, async () => {
  const email = 'lapsed@example.com';
  await db.grantEntitlement(email, [SLUG], 'cs_lapsed', { release: CURRENT.version });
  await db.issueCertification({ email, slug: SLUG, tier: 'L4', subscriptionId: 'sub_lapse', currentPeriodEnd: Math.floor(Date.now() / 1000) - 86400, certifiedVersion: CURRENT.version });
  await db.lapseCertification('sub_lapse', 'canceled');
  const res = await requestPackage(email);
  assert.equal(res.statusCode, 302, 'the release bought stays downloadable after the certification ends');
}));

test('thank-you page: shows the release given to it, and no package link when the buyer has none', () => withEnv({ RELEASE_TEST_DELIVERY: '1' }, async () => {
  const links = (html) => [...html.matchAll(/href="\/api\/download\?t=([A-Za-z0-9_-]+)"/g)].map((m) => openDownload(m[1]).file);
  assert.deepEqual(links(deliveryHtml('b@example.com', SLUG, 'en', CURRENT)), [CURRENT.package, 'dossier.pdf']);
  const none = deliveryHtml('b@example.com', SLUG, 'en', null);
  assert.doesNotMatch(none, /\.zip/);
  assert.deepEqual(links(none), ['dossier.pdf']);
}));
