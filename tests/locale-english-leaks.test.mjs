/**
 * tests/locale-english-leaks.test.mjs — strings that were served in English on
 * every locale page, and the reason none of the existing checks noticed.
 *
 * Four dictionaries localise this site and every one of them is keyed by English
 * source text. Edit the English and the key silently stops matching: the build
 * succeeds, the English site is perfect, and seven locale pages quietly serve
 * English. Three separate defects reached production that way before anyone
 * looked at a rendered locale page.
 *
 * These assertions read dist/, because that is the only place the question can
 * honestly be asked. public/<loc>/ is build output of unknown vintage and lags
 * the dictionaries; asking it produces false positives for things already fixed.
 *
 * Usage: npm run build && node --test tests/locale-english-leaks.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const dist = (p) => new URL('../dist/' + p, import.meta.url);
const read = (p) => readFileSync(dist(p), 'utf8');

/* Each entry is a string that was live in English in all seven languages, with
   the page it sits on. The comment says which mechanism failed, because they
   were not all the same failure. */
/* Where a locale's correct translation genuinely equals the English. Keep this
   list short and justified: every entry is a place the leak test cannot see. */
const IDENTICAL_IS_CORRECT = new Set([
  'fr|// architecture',   // "architecture" is the French word too
]);

const FIXED = [
  // data-i18n="eaia_roles" is on the element, but that key exists in no
  // dictionary anywhere, so neither the build nor the browser could ever
  // translate it. Permanently English until this commit.
  ['score.html', 'Tiers set the obligations'],
  // Translated in pricing-content.json, but that dictionary is page-scoped:
  // generate-pricing-pages.cjs only writes pricing pages, so the same string
  // on /score got nothing.
  ['score.html', 'Questions, answered'],
  ['score.html', '// accountability'],
  ['score.html', '// regulation'],
  ['score.html', '// architecture'],
  // Static text inside a paragraph whose own data-i18n key the build skips.
  ['agents.html', 'What certification covers →'],
  // One English word inside an otherwise translated line.
  ['contact.html', 'file C 448176'],
  ['contact.html', '← ColleagueAI'],
  ['refund.html', '← ColleagueAI'],
  // An English conjunction between two translated links. Five characters, and
  // it took building the site and diffing 203 pages to see it.
  ['imprint.html', ', and\n'],
];

/* Split deliberately. The dictionary half needs no build and therefore always
   runs, including in a bare worktree; the dist half is the ground truth but can
   only speak after `npm run build`. Keeping them in one test meant the whole
   thing skipped without a build -- and a skipped test reads exactly like a
   passing one, which is how an empty branch once got pushed. */
function resolveKey(dict, marker, page) {
  const matches = Object.keys(dict.cs).filter((k) => k.includes(marker));
  assert.equal(matches.length, 1,
    `expected exactly one reviewed-copy key containing ${JSON.stringify(marker)}, found ${matches.length} — ${page} will serve it in English in all seven locales`);
  return matches[0];
}

test('every string fixed here is still translated in all seven locales', () => {
  const dict = JSON.parse(readFileSync(new URL('../scripts/i18n/reviewed-copy.json', import.meta.url), 'utf8'));
  for (const [page, marker] of FIXED) {
    const english = resolveKey(dict, marker, page);
    for (const loc of LOCALES) {
      const translated = dict[loc] && dict[loc][english];
      assert.ok(translated,
        `${loc}: reviewed-copy has no entry for ${JSON.stringify(marker)}, so ${page} serves it in English`);
      // A translation identical to the English is indistinguishable, on the
      // page, from one that was never made. Blanket-skipping those let two
      // mutants through, so the exceptions are named instead.
      if (translated === english) {
        assert.ok(IDENTICAL_IS_CORRECT.has(`${loc}|${marker}`),
          `${loc}: the translation of ${JSON.stringify(marker)} is identical to the English — either it was reverted, or add it to IDENTICAL_IS_CORRECT with a reason`);
      }
    }
  }
});

test('no built locale page serves one of them back in English', { skip: existsSync(dist('cs/score.html')) ? false : 'needs npm run build' }, () => {
  const dict = JSON.parse(readFileSync(new URL('../scripts/i18n/reviewed-copy.json', import.meta.url), 'utf8'));
  const still = [];
  for (const [page, marker] of FIXED) {
    const english = resolveKey(dict, marker, page);
    for (const loc of LOCALES) {
      if (dict[loc][english] === english) continue;   // legitimately identical, covered above
      if (read(`${loc}/${page}`).includes(english)) still.push(`${loc}/${page}: ${JSON.stringify(marker)}`);
    }
  }
  assert.deepEqual(still, [],
    'these locale pages are serving English again — a dictionary key has drifted from the page text:\n  ' + still.join('\n  '));
});

