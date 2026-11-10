/**
 * tests/claims-truth.test.mjs - the site may only promise what exists (launch-readiness findings LR-03, LR-04).
 *
 * - The CAI Token Economy Monitor does not exist yet. No page may say a package includes it, or that a package
 *   "can include" it, in any of the 8 languages; the usage page and the Trust Center must call it planned.
 * - Only agents with a product record in config/products.json have a released package. Every other catalogue agent
 *   is a concept: it offers no installable package, its status is shown as such, and checkout refuses it in any mode.
 *
 * Usage: node --test tests/claims-truth.test.mjs   (the factsheet checks additionally need `npm run build`)
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRODUCTS = JSON.parse(readFileSync(join(ROOT, 'config/products.json'), 'utf8'));
const PACKAGES = JSON.parse(readFileSync(join(ROOT, 'config/packages.json'), 'utf8'));
const RELEASED = Object.keys(PRODUCTS).filter((k) => k !== '_comment');

function htmlFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'docs') htmlFiles(p, out); } else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const PUBLIC = htmlFiles(join(ROOT, 'public'));
const DIST = existsSync(join(ROOT, 'dist')) && statSync(join(ROOT, 'dist')).isDirectory() ? htmlFiles(join(ROOT, 'dist')) : [];

/* The retired promises, as they were worded in each language. Any of them on a page is a regression. */
const RETIRED = [
  'and a CAI Token Economy Monitor', 'token-economy indicators', 'token-economy monitoring,',
  'can include token-level usage intelligence', 'can include client-owned token economy monitoring',
  'Request access to the Token Monitor',
  'a CAI Monitor ekonomiky tokenů', 'může obsahovat tokenovou vrstvu', 'mohou zahrnovat monitorování ekonomiky tokenů',
  'und einen CAI Token-Ökonomie-Monitor', 'kann tokenbasierte Nutzungsintelligenz enthalten', 'können eine kundeneigene Token-Ökonomie',
  'et un moniteur CAI d’économie des tokens', 'peut inclure une intelligence d’usage', "peuvent inclure une surveillance de l'économie",
  'y un Monitor CAI de economía de tokens', 'puede incluir inteligencia de uso', 'pueden incluir una monitorización de la economía',
  'e un Monitor CAI dell’economia dei token', 'può includere intelligenza d’uso', "possono includere un monitoraggio dell'economia",
  'e um Monitor CAI de economia de tokens', 'pode incluir inteligência de utilização', 'podem incluir uma monitorização da economia',
  'oraz Monitor ekonomii tokenów CAI', 'może zawierać inteligencję użycia', 'mogą obejmować należące do klienta monitorowanie',
];

for (const [label, files] of [['committed pages', PUBLIC], ['built site', DIST]]) {
  test(`${label}: no page promises the Token Economy Monitor as part of a package`, { skip: !files.length && 'run npm run build first' }, () => {
    const bad = [];
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      for (const phrase of RETIRED) if (s.includes(phrase)) bad.push(`${f.slice(ROOT.length)}: "${phrase}"`);
    }
    assert.deepEqual(bad, []);
  });
}

test('the usage page and the Trust Center call the monitor planned', () => {
  const usage = readFileSync(join(ROOT, 'public/usage.html'), 'utf8');
  assert.match(usage, /Planned, not yet available: token-level usage intelligence/);
  assert.match(usage, /<title>[^<]*\(planned\)/);
  const trust = readFileSync(join(ROOT, 'public/trust.html'), 'utf8');
  assert.match(trust, /Planned, not yet available: client-owned token economy monitoring/);
});

test('concept agents offer no installable package; only released products list one', () => {
  assert.deepEqual(PACKAGES.default, [], 'a catalogue agent without a tested package must not inherit one');
  for (const slug of Object.keys(PACKAGES.agents)) assert.ok(RELEASED.includes(slug), `${slug} lists a package but has no product record`);
});

test('every agents page embeds the release-status map built from config/products.json', () => {
  const pages = PUBLIC.filter((f) => /[\\/]agents(\.html|[\\/]index\.html)$/.test(f));
  assert.ok(pages.length >= 9, `found ${pages.length} agents pages`);
  for (const f of pages) {
    const m = readFileSync(f, 'utf8').match(/\/\*CAI_AVAIL\*\/(\{.*?\})\/\*\/CAI_AVAIL\*\//);
    assert.ok(m, `${f}: release-status map missing`);
    assert.deepEqual(Object.keys(JSON.parse(m[1])).sort(), [...RELEASED].sort(), `${f}: status map drifted from config/products.json`);
    const s = readFileSync(f, 'utf8');
    assert.match(s, /caiStatusFor\(cur\.slug\)/, `${f}: pay panel does not show the release status`);
    assert.match(s, /caiStatusFor\(a\.n/, `${f}: drawer does not show the release status`);
  }
});

test('the pricing page does not list a Microsoft 365 Copilot package as included in every package', () => {
  const s = readFileSync(join(ROOT, 'public/pricing.html'), 'utf8');
  assert.doesNotMatch(s, /<li>Microsoft 365 Copilot package<\/li>/);
  assert.match(s, /Today one agent has a released package/);
});

test('checkout refuses a concept agent even with a test key', async () => {
  const saved = { k: process.env.STRIPE_SECRET_KEY, c: process.env.CHECKOUT_ENABLED };
  process.env.STRIPE_SECRET_KEY = 'sk_test_never_used';
  delete process.env.CHECKOUT_ENABLED;
  try {
    const { default: checkout } = await import('../api/checkout.js');
    const res = { statusCode: 200, headers: {}, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end(b) { this.body = b; return this; } };
    await checkout({ method: 'GET', query: { agent: 'onboarding-agent' }, headers: { host: 'shop.example.test' } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'not_available');
  } finally {
    if (saved.k === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = saved.k;
    if (saved.c !== undefined) process.env.CHECKOUT_ENABLED = saved.c;
  }
});
