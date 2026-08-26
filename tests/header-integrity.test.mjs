/**
 * tests/header-integrity.test.mjs — the header is the same on every page, and it works.
 *
 * Three defects prompted this, all of them invisible to the existing checks and
 * all of them shipped:
 *
 *   1. accessibility.html and responsible-ai.html, in all eight languages, never
 *      closed <nav class="cai-hdr-links">. The mobile nav then nested inside the
 *      desktop one, so the menu bar rendered the mobile links too.
 *   2. Those pages plus refund.html carried the language selector as
 *      id="pagelang", while the URL-locale controller binds #langsel — so on 24
 *      pages, switching language did nothing at all.
 *   3. The certification page was a document of its own with no <header>, so it
 *      had no menu bar while every page linking to it did.
 *
 * The tag-balance integrity check passed all three: it counts tags document-wide,
 * where a stray </div> can offset a missing </nav>. These assertions look at the
 * header alone.
 *
 * Reads the BUILT site, so run it after `npm run build`.
 * Usage: node --test tests/header-integrity.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];

const pages = () => {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk(DIST);
  return out;
};

const headerOf = (html) => {
  const open = html.indexOf('<header');
  if (open === -1) return null;
  const close = html.indexOf('</header>', open);
  return close === -1 ? null : html.slice(open, close + '</header>'.length);
};

const countOpen = (html, tag) => {
  let n = 0;
  for (let i = html.indexOf(`<${tag}`); i !== -1; i = html.indexOf(`<${tag}`, i + 1)) {
    const after = html[i + tag.length + 1];
    if (after === ' ' || after === '\t' || after === '\n' || after === '>') n += 1;
  }
  return n;
};
const countClose = (html, tag) => html.split(`</${tag}>`).length - 1;

// Normalised to forward slashes: path.join gives "cs\\agents.html" on Windows,
// so a rel(p).startsWith('cs/') filter matched nothing there and the locale
// comparison silently ran over an empty set. Green on CI's ubuntu, red only
// on a Windows checkout - the worst way round.
const rel = (p) => p.slice(DIST.length + 1).split(sep).join('/');

test('every header opens and closes the same number of navs and divs', () => {
  const bad = [];
  for (const p of pages()) {
    const h = headerOf(readFileSync(p, 'utf8'));
    if (!h) continue;
    for (const tag of ['nav', 'div']) {
      const o = countOpen(h, tag);
      const c = countClose(h, tag);
      if (o !== c) bad.push(`${rel(p)}: ${o} <${tag}> vs ${c} </${tag}>`);
    }
  }
  assert.deepEqual(bad, [], 'unbalanced headers: ' + bad.slice(0, 6).join(', '));
});

test('every language selector is wired to a handler the page actually loads', () => {
  /* Not "the id must be langsel". Three pages — accessibility, responsible-ai
     and refund — deliberately use id="pagelang" with their own script, because
     their localized slugs (/pl/dostepnosc, /cs/vraceni-penez) are not in
     i18n.routes.json and the shared controller could not build them. Renaming
     those to langsel would hand them to a controller that would send visitors
     to /pl/accessibility, which does not exist. home and contact do the same
     under their own ids.
     So the invariant is not the name — it is that something binds it. */
  const bad = [];
  for (const p of pages()) {
    const html = readFileSync(p, 'utf8');
    const sel = html.indexOf('aria-label="Language"');
    if (sel === -1) continue;
    const open = html.lastIndexOf('<select', sel);
    if (open === -1) continue;
    const tag = html.slice(open, html.indexOf('>', sel));
    const m = tag.match(/id="([^"]*)"/);
    if (!m) { bad.push(`${rel(p)}: language selector has no id`); continue; }
    const id = m[1];
    if (id === 'langsel') continue;                       // the shared controller binds this one
    const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((x) => x[1]);
    const wired = srcs.some((src) => {
      if (!src.startsWith('/')) return false;
      try {
        return readFileSync(join(DIST, src.split('?')[0].slice(1)), 'utf8').includes(`getElementById("${id}")`);
      } catch { return false; }
    });
    if (!wired) bad.push(`${rel(p)}: #${id} has no handler in any script the page loads`);
  }
  assert.deepEqual(bad, [], 'inert language selectors: ' + bad.slice(0, 8).join(', '));
});

test('every page of a locale shows the same menu', () => {
  const stripTags = (input) => {
    let out = '';
    let inTag = false;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '<') {
        inTag = true;
        continue;
      }
      if (ch === '>' && inTag) {
        inTag = false;
        continue;
      }
      if (!inTag) out += ch;
    }
    return out;
  };
  const labels = (html) => {
    const open = html.indexOf('<nav');
    if (open === -1) return null;
    const close = html.indexOf('</nav>', open);
    if (close === -1) return null;
    const nav = html.slice(open, close);
    const out = [];
    for (let i = nav.indexOf('<a'); i !== -1; i = nav.indexOf('<a', i + 1)) {
      const gt = nav.indexOf('>', i);
      const end = nav.indexOf('</a>', gt);
      if (gt === -1 || end === -1) break;
      out.push(stripTags(nav.slice(gt + 1, end)).trim());
    }
    return out;
  };
  for (const loc of LOCALES) {
    const seen = new Map();
    for (const p of pages()) {
      if (!rel(p).startsWith(loc + '/')) continue;
      const l = labels(readFileSync(p, 'utf8'));
      if (!l || !l.length) continue;
      const key = l.join(' | ');
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(rel(p));
    }
    // the CTA wording differs by page on purpose; compare the menu items before it
    const shapes = new Set([...seen.keys()].map((k) => k.split(' | ').slice(0, -1).join(' | ')));
    assert.equal(shapes.size, 1,
      `${loc} has ${shapes.size} different menus: ` + [...shapes].map((s) => `"${s}"`).join(' vs '));
  }
});

test('the certification page wears the site header, like every page that links to it', () => {
  for (const loc of ['en', ...LOCALES]) {
    const p = loc === 'en' ? join(DIST, 'certified.html') : join(DIST, loc, 'certified.html');
    const html = readFileSync(p, 'utf8');
    assert.ok(headerOf(html), `/${loc}/certified has no <header> — it is a bare page again`);
    assert.ok(html.includes('class="cai-hdr"'), `/${loc}/certified does not use the site header`);
    assert.ok(html.includes('aria-current="page"'),
      `/${loc}/certified does not mark itself current in the menu`);
    assert.ok(html.includes('</main>'), `/${loc}/certified leaves <main> unclosed`);
  }
});
