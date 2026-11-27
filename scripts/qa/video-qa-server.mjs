// Static server for QA: dist/ with vercel.json rewrites, the production CSP header and byte-range responses.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const CSP = VERCEL.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
const REWRITES = new Map(VERCEL.rewrites.filter((r) => !r.source.includes(':') && !r.source.includes('(')).map((r) => [r.source, r.destination]));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' };
export const log = [];

function resolve(p) {
  if (REWRITES.has(p)) p = REWRITES.get(p);
  const cands = [p, `${p}.html`, path.posix.join(p, 'index.html')];
  for (const c of cands) {
    const f = path.join(DIST, decodeURIComponent(c));
    if (f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

export function start(port = 4321) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const file = resolve(u.pathname === '/' ? '/index.html' : u.pathname.replace(/\/$/, ''));
    log.push({ path: u.pathname, range: req.headers.range || null });
    if (!file) { res.writeHead(404, { 'Content-Security-Policy': CSP }); return res.end('not found'); }
    const ext = path.extname(file);
    const size = fs.statSync(file).size;
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Security-Policy': CSP, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const a = range[1] ? Number(range[1]) : 0;
      const b = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}
