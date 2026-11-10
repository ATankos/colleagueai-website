/* tests/product-release.test.mjs — the purchased product is the released product.
 *
 * Guards the pre-launch audit findings for the first L4 product
 * (ColleagueAI Contract Intelligence & Register, SKU CAI-L4-CI-001):
 *   - the success page links the versioned release package, not the dossier PDF;
 *   - the download endpoint accepts that package and never substitutes a placeholder
 *     PDF for it when object storage is missing;
 *   - a live Stripe key cannot sell a release that is not approved for sale;
 *   - the retired name and slug are gone from the built site, the old URLs redirect,
 *     and the dossier that replaced the old one exists.
 * No network, no credentials: KV is stubbed in memory and Stripe is never reached.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { casReply } from './kv-cas-fake.mjs';
import { join } from 'node:path';

process.env.KV_REST_API_URL = 'http://kv.test';
process.env.KV_REST_API_TOKEN = 'test-token';
process.env.DOWNLOAD_TOKEN_SECRET = 'test-download-secret';
for (const k of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_ENDPOINT', 'R2_BUCKET_NAME', 'BLOB_STORE_ID', 'BLOB_READ_WRITE_TOKEN']) delete process.env[k];

const store = new Map();
global.fetch = async (url, init) => {
  // entitlement changes are an EVAL compare-and-set, posted as a JSON command (see tests/kv-cas-fake.mjs)
  if (init?.method === 'POST') return { ok: true, json: async () => ({ result: casReply(store, JSON.parse(init.body)) }) };
  const [cmd, ...args] = String(url).replace('http://kv.test/', '').split('/').map(decodeURIComponent);
  let result = null;
  if (cmd === 'GET') result = store.has(args[0]) ? store.get(args[0]) : null;
  else if (cmd === 'SET') { store.set(args[0], args.slice(1).join('/')); result = 'OK'; }
  return { ok: true, json: async () => ({ result }) };
};

const ROOT = new URL('..', import.meta.url).pathname;
const SLUG = 'contract-intelligence-and-register';
const PRODUCTS = JSON.parse(readFileSync(join(ROOT, 'config/products.json'), 'utf8'));
const product = PRODUCTS[SLUG];

const db = await import('../lib/db.js');
const { signDownload, openDownload } = await import('../lib/downloadToken.js');
const products = await import('../lib/products.js');
const storage = await import('../lib/storage.js');
const download = (await import('../api/download.js')).default;
const checkout = (await import('../api/checkout.js')).default;
const { deliveryHtml } = await import('../api/success.js');

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

test('every product record maps to a catalogue slug with the same tier', () => {
  const tierMap = JSON.parse(readFileSync(join(ROOT, 'api/checkout.js'), 'utf8').match(/const SLUG_TIER = (\{[\s\S]*?\});/)[1]);
  for (const slug of products.slugsWithProducts()) {
    assert.ok(tierMap[slug], `config/products.json has ${slug}, which the catalogue does not sell`);
    assert.equal(tierMap[slug], PRODUCTS[slug].tier, `${slug}: tier in products.json differs from the catalogue`);
  }
  assert.equal(product.sku, 'CAI-L4-CI-001');
  assert.equal(product.name, 'ColleagueAI Contract Intelligence & Register');
});

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const restore = () => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
  let out;
  try { out = fn(); } catch (e) { restore(); throw e; }
  if (out && typeof out.then === 'function') return out.finally(restore);
  restore();
  return out;
}

/* The download links a success page renders, each opened with the server's own key: the file
   and buyer each link would serve, in page order. */
function linksIn(html) {
  return [...html.matchAll(/href="\/api\/download\?t=([A-Za-z0-9_-]+)"/g)].map((m) => openDownload(m[1]));
}

