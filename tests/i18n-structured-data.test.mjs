/**
 * tests/i18n-structured-data.test.mjs — structured data on a localized page
 * names the localized page, and the language switcher's data source exists.
 *
 * The Czech privacy page's canonical is /cs/ochrana-soukromi, but its JSON-LD
 * WebPage said url /privacy and @id /privacy#webpage; pricing's FAQPage and
 * BreadcrumbList @ids did the same, and breadcrumb trails pointed Home → / and
 * Ceník → /pricing. Search engines were told the localized page is the English
 * one. localize-structured-data.cjs (end of postbuild) rewrites those to the
 * page's own canonical; this suite keeps it that way.
 *
 * It also guards the visible language switcher's two inputs: the hreflang maps
 * on legal pages and Insights articles (what samePageIn consults first), and
 * the rule that English-only factsheets never grow invented localized routes.
 *
 * This suite reads the BUILT site, so run it after `npm run build`.
 * Usage: node --test tests/i18n-structured-data.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const ROUTES = JSON.parse(readFileSync(join(ROOT, 'i18n.routes.json'), 'utf8'));

const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const ALL_LOCALES = ['en', ...LOCALES];
const ORIGIN = 'https://www.colleagueai.ai';

/* English routes with a localized twin — the localize-internal-links list. */
const PAGES = ['agents', 'pricing', 'trust', 'partners', 'certified', 'score', 'demo', 'contact', 'privacy', 'terms', 'license', 'imprint', 'partner-agreement'];

const norm = (p) => (p.replace(/\/$/, '') || '/');

function htmlFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function localizedFiles() {
  const out = [];
  for (const loc of LOCALES) {
    for (const file of htmlFiles(join(DIST, loc))) out.push({ loc, file });
  }
  return out;
}

function canonicalPath(html) {
  const m = html.match(/<link rel="canonical" href="https:\/\/www\.colleagueai\.ai([^"]*)"/);
  return m ? norm(m[1]) : null;
}

function englishTwinPath(html) {
  const m = html.match(/<link rel="alternate" hreflang="en" href="https:\/\/www\.colleagueai\.ai([^"]*)"/);
  return m ? norm(m[1]) : null;
}

/** every url/@id/item/mainEntityOfPage string in every JSON-LD block, with breadcrumb scope */
function ldUrls(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    (function walk(node, inBreadcrumb) {
      if (Array.isArray(node)) return node.forEach((n) => walk(n, inBreadcrumb));
      if (!node || typeof node !== 'object') return;
      const crumb = inBreadcrumb || node['@type'] === 'BreadcrumbList';
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string' && ['url', '@id', 'item', 'mainEntityOfPage'].includes(key)) {
          if (value.startsWith('/') || value.startsWith(ORIGIN)) {
            const rest = value.startsWith('/') ? value : value.slice(ORIGIN.length) || '/';
            out.push({ key, crumb, path: norm(rest.split('#')[0] || '/') });
          }
        } else {
          walk(value, crumb);
        }
      }
    })(data, false);
  }
  return out;
}

test('the built site exists (run npm run build first)', () => {
  assert.ok(existsSync(DIST), 'dist/ not found — this suite reads the built site');
  assert.ok(localizedFiles().length > 100, 'expected the localized pages to be built');
});

test('JSON-LD on a localized page never names the English twin as the current page', () => {
  const bad = [];
  for (const { file } of localizedFiles()) {
    const html = readFileSync(file, 'utf8');
    const canon = canonicalPath(html);
    const en = englishTwinPath(html);
    if (!canon || !en || en === '/' || en === canon) continue;
    for (const u of ldUrls(html)) {
      if (u.path === en) bad.push(`${file.slice(DIST.length)} ${u.key} → ${u.path} (canonical ${canon})`);
    }
  }
  assert.deepEqual(bad, [], 'English current-page URLs in localized JSON-LD: ' + bad.slice(0, 8).join(', '));
});

