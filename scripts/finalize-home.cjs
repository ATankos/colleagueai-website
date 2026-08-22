/* finalize-home.cjs — make the homepage the root document.
   Vite builds the demo SPA as index.html; Vercel serves filesystem matches
   before rewrites, so "/" would show the demo. This step renames the SPA to
   demo.html (served via the /demo rewrite) and installs home.html as index. */
const fs = require("fs");
const path = require("path");
const dist = path.resolve("dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  const idx = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  // Detect the SPA structurally (react mount + module bundle), never by copy text.
  // This previously keyed off the string "Live Demo"; when that wording changed,
  // demo.html stopped being written and /demo 404'd across the whole site.
  const isSpa = idx.includes('id="root"') && /<script[^>]+type="module"[^>]*src="/.test(idx);
  if (isSpa) {
    fs.writeFileSync(path.join(dist, "demo.html"), idx);
  }
}
// The home masters carry an unpublished founder-section draft inside an HTML comment.
// Comments never render, but crawlers and audits read them; ship the pages without any.
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "");
const installHome = (src, dest) => {
  const clean = stripComments(fs.readFileSync(src, "utf8"));
  fs.writeFileSync(src, clean, "utf8");   // the home.html copy in dist is reachable as a static file too
  fs.writeFileSync(dest, clean, "utf8");
};
if (fs.existsSync(path.join(dist, "home.html"))) {
  installHome(path.join(dist, "home.html"), path.join(dist, "index.html"));
}
for (const loc of ["cs", "de", "fr", "es", "it", "pl", "pt"]) {
  if (fs.existsSync(path.join(dist, loc, "home.html"))) {
    installHome(path.join(dist, loc, "home.html"), path.join(dist, loc, "index.html"));
  }
}
console.log("[finalize-home] homepage installed at / and /cs; demo SPA at /demo.html");
