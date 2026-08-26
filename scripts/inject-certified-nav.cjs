/* inject-certified-nav.cjs — put Certification in the main menu, once, everywhere.
 *
 * The header is duplicated across nine masters and every localized copy, in three
 * different markup shapes (.cai-hdr-links, .nav-links, .links, plus the mobile
 * .cai-hdr-mnav / .mnav). Hand-editing all of them is how nav drift starts, so
 * this step inserts the item in dist/ instead: find the Pricing link inside any
 * <nav>, add a sibling immediately after it with the SAME classes, the locale's
 * label and the locale's URL.
 *
 * Locale-correct by construction: a Czech page gets "Certifikace" pointing at
 * /cs/certifikace, never the English word or the English path — which is the
 * whole point, since a menu item that lands you on another language is worse
 * than no menu item.
 *
 * Idempotent: a nav that already links the locale's certified page is skipped.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ROUTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n.routes.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n/certified-content.json'), 'utf8'));
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];

const slug = (loc, page) => ROUTES.slugs[page]?.[loc] || ROUTES.slugs[page]?.en || page;
const url = (loc, page) => (loc === 'en' ? `/${slug(loc, page)}` : `/${loc}/${slug(loc, page)}`);

const localeOf = (rel) => {
  const first = rel.split(path.sep)[0];
  return LOCALES.includes(first) ? first : 'en';
};

/* Deliberately NO regular expressions below.
 *
 * The first version scanned for the Pricing anchor with a RegExp built from the
 * locale's URL, inside a <nav>...</nav> match. CodeQL was right to object: a
 * pattern assembled from data is a regex-injection question however carefully it
 * is escaped, and `([^>]*?)href="..."` followed by `[^>]*>` backtracks
 * polynomially on any tag that does not match. Plain indexOf scanning has none
 * of those properties, is linear, and is easier to be sure about.
 */

/** The <a ...>...</a> whose OPENING TAG contains `pos` (an href sits there), or null. */
function anchorAround(html, pos) {
  // walk back over any `<a` that is really `<article`, `<aside`, …
  let open = html.lastIndexOf('<a', pos);
  while (open !== -1) {
    const after = html[open + 2];
    if (after === ' ' || after === '\t' || after === '\n' || after === '>') break;
    open = html.lastIndexOf('<a', open - 1);
  }
  if (open === -1) return null;

  const gt = html.indexOf('>', open);
  if (gt === -1 || pos > gt) return null;   // href must be inside this opening tag
  const close = html.indexOf('</a>', gt);
  if (close === -1) return null;
  return { start: open, tagEnd: gt, end: close + 4 };
}

/** value of class="..." on the opening tag, or '' */
function classOf(html, a) {
  const tag = html.slice(a.start, a.tagEnd + 1);
  const at = tag.indexOf('class="');
  if (at === -1) return '';
  const from = at + 'class="'.length;
  const to = tag.indexOf('"', from);
  return to === -1 ? '' : tag.slice(from, to);
}

/** every <nav ...>...</nav> span, as [start, end) index pairs */
function navSpans(html) {
  const spans = [];
  let i = 0;
  for (;;) {
    const open = html.indexOf('<nav', i);
    if (open === -1) break;
    const after = html[open + 4];
    if (after !== ' ' && after !== '\t' && after !== '\n' && after !== '>') { i = open + 4; continue; }
    const close = html.indexOf('</nav>', open);
    if (close === -1) break;
    spans.push([open, close + '</nav>'.length]);
    i = close + 1;
  }
  return spans;
}

function inject(html, loc) {
  const certHref = url(loc, 'certified');
  const label = (C[loc] && C[loc].nav) || C.en.nav;
  // the localized pricing path, and the English one for locale pages whose href
  // the localizer has not rewritten
  const targets = [...new Set([url(loc, 'pricing'), '/pricing'])];

  let out = html;
  let added = 0;

  // Right-to-left, so an insertion never shifts the spans still to be processed.
  const spans = navSpans(out);
  for (let s = spans.length - 1; s >= 0; s -= 1) {
    const [navStart, navEnd] = spans[s];
    const nav = out.slice(navStart, navEnd);
    if (nav.indexOf(`href="${certHref}"`) !== -1) continue;   // already there

    for (const target of targets) {
      const at = nav.indexOf(`href="${target}"`);
      if (at === -1) continue;
      const a = anchorAround(nav, at);
      if (!a) continue;
      const cls = classOf(nav, a);
      const item = `<a${cls ? ` class="${cls}"` : ''} href="${certHref}">${label}</a>`;
      out = out.slice(0, navStart + a.end) + item + out.slice(navStart + a.end);
      added += 1;
      break;
    }
  }

  return { out, added };
}

let files = 0;
let items = 0;

/* No stat-then-read, and no exists-then-walk.
 *
 * `statSync(p)` followed by `readFileSync(p)` asks the filesystem about a path
 * twice and assumes the second answer matches the first — the classic
 * time-of-check/time-of-use shape, which CodeQL flags. Here it is also simply
 * wasteful: readdirSync already knows whether each entry is a directory, so
 * withFileTypes gets the same answer for free and leaves exactly one syscall
 * per path. A missing dist/ is handled the same way — by trying, not by asking
 * first.
 */
const walk = (dir) => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // no dist/ yet, or not a directory: nothing to inject into
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(p); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const rel = path.relative(DIST, p);
    // never add a self-link: the certification page's own breadcrumb already
    // sits on the destination, and a crumb that links to itself reads as a bug
    if (rel.split(path.sep).join('/').endsWith('certified.html')) continue;
    const html = fs.readFileSync(p, 'utf8');
    if (html.indexOf('<nav') === -1) continue;
    const { out, added } = inject(html, localeOf(rel));
    if (added) { fs.writeFileSync(p, out, 'utf8'); files += 1; items += added; }
  }
};
walk(DIST);
console.log(`[certified-nav] ${items} menu item(s) inserted across ${files} page(s)`);
