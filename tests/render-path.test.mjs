/**
 * tests/render-path.test.mjs - Round 3 mobile catalogue performance (Lighthouse 79 -> 96, LCP 3.9 s -> 2.3 s locally).
 * scripts/optimize-render-path.cjs must shorten the path to first paint WITHOUT changing what the page does: the CSS
 * cascade keeps its order, ids that code reads stay in place, body scripts keep their order, and a second run changes
 * nothing. The last tests check the built site (run `npm run build` first).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const h = (n) => n.toString(16).padStart(16, '0');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  const css = (i) => { fs.writeFileSync(path.join(dir, 'assets', `inline-${h(i)}.css`), `.r${i}{order:${i}}`); return `/assets/inline-${h(i)}.css`; };
  const js = (i) => { fs.writeFileSync(path.join(dir, 'assets', `inline-${h(100 + i)}.js`), `window.seq=(window.seq||[]).concat(${i});`); return `/assets/inline-${h(100 + i)}.js`; };
  fs.writeFileSync(path.join(dir, 'site.css'), '.site{}');
  const html = `<!doctype html><html><head><title>x</title>
<script src="${js(0)}"></script>
<link rel="stylesheet" href="${css(1)}">
<link rel="stylesheet" id="cai-a" href="${css(2)}">
<link rel="stylesheet" href="${css(3)}">
<link rel="stylesheet" id="cai-fixed-backtop-css" href="${css(4)}">
<link rel="stylesheet" href="${css(5)}">
<link rel="stylesheet" href="${css(6)}">
</head><body><h1>t</h1>
<link rel="stylesheet" href="${css(7)}"><p>x</p><link rel="stylesheet" href="/site.css">
<script src="${js(1)}"></script><script id="cai-x" src="${js(2)}"></script>
<link rel="stylesheet" href="https://example.com/ext.css"><link rel="stylesheet" href="${css(8)}">
</body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  return dir;
}
const run = (dir) => execFileSync(process.execPath, [path.resolve('scripts/optimize-render-path.cjs'), dir], { encoding: 'utf8' });
const cssOrder = (dir, html) => [...html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].flatMap(([, href]) => {
  if (!href.startsWith('/')) return [href];
  return [...fs.readFileSync(path.join(dir, href), 'utf8').matchAll(/\.(r\d+|site)\{/g)].map((m) => m[1]);
});

test('the cascade order of every stylesheet is exactly what it was', () => {
  const dir = fixture();
  const before = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const orderBefore = cssOrder(dir, before);
  run(dir);
  const after = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.deepEqual(cssOrder(dir, after), orderBefore);
  assert.ok((after.match(/rel="stylesheet"/g) || []).length < (before.match(/rel="stylesheet"/g) || []).length, 'fewer requests');
});

test('an id read by code is never merged away, and nothing moves past a stylesheet that cannot move', () => {
  const dir = fixture();
  run(dir);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" id="cai-fixed-backtop-css" href="\/assets\/inline-0000000000000004\.css">/);
  const body = html.slice(html.indexOf('</head>'));
  assert.match(body, /https:\/\/example\.com\/ext\.css/, 'an external stylesheet stays where it was');
  assert.match(body, /inline-0000000000000008\.css/, 'a stylesheet after it is not hoisted over it');
  assert.doesNotMatch(body, /inline-0000000000000007\.css|\/site\.css/, 'the movable body stylesheets before it were hoisted');
});

test('body scripts are deferred in their original order; head scripts stay synchronous', () => {
  const dir = fixture();
  run(dir);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /<script src="\/assets\/inline-0000000000000064\.js"><\/script>/);
  const body = html.slice(html.indexOf('</head>'));
  const scripts = [...body.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [' defer src="/assets/inline-0000000000000065.js"', ' id="cai-x" defer src="/assets/inline-0000000000000066.js"']);
});

test('a second run changes nothing', () => {
  const dir = fixture();
  run(dir);
  const once = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(run(dir), /0 stylesheet request\(s\) merged away, 0 body script\(s\) deferred/);
  assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), once);
});

const DIST = path.resolve('dist');
test('the built catalogue has no render-blocking body script and at most 10 head stylesheets', { skip: !fs.existsSync(path.join(DIST, 'agents.html')) && 'run npm run build first' }, () => {
  for (const f of ['agents.html', 'cs/agents.html', 'pricing.html', 'partners.html', 'agents/contract-intelligence-and-register.html']) {
    const html = fs.readFileSync(path.join(DIST, f), 'utf8');
    const end = html.indexOf('</head>');
    const body = html.slice(end);
    assert.doesNotMatch(body, /<script(?: id="[^"]+")? src="\/assets\/inline-/, `${f}: a body script still blocks rendering`);
    assert.doesNotMatch(body, /<link rel="stylesheet"(?: id="[^"]+")? href="\/assets\/inline-/, `${f}: a body stylesheet still blocks rendering`);
    assert.ok((html.slice(0, end).match(/rel="stylesheet"/g) || []).length <= 10, `${f}: too many head stylesheets`);
  }
});

test('the i18n applier does not rewrite text that is already correct (a rewrite moves LCP after first paint)', () => {
  for (const f of ['public/agents.html', 'public/partners.html', 'public/cs/agents.html']) {
    const t = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /if\(v!=null\)e\.(textContent|innerHTML)=v;/, f);
  }
});
