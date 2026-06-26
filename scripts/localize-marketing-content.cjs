const fs = require("fs");
const path = require("path");
const dict = require("./i18n/marketing-content.json");
const LOCALES = ["cs", "de", "fr", "es", "it", "pl", "pt"];
const ROOTS = ["public", "dist"];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else if (f.endsWith(".html")) out.push(f);
  }
  return out;
}
function localeOf(file) {
  const n = file.replace(/\\/g, "/");
  return LOCALES.find((l) => n.includes("/" + l + "/"));
}
function repl(s, en, tr) {
  return s.split('"' + en + '"').join('"' + tr + '"')
          .split("'" + en + "'").join("'" + tr + "'")
          .split(">" + en + "<").join(">" + tr + "<");
}
// map data-i18n key -> trimmed first-text-node, from the English base page
function i18nMap(html) {
  const m = {};
  for (const x of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
    if (m[x[1]] == null) m[x[1]] = x[2].trim();
  }
  return m;
}
function enBaseFor(file) {
  let n = file.replace(/\\/g, "/").replace(/^dist\//, "public/");
  for (const l of LOCALES) n = n.replace("/" + l + "/", "/");
  return n;
}
let changed = 0, frozen = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const loc = localeOf(file);
    if (!loc) continue;
    let s = fs.readFileSync(file, "utf8");
    const before = s;
    // 1) translate JS-data / visible marketing strings (demo card, factsheet values)
    for (const en in dict) { const tr = dict[en][loc]; if (tr) s = repl(s, en, tr); }
    // 2) freeze any data-i18n element whose localized text differs from the English base,
    //    so the page's applyLang() (which falls back to English) cannot revert it.
    const enFile = enBaseFor(file);
    if (fs.existsSync(enFile)) {
      const en = i18nMap(fs.readFileSync(enFile, "utf8"));
      s = s.replace(/data-i18n="([^"]+)"([^>]*>)([^<]*)</g, (full, key, mid, text) => {
        const lt = text.trim(), et = en[key];
        if (et != null && lt && lt !== et) { frozen++; return 'data-i18n-cai="' + key + '"' + mid + text + "<"; }
        return full;
      });
    }
    if (s !== before) { fs.writeFileSync(file, s, "utf8"); changed++; }
  }
}
console.log("[marketing-content] localized", changed, "files, froze", frozen, "elements");
