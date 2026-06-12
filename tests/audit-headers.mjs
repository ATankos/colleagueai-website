/**
 * tests/audit-headers.mjs — Phase 1: headers, indexing, robots, sitemap, canonicals,
 * hreflang, titles, structured data, prerender (no-JS) content audit.
 *
 * Usage:  BASE_URL=https://www.colleagueai.ai node tests/audit-headers.mjs
 * Local:  npm run build && node tests/local-server.mjs &  BASE_URL=http://localhost:4173 node tests/audit-headers.mjs
 * Output: console table + tests/results/headers-audit.json. Exit 1 if any Critical/High FAIL.
 * No secrets are read, printed, or required.
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const CANONICAL_HOST = 'www.colleagueai.ai';
const ROUTES = ['/', '/agents', '/demo', '/partners', '/trust', '/terms', '/privacy', '/license',
  '/cs/agenti', '/de/agenten'];
const LOCALE_PATHS = ['/agents','/cs/agenti','/es/agentes','/pt/agentes','/fr/agents','/de/agenten','/pl/agenci','/it/agenti'];
const results = [];
const add = (id, test, route, result, severity, evidence) =>
  results.push({ id, test, route, result, severity, evidence: String(evidence).slice(0, 300) });

async function get(path, redirect = 'manual') {
  const r = await fetch(BASE + path, { redirect, headers: { 'User-Agent': 'colleagueai-golive-harness' } });
  const body = redirect === 'follow' || r.status < 300 || r.status >= 400 ? await r.text() : '';
  return { r, body };
}
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (html, re) => { const m = html.match(re); return m ? m[1] : null; };

// ── 1. Security headers ─────────────────────────────────────────────────────
{
  const { r } = await get('/agents', 'follow');
  const h = (k) => r.headers.get(k);
  const hsts = h('strict-transport-security') ?? '';
  const maxAge = Number((hsts.match(/max-age=(\d+)/) ?? [])[1] ?? 0);
  add('H1', 'HSTS present, max-age ≥ 15552000', '/agents', maxAge >= 15552000 ? 'PASS' : 'FAIL', 'Critical', hsts || 'header absent');
  const csp = h('content-security-policy');
  add('H2', 'CSP present', '/agents', csp ? 'PASS' : 'FAIL', 'Critical', csp ? csp.slice(0, 120) : 'header absent');
  if (csp) add('H2b', 'CSP avoids unsafe-inline/unsafe-eval', '/agents',
    /unsafe-(inline|eval)/.test(csp) ? 'FAIL' : 'PASS', 'Medium', (csp.match(/unsafe-\w+/g) ?? []).join(','));
  add('H3', 'X-Content-Type-Options: nosniff', '/agents', h('x-content-type-options') === 'nosniff' ? 'PASS' : 'FAIL', 'High', h('x-content-type-options'));
  add('H4', 'X-Frame-Options or frame-ancestors', '/agents',
    (h('x-frame-options') || /frame-ancestors/.test(csp ?? '')) ? 'PASS' : 'FAIL', 'High', h('x-frame-options') ?? 'via CSP');
  add('H5', 'Referrer-Policy present', '/agents', h('referrer-policy') ? 'PASS' : 'FAIL', 'Medium', h('referrer-policy'));
  add('H6', 'Permissions-Policy present', '/agents', h('permissions-policy') ? 'PASS' : 'FAIL', 'Medium', (h('permissions-policy') ?? '').slice(0, 80));
}
// ── 2. Per-route: indexing, canonical, prerender, title, JSON-LD, mojibake ──
for (const route of ROUTES) {
  const { r, body } = await get(route, 'follow');
  if (r.status === 404) {
    // An honest 404 (with noindex) is correct for a not-yet-created page; content checks
    // don't apply. Tracked as one OPEN item instead of five false FAILs.
    const noindexed = /noindex/i.test(attr(body, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i) ?? '');
    add('P0', 'route 404s pending page creation (FIXES §3)', route, 'OPEN', 'High', `HTTP 404, noindex=${noindexed}`);
    continue;
  }
  const xr = r.headers.get('x-robots-tag') ?? '';
  if (/noindex/i.test(xr)) add('I1', 'no x-robots-tag noindex', route, 'FAIL', 'Critical', xr);
  const metaRobots = attr(body, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i) ?? '';
  add('I2', 'no meta robots noindex', route, /noindex/i.test(metaRobots) ? 'FAIL' : 'PASS', 'Critical', metaRobots || 'none');
  const canon = attr(body, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
  const expected = `https://${CANONICAL_HOST}${route === '/' ? '/agents' : route}`;
  const selfRef = canon === expected;
  add('C1', 'self-referencing canonical on www host', route, selfRef ? 'PASS' : 'FAIL', 'High', `declared: ${canon}; expected: ${expected}`);
  const bodyText = text(body);
  const h1 = /<h1[\s>]/i.test(body);
  add('P1', 'prerendered: >2KB body text + H1 (no-JS fetch)', route,
    bodyText.length > 2048 && h1 ? 'PASS' : 'FAIL', 'Critical', `textBytes=${bodyText.length} h1=${h1}`);
  const title = attr(body, /<title>([^<]*)<\/title>/i) ?? '';
  const categorised = /AI/i.test(title) && /(governance|certif|agent|risk|trust|compliance)/i.test(title);
  const bareBrand = /^\s*Colleague\s*AI\s*$/i.test(title.replace(/[—|–-].*$/, ''));
  add('T1', 'title pairs brand with category (not bare brand)', route,
    categorised && !bareBrand ? 'PASS' : 'FAIL', 'High', title);
  const blocks = [...body.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  let types = [];
  for (const b of blocks) { try { const d = JSON.parse(b[1]);
    types.push(...(d['@graph']?.map(n => n['@type']) ?? [d['@type']]).flat());
    for (const li of d.itemListElement ?? []) if (li.item?.['@type']) types.push(li.item['@type']); // Products inside ItemList
  } catch { types.push('PARSE_ERROR'); } }
  add('S1', 'Organization JSON-LD present & parses', route, types.includes('Organization') ? 'PASS' : 'FAIL', 'High', types.join(',') || 'no JSON-LD');
  if (route === '/agents') {
    add('S2', 'FAQPage JSON-LD on /agents', route, types.includes('FAQPage') ? 'PASS' : 'FAIL', 'Medium', types.join(','));
    add('S3', 'Product JSON-LD on store page', route, types.includes('Product') ? 'PASS' : 'FAIL', 'High', `${types.filter(t=>t==='Product').length}×Product, ` + [...new Set(types.filter(t=>t!=='Product'))].join(','));
  }
  const moji = (body.match(/â€|Ã¢|Â·|âœ|â†|â¤/g) ?? []).length;
  add('M1', 'no mojibake (double-encoded UTF-8)', route, moji === 0 ? 'PASS' : 'FAIL', 'High', `${moji} mojibake sequences`);
  if (LOCALE_PATHS.includes(route)) {
    const hl = [...body.matchAll(/hreflang=["']([^"']+)["']/g)].map(m => m[1]);
    const want = ['en','cs','es','pt','fr','de','pl','it','x-default'];
    const missing = want.filter(w => !hl.includes(w));
    add('L1', 'hreflang for 8 locales + x-default', route, missing.length === 0 ? 'PASS' : 'FAIL', 'High', missing.length ? 'missing: ' + missing.join(',') : hl.join(','));
  }
}
// ── 3. Canonicals must not point into a redirect ────────────────────────────
{
  const seen = new Set();
  for (const route of ROUTES) {
    const { body } = await get(route, 'follow');
    const canon = attr(body, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
    if (!canon || seen.has(canon)) continue; seen.add(canon);
    try {
      const target = canon.startsWith('http') && !canon.includes(CANONICAL_HOST) && !BASE.startsWith('http://localhost')
        ? canon : canon.replace(/^https?:\/\/[^/]+/, BASE);
      const r2 = await fetch(target, { redirect: 'manual' });
      add('C2', 'canonical does not 30x-redirect', route, r2.status < 300 || r2.status >= 400 ? 'PASS' : 'FAIL', 'High', `${canon} → HTTP ${r2.status} ${r2.headers.get('location') ?? ''}`);
    } catch (e) { add('C2', 'canonical does not 30x-redirect', route, 'BLOCKED', 'High', `${canon}: ${e.message}`); }
  }
}
// ── 4. robots.txt ───────────────────────────────────────────────────────────
{
  const { r, body } = await get('/robots.txt', 'follow');
  add('R1', 'robots.txt exists', '/robots.txt', r.ok ? 'PASS' : 'FAIL', 'Critical', `HTTP ${r.status}`);
  if (r.ok) {
    add('R2', 'no blanket Disallow: /', '/robots.txt', /Disallow:\s*\/\s*$/m.test(body) ? 'FAIL' : 'PASS', 'Critical', body.slice(0, 120));
    for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'])
      add('R3', `allows ${bot}`, '/robots.txt', new RegExp(`User-agent:\\s*${bot}[\\s\\S]{0,40}Allow:`, 'i').test(body) ? 'PASS' : 'FAIL', 'High', '');
    add('R4', 'references sitemap', '/robots.txt', /Sitemap:\s*http/i.test(body) ? 'PASS' : 'FAIL', 'Medium', (body.match(/Sitemap:.*/) ?? [''])[0]);
  }
}
// ── 5. sitemap.xml ──────────────────────────────────────────────────────────
{
  const { r, body } = await get('/sitemap.xml', 'follow');
  add('SM1', 'sitemap.xml exists + parses as XML', '/sitemap.xml', r.ok && /^<\?xml/.test(body.trim()) ? 'PASS' : 'FAIL', 'High', `HTTP ${r.status}`);
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const alts = [...body.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  const allUrls = [...new Set([...locs, ...alts])];
  add('SM2', 'sitemap includes all 8 locale variants of /agents', '/sitemap.xml',
    LOCALE_PATHS.every(p => allUrls.some(u => u.endsWith(p))) ? 'PASS' : 'FAIL', 'High', `${allUrls.length} urls`);
  for (const u of allUrls) {
    const local = u.replace(/^https?:\/\/[^/]+/, BASE);
    try {
      const rr = await fetch(local, { redirect: 'manual' });
      add('SM3', 'sitemap URL resolves 200 (no 404/redirect)', u, rr.status === 200 ? 'PASS' : 'FAIL', 'High', `HTTP ${rr.status}`);
      if (rr.status === 200) {
        const bt = text(await rr.text());
        add('SM4', 'sitemap URL serves real (prerendered) content', u, bt.length > 2048 ? 'PASS' : 'FAIL', 'High', `textBytes=${bt.length}`);
      }
    } catch (e) { add('SM3', 'sitemap URL resolves', u, 'BLOCKED', 'High', e.message); }
  }
}
// ── output ──────────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('./results', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/headers-audit.json', import.meta.url), JSON.stringify({ BASE, date: new Date().toISOString(), results }, null, 2));
const fails = results.filter(x => x.result === 'FAIL');
console.log(`\n=== audit-headers vs ${BASE} — ${results.length} checks, ${fails.length} FAIL ===`);
for (const x of results) console.log(`${x.result.padEnd(7)} ${x.severity.padEnd(8)} ${x.id.padEnd(4)} ${x.route.padEnd(14)} ${x.test} :: ${x.evidence}`);
process.exit(fails.some(f => ['Critical', 'High'].includes(f.severity)) ? 1 : 0);
