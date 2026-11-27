/* inject-videos.cjs: place the site videos on the built pages, in every language, from ONE placement table.
 *
 * Canonical players (one feature player per page, poster only until the visitor presses play):
 *   corporate      home (every language)
 *   certification  /certified (every language; rendered by scripts/lib/cc-pillar.cjs through the same renderer)
 *   install        English factsheet, "Microsoft prerequisites and running costs"; partner programme (every language)
 *   product        English factsheet, top (HELD: renders nothing until a corrected master is approved)
 * Everywhere else a compact card links to the player in the visitor's language.
 *
 * Runs in postbuild after inject-cc-pillar.cjs and before localize-internal-links.cjs and
 * externalize-inline-scripts.cjs (which moves the <style> block into a file for the CSP). Plain indexOf, no regular
 * expressions over page HTML, idempotent (a page that already carries data-cai-video-sec is skipped per marker).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const V = require('./lib/videos.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ROUTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n.routes.json'), 'utf8'));
const FACTSHEET = '/agents/contract-intelligence-and-register';

const slug = (page, loc) => (ROUTES.slugs[page] && ROUTES.slugs[page][loc]) || page;
const url = (page, loc) => {
  if (page === 'home') return loc === 'en' ? '/' : `/${loc}`;
  return loc === 'en' ? `/${slug(page, 'en')}` : `/${loc}/${slug(page, loc)}`;
};
/* Where each video plays, for a visitor in this language. The factsheet exists in English only. */
const watchUrl = (id, loc) => ({
  corporate: url('home', loc),
  certification: url('certified', loc),
  install: loc === 'en' ? FACTSHEET : url('partners', loc),
  product: FACTSHEET,
})[id];

/* Files for one page key in one language: root and /en/ copies for English, both the .html and the folder index. */
function files(page, loc) {
  const dirs = loc === 'en' ? ['', 'en/'] : [`${loc}/`];
  const names = page === 'home' ? ['index.html', 'home.html'] : [`${page}.html`, `${page}/index.html`];
  const out = [];
  for (const d of dirs) for (const n of names) out.push(`${d}${n}`);
  return out;
}

/* Each placement: page key, anchor to insert BEFORE ('after:' inserts after the end of the matched element's
 * first closing tag), and the block. */
function placements(loc) {
  const L = [];
  L.push({ page: 'home', anchor: 'after-section:<section class="hero wrap"', block: () => V.renderFeature('corporate', loc, { cta: 'catalogue', ctaHref: url('agents', loc) }) });
  L.push({ page: 'home', anchor: 'before:<section class="cc-pillar"', block: () => V.renderCards([{ id: 'product', href: watchUrl('product', loc) }, { id: 'certification', href: watchUrl('certification', loc) }], loc) });
  L.push({ page: 'agents', anchor: 'before:<section id="pillars"', block: () => V.renderCards([{ id: 'corporate', href: watchUrl('corporate', loc) }, { id: 'product', href: watchUrl('product', loc) }], loc) });
  L.push({ page: 'pricing', anchor: 'before:<section class="cc-pillar"', block: () => V.renderCards([{ id: 'product', href: watchUrl('product', loc) }, { id: 'certification', href: watchUrl('certification', loc) }], loc) });
  L.push({ page: 'partners', anchor: 'before:<section id="faq"', block: () => V.renderFeature('install', loc, { cta: 'partner', ctaHref: '#partner-apply' })
    + V.renderCards([{ id: 'corporate', href: watchUrl('corporate', loc) }, { id: 'product', href: watchUrl('product', loc) }, { id: 'certification', href: watchUrl('certification', loc) }], loc) });
  L.push({ page: 'trust', anchor: 'before:<section class="cc-pillar"', block: () => V.renderCards([{ id: 'certification', href: watchUrl('certification', loc) }], loc) });
  L.push({ page: 'usage', anchor: 'before:<section class="cta" id="usage-cta"', block: () => V.renderCards([{ id: 'install', href: watchUrl('install', loc) }], loc) });
  return L;
}

