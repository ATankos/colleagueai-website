const fs = require("fs");
const path = require("path");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const css = `<style id="cai-fixed-backtop-css">
#cai-fixed-backtop {
  position: fixed !important;
  right: 22px !important;
  bottom: 22px !important;
  width: 48px !important;
  height: 48px !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: #1d1b1a !important;
  color: #fff !important;
  font-size: 22px !important;
  z-index: 2147483647 !important;
  cursor: pointer !important;
  display: none;
 22px !important;
  z-index: 2147483647 !important;
  cursor: pointer !important;
  display: none;
  align-items: center !important;
  justify-content: center !important;
}
#cai-fixed-backtop[data-show="true"] {
  display: flex !important;
}
</style>`;

const js = `<script id="cai-fixed-backtop-js">
(function () {
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    var b = document.getElementById("cai-fixed-backtop");
    if (!b) {
      b = document.createElement("button");
      b.id = "cai-fixed-backtop";
      b.type = "button";
      b.textContent = "↑";
      b.setAttribute("aria-label", "Back to top");
      document.body.appendChild(b);
    }

    function show() {
      b.setAttribute("data-show", window.scrollY > 200 ? "true" : "false");
    }

    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, true);

    window.addEventListener("scroll", show, { passive: true });
    show();
  });
})();
</script>`;

for (const file of walk("dist")) {
  if (!file.endsWith(".html")) continue;

  let html = fs.readFileSync(file, "utf8");
  html = html.replace(/\n*<style id="cai-fixed-backtop-css">[\s\S]*?<\/style>\s*/g, "\n");
  html = html.replace(/\n*<script id="cai-fixed-backtop-js">[\s\S]*?<\/script>\s*/g, "\n");

  const marker = "</head>";
  if (html.includes(marker)) {
    html = html.replace(marker, css + "\n" + js + "\n" + marker);
  }

  fs.writeFileSync(file, html, "utf8");
}

console.log("Injected fixed back-to-top button into dist HTML");
