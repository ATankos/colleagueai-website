/**
 * tests/local-server.mjs — minimal local replica of vercel.json routing for dist/
 * Serves headers, the / redirect, rewrites (incl. locale → agents.html?lang=) and SPA catch-all,
 * so the audit scripts can run against http://localhost:PORT exactly as they run against prod.
 * Usage: node tests/local-server.mjs [port]   (default 4173; requires `npm run build` first)
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../dist', import.meta.url));
const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
const PORT = Number(process.argv[2] ?? 4173);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
  '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.xml':'application/xml',
  '.txt':'text/plain; charset=utf-8', '.pdf':'application/pdf' };

function applyHeaders(res, path) {
  for (const h of cfg.headers ?? []) {
    const re = new RegExp('^' + h.source.replace(/\(\.\*\)/g, '(.*)') + '$');
    if (re.test(path)) for (const { key, value } of h.headers) res.setHeader(key, value);
  }
}
http.createServer((req, res) => {
  const url = new URL(req.url, `http://x`);
  let path = url.pathname;
  applyHeaders(res, path);
  for (const r of cfg.redirects ?? []) {
    if (path === r.source) {
      res.writeHead(r.permanent ? 308 : 307, { Location: r.destination });
      return res.end();
    }
  }
  // Vercel serves the filesystem before rewrites
  if (path !== '/' && existsSync(join(ROOT, path)) && !path.endsWith('/')) {
    try {
      const body = readFileSync(join(ROOT, path));
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
      return res.end(body);
    } catch {}
  }
  let dest = null;
  for (const rw of cfg.rewrites ?? []) {
    if (rw.source === '/(.*)') { dest = dest ?? rw.destination; break; }
    if (path === rw.source) { dest = rw.destination; break; }
  }
  const [destPath] = (dest ?? path).split('?');
  let file = join(ROOT, destPath);
  if (!existsSync(file) && existsSync(join(ROOT, path))) file = join(ROOT, path);
  if (!existsSync(file)) {
    // No filesystem match and no rewrite: Vercel serves 404.html with status 404
    const nf = join(ROOT, '404.html');
    if (existsSync(nf)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(nf));
    }
    res.writeHead(404); return res.end('not found');
  }
  const body = readFileSync(file);
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
}).listen(PORT, () => console.log(`[local-server] dist/ on http://localhost:${PORT}`));