test('success page, test delivery on: links the versioned release package, with the dossier as a secondary link', () => withEnv({ RELEASE_TEST_DELIVERY: '1' }, () => {
  const html = deliveryHtml('buyer@example.com', SLUG);
  const pkg = product.release.package;
  assert.deepEqual(linksIn(html).map((c) => c.file), [pkg, 'dossier.pdf'], 'package link first, dossier secondary');
  assert.match(html, new RegExp(product.release.version.replace(/\./g, '\\.')), 'version is shown to the buyer');
  assert.match(html, /START-HERE/, 'buyer is pointed at START-HERE first');
}));

test('success page, unapproved release without test delivery: no package link, dossier only', () => withEnv({ RELEASE_TEST_DELIVERY: undefined }, () => {
  const html = deliveryHtml('buyer@example.com', SLUG);
  assert.doesNotMatch(html, /\.zip/);
  assert.deepEqual(linksIn(html).map((c) => c.file), ['dossier.pdf']);
  assert.match(html, /not yet available for download/);
}));

test('agents without a release package keep the existing dossier link', () => {
  const html = deliveryHtml('buyer@example.com', 'onboarding-agent');
  assert.deepEqual(linksIn(html).map((c) => c.file), ['dossier.pdf']);
  assert.doesNotMatch(html, /\.zip/);
});

test('download links carry no buyer email, in clear or encoded form, yet still identify the buyer to the server', () => withEnv({ RELEASE_TEST_DELIVERY: '1' }, () => {
  const html = deliveryHtml('Buyer.Name@Example.com', SLUG);
  assert.doesNotMatch(html, /buyer\.name|example\.com|%40/i, 'the email must not appear in the page');
  const links = linksIn(html);
  assert.ok(links.length > 0);
  assert.ok(links.every((c) => c.ok && c.email === 'buyer.name@example.com'), 'the sealed token must carry the buyer');
}));

test('download: the release package is accepted for its slug only', () => {
  assert.ok(products.allowedFilesFor(SLUG).includes(product.release.package));
  assert.ok(!products.allowedFilesFor('onboarding-agent').includes(product.release.package));
});

async function requestFile(slug, file) {
  const email = 'buyer@example.com';
  await db.grantEntitlement(email, [slug], 'cs_release_' + slug + '_' + file);
  const tok = signDownload({ email, slug, file, ttlSeconds: 300 });
  const res = mockRes();
  await download({ method: 'GET', query: { t: tok.t } }, res);
  return res;
}
const requestPackage = (slug = SLUG) => requestFile(slug, product.release.package);

test('download: an unapproved release is withheld from an entitled buyer unless test delivery is on', () => withEnv({ RELEASE_TEST_DELIVERY: undefined }, async () => {
  const res = await requestPackage();
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'release_not_approved');
}));

test('download: without object storage a package request fails loudly instead of returning a placeholder', () => withEnv({ RELEASE_TEST_DELIVERY: '1' }, async () => {
  const res = await requestPackage();
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'package_storage_not_configured');
  assert.notEqual(res.headers['content-type'], 'application/pdf');
}));

test('download: with only R2 configured and test delivery on, the package redirects to its signed R2 object', () => withEnv({
  RELEASE_TEST_DELIVERY: '1', R2_ACCESS_KEY_ID: 'AKIATEST', R2_SECRET_ACCESS_KEY: 'secret', R2_PUBLIC_ENDPOINT: 'https://r2.example.test', R2_BUCKET_NAME: 'bk',
}, async () => {
  const res = await requestPackage();
  assert.equal(res.statusCode, 302);
  const loc = new URL(res.headers.location);
  assert.equal(loc.pathname, `/bk/agents/${SLUG}/${product.release.package}`);
  assert.ok(loc.searchParams.get('X-Amz-Signature'), 'URL must be signed');
}));

