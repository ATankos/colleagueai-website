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
let changed = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const loc = localeOf(file);
    if (!loc) continue;
    let s = fs.readFileSync(file, "utf8");
    const before = s;
    for (const en in dict) { const tr = dict[en][loc]; if (tr) s = repl(s, en, tr); }
    if (s !== before) { fs.writeFileSync(file, s, "utf8"); changed++; }
  }
}
console.log("[marketing-content] localized", changed, "files");