test('breadcrumbs on localized pages use localized equivalents, not English routes', () => {
  const bad = [];
  for (const { loc, file } of localizedFiles()) {
    const html = readFileSync(file, 'utf8');
    for (const u of ldUrls(html)) {
      if (!u.crumb || u.key !== 'item') continue;
      if (u.path === '/') {
        bad.push(`${file.slice(DIST.length)} breadcrumb Home → / (expected /${loc})`);
        continue;
      }
      const page = u.path.slice(1);
      if (!page.includes('/') && PAGES.includes(page)) {
        bad.push(`${file.slice(DIST.length)} breadcrumb → ${u.path} (expected the ${loc} twin)`);
      }
    }
  }
  assert.deepEqual(bad, [], 'English breadcrumb items on localized pages: ' + bad.slice(0, 8).join(', '));
});

test('no localized factsheet route is invented anywhere in structured data', () => {
  const bad = [];
  for (const { loc, file } of localizedFiles()) {
    const catalogue = '/' + loc + '/' + (ROUTES.slugs.agents[loc] || 'agents');
    const html = readFileSync(file, 'utf8');
    for (const u of ldUrls(html)) {
      if (u.path.startsWith(catalogue + '/')) bad.push(`${file.slice(DIST.length)} → ${u.path}`);
    }
  }
  assert.deepEqual(bad, [], 'invented localized factsheet URLs: ' + bad.slice(0, 8).join(', '));
});

test('factsheets keep their English canonical and English breadcrumb', () => {
  const files = htmlFiles(join(DIST, 'agents'));
  assert.ok(files.length > 10, 'expected the factsheets to be built under dist/agents/');
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const canon = canonicalPath(html);
    assert.ok(canon && canon.startsWith('/agents/'), `${file.slice(DIST.length)} lost its /agents/ canonical`);
    for (const u of ldUrls(html)) {
      assert.ok(!/^\/(cs|de|fr|es|it|pl|pt)\//.test(u.path), `${file.slice(DIST.length)} grew a localized URL: ${u.path}`);
    }
  }
});

test('legal pages carry the full hreflang map the language switcher reads', () => {
  const bad = [];
  for (const loc of LOCALES) {
    for (const name of ['privacy', 'terms', 'refund', 'accessibility', 'responsible-ai', 'contact']) {
      const file = join(DIST, loc, name + '.html');
      if (!existsSync(file)) {
        bad.push(`${loc}/${name}.html missing`);
        continue;
      }
      const html = readFileSync(file, 'utf8');
      for (const code of ALL_LOCALES) {
        if (!new RegExp(`<link rel="alternate" hreflang="${code}"`).test(html)) {
          bad.push(`${loc}/${name}.html has no hreflang="${code}"`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], 'hreflang gaps: ' + bad.slice(0, 8).join(', '));
});

test('insights articles carry the full hreflang map the language switcher reads', () => {
  const bad = [];
  for (const loc of LOCALES) {
    const files = htmlFiles(join(DIST, loc, 'insights'));
    assert.ok(files.length > 0, `no built insights pages for ${loc}`);
    for (const file of files) {
      const html = readFileSync(file, 'utf8');
      for (const code of ALL_LOCALES) {
        if (!new RegExp(`<link rel="alternate" hreflang="${code}"`).test(html)) {
          bad.push(`${file.slice(DIST.length)} has no hreflang="${code}"`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], 'hreflang gaps: ' + bad.slice(0, 8).join(', '));
});

test('the unified header consults hreflang first and never sends factsheets home', () => {
  const source = readFileSync(join(ROOT, 'public/colleagueai-mobile-fix.js'), 'utf8');
  assert.ok(source.includes('link[rel="alternate"][hreflang]'),
    'samePageIn no longer consults the page hreflang map');
  assert.ok(/\/\^\\\/agents\\\/\[\^\/\]\+\$\//.test(source) || source.includes('/^\\/agents\\/[^/]+$/'),
    'samePageIn lost the English-only factsheet fallback to the localized catalogue');
});
