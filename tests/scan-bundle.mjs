/**
 * tests/scan-bundle.mjs — builds nothing itself; scans dist/ (run `npm run build` first)
 * for secret patterns. Prints file + pattern NAME only — never the matched value.
 * Usage: npm run build && node tests/scan-bundle.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('../dist', import.meta.url).pathname;
const PATTERNS = [
  ['Stripe live secret key', /sk_live_[0-9a-zA-Z]{10,}/],
  ['Stripe test secret key', /sk_test_[0-9a-zA-Z]{10,}/],
  ['Stripe webhook signing secret', /whsec_[0-9a-zA-Z]{10,}/],
  ['Stripe restricted key', /rk_(live|test)_[0-9a-zA-Z]{10,}/],
  ['Upstash REST token (Bearer A… near upstash host)', /upstash\.io[\s\S]{0,200}Bearer\s+A[0-9a-zA-Z=_-]{20,}/],
  ['Anthropic API key', /sk-ant-[0-9a-zA-Z-]{10,}/],
];
let hits = 0, files = 0;
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(js|html|css|json|map|txt|xml)$/.test(e)) continue;
    files++;
    const body = readFileSync(p, 'utf8');
    for (const [name, re] of PATTERNS) if (re.test(body)) { hits++; console.log(`CRITICAL  ${name}  in ${p.replace(ROOT, 'dist')}`); }
  }
})(ROOT);
console.log(hits === 0 ? `PASS — no secret patterns in ${files} bundle files` : `FAIL — ${hits} hit(s)`);
process.exit(hits ? 1 : 0);