const FACTSHEET_PLACEMENTS = [
  { anchor: 'after:</h1>', block: () => V.renderFeature('product', 'en', { cta: 'demo', ctaHref: '/demo', level: 3 }) },
  { anchor: 'end-of-section:<h2>Microsoft prerequisites and running costs</h2>', block: () => V.renderFeature('install', 'en', { cta: 'demo', ctaHref: '/demo', level: 3 }) },
  { anchor: 'end-of-section:<h2>Availability and certification status</h2>', block: () => V.renderCards([{ id: 'certification', href: watchUrl('certification', 'en') }], 'en') },
];

/** Index at which to insert, or -1 when the anchor is missing. */
function locate(html, anchor) {
  const [kind, needle] = [anchor.slice(0, anchor.indexOf(':')), anchor.slice(anchor.indexOf(':') + 1)];
  const at = html.indexOf(needle);
  if (at === -1) return -1;
  if (kind === 'before') return at;
  if (kind === 'after') return at + needle.length;
  if (kind === 'after-section' || kind === 'end-of-section') {
    const close = html.indexOf('</section>', at);
    if (close === -1) return -1;
    return kind === 'after-section' ? close + '</section>'.length : close;
  }
  return -1;
}

const SCRIPT_REL = '/cai-video.js';
const scriptHash = (() => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, 'cai-video.js'))).digest('hex').slice(0, 8); } catch { return 'dev'; }
})();

function withAssets(html, needsScript) {
  if (!html.includes('id="cai-video-css"')) {
    const head = html.indexOf('</head>');
    if (head !== -1) html = `${html.slice(0, head)}<style id="cai-video-css">${V.CSS}</style>\n${html.slice(head)}`;
  }
  if (needsScript && !html.includes('id="cai-video-js"')) {
    const body = html.lastIndexOf('</body>');
    if (body !== -1) html = `${html.slice(0, body)}<script id="cai-video-js" src="${SCRIPT_REL}?v=${scriptHash}" defer></script>\n${html.slice(body)}`;
  }
  return html;
}

/** Add the VideoObject for every feature player on the page, named after the page's own canonical URL. */
function withJsonLd(html, loc) {
  const c = html.indexOf('<link rel="canonical" href="');
  if (c === -1) return html;
  const start = c + '<link rel="canonical" href="'.length;
  const pageUrl = html.slice(start, html.indexOf('"', start));
  let ld = '';
  for (const id of Object.keys(V.REG)) {
    if (html.includes(`data-cai-video="${id}"`) && !html.includes(`data-cai-video-ld="${id}"`)) ld += V.jsonLd(id, loc, pageUrl);
  }
  if (!ld) return html;
  const head = html.indexOf('</head>');
  return head === -1 ? html : `${html.slice(0, head)}${ld}\n${html.slice(head)}`;
}

function apply(rel, list, loc) {
  const file = path.join(DIST, rel);
  let html;
  try { html = fs.readFileSync(file, 'utf8'); } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return 0;
    throw err;
  }
  let changed = 0;
  for (const p of list) {
    const block = p.block();
    if (!block) continue;
    const marker = block.slice(0, block.indexOf('>') + 1);
    if (html.includes(marker)) continue;
    const at = locate(html, p.anchor);
    if (at === -1) { console.warn(`[videos] anchor not found in ${rel}: ${p.anchor}`); continue; }
    html = `${html.slice(0, at)}\n${block}\n${html.slice(at)}`;
    changed += 1;
  }
  /* /certified gets its player from cc-pillar.cjs; it still needs the stylesheet, script and structured data. */
  const hasFeature = html.includes('data-cai-video-play');
  const hasAny = hasFeature || html.includes('class="cai-vcard"');
  if (!changed && !hasAny) return 0;
  html = withAssets(html, hasFeature);
  html = withJsonLd(html, loc);
  fs.writeFileSync(file, html);
  return 1;
}

let pages = 0;
for (const loc of V.LOCALES) {
  const byPage = {};
  for (const p of placements(loc)) (byPage[p.page] = byPage[p.page] || []).push(p);
  for (const [page, list] of Object.entries(byPage)) for (const rel of files(page, loc)) pages += apply(rel, list, loc);
  for (const rel of files('certified', loc)) pages += apply(rel, [], loc);
}
pages += apply('agents/contract-intelligence-and-register.html', FACTSHEET_PLACEMENTS, 'en');
console.log(`[videos] ${V.previewMode() ? 'PREVIEW (pending videos shown) ' : ''}video blocks on ${pages} page(s)`);