test('download: with a private Vercel Blob store, the package redirects to a presigned GET for its own object only', () => withEnv({
  RELEASE_TEST_DELIVERY: '1', BLOB_STORE_ID: 'store_test', R2_ACCESS_KEY_ID: 'AKIATEST', R2_SECRET_ACCESS_KEY: 's', R2_PUBLIC_ENDPOINT: 'https://r2.example.test', R2_BUCKET_NAME: 'bk',
}, async () => {
  const calls = [];
  storage.__setBlobSdkForTests({
    issueSignedToken: async (o) => { calls.push(['token', o]); return { delegationToken: 'd', clientSigningToken: 'c', validUntil: o.validUntil }; },
    presignUrl: async (t, o) => { calls.push(['sign', o]); return { presignedUrl: `https://store.private.blob.vercel-storage.com/${o.pathname}?vercel-blob-signature=x` }; },
  });
  try {
    assert.equal(storage.storageDriver(), 'blob', 'Blob takes precedence over R2 when both are configured');
    const res = await requestPackage();
    assert.equal(res.statusCode, 302);
    const key = `agents/${SLUG}/${product.release.package}`;
    assert.equal(new URL(res.headers.location).pathname, '/' + key);
    const [tok, sig] = calls;
    assert.deepEqual(tok[1].operations, ['get'], 'token is GET-only');
    assert.equal(tok[1].pathname, key, 'token is scoped to this one object');
    assert.equal(sig[1].access, 'private');
    assert.ok(tok[1].validUntil - Date.now() <= 900 * 1000 + 5000, 'link lives at most ~15 minutes');
  } finally {
    storage.__setBlobSdkForTests(null);
  }
}));

test('download: with storage configured, the dossier goes to the public dossier page, not to storage', () => withEnv({ BLOB_STORE_ID: 'store_test' }, async () => {
  const email = 'buyer@example.com';
  await db.grantEntitlement(email, [SLUG], 'cs_dossier');
  const tok = signDownload({ email, slug: SLUG, file: 'dossier.pdf', ttlSeconds: 300 });
  const res = mockRes();
  await download({ method: 'GET', query: { t: tok.t } }, res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, `/docs/agents/${SLUG}.pdf`);
}));

test('download: the release package of one product cannot be requested under another slug', async () => {
  const email = 'buyer@example.com';
  await db.grantEntitlement(email, ['onboarding-agent'], 'cs_other_1');
  const file = product.release.package;
  const tok = signDownload({ email, slug: 'onboarding-agent', file, ttlSeconds: 300 });
  const res = mockRes();
  await download({ method: 'GET', query: { t: tok.t } }, res);
  assert.equal(res.statusCode, 400);
});

test('download: a tampered token is refused as bad, and an expired one as expired', () => withEnv({ RELEASE_TEST_DELIVERY: '1' }, async () => {
  await db.grantEntitlement('buyer@example.com', [SLUG], 'cs_tamper');
  const good = signDownload({ email: 'buyer@example.com', slug: SLUG, file: 'dossier.pdf', ttlSeconds: 300 }).t;
  // Change a character inside the sealed bytes (not the final one, whose low bits can be padding).
  const i = 40;
  const flipped = good.slice(0, i) + (good[i] === 'A' ? 'B' : 'A') + good.slice(i + 1);
  const bad = mockRes();
  await download({ method: 'GET', query: { t: flipped } }, bad);
  assert.equal(bad.statusCode, 403);
  assert.equal(bad.body.reason, 'bad-token');

  const expired = signDownload({ email: 'buyer@example.com', slug: SLUG, file: 'dossier.pdf', ttlSeconds: -5 }).t;
  const old = mockRes();
  await download({ method: 'GET', query: { t: expired } }, old);
  assert.equal(old.statusCode, 403);
  assert.equal(old.body.reason, 'expired');
}));

test('download: a request with no token, or the old email-and-signature form, is refused', () => withEnv({ RELEASE_TEST_DELIVERY: '1' }, async () => {
  const none = mockRes();
  await download({ method: 'GET', query: {} }, none);
  assert.equal(none.statusCode, 403);
  assert.equal(none.body.reason, 'missing-token');
  const legacy = mockRes();
  await download({ method: 'GET', query: { email: 'buyer@example.com', slug: SLUG, file: 'dossier.pdf', exp: '9999999999', sig: 'deadbeef' } }, legacy);
  assert.equal(legacy.statusCode, 403, 'an email-addressed link must not be honoured');
}));

