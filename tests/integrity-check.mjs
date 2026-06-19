/**
 * tests/integrity-check.mjs — static HTML integrity gate (no browser required).
 *
 * Scans every shipped .html page under public/ for the classes of defect that
 * have actually bitten this site:
 *   - unbalanced <script>/<style> tags  → raw code leaks onto the page
 *   - doubled opening tags  (<section <section ...>)
 *   - orphaned opening tags (a line that is bare attributes + '>' with no '<tag')
 *   - in-page anchor links (#id) that point at a section id that doesn't exist
 *   - obviously-broken internal links
 *
 * Usage:  node tests/integrity-check.mjs
 * Exit 0 = clean, Exit 1 = one or more defects (so it works as a CI / pre-deploy gate).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');

// Routes the site serves that don't map 1:1 to a public/*.html file name.
// (vercel.json rewrites clean URLs onto .html files; these are treated as valid link targets.)
const KNOWN_ROUTES = new Set([
  '/', '/agents', '/demo', '/trust', '/terms', '/license', '/privacy',
  '/partners', '/partner-agreement', '/legal-review-checklist',
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function count(re, s) {
  const m = s.match(re);
  return m ? m.length : 0;
}

const failures = [];
const warnings = [];
const files = walk(PUBLIC);

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const html = readFileSync(file, 'utf8');
  const lines = html.split(/\r?\n/);

  // 1. script / style tag balance — the analytics-leak bug
  const scriptOpen = count(/<script[\s>]/gi, html);
  const scriptClose = count(/<\/script>/gi, html);
  if (scriptOpen !== scriptClose) {
    failures.push(`${rel}: <script> unbalanced — ${scriptOpen} open vs ${scriptClose} close (raw JS will render as text)`);
  }
  const styleOpen = count(/<style[\s>]/gi, html);
  const styleClose = count(/<\/style>/gi, html);
  if (styleOpen !== styleClose) {
    failures.push(`${rel}: <style> unbalanced — ${styleOpen} open vs ${styleClose} close`);
  }

  // 2. doubled opening tag, e.g. "<section <section ...>"
  const doubled = html.match(/<([a-z][\w-]*)\s+<\1[\s>]/i);
  if (doubled) failures.push(`${rel}: doubled opening tag near "${doubled[0].slice(0, 40)}"`);

  // 3. orphaned opening tag — bare attributes ending in '>' with no '<' on the line.
  //    Guard against false positives on normal multi-line tags: a genuine orphan follows
  //    a line that already closed (ends in '>'); a wrapped attribute line follows '<tag'.
  lines.forEach((ln, i) => {
    const bareAttrs = /^\s*(id|class|aria-[a-z]+|role|data-[a-z-]+)="[^"]*"[^<]*>/i.test(ln) && !ln.includes('<');
    if (!bareAttrs) return;
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === '') j--;
    const prevClosed = j < 0 || lines[j].trimEnd().endsWith('>');
    if (prevClosed) {
      failures.push(`${rel}:${i + 1}: orphaned tag (bare attributes, no opening "<"): ${ln.trim().slice(0, 60)}`);
    }
  });

  // 4. visible-code smell: the analytics comment must live inside a <script>
  if (/\/\* -+ ANALYTICS/.test(html)) {
    const idx = html.indexOf('/* ---------- ANALYTICS');
    const before = html.slice(0, idx);
    const lastOpen = before.lastIndexOf('<script');
    const lastClose = before.lastIndexOf('</script>');
    if (lastOpen < lastClose) {
      failures.push(`${rel}: ANALYTICS block is not inside a <script> tag (will render as visible text)`);
    }
  }

  // 5. in-page anchors must resolve to a real id in the same document
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  for (const a of anchors) {
    if (!ids.has(a)) warnings.push(`${rel}: nav/link anchor #${a} has no matching id in the page`);
  }

  // 6. internal absolute links should resolve to a known route, a localized path, or a static file
  const internal = [...html.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]);
  for (const href of internal) {
    if (href.startsWith('/api') || href.startsWith('/docs') || href.startsWith('/assets') || href.startsWith('/.well-known')) continue;
    const hasFileExt = /\.[a-z0-9]+$/i.test(href);                 // /favicon.svg, /manifest.json, /x.html → static files
    const isLocale = /^\/(cs|de|fr|es|it|pl|pt|en)(\/|$)/.test(href);
    const clean = href.replace(/\/$/, '') || '/';
    if (hasFileExt || isLocale || KNOWN_ROUTES.has(clean)) continue;
    warnings.push(`${rel}: internal link ${href} is not a known route (verify the rewrite exists)`);
  }
}

console.log(`Scanned ${files.length} HTML page(s) under public/.\n`);

if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}):`);
  for (const w of [...new Set(warnings)]) console.log('  ! ' + w);
  console.log('');
}

if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  for (const f of failures) console.log('  ✗ ' + f);
  console.log('\nIntegrity check FAILED — do not deploy until these are fixed.');
  process.exit(1);
}

console.log('Integrity check PASSED — no tag-balance, orphaned-tag, or anchor defects found.');
