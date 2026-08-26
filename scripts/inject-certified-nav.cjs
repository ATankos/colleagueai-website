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

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function inject(html, loc) {
  const certHref = url(loc, 'certified');
  const label = C[loc]?.nav || C.en.nav;
  // Both the localized pricing path and the English one: some locale pages still
  // carry /pricing where the localizer has not rewritten the href.
  const targets = [...new Set([url(loc, 'pricing'), '/pricing'])];

  let out = html;
  let added = 0;

  out = out.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/g, (nav) => {
    if (nav.includes(`href="${certHref}"`)) return nav;          // already there
    for (const target of targets) {
      const re = new RegExp(`(<a\\b([^>]*?)href="${esc(target)}"[^>]*>[\\s\\S]*?<\\/a>)`);
      const m = nav.match(re);
      if (!m) continue;
      // reuse the sibling's class so the item inherits the nav's own styling
      const cls = (m[0].match(/class="([^"]*)"/) || [, ''])[1];
      const clsAttr = cls ? ` class="${cls}"` : '';
      added += 1;
      return nav.replace(re, `$1<a${clsAttr} href="${certHref}">${label}</a>`);
    }
    return nav;
  });

  return { out, added };
}

let files = 0;
let items = 0;
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.html')) continue;
    const rel = path.relative(DIST, p);
    const html = fs.readFileSync(p, 'utf8');
    if (!/<nav\b/.test(html)) continue;
    // never add a self-link: the certification page's own breadcrumb already
    // sits on the destination, and a crumb that links to itself reads as a bug
    if (/(^|\/)certified\.html$/.test(rel.split(path.sep).join('/'))) continue;
    const { out, added } = inject(html, localeOf(rel));
    if (added) { fs.writeFileSync(p, out, 'utf8'); files += 1; items += added; }
  }
};
if (fs.existsSync(DIST)) walk(DIST);
console.log(`[certified-nav] ${items} menu item(s) inserted across ${files} page(s)`);
