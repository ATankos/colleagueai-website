/* localize-structured-data.cjs — JSON-LD on a localized page names the localized page.
 *
 * The Czech privacy page's canonical is /cs/ochrana-soukromi, but its WebPage
 * node said url /privacy and @id /privacy#webpage: the structured data
 * contradicted the canonical on every localized privacy, terms, license, score
 * and usage page, and the pricing FAQPage/BreadcrumbList @ids did the same —
 * seven languages at a time. Breadcrumb trails also pointed at English routes
 * (Home → /, Ceník → /pricing) on pages whose canonical is /cs/cenik.
 *
 * Like align-og-url.cjs, the current-page fix takes its truth from the page
 * itself: <link rel="alternate" hreflang="en"> names this page's English twin
 * and <link rel="canonical"> names the localized URL, so any JSON-LD url/@id
 * naming the English twin is rewritten to the canonical, fragment preserved.
 * There is no second slug table to drift from.
 *
 * BreadcrumbList items that point at OTHER pages are mapped with the same
 * route table localize-internal-links.cjs uses (i18n.routes.json slugs, or the
 * English word under the locale prefix), and the site root becomes the locale
 * home (/cs). Only EXACT path matches are rewritten, so the English-only
 * factsheet URLs (/agents/<slug>) inside the catalogue ItemList are never
 * touched — no localized factsheet route is invented.
 *
 * Runs at the end of postbuild, over BOTH public/ and dist/, because the
 * locale generators write their pages to both (see generate-locale-pages.mjs).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROUTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n.routes.json'), 'utf8'));
const ROOTS = ['public', 'dist'];
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];

/* The English routes that have a localized twin — the localize-internal-links
   list. Pages carrying a slug map get the translated slug; the rest keep the
   English word under the locale prefix, which is how they are routed. */
const PAGES = ['agents', 'pricing', 'trust', 'partners', 'certified', 'score', 'demo', 'contact', 'privacy', 'terms', 'license', 'imprint', 'partner-agreement'];

const ORIGINS = ['https://www.colleagueai.ai', 'https://colleagueai.ai',
  'http://www.colleagueai.ai', 'http://colleagueai.ai'];

const CANONICAL = /<link rel="canonical" href="https:\/\/www\.colleagueai\.ai([^"]*)"/;
const EN_ALT = /<link rel="alternate" hreflang="en" href="https:\/\/www\.colleagueai\.ai([^"]*)"/;
const LD_BLOCK = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g;

const norm = (p) => (p.replace(/\/$/, '') || '/');

function localizedTarget(loc, page) {
  const slug = (ROUTES.slugs[page] && ROUTES.slugs[page][loc]) || page;
  return '/' + loc + '/' + slug;
}

/** split a site URL into origin ('' when root-relative), path and #fragment; null when not this site */
function splitSiteUrl(value) {
  let origin = '';
  let rest = null;
  if (value.startsWith('/')) {
    rest = value;
  } else {
    for (const o of ORIGINS) {
      if (value === o || value.startsWith(o + '/') || value.startsWith(o + '#')) {
        origin = o;
        rest = value.slice(o.length) || '/';
        break;
      }
    }
  }
  if (rest === null) return null;
  const hash = rest.indexOf('#');
  const pathPart = hash === -1 ? rest : rest.slice(0, hash);
  const fragment = hash === -1 ? '' : rest.slice(hash);
  return { origin, path: pathPart || '/', fragment };
}

/** walk the parsed JSON-LD; fn(key, value, inBreadcrumb) returns the (possibly new) string */
function walkLd(node, fn, inBreadcrumb) {
  if (Array.isArray(node)) {
    for (const item of node) walkLd(item, fn, inBreadcrumb);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const crumb = inBreadcrumb || node['@type'] === 'BreadcrumbList';
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (typeof value === 'string' && (key === 'url' || key === '@id' || key === 'item' || key === 'mainEntityOfPage')) {
      node[key] = fn(key, value, crumb);
    } else {
      walkLd(value, fn, crumb);
    }
  }
}

function localizeFile(file, loc) {
  const html = fs.readFileSync(file, 'utf8');
  if (!LD_BLOCK.test(html)) return 0;
  LD_BLOCK.lastIndex = 0;
  const canonical = html.match(CANONICAL);
  if (!canonical) return 0;
  const canonPath = norm(canonical[1]);
  const enAlt = html.match(EN_ALT);
  const enPath = enAlt ? norm(enAlt[1]) : null;

  let changed = 0;
  const out = html.replace(LD_BLOCK, (whole, open, body, close) => {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return whole; // hand-written block that is not strict JSON: leave it alone
    }
    let touched = 0;
    walkLd(data, (key, value, inBreadcrumb) => {
      const site = splitSiteUrl(value);
      if (!site) return value;
      const p = norm(site.path);
      /* the current page: the English twin's path becomes the canonical path.
         The root path is never treated as a twin — that would drag the
         Organization url along on locale home pages. */
      if (enPath && enPath !== '/' && p === enPath && p !== canonPath) {
        touched += 1;
        return site.origin + canonPath + site.fragment;
      }
      /* breadcrumb items pointing at other pages: use the localized twin */
      if (inBreadcrumb) {
        if (p === '/') {
          touched += 1;
          return site.origin + '/' + loc + site.fragment;
        }
        const page = p.slice(1);
        if (!page.includes('/') && PAGES.includes(page)) {
          const dest = localizedTarget(loc, page);
          if (dest !== p) {
            touched += 1;
            return site.origin + dest + site.fragment;
          }
        }
      }
      return value;
    });
    if (!touched) return whole;
    changed += touched;
    return open + JSON.stringify(data) + close;
  });

  if (changed) fs.writeFileSync(file, out, 'utf8');
  return changed;
}

function walkDir(dir, cb) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(p, cb);
    else if (entry.name.endsWith('.html')) cb(p);
  }
}

let files = 0;
let urls = 0;
for (const root of ROOTS) {
  for (const loc of LOCALES) {
    walkDir(path.join(ROOT, root, loc), (file) => {
      const changed = localizeFile(file, loc);
      if (changed) {
        files += 1;
        urls += changed;
      }
    });
  }
}
console.log(`[structured-data] localized ${urls} JSON-LD URL(s) across ${files} page(s)`);
