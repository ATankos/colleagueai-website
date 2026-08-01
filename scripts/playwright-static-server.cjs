const http = require("http");
const fs = require("fs");
const path = require("path");

const rootArg = process.argv[2] || "public";
const port = Number(process.argv[3] || process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const root = path.resolve(process.cwd(), rootArg);

/* Vercel serves this site through rewrites and redirects declared in
   vercel.json: pretty localized slugs like /fr/confiance map to
   /fr/trust.html, and /demo only exists in the build output. Without them a
   plain static server 404s on most real URLs, which is why the Playwright
   specs failed 58 times the first time they were actually run. */
let REDIRECTS = new Map();
let REWRITES = new Map();
let PATTERNS = [];
try {
  const vercel = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8"));
  for (const r of vercel.redirects || []) REDIRECTS.set(r.source.replace(/\/$/, ""), r.destination);
  for (const r of vercel.rewrites || []) {
    if (r.source.includes(":")) {
      PATTERNS.push({
        re: new RegExp("^" + r.source.replace(/:[a-zA-Z]+/g, "([^/]+)") + "$"),
        to: r.destination,
      });
    } else {
      REWRITES.set(r.source.replace(/\/$/, ""), r.destination);
    }
  }
} catch (error) {
  console.warn("static server: could not read vercel.json —", error.message);
}

function applyRouting(urlPath) {
  const clean = urlPath.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  if (REWRITES.has(clean)) return REWRITES.get(clean);
  for (const p of PATTERNS) {
    const m = p.re.exec(clean);
    if (m) return p.to.replace(/:[a-zA-Z]+/g, () => m[1]);
  }
  return urlPath;
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function safeResolve(candidate) {
  const full = path.resolve(root, candidate);
  if (!full.startsWith(root)) return null;
  return full;
}

function findFile(urlPath) {
  let clean = urlPath.split("?")[0].split("#")[0];

  try {
    clean = decodeURIComponent(clean);
  } catch (error) {
    clean = "/";
  }

  clean = clean.replace(/^\/+/, "");

  if (!clean) clean = "agents.html";

  const candidates = [
    clean,
    path.join(clean, "index.html"),
    clean + ".html"
  ];

  for (const candidate of candidates) {
    const full = safeResolve(candidate);
    if (!full) continue;

    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) return full;
    } catch (error) {}
  }

  return null;
}

const server = http.createServer((req, res) => {
  const raw = (req.url || "/").split("?")[0].replace(/\/$/, "") || "/";
  const target = REDIRECTS.get(raw);
  if (target) {
    res.statusCode = 301;
    res.setHeader("Location", target);
    res.end();
    return;
  }

  const file = findFile(applyRouting(req.url || "/"));

  if (!file) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const ext = path.extname(file).toLowerCase();
  res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");

  fs.createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log("Static test server running at http://" + host + ":" + port + "/ from " + root);
});
