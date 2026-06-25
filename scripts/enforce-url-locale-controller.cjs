const fs = require("fs");
const path = require("path");
const { DEFAULT_LOCALE, SUPPORTED_LOCALE_CODES, PAGE_SLUGS, GLOBAL_PAGES, LOCALES } = require("./i18n/config.cjs");

const PAGES = GLOBAL_PAGES;
const ROOTS = ["public", "dist"];

const LABELS = {};
for (const l of LOCALES) LABELS[l.code] = l.label || l.code.toUpperCase();

// The slug map is the single source of truth; bake a compact copy into the inlined controller.
const DATA = JSON.stringify({ def: DEFAULT_LOCALE, locales: SUPPORTED_LOCALE_CODES, labels: LABELS, slugs: PAGE_SLUGS });

const CSS = [
  '<style id="cai-url-locale-controller-css">',
  'html[data-cai-page="agents"] #cai-site-journey,',
  'html[data-cai-page="agents"] #cai-buyer-path { display: none !important; }',
  '.cai-langsel { margin: 14px auto 0; max-width: 1120px; padding: 0 18px; }',
  '.cai-langsel select { font: 500 13px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #2B2A28; border: 1px solid rgba(29,27,26,.18); border-radius: 100px; padding: 7px 12px; background: #fff; cursor: pointer; }',
  '</style>'
].join("\n");

const SCRIPT = [
  '<script id="cai-url-locale-controller">',
  '(function () {',
  '  var D = ' + DATA + ';',
  '  var parts = location.pathname.split("/").filter(Boolean);',
  '  var hasLocale = D.locales.indexOf(parts[0]) >= 0;',
  '  var locale = hasLocale ? parts[0] : D.def;',
  '  var rest = hasLocale ? parts.slice(1) : parts;',
  '  function pageFromSlug(slug) { for (var p in D.slugs) { var m = D.slugs[p]; for (var l in m) { if (m[l] === slug) return p; } } return null; }',
  '  var page = rest.length ? pageFromSlug(rest[0]) : null;',
  '  function canonical(loc, p) { var m = D.slugs[p] || {}; var slug = m[loc] || m[D.def] || p; return loc === D.def ? "/" + slug : "/" + loc + "/" + slug; }',
  '  function urlFor(loc) {',
  '    if (page) return canonical(loc, page) + location.search + location.hash;',
  '    var tail = "/" + rest.join("/");',
  '    var base = loc === D.def ? (tail === "/" ? "/" : tail) : "/" + loc + (tail === "/" ? "" : tail);',
  '    return base + location.search + location.hash;',
  '  }',
  '  var el = document.documentElement;',
  '  el.lang = locale;',
  '  el.setAttribute("data-cai-route-locale", locale);',
  '  // URL path is the single source of truth. One write-only key for cross-surface',
  '  // parity only; never read to redirect, never set ahead of the URL path.',
  '  try { localStorage.setItem("cai-lang", locale); } catch (e) {}',
  '  function mount() {',
  '    var sel = document.getElementById("langsel");',
  '    if (!sel) return;',
  '    var fresh = sel.cloneNode(false);',
  '    fresh.innerHTML = "";',
  '    D.locales.forEach(function (l) { var o = document.createElement("option"); o.value = l; o.textContent = D.labels[l] || l.toUpperCase(); if (l === locale) o.selected = true; fresh.appendChild(o); });',
  '    fresh.value = locale;',
  '    fresh.setAttribute("data-cai-locale-bound", "true");',
  '    if (sel.parentNode) sel.parentNode.replaceChild(fresh, sel);',
  '    fresh.addEventListener("change", function () { var t = fresh.value; if (D.locales.indexOf(t) < 0) return; try { localStorage.setItem("cai-lang", t); } catch (e) {} location.assign(urlFor(t)); });',
  '  }',
  '  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", mount); } else { mount(); }',
  '})();',
  '</script>'
].join("\n");

const CONTROLLER = CSS + "\n" + SCRIPT;
const LANGSEL = '<div class="cai-langsel"><select id="langsel" aria-label="Language"></select></div>';

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(file));
    if (entry.isFile() && file.endsWith(".html")) out.push(file);
  }
  return out;
}

function isTargetHtml(file) {
  const normalized = file.replace(/\\/g, "/");
  return PAGES.some((page) =>
    normalized.endsWith("/" + page + ".html") ||
    normalized.endsWith("/" + page + "/index.html")
  );
}

function applyController(html) {
  // Idempotent: strip any prior controller + previously-injected selector first.
  html = html.replace(/\s*<style id="cai-url-locale-controller-css">[\s\S]*?<\/style>\s*/g, "\n");
  html = html.replace(/\s*<script id="cai-url-locale-controller">[\s\S]*?<\/script>\s*/g, "\n");
  html = html.replace(/\s*<div class="cai-langsel">[\s\S]*?<\/div>\s*/g, "\n");
  html = html.replace(/\n{3,}/g, "\n\n");

  // Exactly one visible selector: inject only if the page has no native #langsel.
  if (!/id="langsel"/.test(html)) {
    const body = html.match(/<body[^>]*>/i);
    if (body) html = html.replace(body[0], body[0] + "\n" + LANGSEL);
  }

  const headClose = html.indexOf("</head>");
  if (headClose >= 0) {
    return html.slice(0, headClose).replace(/\s*$/, "\n") + CONTROLLER + "\n" + html.slice(headClose).replace(/^\s*/, "");
  }
  return CONTROLLER + "\n" + html.replace(/^\s*/, "");
}

let changed = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (!isTargetHtml(file)) continue;
    const before = fs.readFileSync(file, "utf8");
    const after = applyController(before);
    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      changed += 1;
    }
  }
}
console.log("URL locale controller enforcement applied to", changed, "files.");