test('download: the connect package of an unapproved release is withheld too, unless test delivery is on', () => withEnv({ RELEASE_TEST_DELIVERY: undefined }, async () => {
  const res = await requestFile(SLUG, 'connect-package.zip');
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'release_not_approved');
}));

test('download: the connect package of an agent with no release record is not held back by the release gate', () => withEnv({ RELEASE_TEST_DELIVERY: undefined }, async () => {
  const res = await requestFile('onboarding-agent', 'connect-package.zip');
  assert.notEqual(res.body?.code, 'release_not_approved');
}));

test('checkout: live keys (sk_live_ and rk_live_) cannot sell an unapproved release; test keys can', async () => {
  assert.equal(product.saleApproved, false, 'release 1.0.3.2 is a controlled test release, not approved for sale');
  for (const key of ['sk_live_not_a_real_key', 'rk_live_not_a_real_key']) {
    await withEnv({ STRIPE_SECRET_KEY: key, CHECKOUT_ENABLED: undefined }, async () => {
      const res = mockRes();
      await checkout({ method: 'GET', query: { agent: SLUG }, headers: { host: 'example.test' } }, res);
      assert.equal(res.statusCode, 403, key);
      assert.equal(res.body.code, 'not_approved_for_sale');
    });
  }
  assert.equal(products.liveSaleBlocked(SLUG, 'sk_test_x'), false, 'test-mode purchase must remain possible');
  assert.equal(products.liveSaleBlocked('onboarding-agent', 'sk_live_x'), true, 'a catalogue agent with no approved record is refused for live sales (default-deny)');
  assert.equal(products.liveSaleBlocked(undefined, 'sk_live_x'), true, 'a missing slug is refused for live sales');
  assert.equal(products.liveSaleBlocked('onboarding-agent', 'sk_test_x'), false, 'test-mode checkout of a catalogue agent keeps working');
  assert.equal(products.liveRestoreRefused('onboarding-agent', true), false, 'a won dispute on a purchase made before the rule still restores access (not a sale)');
  assert.equal(products.liveRestoreRefused(SLUG, true), true, 'a won dispute on an unapproved release with a record is not restored');
});

test('approval opens both gates: live sale allowed and package deliverable without the test flag', () => withEnv({ RELEASE_TEST_DELIVERY: undefined }, () => {
  const rec = products.productFor(SLUG);
  rec.saleApproved = true;
  try {
    assert.equal(products.liveSaleBlocked(SLUG, 'sk_live_x'), false);
    assert.equal(products.packageDeliverable(SLUG), true);
  } finally {
    rec.saleApproved = false;
  }
}));

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(html|txt|xml|json)$/.test(n)) out.push(p);
  }
  return out;
}

test('built site: the retired name and slug are gone and the new name is published', { skip: !existsSync(join(ROOT, 'dist')) && 'run npm run build first' }, () => {
  const offenders = [];
  let named = 0;
  for (const f of walk(join(ROOT, 'dist'))) {
    const s = readFileSync(f, 'utf8');
    if (/Contract Summari[sz]ation|contract-summari[sz]ation/.test(s)) offenders.push(f.replace(ROOT, ''));
    if (s.includes('Contract Intelligence &amp; Register') || s.includes('Contract Intelligence & Register')) named++;
  }
  assert.deepEqual(offenders, [], 'pages still carry the retired product name or slug');
  assert.ok(named > 10, 'the product name should appear across the catalogue, home and partner pages');
  assert.ok(existsSync(join(ROOT, 'dist/agents', SLUG + '.html')), 'factsheet page for the new slug is generated');
});

test('old URLs redirect permanently and the replacement dossier exists', () => {
  const v = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  const find = (src) => v.redirects.find((r) => r.source === src);
  assert.equal(find('/agents/contract-summarisation-agent')?.destination, `/agents/${SLUG}`);
  assert.equal(find('/docs/agents/contract-summarisation-agent.pdf')?.destination, `/docs/agents/${SLUG}.pdf`);
  for (const r of ['/agents/contract-summarisation-agent', '/docs/agents/contract-summarisation-agent.pdf']) assert.equal(find(r).permanent, true);
  assert.ok(existsSync(join(ROOT, 'public/docs/agents', SLUG + '.pdf')), 'replacement dossier PDF is missing');
});

