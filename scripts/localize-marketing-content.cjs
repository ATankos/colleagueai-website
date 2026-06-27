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

function balanced(str, marker) {
  const i = str.indexOf(marker); if (i < 0) return null;
  let j = i + marker.length;
  while (j < str.length && str[j] !== "[" && str[j] !== "{") j++;
  if (j >= str.length) return null;
  const open = str[j], close = open === "[" ? "]" : "}";
  let depth = 0, inStr = false, esc = false;
  for (let k = j; k < str.length; k++) {
    const c = str[k];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return str.slice(j, k + 1); }
  }
  return null;
}
function slugify(n){ return String(n||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function localizeCatalogue(s, loc) {
  try {
    const ag = balanced(s, "AGENTS="); const tj = balanced(s, "AGENTS_" + loc.toUpperCase() + "=");
    if (!ag || !tj) return s;
    const agents = JSON.parse(ag), tr = JSON.parse(tj);
    for (const a of agents) {
      const t = tr[slugify(a.n)]; if (!t) continue;
      for (const fld of ["desc","kpi","fit"]) {
        if (a[fld] && t[fld] && a[fld] !== t[fld]) {
          s = s.split('"' + fld + '":' + JSON.stringify(a[fld])).join('"' + fld + '":' + JSON.stringify(t[fld]));
        }
      }
    }
  } catch (e) {}
  return s;
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
    // 3b) ensure the catalogue/factsheet use the already-present per-locale agent data
    if (/AGENTS_/.test(s) && s.indexOf("cai-langnow-fix") < 0) {
      const js = '<script id="cai-langnow-fix">(function(){function go(){try{var L="' + loc + '";window.LANGNOW=L;var D=window["AGENTS_"+L.toUpperCase()];if(D&&window.AGENTS){window.AGENTS.forEach(function(a){var g=(a.n||a.name||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");if(D[g]){for(var k in D[g])a[k]=D[g][k];}});}if(typeof render==="function"){render();}}catch(e){}}if(document.readyState!=="loading"){go();}else{document.addEventListener("DOMContentLoaded",go);}})();<\/script>';
      if (s.indexOf("</body>") >= 0) s = s.replace("</body>", js + "</body>"); else s += js;
    }
    // localize agent catalogue data (factsheet reads a.desc directly from AGENTS)
    s = localizeCatalogue(s, loc);
    // factsheet panel header
    const ghdr = dict["Governance factsheet"] && dict["Governance factsheet"][loc];
    if (ghdr) s = s.split("▣ Governance factsheet").join("▣ " + ghdr);
    if (s !== before) { fs.writeFileSync(file, s, "utf8"); changed++; }
  }
}
console.log("[marketing-content] localized", changed, "files, froze", frozen, "elements");
