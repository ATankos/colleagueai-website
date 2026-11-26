/* inject-cc-pillar.cjs: make Continuous Certification a visible commercial pillar on every main page.
 *
 * Inserts the ONE shared block (scripts/lib/cc-pillar.cjs) into the built site:
 *   home (with the video slot) and pricing                       full: message, ten benefits with status, comparison
 *   agent catalogue, every agent factsheet, Trust Center, CAI Score, partner programme    compact: message and benefit titles
 * in the page's own language, linking to the page's localized Continuous Certification page.
 *
 * Runs in postbuild after generate-certified-pages.cjs (which uses trust.html as its shell, so the shell stays clean)
 * and before externalize-inline-scripts.cjs (which moves the style block into a file for the CSP).
 * No regular expressions over page HTML: plain indexOf, like inject-certified-nav.cjs. Idempotent.
 */
const fs = require('fs');
const path = require('path');
const { render, CSS } = require('./lib/cc-pillar.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ROUTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n.routes.json'), 'utf8'));
const LOCALES = ['en', 'cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const certifiedUrl = (loc) => {
  const slug = ROUTES.slugs.certified?.[loc] || 'certified';
  return loc === 'en' ? `/${slug}` : `/${loc}/${slug}`;
};

const FULL = { home: { variant: 'full', withVideo: true }, pricing: { variant: 'full' } };
const COMPACT = ['agents', 'trust', 'score', 'partners'];

function candidates(loc) {
  const dirs = loc === 'en' ? ['', 'en/'] : [`${loc}/`];
  const out = [];
  for (const d of dirs) {
    for (const f of ['index.html', 'home.html']) out.push([`${d}${f}`, FULL.home]);
    out.push([`${d}pricing.html`, FULL.pricing], [`${d}pricing/index.html`, FULL.pricing]);
    for (const p of COMPACT) out.push([`${d}${p}.html`, { variant: 'compact' }], [`${d}${p}/index.html`, { variant: 'compact' }]);
  }
  if (loc === 'en') {
    const dir = path.join(DIST, 'agents');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.html') && f !== 'index.html') out.push([`agents/${f}`, { variant: 'compact' }]);
    }
  }
  return out;
}

/* Where the block goes: before the footer; else before </main>; else before the scripts that end the body. */
function insertionPoint(html) {
  const footer = html.indexOf('<footer');
  if (footer !== -1) return footer;
  const main = html.lastIndexOf('</main>');
  if (main !== -1) return main;
  let at = html.lastIndexOf('</body>');
  if (at === -1) return -1;
  for (;;) {
    let i = at;
    while (i > 0 && ' \t\r\n'.includes(html[i - 1])) i -= 1;
    if (!html.slice(0, i).endsWith('</script>')) break;
    const open = html.lastIndexOf('<script', i);
    if (open === -1) break;
    at = open;
  }
  return at;
}

let pages = 0;
for (const loc of LOCALES) {
  for (const [rel, opts] of candidates(loc)) {
    const file = path.join(DIST, rel);
    if (!fs.existsSync(file)) continue;
    let html = fs.readFileSync(file, 'utf8');
    if (html.includes('data-cc-pillar=')) continue;
    const at = insertionPoint(html);
    if (at === -1) continue;
    html = html.slice(0, at) + render(loc, { ...opts, link: certifiedUrl(loc) }) + '\n' + html.slice(at);
    if (!html.includes('id="cc-pillar-css"')) {
      const head = html.indexOf('</head>');
      if (head !== -1) html = `${html.slice(0, head)}<style id="cc-pillar-css">${CSS}</style>\n${html.slice(head)}`;
    }
    fs.writeFileSync(file, html, 'utf8');
    pages += 1;
  }
}
console.log(`[cc-pillar] Continuous Certification block added to ${pages} page(s)`);