// ── Retired slug keeps working (product rename migration) ────────────────────
const OLD_SLUG = 'contract-summarisation-agent';

test('alias: the retired slug resolves to the current product', () => {
  assert.equal(products.canonicalSlug(OLD_SLUG), SLUG);
  assert.equal(products.canonicalSlug('onboarding-agent'), 'onboarding-agent');
  assert.deepEqual(products.slugFamily(SLUG), [SLUG, OLD_SLUG]);
});

test('alias: an entitlement stored under the retired slug still downloads under both slugs', () => withEnv({ RELEASE_TEST_DELIVERY: undefined }, async () => {
  const email = 'legacy-buyer@example.com';
  store.set(`entitlement:${email}`, JSON.stringify({ email, slugs: [OLD_SLUG], stripeSessionIds: ['cs_legacy'] }));
  assert.equal(await db.isEntitled(email, SLUG), true);
  assert.equal(await db.isEntitled(email, OLD_SLUG), true);
  for (const slug of [OLD_SLUG, SLUG]) {
    const tok = signDownload({ email, slug, file: 'dossier.pdf', ttlSeconds: 300 });
    const res = mockRes();
    await download({ method: 'GET', query: { t: tok.t } }, res);
    assert.equal(res.statusCode, 200, `dossier under ${slug}`);
  }
}));

test('alias: new grants are stored under the current slug, and a refund revokes either form', async () => {
  const email = 'mixed-buyer@example.com';
  const ent = await db.grantEntitlement(email, [OLD_SLUG], 'cs_mixed');
  assert.deepEqual(ent.slugs, [SLUG]);
  store.set(`entitlement:${email}`, JSON.stringify({ email, slugs: [OLD_SLUG, 'onboarding-agent'], stripeSessionIds: ['cs_old'] }));
  const after = await db.revokeEntitlement(email, [SLUG], 'cs_old');
  assert.deepEqual(after.slugs, ['onboarding-agent']);
});

test('alias: old checkout links reach the current product (live key still blocked by the sale gate)', () => withEnv({ STRIPE_SECRET_KEY: 'sk_live_x', CHECKOUT_ENABLED: undefined }, async () => {
  const res = mockRes();
  await checkout({ method: 'GET', query: { agent: OLD_SLUG }, headers: { host: 'example.test' } }, res);
  assert.equal(res.statusCode, 403, 'resolved to the product (not 404 Unknown agent)');
  assert.equal(res.body.code, 'not_approved_for_sale');
}));

test('alias: a certificate stored under the retired slug is found by the current slug', async () => {
  const email = 'cert-holder@example.com';
  const keys = [...store.keys()];
  const cert = await db.issueCertification({ email, slug: OLD_SLUG, tier: 'L4', subscriptionId: 'sub_alias_1', currentPeriodEnd: 2000000000 });
  assert.equal(cert.agentSlug, SLUG, 'new certificates are issued under the current slug');
  const found = await db.getCertificationForHolder(email, OLD_SLUG);
  assert.equal(found?.certificateId, cert.certificateId);
  assert.ok(keys.length < store.size);
});

// ── Package availability per agent ───────────────────────────────────────────
const PKGCFG = JSON.parse(readFileSync(join(ROOT, 'config/packages.json'), 'utf8'));

test('packages: this product offers only the Copilot Studio package', () => {
  assert.deepEqual(PKGCFG.agents[SLUG], ['copilot-studio']);
});

