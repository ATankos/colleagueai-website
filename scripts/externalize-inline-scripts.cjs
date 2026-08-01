/* externalize-inline-scripts.cjs — final postbuild step.
 *
 * Moves every executable inline <script> in dist/ into a content-hashed file
 * under /assets/, and rewrites the inline onclick handlers into a delegated
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
 *   - Tags are located with an index scanner rather than a regex. A regex of the
 *     form /<script([^>]*)>/ mis-parses any attribute value containing ">", and
 *     CodeQL flags that shape as an incomplete HTML filter. Scanning respects
 *     quoted attribute values, so it is both correct and quiet.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIST = path.join(process.cwd(), 'dist');
const ASSETS = path.join(DIST, 'assets');

// Both spellings of the mobile menu button handler that appear in the pages.
const ONCLICKS = [
  `onclick="var m=document.getElementById('caihdrm');m.classList.toggle('open')"`,
  `onclick="document.getElementById('caihdrm').classList.toggle('open')"`,
];
const DELEGATE =
  '(function(){document.addEventListener("click",function(e){' +
  'var b=e.target&&e.target.closest?e.target.closest("[data-cai-menu-toggle]"):null;' +
  'if(!b)return;var m=document.getElementById("caihdrm");' +
  'if(m)m.classList.toggle("open");});})();';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Locate every <script>...</script>, honouring quotes inside the open tag. */
function findScripts(html) {
  const lower = html.toLowerCase();
  const found = [];
  let i = 0;
  while ((i = lower.indexOf('<script', i)) !== -1) {
    const next = html[i + 7];
    if (next && /[a-z0-9_-]/i.test(next)) { i += 7; continue; }   // <scriptfoo
    let j = i + 7;
    let quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
      j++;
    }
    if (j >= html.length) break;
    const bodyStart = j + 1;
    const close = lower.indexOf('</script', bodyStart);
    if (close === -1) break;
    const closeEnd = html.indexOf('>', close);
    if (closeEnd === -1) break;
    found.push({ start: i, end: closeEnd + 1, attrs: html.slice(i + 7, j), body: html.slice(bodyStart, close) });
    i = closeEnd + 1;
  }
  return found;
}

function attr(attrs, name) {
  const m = new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(attrs);
  return m ? ` ${name}="${m[1]}"` : '';
}

function emit(body, written) {
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  const file = `inline-${hash}.js`;
  const full = path.join(ASSETS, file);
  if (!fs.existsSync(full)) fs.writeFileSync(full, body, 'utf8');
  const src = `/assets/${file}`;
  written.add(src);
  return src;
}

if (!fs.existsSync(DIST)) {
  console.log('externalize-inline-scripts: no dist/, nothing to do');
  process.exit(0);
}
fs.mkdirSync(ASSETS, { recursive: true });

let pages = 0, moved = 0, handlers = 0;
const written = new Set();

for (const file of walk(DIST)) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  // 1. delegate the mobile menu button instead of handling it inline
  let hits = 0;
  for (const oc of ONCLICKS) {
    if (!html.includes(oc)) continue;
    hits += html.split(oc).length - 1;
    html = html.split(oc).join('data-cai-menu-toggle');
  }
  if (hits) {
    handlers += hits;
    const src = emit(DELEGATE, written);
    html = html.replace('</body>', `<script src="${src}"></script>\n</body>`);
  }

  // 2. move each executable inline block out to /assets, in place
  const blocks = findScripts(html);
  for (let k = blocks.length - 1; k >= 0; k--) {          // back to front: offsets stay valid
    const b = blocks[k];
    if (/\ssrc\s*=/i.test(b.attrs)) continue;             // already external
    if (/type\s*=\s*"[^"]*json/i.test(b.attrs)) continue; // JSON-LD is data
    if (!b.body.trim()) continue;
    const src = emit(b.body, written);
    const tag = `<script${attr(b.attrs, 'id')}${attr(b.attrs, 'type')} src="${src}"></script>`;
    html = html.slice(0, b.start) + tag + html.slice(b.end);
    moved++;
  }

  if (html !== before) { fs.writeFileSync(file, html, 'utf8'); pages++; }
}

console.log(
  `externalize-inline-scripts: ${moved} inline blocks -> ${written.size} files, ` +
  `${handlers} onclick handlers delegated, across ${pages} pages`,
);
