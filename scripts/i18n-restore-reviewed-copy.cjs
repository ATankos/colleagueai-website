/* i18n-restore-reviewed-copy.cjs — final localization guard.
 *
 * public/ is both source and build output, so regenerating localized pages from
 * the English source can drop reviewed translations for strings the dictionaries
 * do not cover. Those strings silently revert to English on every build.
 *
 * This step runs last and restores the reviewed wording from
 * scripts/i18n/reviewed-copy.json. Replacement is single-pass and skips text that
 * already reads correctly, so running it repeatedly is safe.
 */
const fs = require("fs");
const path = require("path");
const DICT = require("./i18n/reviewed-copy.json");
const LOCALES = Object.keys(DICT);
const ROOTS = ["public", "dist"];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".html")) out.push(p);
  }
  return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One pass over the document: replaced text is never rescanned, and a match whose
// corrected form is already present is left untouched (idempotent).
function applyDict(html, dict) {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  if (!keys.length) return html;
  const re = new RegExp(keys.map(esc).join("|"), "g");
  return html.replace(re, (m, offset, whole) => {
    const v = dict[m];
    if (v === undefined) return m;
    if (whole.startsWith(v, offset)) return m; // already correct
    return v;
  });
}

let patched = 0;
for (const root of ROOTS) {
  for (const locale of LOCALES) {
    const dict = DICT[locale];
    for (const file of walk(path.join(root, locale))) {
      const before = fs.readFileSync(file, "utf8");
      const after = applyDict(before, dict);
      if (after !== before) { fs.writeFileSync(file, after, "utf8"); patched += 1; }
    }
  }
}
console.log("[i18n-restore-reviewed-copy] restored reviewed wording in", patched, "files");