test('packages: every agents page embeds the same per-agent map as config/packages.json', () => {
  const files = ['public/agents.html', ...readdirSync(join(ROOT, 'public')).flatMap((d) =>
    ['agents.html', 'agents/index.html'].map((f) => `public/${d}/${f}`))].filter((f) => existsSync(join(ROOT, f)));
  assert.ok(files.length >= 9);
  for (const f of files) {
    const m = readFileSync(join(ROOT, f), 'utf8').match(/\/\*CAI_PKG\*\/(\{.*?\})\/\*\/CAI_PKG\*\/;return m\[s\]\|\|(\[[^\]]*\])/);
    assert.ok(m, `${f}: package map missing`);
    assert.deepEqual(JSON.parse(m[1]), PKGCFG.agents, `${f}: package map drifted from config/packages.json`);
    assert.deepEqual(JSON.parse(m[2]), PKGCFG.default, `${f}: default packages drifted`);
  }
});

test('packages: generated factsheets list only the packages each agent offers', { skip: !existsSync(join(ROOT, 'dist/agents')) && 'run npm run build first' }, () => {
  const ours = readFileSync(join(ROOT, 'dist/agents', SLUG + '.html'), 'utf8');
  assert.match(ours, /Copilot Studio managed solution/);
  assert.doesNotMatch(ours, /Microsoft 365 Copilot package/);
  // A controlled-test release (installable, not yet on general sale) is labelled as such, not as a released package.
  const status = JSON.parse(readFileSync(join(ROOT, 'config/products.json'), 'utf8'))[SLUG].release.status;
  assert.match(ours, status === 'controlled-test' ? /<span class="chip">Controlled release<\/span>/ : /<span class="chip">Released package<\/span>/);
  const other = readFileSync(join(ROOT, 'dist/agents/onboarding-agent.html'), 'utf8');
  assert.doesNotMatch(other, /Microsoft 365 Copilot package|Copilot Studio managed solution|connect package/, 'a concept agent lists no installable package');
  assert.match(other, /Concept · dossier only/);
  assert.match(other, /no installable package exists yet/);
});

test('success page: every catalogue agent gets the branded delivery card with its name, CAI tier and a signed download', () => withEnv({ RELEASE_TEST_DELIVERY: '1', DOWNLOAD_TOKEN_SECRET: 'test-only-secret' }, () => {
  const tierMap = JSON.parse(readFileSync(join(ROOT, 'api/checkout.js'), 'utf8').match(/const SLUG_TIER = (\{[\s\S]*?\});/)[1]);
  const slugs = Object.keys(tierMap);
  assert.ok(slugs.length >= 36, 'catalogue map unexpectedly small');
  for (const slug of slugs) {
    const html = deliveryHtml('buyer@example.com', slug);
    assert.match(html, /class="o-card"/, `${slug}: branded card`);
    assert.match(html, new RegExp(`CAI ${tierMap[slug]}`), `${slug}: CAI tier badge`);
    assert.match(html, /class="o-btn o-btn-p"/, `${slug}: primary download button`);
    const links = linksIn(html);
    assert.ok(links.length > 0 && links.every((c) => c.ok), `${slug}: download link is a valid sealed token`);
    assert.ok(links.every((c) => c.slug === slug), `${slug}: download is for this agent`);
    assert.doesNotMatch(html, /your agent<\/h2>|undefined|null/, `${slug}: no placeholder text`);
  }
}));

test('success page assets: styles and script are served as files (the CSP blocks inline ones)', () => {
  const src = readFileSync(join(ROOT, 'api/success.js'), 'utf8');
  assert.match(src, /href="\/order\.css"/);
  assert.match(src, /src="\/order\.js"/);
  assert.doesNotMatch(src, /<style>|<style\s+[a-z]/, 'no inline <style>: the site CSP blocks it');
  assert.ok(existsSync(join(ROOT, 'public/order.css')) && existsSync(join(ROOT, 'public/order.js')));
});

const orderI18n = await import('../lib/orderI18n.js');

