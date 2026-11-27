/**
 * scripts/optimize-render-path.cjs - last postbuild step, two changes that shorten the path to first paint:
 *   1. merge each run of ADJACENT externalized stylesheets in <head> into one file, in their original order;
 *   2. mark the externalized classic scripts in <body> `defer`, so they no longer stop rendering;
 *   3. move the stylesheets scattered through <body> into one combined file at the end of <head>. Every body stylesheet
 *      already comes after every head stylesheet in document order, so the cascade is unchanged; moving stops at the
 *      first body stylesheet that cannot move (an id read by code, or a non-local URL), so nothing jumps over it.
 *
 * Why: the build externalizes inline <style> blocks (the CSP forbids inline styles), which left the catalogue with 19
 * render-blocking stylesheet requests in <head>; on a mobile connection each one costs a round trip before first paint
 * (Lighthouse: FCP = LCP = 3.9 s, "render-blocking requests" the main cause).
 *
 * Safety: only consecutive <link rel="stylesheet" href="/assets/inline-*.css"> tags with no media/other attributes are
 * merged, so the cascade order is exactly what it was (nothing between them moves). Links whose id is read by code
 * (KEEP_IDS) are never merged: they stay in place and split the run. The merged file is content-hashed like the others
 * and shared by every page with the same run. Idempotent: a second run finds nothing left to merge.
 *
 * Deferring (2): every page script is an external /assets/inline-*.js file (the CSP allows no inline script), so marking
 * the BODY ones `defer` keeps their relative order (deferred scripts run in document order, before DOMContentLoaded).
 * Head scripts stay synchronous: they set locale and state before first paint. Scripts that already carry
 * async/defer/type/src attributes other than an optional id are left alone.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIST = path.resolve(process.cwd(), process.argv[2] || 'dist');
const ASSETS = path.join(DIST, 'assets');
// Read at runtime (src/backToTopFix.js) or by a build check (scripts/check-url-locale-controller.cjs).
const KEEP_IDS = new Set(['cai-fixed-backtop-css', 'cai-url-locale-controller-css']);

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'assets') walk(p, out); } else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
};

const BODY_SCRIPT = /<script(?: id="([A-Za-z0-9_-]+)")? src="(\/assets\/inline-[0-9a-f]{16}\.js)"><\/script>/g;
function deferBodyScripts(body) {
  let n = 0;
  const out = body.replace(BODY_SCRIPT, (m, id, src) => { n += 1; return `<script${id ? ` id="${id}"` : ''} defer src="${src}"></script>`; });
  return { body: out, deferred: n };
}

// A local stylesheet link in <body>: externalized (/assets/inline-*.css) or a plain site file such as /cai-authority-graph.css.
const BODY_LINK = /<link rel="stylesheet"(?: id="([A-Za-z0-9_-]+)")? href="(\/(?:assets\/inline-[0-9a-f]{16}|[a-z0-9-]+)\.css)">|<link\b[^>]*rel="stylesheet"[^>]*>/g;
function hoistBodyStyles(head, body, written) {
  const moved = [];
  let stop = false;
  const rest = body.replace(BODY_LINK, (m, id, href) => {
    if (stop) return m;
    if (!href || (id && KEEP_IDS.has(id))) { stop = true; return m; } // cannot move: keep it and everything after it
    const file = path.join(DIST, href);
    if (!fs.existsSync(file)) { stop = true; return m; }
    moved.push({ href, id: id || null, css: fs.readFileSync(file, 'utf8') });
    return '';
  });
  if (!moved.length) return { head, body, hoisted: 0 };
  const bodyCss = moved.map((r) => `/* ${r.href}${r.id ? ` #${r.id}` : ''} */\n${r.css}`).join('\n');
  const name = `inline-${crypto.createHash('sha256').update(bodyCss).digest('hex').slice(0, 16)}.css`;
  if (!written.has(name)) { fs.writeFileSync(path.join(ASSETS, name), bodyCss, 'utf8'); written.add(name); }
  const ids = moved.map((r) => r.id).filter(Boolean);
  return { head: head + `<link rel="stylesheet" href="/assets/${name}" data-hoisted="${moved.length}"${ids.length ? ` data-merged="${ids.join(' ')}"` : ''}>`, body: rest, hoisted: moved.length };
}

// One link tag, on its own, exactly as the externalize step writes it (optionally with an id).
const LINK = /<link rel="stylesheet"(?: id="([A-Za-z0-9_-]+)")? href="\/assets\/(inline-[0-9a-f]{16}\.css)">/y;

function combineHead(head, written) {
  let out = '', i = 0, merged = 0;
  while (i < head.length) {
    const run = [];
    let j = i, gapStart = i;
    for (;;) {
      LINK.lastIndex = j;
      const m = LINK.exec(head);
      if (!m || (m[1] && KEEP_IDS.has(m[1]))) break;
      run.push({ id: m[1] || null, file: m[2], end: LINK.lastIndex });
      j = LINK.lastIndex;
      const ws = /^\s*/.exec(head.slice(j))[0]; // whitespace between adjacent tags does not break a run
      j += ws.length;
    }
    if (run.length >= 2) {
      const body = run.map((r) => `/* ${r.file}${r.id ? ` #${r.id}` : ''} */\n` + fs.readFileSync(path.join(ASSETS, r.file), 'utf8')).join('\n');
      const file = `inline-${crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)}.css`;
      if (!written.has(file)) { fs.writeFileSync(path.join(ASSETS, file), body, 'utf8'); written.add(file); }
      const ids = run.map((r) => r.id).filter(Boolean);
      out += `<link rel="stylesheet" href="/assets/${file}"${ids.length ? ` data-merged="${ids.join(' ')}"` : ''}>`;
      out += head.slice(run[run.length - 1].end, j); // keep the trailing whitespace
      merged += run.length - 1;
      i = j;
    } else {
      out += head[gapStart];
      i = gapStart + 1;
    }
  }
  return { head: out, merged };
}

if (require.main === module) {
  if (!fs.existsSync(ASSETS)) { console.log('[optimize-render-path] no dist/assets, nothing to do'); process.exit(0); }
  const written = new Set();
  let pages = 0, saved = 0, deferredTotal = 0;
  for (const file of walk(DIST)) {
    const html = fs.readFileSync(file, 'utf8');
    const end = html.indexOf('</head>');
    if (end < 0) continue;
    const c = combineHead(html.slice(0, end), written);
    const d = deferBodyScripts(html.slice(end));
    const h = hoistBodyStyles(c.head, d.body, written);
    if (c.merged || d.deferred || h.hoisted) { fs.writeFileSync(file, h.head + h.body, 'utf8'); pages += 1; saved += c.merged + h.hoisted; deferredTotal += d.deferred; }
  }
  console.log(`[optimize-render-path] ${saved} stylesheet request(s) merged away, ${deferredTotal} body script(s) deferred, across ${pages} page(s); ${written.size} combined file(s)`);
}

module.exports = { combineHead, deferBodyScripts, hoistBodyStyles, KEEP_IDS };
