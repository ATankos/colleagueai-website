/* finalize-home.cjs — make the homepage the root document.
   Vite builds the demo SPA as index.html; Vercel serves filesystem matches
   before rewrites, so "/" would show the demo. This step renames the SPA to
   demo.html (served via the /demo rewrite) and installs home.html as index. */
const fs = require("fs");
const path = require("path");
const dist = path.resolve("dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  const idx = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  // only move it if it is the demo SPA (has the react mount), not an already-installed homepage
  if (idx.includes('src="/') && idx.includes("Live Demo")) {
    fs.writeFileSync(path.join(dist, "demo.html"), idx);
  }
}
if (fs.existsSync(path.join(dist, "home.html"))) {
  fs.copyFileSync(path.join(dist, "home.html"), path.join(dist, "index.html"));
}
for (const loc of ["cs", "de", "fr", "es", "it", "pl", "pt"]) {
  if (fs.existsSync(path.join(dist, loc, "home.html"))) {
    fs.copyFileSync(path.join(dist, loc, "home.html"), path.join(dist, loc, "index.html"));
  }
}
console.log("[finalize-home] homepage installed at / and /cs; demo SPA at /demo.html");
