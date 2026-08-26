/**
 * tests/language-unity.test.mjs — a page is in ONE language, or it is broken.
 *
 * Mixed-language pages were found by eye, not by CI: a Polish legal page whose
 * "Ostatnia aktualizacja" was followed by "13 June 2026", and an imprint whose
 * labels ("Company name", "Registered office", "File number") were English on
 * every locale while the prose around them was translated. Both had passed the
 * existing i18n checkers, because those look for untranslated *blocks*, not for
 * English fragments sitting inside translated ones.
 *
 * This suite reads the BUILT site, so run it after `npm run build`.
 * Usage: node --test tests/language-unity.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const ROUTES = JSON.parse(readFileSync(new URL('../i18n.routes.json', import.meta.url), 'utf8'));
const CERT = JSON.parse(readFileSync(new URL('../scripts/i18n/certified-content.json', import.meta.url), 'utf8'));
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];

const localeFiles = () => {
  const out = [];
  const walk = (dir, loc) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p, loc); continue; }
      if (name.endsWith('.html')) out.push([loc, p]);
    }
  };
  for (const loc of LOCALES) {
    const d = join(DIST, loc);
    if (existsSync(d)) walk(d, loc);
  }
  return out;
};

// visible text only: script/style bodies and attributes are not what a reader sees
const visible = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ');

test('the built site exists (run npm run build first)', () => {
  assert.ok(existsSync(DIST), 'dist/ not found — this suite reads the built site');
  assert.ok(localeFiles().length > 100, 'expected the localized pages to be built');
});

test('no English month name appears on a localized page', () => {
  const MONTHS = /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d\d\b/;
  const bad = [];
  for (const [loc, p] of localeFiles()) {
    const m = visible(readFileSync(p, 'utf8')).match(MONTHS);
    if (m) bad.push(`${loc}:${p.split(loc + '/')[1]} → "${m[0]}"`);
  }
  assert.deepEqual(bad, [], 'English dates on localized pages: ' + bad.slice(0, 6).join(', '));
});

test('no English UI or legal label survives on a localized page', () => {
  /* Curated, not a dictionary: each of these was an actual leak. A generic
     English-word detector would drown in brand names and loanwords. */
  const LEAKS = ['Company name', 'Registered office', 'File number', 'Registration date',
    'Back to ColleagueAI', 'See also our', 'Privacy Policy', 'Last updated', 'Czech Republic',
    'Coming soon', 'Read more', 'Learn more'];
  const bad = [];
  for (const [loc, p] of localeFiles()) {
    const vis = visible(readFileSync(p, 'utf8'));
    for (const leak of LEAKS) {
      if (vis.includes(leak)) bad.push(`${loc}:${p.split(loc + '/')[1]} → "${leak}"`);
    }
  }
  assert.deepEqual(bad, [], 'English leaks on localized pages: ' + bad.slice(0, 6).join(', '));
});

test('every localized page declares its own language in <html lang>', () => {
  const bad = [];
  for (const [loc, p] of localeFiles()) {
    const m = readFileSync(p, 'utf8').match(/<html[^>]*\slang="([^"]+)"/);
    if (!m) { bad.push(`${loc}:${p} has no lang attribute`); continue; }
    if (m[1].split('-')[0] !== loc) bad.push(`${loc}:${p.split(loc + '/')[1]} declares lang="${m[1]}"`);
  }
  assert.deepEqual(bad, [], 'wrong lang attributes: ' + bad.slice(0, 6).join(', '));
});

// ── the certification programme page, in every language ─────────────────────
test('the certification page is built for all eight languages', () => {
  assert.ok(existsSync(join(DIST, 'certified.html')), '/certified missing');
  for (const loc of LOCALES) {
    assert.ok(existsSync(join(DIST, loc, 'certified.html')), `/${loc}/certified missing`);
  }
});

test('each certification page is wholly in its own language, and self-canonical', () => {
  for (const loc of LOCALES) {
    const html = readFileSync(join(DIST, loc, 'certified.html'), 'utf8');
    const slug = ROUTES.slugs.certified[loc];

    assert.match(html, new RegExp(`<html lang="${loc}"`), `${loc}/certified declares the wrong language`);
    assert.ok(html.includes(`canonical" href="https://www.colleagueai.ai/${loc}/${slug}"`),
      `${loc}/certified does not point its canonical at its own localized URL`);

    // English source strings must not survive anywhere in the translated page
    for (const key of ['not_label', 'scope_h', 'inc_h', 'verify_h', 'price_h', 'end_h']) {
      assert.ok(!html.includes(CERT.en[key]) || CERT[loc][key] === CERT.en[key],
        `${loc}/certified still shows the English "${CERT.en[key]}"`);
    }
    // and the scope limits must be present in the local language
    assert.ok(html.includes(CERT[loc].l3_lab), `${loc}/certified lost the materiality trigger`);
    assert.ok(html.includes(CERT[loc].stop_lab), `${loc}/certified lost the discontinuation exit`);
    assert.ok(/DORA/.test(html), `${loc}/certified lost the named sector exclusions`);
  }
});

