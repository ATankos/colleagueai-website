const fs = require("fs");
const path = require("path");

const roots = ["dist", "public"];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && full.endsWith(".html")) {
      out.push(full);
    }
  }

  return out;
}

const css = [
  '<style id="cai-fixed-backtop-css">',
  '#cai-fixed-backtop {',
  'position: fixed !important;',
  'right: 22px !important;',
  'bottom: 22px !important;',
  'width: 48px !important;',
  'height: 48px !important;',
  'border: 0 !important;',
  'border-radius: 999px !important;',
  'background: #1d1b1a !important;',
  'color: #fff !important;',
  'font-size: 16px !important;',
  'font-weight: 700 !important;',
  'z-index: 2147483647 !important;',
  'cursor: pointer !important;',
  'display: none !important;',
  'align-items: center !important;',
  'justify-content: center !important;',
  'line-height: 1 !important;',
  '}',
  '#cai-fixed-backtop[data-show="true"] {',
  'display: flex !important;',
  '}',
  '</style>'
].join('\n');

const js = [
  '<script id="cai-fixed-backtop-js">',
  '(function () {',
  '  function ready(fn) {',
  '    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);',
  '    else fn();',
  '  }',
  '  function getY() {',
  '    return window.scrollY ||',
  '      (document.scrollingElement && document.scrollingElement.scrollTop) ||',
  '      (document.documentElement && document.documentElement.scrollTop) ||',
  '      (document.body && document.body.scrollTop) ||',
  '      0;',
  '  }',
  '  function forceTop() {',
  '    var html = document.documentElement;',
  '    var body = document.body;',
  '    var oldHtml = html ? html.style.scrollBehavior : "";',
  '    var oldBody = body ? body.style.scrollBehavior : "";',
  '    if (html) html.style.scrollBehavior = "auto";',
  '    if (body) body.style.scrollBehavior = "auto";',
  '    try { window.scrollTo(0, 0); } catch (e) {}',
  '    try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch (e) {}',
  '    var nodes = [document.scrollingElement, html, body];',
  '    for (var i = 0; i < nodes.length; i += 1) {',
  '      if (!nodes[i]) continue;',
  '      try { nodes[i].scrollTop = 0; nodes[i].scrollLeft = 0; } catch (e) {}',
  '    }',
  '    if (html) html.style.scrollBehavior = oldHtml || "";',
  '    if (body) body.style.scrollBehavior = oldBody || "";',
  '  }',
  '  ready(function () {',
  '    var button = document.getElementById("cai-fixed-backtop");',
  '    if (!button) {',
  '      button = document.createElement("button");',
  '      button.id = "cai-fixed-backtop";',
  '      button.type = "button";',
  '      button.textContent = "Top";',
  '      button.setAttribute("aria-label", "Back to top");',
  '      document.body.appendChild(button);',
  '    }',
  '    function show() {',
  '      button.setAttribute("data-show", getY() > 120 ? "true" : "false");',
  '    }',
  '    function clickHandler(event) {',
  '      if (event) { event.preventDefault(); event.stopPropagation(); }',
  '      forceTop();',
  '      if (window.requestAnimationFrame) window.requestAnimationFrame(forceTop);',
  '      window.setTimeout(forceTop, 50);',
  '      window.setTimeout(forceTop, 150);',
  '      window.setTimeout(forceTop, 400);',
  '      window.setTimeout(show, 450);',
  '    }',
  '    button.addEventListener("click", clickHandler, true);',
  '    button.addEventListener("pointerup", clickHandler, true);',
  '    button.addEventListener("touchend", clickHandler, true);',
  '    window.addEventListener("scroll", show, { passive: true });',
  '    window.addEventListener("load", show);',
  '    show();',
  '  });',
  '}());',
  '</script>'
].join('\n');

let count = 0;

for (const root of roots) {
  for (const file of walk(root)) {
    let html = fs.readFileSync(file, "utf8");

    html = html.replace(/\s*<style id="cai-fixed-backtop-css">[\s\S]*?<\/style>\s*/g, "\n");
    html = html.replace(/\s*<script id="cai-fixed-backtop-js">[\s\S]*?<\/script>\s*/g, "\n");

    if (html.includes("</head>")) {
      html = html.replace("</head>", css + "\n" + js + "\n</head>");
      fs.writeFileSync(file, html, "utf8");
      count += 1;
    }
  }
}

console.log("Injected fixed back-to-top button into " + count + " HTML files across dist/public");