test('order page i18n: every locale has every string, and paths match i18n.routes.json', () => {
  const { ORDER_LOCALES, ORDER_STRINGS, AGENTS_PATH, PRIVACY_PATH, TIER_NAMES } = orderI18n;
  const routes = JSON.parse(readFileSync(join(ROOT, 'i18n.routes.json'), 'utf8'));
  assert.deepStrictEqual([...ORDER_LOCALES].sort(), [...routes.locales].sort(), 'same locales as the site');
  const keys = Object.keys(ORDER_STRINGS.en);
  for (const l of ORDER_LOCALES) {
    assert.deepStrictEqual(Object.keys(ORDER_STRINGS[l]).sort(), [...keys].sort(), `${l}: same keys as en`);
    for (const k of keys) {
      if (l === 'en' && k === 'docs_en') continue;
      assert.ok(String(ORDER_STRINGS[l][k]).trim(), `${l}.${k} is empty`);
      assert.deepStrictEqual((ORDER_STRINGS[l][k].match(/\{\w+\}/g) || []).sort(), (ORDER_STRINGS.en[k].match(/\{\w+\}/g) || []).sort(), `${l}.${k}: placeholders`);
    }
    for (const t of ['L2', 'L3', 'L4', 'L5']) assert.ok(TIER_NAMES[l][t], `${l}: tier ${t}`);
    const agentsSlug = routes.slugs.agents[l];
    assert.strictEqual(AGENTS_PATH[l], l === 'en' ? '/agents' : `/${l}/${agentsSlug}`, `${l}: agents path`);
    assert.strictEqual(PRIVACY_PATH[l], l === 'en' ? '/privacy' : `/${l}/${routes.slugs.privacy[l]}`, `${l}: privacy path`);
  }
});

test('order page i18n: language comes from ?lang, then Accept-Language, then English', () => {
  const { pickOrderLang } = orderI18n;
  assert.strictEqual(pickOrderLang('cs', 'de-DE,de;q=0.9'), 'cs');
  assert.strictEqual(pickOrderLang('xx', 'de-DE,de;q=0.9,en;q=0.5'), 'de');
  assert.strictEqual(pickOrderLang('<script>', 'zh-CN'), 'en');
  assert.strictEqual(pickOrderLang(undefined, undefined), 'en');
});

test('order page i18n: delivery card is translated in every locale (buttons, tier name)', () => withEnv({ RELEASE_TEST_DELIVERY: '1', DOWNLOAD_TOKEN_SECRET: 'test-only-secret' }, () => {
  const { ORDER_LOCALES, ORDER_STRINGS, TIER_NAMES } = orderI18n;
  const esc = (s) => String(s).replace(/&/g, '&amp;');
  for (const l of ORDER_LOCALES) {
    const html = deliveryHtml('buyer@example.com', SLUG, l);
    assert.ok(html.includes(esc(ORDER_STRINGS[l].btn_pkg)), `${l}: download button`);
    assert.ok(html.includes(esc(ORDER_STRINGS[l].steps_h)), `${l}: next steps heading`);
    assert.ok(html.includes(esc(TIER_NAMES[l].L4)), `${l}: L4 tier name`);
    assert.deepEqual(linksIn(html).map((c) => c.file), [product.release.package, 'dossier.pdf'], `${l}: package first`);
    const other = deliveryHtml('buyer@example.com', 'onboarding-agent', l);
    assert.ok(other.includes(esc(ORDER_STRINGS[l].btn_doc)), `${l}: dossier button for other agents`);
  }
}));

test('checkout carries the storefront language to Stripe and to the thank-you page', () => {
  const src = readFileSync(join(ROOT, 'api/checkout.js'), 'utf8');
  assert.match(src, /locale: lang/, 'Stripe Checkout locale');
  assert.match(src, /api\/success\?session_id=\{CHECKOUT_SESSION_ID\}&lang=\$\{lang\}/, 'success_url carries lang');
  assert.match(src, /AGENTS_PATH\[lang\]\}\?purchase=cancelled/, 'cancel returns to the localized catalogue');
  const store = readFileSync(join(ROOT, 'public/agents.html'), 'utf8');
  assert.match(store, /&ref='\+ref\+'&lang='\+encodeURIComponent\(String\(document\.documentElement\.lang/, 'storefront buy link passes the page language');
});