test('the certification content model has full key parity across all eight languages', () => {
  const keys = Object.keys(CERT.en).sort();
  for (const loc of ['en', ...LOCALES]) {
    assert.deepEqual(Object.keys(CERT[loc]).sort(), keys, `certified-content.json ${loc} has different keys`);
    for (const k of keys) {
      const v = CERT[loc][k];
      assert.ok(v !== undefined && v !== '', `certified-content.json ${loc}.${k} is empty`);
      if (Array.isArray(CERT.en[k])) {
        assert.equal(v.length, CERT.en[k].length, `certified-content.json ${loc}.${k} has a different item count`);
      }
    }
  }
});

// ── the menu ────────────────────────────────────────────────────────────────
test('Certification sits in the main menu of every page that has one, in the right language', () => {
  const sample = ['contact.html', 'trust.html', 'partners.html'];
  for (const loc of ['en', ...LOCALES]) {
    const dir = loc === 'en' ? DIST : join(DIST, loc);
    const slug = ROUTES.slugs.certified[loc];
    const expectedHref = loc === 'en' ? `/${slug}` : `/${loc}/${slug}`;
    for (const f of sample) {
      const p = join(dir, f);
      if (!existsSync(p)) continue;
      const html = readFileSync(p, 'utf8');
      assert.ok(html.includes(`href="${expectedHref}"`),
        `${loc}/${f} menu does not link the localized certification page (${expectedHref})`);
      assert.ok(html.includes(`>${CERT[loc].nav}</a>`),
        `${loc}/${f} menu does not use the localized label "${CERT[loc].nav}"`);
    }
  }
});

test('a localized menu never links an English destination for a localized page', () => {
  const bad = [];
  for (const [loc, p] of localeFiles()) {
    const html = readFileSync(p, 'utf8');
    const navs = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/g) || [];
    for (const nav of navs) {
      if (nav.includes('href="/certified"')) bad.push(`${loc}:${p.split(loc + '/')[1]}`);
    }
  }
  assert.deepEqual(bad, [], 'localized navs pointing at the English certification page: ' + bad.slice(0, 5).join(', '));
});

test('every localized certification route is served by a rewrite', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrites = new Map(vercel.rewrites.map((r) => [r.source, r.destination]));
  assert.equal(rewrites.get('/certified'), '/certified.html');
  for (const loc of LOCALES) {
    const src = `/${loc}/${ROUTES.slugs.certified[loc]}`;
    assert.equal(rewrites.get(src), `/${loc}/certified.html`, `${src} has no rewrite`);
  }
});

/* public/certified.html no longer exists: the page is generated for all eight
   languages from the content model, so these guards moved here from journey,
   where they were reading a master the build had stopped shipping. A guard
   pointed at a dead file passes forever. */
test('the certification page carries its scope limits, in every language', () => {
  const REQUIRED = [
    ['not_text', /not/i],          // the not-third-party disclaimer
    ['l1_lab', null], ['l2_lab', null], ['l3_lab', null], ['l4_lab', null],
    ['owe_lab', null],             // delivery bound
    ['stop_lab', null],            // discontinuation exit
    ['out_lab', null],             // express exclusions
    ['cond', null],                // updates conditional, not periodic
    ['unmod', null],               // unmodified versions only
    ['end', null],                 // licence unaffected on lapse
  ];
  for (const loc of ['en', ...LOCALES]) {
    const p = loc === 'en' ? join(DIST, 'certified.html') : join(DIST, loc, 'certified.html');
    const html = readFileSync(p, 'utf8');
    for (const [key] of REQUIRED) {
      const expected = CERT[loc][key];
      assert.ok(html.includes(expected),
        `${loc}/certified is missing "${key}" (${String(expected).slice(0, 48)}…)`);
    }
    assert.ok(/DORA/.test(html) && /HIPAA/.test(html),
      `${loc}/certified no longer names the excluded sector rules`);
    // the promise must never be restated as covering the customer's own compliance
    assert.ok(!/your (use|agent) (is|will be) compliant/i.test(html),
      `${loc}/certified claims the customer is compliant`);
  }
});

test('the English certification page is generated, not a stale master', () => {
  assert.ok(!existsSync(fileURLToPath(new URL('../public/certified.html', import.meta.url))),
    'public/certified.html is back — two sources of truth for one page is how they drift apart');
});