/* The reviewed-copy restorer builds ONE regex from every key, sorted
   longest-first, and makes a single pass. A longer key that overlaps a shorter
   one wins the position and the shorter key then never matches — silently, with
   no error and no failing build. That is exactly what happened to the imprint
   conjunction: ">Partner Agreement</a>" consumed the "</a>" that "</a>, and"
   needed to start on. Any key that is a suffix-overlap of a longer key is dead
   on arrival, so it is worth failing the build rather than shipping one. */
test('no reviewed-copy key is swallowed by a longer overlapping key', () => {
  const dict = JSON.parse(readFileSync(new URL('../scripts/i18n/reviewed-copy.json', import.meta.url), 'utf8'));
  const dead = [];
  for (const loc of LOCALES) {
    const keys = Object.keys(dict[loc]).sort((a, b) => b.length - a.length);
    for (const short of keys) {
      for (const long of keys) {
        if (long.length <= short.length) break;
        // A short key that only ever appears inside a longer key's span, sharing
        // its opening, can never win the leftmost-longest race.
        if (long.includes(short) && long.indexOf(short) > 0 && long.endsWith(short.slice(0, Math.min(4, short.length)))) {
          dead.push(`${loc}: ${JSON.stringify(short)} is shadowed by ${JSON.stringify(long.slice(0, 60))}`);
          break;
        }
      }
    }
  }
  assert.deepEqual(dead, [], 'these keys can never match:\n  ' + dead.join('\n  '));
});

/* Metadata is where both of the next two defects hid, and it is invisible to
   everything above: the leak detector reads visible text nodes, and metadata
   lives in attributes that never appear between tags. It is also invisible in a
   browser — you only ever see it in a search result or a shared link. */

test('the imprint metadata is translated in every locale', () => {
  const dict = JSON.parse(readFileSync(new URL('../scripts/i18n/reviewed-copy.json', import.meta.url), 'utf8'));
  // The English title carries an &amp; and the description a comma-and; both are
  // matched verbatim by the restorer, so they are looked up as literal keys.
  const keys = Object.keys(dict.cs).filter((k) => /Legal Notice|Company identification, registered office/.test(k));
  assert.equal(keys.length, 2,
    `expected the imprint title and description among the reviewed keys, found ${keys.length} — /imprint serves English metadata in all seven locales`);
  for (const en of keys) {
    for (const loc of LOCALES) {
      const t = dict[loc] && dict[loc][en];
      assert.ok(t && t !== en, `${loc}: imprint metadata ${JSON.stringify(en.slice(0, 40))} is untranslated`);
    }
  }
});

test('og:url names the page you are on, not its English twin', { skip: existsSync(dist('cs/imprint.html')) ? false : 'needs npm run build' }, () => {
  const wrong = [];
  let checked = 0;
  for (const loc of LOCALES) {
    for (const page of ['imprint.html', 'agents.html', 'partners.html', 'privacy.html', 'score.html', 'trust.html', 'usage.html']) {
      let html;
      try { html = read(`${loc}/${page}`); } catch { continue; }
      const og = html.match(/<meta property="og:url" content="([^"]*)"/);
      const canonical = html.match(/<link rel="canonical" href="([^"]*)"/);
      if (!og || !canonical) continue;
      checked += 1;
      if (og[1].replace(/\/$/, '') !== canonical[1].replace(/\/$/, '')) {
        wrong.push(`${loc}/${page}: og:url=${og[1]} canonical=${canonical[1]}`);
      }
    }
  }
  assert.ok(checked >= 40, `expected to check the localized pages, only saw ${checked} — did the build run?`);
  assert.deepEqual(wrong, [],
    'these pages tell social crawlers they are the English page:\n  ' + wrong.join('\n  '));
});

test('no locale imprint serves the English title or description', { skip: existsSync(dist('cs/imprint.html')) ? false : 'needs npm run build' }, () => {
  const english = read('imprint.html');
  const title = english.match(/<title>([^<]*)<\/title>/)[1];
  const description = english.match(/<meta name="description" content="([^"]*)"/)[1];
  const bad = [];
  for (const loc of LOCALES) {
    const html = read(`${loc}/imprint.html`);
    if (html.includes(title)) bad.push(`${loc}: English <title> / og:title`);
    if (html.includes(description)) bad.push(`${loc}: English description`);
  }
  assert.deepEqual(bad, [], 'imprint metadata reverted to English:\n  ' + bad.join('\n  '));
});
