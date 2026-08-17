/* slim-locale-payloads.cjs — postbuild step, dist/ only.
 *
 * The agents catalogue pages are generated as byte-copies of the English
 * master, so every locale variant (and the English page itself) used to ship
 * the FULL multilingual payload on every page view:
 *   var I18N        — all 8 locales' UI strings          (~186 KB)
 *   var AGENTS_XX   — 7 locales' agent content           (~214 KB)
 *   var SRC/TR      — reader-section translations         (~67 KB)
 * That is ~465 KB of translations per view that the visitor's locale never
 * reads. This step slices each dist/ agents page down to its own locale:
 *   - I18N   -> { en } on the English page, { en, <loc> } on locale pages
 *   - AGENTS_XX -> only the page's own locale (none on the English page)
 *   - TR     -> only the page's own locale ({} on the English page; the
 *               runtime script no-ops for 'en' by restoring original HTML)
 *
 * public/ is NOT touched: public/agents.html stays the full master because it
 * is the single translation source of truth for the generators and for
 * tests/audit-i18n.mjs. Runs before externalize-inline-scripts.cjs so the
 * content-hashed /assets files are hashed on the slimmed content.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIST = path.join(process.cwd(), 'dist');
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function findMatchingBrace(source, startIndex) {
  let depth = 0, quote = '', escaped = false;
  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/* Replace `var NAME={...}` with a re-serialized subset (or remove the statement). */
function sliceVar(html, name, transform) {
  const marker = 'var ' + name + '=';
  const start = html.indexOf(marker);
  if (start < 0) return { html, changed: false };
  const braceStart = html.indexOf('{', start);
  const braceEnd = findMatchingBrace(html, braceStart);
  if (braceEnd < 0) return { html, changed: false };
  let obj;
  try {
    obj = vm.runInNewContext('(' + html.slice(braceStart, braceEnd + 1) + ')');
  } catch {
    return { html, changed: false };
  }
  const replacement = transform(obj);
  let end = braceEnd + 1;
  if (replacement === null) {
    // remove the whole statement, including a trailing semicolon
    if (html[end] === ';') end += 1;
    return { html: html.slice(0, start) + html.slice(end), changed: true };
  }
  return {
    html: html.slice(0, braceStart) + JSON.stringify(replacement) + html.slice(end === braceEnd + 1 ? braceEnd + 1 : end),
    changed: true
  };
}

function localeOf(file) {
  const rel = path.relative(DIST, file).split(path.sep);
  return LOCALES.includes(rel[0]) ? rel[0] : 'en';
}

const targets = walk(DIST).filter((f) => {
  const base = path.basename(f);
  const parent = path.basename(path.dirname(f));
  return base === 'agents.html' || (base === 'index.html' && parent === 'agents');
});

let saved = 0;
for (const file of targets) {
  const loc = localeOf(file);
  let html = fs.readFileSync(file, 'utf8');
  const before = Buffer.byteLength(html);

  // I18N: keep en + the page's own locale
  ({ html } = sliceVar(html, 'I18N', (o) => {
    const keep = { en: o.en || {} };
    if (loc !== 'en' && o[loc]) keep[loc] = o[loc];
    return keep;
  }));

  // AGENTS_XX: keep only the page's own locale content
  for (const l of LOCALES) {
    if (l === loc) continue;
    ({ html } = sliceVar(html, 'AGENTS_' + l.toUpperCase(), () => null));
  }

  // TR: keep only the page's own locale (empty on English pages)
  ({ html } = sliceVar(html, 'TR', (o) => (loc !== 'en' && o[loc] ? { [loc]: o[loc] } : {})));

  const after = Buffer.byteLength(html);
  if (after !== before) {
    fs.writeFileSync(file, html, 'utf8');
    saved += before - after;
    console.log('[slim] ' + path.relative(DIST, file) + ': ' + Math.round(before / 1024) + 'K -> ' + Math.round(after / 1024) + 'K');
  }
}
console.log('[slim] total saved across dist agents pages: ' + Math.round(saved / 1024) + ' KB');
