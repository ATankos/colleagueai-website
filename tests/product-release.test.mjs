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
import { join } from 'node:path';

process.env.KV_REST_API_URL = 'http://kv.test';
process.env.KV_REST_API_TOKEN = 'test-token';
process.env.DOWNLOAD_TOKEN_SECRET = 'test-download-secret';
for (const k of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_ENDPOINT', 'R2_BUCKET_NAME']) delete process.env[k];

const store = new Map();
global.fetch = async (url) => {
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
const { signDownload } = await import('../lib/downloadToken.js');
const products = await import('../lib/products.js');
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

test('success page, test delivery on: links the versioned release package, with the dossier as a secondary link', () => withEnv({ RELEASE_TEST_DELIVERY: '1' }, () => {
  const html = deliveryHtml('buyer@example.com', SLUG);
  const pkg = product.release.package;
  assert.match(html, new RegExp(`file=${pkg.replace(/\./g, '\\.')}`), 'primary download must be the release package');
  assert.match(html, /file=dossier\.pdf/, 'dossier stays available as a secondary link');
  assert.ok(html.indexOf(`file=${pkg}`) < html.indexOf('file=dossier.pdf'), 'package link comes first');
  assert.match(html, new RegExp(product.release.version.replace(/\./g, '\\.')), 'version is shown to the buyer');
  assert.match(html, /START-HERE/, 'buyer is pointed at START-HERE first');
}));

test('success page, unapproved release without test delivery: no package link, dossier only', () => withEnv({ RELEASE_TEST_DELIVERY: undefined }, () => {
  const html = deliveryHtml('buyer@example.com', SLUG);
  assert.doesNotMatch(html, /\.zip/);
  assert.match(html, /file=dossier\.pdf/);
  assert.match(html, /not yet available for download/);
}));

test('agents without a release package keep the existing dossier link', () => {
  const html = deliveryHtml('buyer@example.com', 'onboarding-agent');
  assert.match(html, /file=dossier\.pdf/);
  assert.doesNotMatch(html, /\.zip/);
});

test('download: the release package is accepted for its slug only', () => {
  assert.ok(products.allowedFilesFor(SLUG).includes(product.release.package));
  assert.ok(!products.allowedFilesFor('onboarding-agent').includes(product.release.package));
});

async function requestPackage(slug = SLUG) {
  const email = 'buyer@example.com';
  await db.grantEntitlement(email, [slug], 'cs_release_' + slug);
  const file = product.release.package;
  const tok = signDownload({ email, slug, file, ttlSeconds: 300 });
  const res = mockRes();
  await download({ method: 'GET', query: { email, slug, file, exp: String(tok.exp), sig: tok.sig } }, res);
  return res;
}

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

test('download: with R2 configured and test delivery on, the package redirects to its signed R2 object', () => withEnv({
  RELEASE_TEST_DELIVERY: '1', R2_ACCESS_KEY_ID: 'AKIATEST', R2_SECRET_ACCESS_KEY: 'secret', R2_PUBLIC_ENDPOINT: 'https://r2.example.test', R2_BUCKET_NAME: 'bk',
}, async () => {
  const res = await requestPackage();
  assert.equal(res.statusCode, 302);
  const loc = new URL(res.headers.location);
  assert.equal(loc.pathname, `/bk/agents/${SLUG}/${product.release.package}`);
  assert.ok(loc.searchParams.get('X-Amz-Signature'), 'URL must be signed');
}));

test('download: the release package of one product cannot be requested under another slug', async () => {
  const email = 'buyer@example.com';
  await db.grantEntitlement(email, ['onboarding-agent'], 'cs_other_1');
  const file = product.release.package;
  const tok = signDownload({ email, slug: 'onboarding-agent', file, ttlSeconds: 300 });
  const res = mockRes();
  await download({ method: 'GET', query: { email, slug: 'onboarding-agent', file, exp: String(tok.exp), sig: tok.sig } }, res);
  assert.equal(res.statusCode, 400);
});

test('checkout: live keys (sk_live_ and rk_live_) cannot sell an unapproved release; test keys can', async () => {
  assert.equal(product.saleApproved, false, 'release 1.0.2.0 is a controlled test baseline, not approved for sale');
  for (const key of ['sk_live_not_a_real_key', 'rk_live_not_a_real_key']) {
    await withEnv({ STRIPE_SECRET_KEY: key, CHECKOUT_ENABLED: undefined }, async () => {
      const res = mockRes();
      await checkout({ method: 'GET', query: { agent: SLUG, terms: 'accepted' }, headers: { host: 'example.test' } }, res);
      assert.equal(res.statusCode, 403, key);
      assert.equal(res.body.code, 'not_approved_for_sale');
    });
  }
  assert.equal(products.liveSaleBlocked(SLUG, 'sk_test_x'), false, 'test-mode purchase must remain possible');
  assert.equal(products.liveSaleBlocked('onboarding-agent', 'sk_live_x'), false, 'catalogue agents without a release record are unaffected');
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
