/* externalize-inline-scripts.cjs — final postbuild step.
 *
 * Moves every executable inline <script> in dist/ into a content-hashed file
 * under /assets/, and rewrites the one inline onclick handler into a delegated
 * listener. Together these remove the last two reasons the Content-Security-
 * Policy needs script-src 'unsafe-inline'.
 *
 * Deliberate choices:
 *   - Runs on dist/ only. public/ keeps its inline scripts, so the generators
 *     that read public/ as source are untouched and the source stays readable.
 *   - Scripts are emitted in place, in document order, with no defer/async, so
 *     execution semantics are byte-for-byte what they were inline.
 *   - id and type attributes are preserved: other code queries scripts by id.
 *   - <script type="application/ld+json"> is data, not code. CSP does not apply
 *     to it and search engines read it, so it is left alone.
 *   - Filenames are sha256-derived, so identical scripts across pages collapse
 *     to one file and inherit the immutable cache headers already configured
 *     for /assets/ in vercel.json.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIST = path.join(process.cwd(), 'dist');
const ASSETS = path.join(DIST, 'assets');

// The mobile menu button. Two spellings of the same handler exist in the pages
// (an older one-liner on the legal/responsible-ai pages), so both are matched.
const ONCLICKS = [
  `onclick="var m=document.getElementById('caihdrm');m.classList.toggle('open')"`,
  `onclick="document.getElementById('caihdrm').classList.toggle('open')"`,
];
const DELEGATE = `(function(){document.addEventListener("click",function(e){var b=e.target&&e.target.closest?e.target.closest("[data-cai-menu-toggle]"):null;if(!b)return;var m=document.getElementById("caihdrm");if(m)m.classList.toggle("open");});})();`;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function emit(body) {
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  const file = `inline-${hash}.js`;
  const full = path.join(ASSETS, file);
  if (!fs.existsSync(full)) fs.writeFileSync(full, body, 'utf8');
  return `/assets/${file}`;
}

if (!fs.existsSync(DIST)) {
  console.log('externalize-inline-scripts: no dist/, nothing to do');
  process.exit(0);
}
fs.mkdirSync(ASSETS, { recursive: true });

const SCRIPT = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let pages = 0, moved = 0, handlers = 0;
const written = new Set();

for (const file of walk(DIST)) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  // 1. the delegated-listener rewrite for the mobile menu button
  let found = 0;
  for (const oc of ONCLICKS) {
    if (!html.includes(oc)) continue;
    found += html.split(oc).length - 1;
    html = html.split(oc).join('data-cai-menu-toggle');
  }
  if (found) {
    handlers += found;
    const src = emit(DELEGATE);
    written.add(src);
    html = html.replace('</body>', `<script src="${src}"></script>\n</body>`);
  }

  // 2. every executable inline block becomes an external file, in place
  html = html.replace(SCRIPT, (whole, attrs, body) => {
    if (/\bsrc\s*=/i.test(attrs)) return whole;                       // already external
    if (/type\s*=\s*["'][^"']*json/i.test(attrs)) return whole;       // JSON-LD is data
    if (!body.trim()) return whole;
    const src = emit(body);
    written.add(src);
    moved++;
    const id = (attrs.match(/\sid\s*=\s*"[^"]*"/i) || [''])[0];
    const type = (attrs.match(/\stype\s*=\s*"[^"]*"/i) || [''])[0];
    return `<script${id}${type} src="${src}"></script>`;
  });

  if (html !== before) { fs.writeFileSync(file, html, 'utf8'); pages++; }
}

console.log(
  `externalize-inline-scripts: ${moved} inline blocks -> ${written.size} files, ` +
  `${handlers} onclick handlers delegated, across ${pages} pages`
);
