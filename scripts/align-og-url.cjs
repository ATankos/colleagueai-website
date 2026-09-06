/* align-og-url.cjs — og:url must name the page you are actually on.
 *
 * Every localized page carried the ENGLISH og:url: /it/imprint told Facebook and
 * LinkedIn its canonical social URL was /imprint. 98 built files, seven
 * languages. The <link rel="canonical"> was right on all of them, so only the
 * social graph was collapsing seven locales onto one — invisible to any check
 * that reads the page body, and invisible in a browser.
 *
 * The fix takes og:url from the page's own canonical rather than rebuilding it
 * from the route table. There is no second source to drift from, it needs no
 * knowledge of slugs, and any page added later is covered without editing this
 * file. A page whose canonical is missing is left alone rather than guessed at.
 *
 * Runs in postbuild, after localize-internal-links.cjs has settled the routes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];

const CANONICAL = /<link rel="canonical" href="([^"]+)"/;
const OG_URL = /(<meta property="og:url" content=")([^"]*)(")/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

let fixed = 0;
let skipped = 0;
for (const loc of LOCALES) {
  for (const file of walk(path.join(DIST, loc))) {
    const html = fs.readFileSync(file, 'utf8');
    const canonical = html.match(CANONICAL);
    const og = html.match(OG_URL);
    if (!canonical || !og) { skipped += 1; continue; }
    if (og[2] === canonical[1]) continue;
    fs.writeFileSync(file, html.replace(OG_URL, `$1${canonical[1]}$3`), 'utf8');
    fixed += 1;
  }
}
console.log(`[og-url] aligned og:url with the canonical on ${fixed} page(s); ${skipped} had no canonical or no og:url`);
