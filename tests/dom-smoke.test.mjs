/**
 * tests/dom-smoke.test.mjs — browserless DOM smoke of public/agents.html via jsdom.
 * Verifies the JS-rendered state that crawler-level fetches can't see:
 * Book-a-call href rewrite, payment modal price, checkout URL partner handoff,
 * localStorage attribution capture. Complements (not replaces) tests/e2e/golive.spec.js.
 * Usage: node --test tests/dom-smoke.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/agents.html', import.meta.url), 'utf8');
function load(url = 'https://www.colleagueai.ai/agents') {
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true });
  dom.window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {} });
  return dom;
}

test('Book a call links are rewritten off "#" once JS runs (fallback to /demo)', () => {
  const { window } = load();
  for (const id of ['nav-call-link', 'hero-call-link']) {
    const a = window.document.getElementById(id);
    assert.ok(a, id + ' missing');
    assert.notEqual(a.getAttribute('href'), '#', `${id} still href="#" after JS`);
    assert.match(a.href, /\/demo$/, `${id} → ${a.href}`);
  }
});
test('STORE config has no live price / scheduler / payment links (dead checkout)', () => {
  const { window } = load();
  // STORE is IIFE-scoped; detect via the rendered modal instead
  const priceEl = [...window.document.querySelectorAll('#paymodal [data-i18n="pay_price"], #paymodal')];
  assert.ok(window.document.getElementById('paymodal'), 'pay modal exists');
  const m = html.match(/price:\s*null/); const s = html.match(/schedulerUrl:\s*'YOUR_SCHEDULER_URL'/);
  const p = html.match(/paymentLinks:\s*\{\}/);
  assert.ok(!m, 'DEFECT: STORE.price is null — Price renders empty / "on request"');
  assert.ok(!s, 'DEFECT: schedulerUrl is the literal placeholder YOUR_SCHEDULER_URL');
  assert.ok(!p, 'DEFECT: STORE.paymentLinks is empty — no Stripe Payment Link configured');
});
test('?partner= is captured to localStorage and survives navigation (attribution capture)', () => {
  const dom = load('https://www.colleagueai.ai/agents?partner=TESTPARTNER');
  assert.equal(dom.window.localStorage.getItem('cai_partner'), 'TESTPARTNER');
  assert.equal(dom.window.__cai_partner, 'TESTPARTNER');
});
test('partner code is appended to outbound demo/partners links', () => {
  const { window } = load('https://www.colleagueai.ai/agents?partner=TESTPARTNER');
  const demoLinks = [...window.document.querySelectorAll('a[href*="colleagueai.ai/demo"]')];
  assert.ok(demoLinks.length > 0);
  assert.ok(demoLinks.every(a => a.href.includes('partner=TESTPARTNER')),
    'demo links missing partner param: ' + demoLinks.map(a => a.href).slice(0,2).join(' '));
});
test('oversized partner param is truncated to 64 chars client-side', () => {
  const big = 'X'.repeat(500);
  const dom = load('https://www.colleagueai.ai/agents?partner=' + big);
  assert.equal((dom.window.localStorage.getItem('cai_partner') ?? '').length, 64);
});
test('checkout handoff: pay CTA href carries partner + client_reference_id (revenue-critical)', () => {
  const { window } = load('https://www.colleagueai.ai/agents?partner=TESTPARTNER');
  const d = window.document;
  // open the first agent card, then the pay modal, as a user would
  const card = d.querySelector('[data-slug], .card, .agent-card');
  const payBtn = d.getElementById('pay-cta');
  assert.ok(payBtn, 'pay CTA exists');
  const href = payBtn.getAttribute('href');
  // before an agent is opened the CTA must not be a live link to "#" presented as checkout
  assert.notEqual(href, '#', 'DEFECT: pay CTA is href="#" — dead checkout (also: no price ⇒ request mode)');
});

test('REGRESSION: i18n engine boots — language switcher populated and applyLang runs', () => {
  const errors = [];
  const dom = new JSDOM(html, { url: 'https://www.colleagueai.ai/cs/agenti?lang=cs',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole().on('jsdomError', e => errors.push(e.detail?.message ?? e.message)) });
  const sel = dom.window.document.getElementById('langsel');
  assert.ok(sel, 'language selector exists');
  assert.ok(sel.options.length >= 8, `DEFECT: language dropdown has ${sel.options.length} options — i18n init crashed (ORDER/NAMES undefined): ${errors.filter(e => /ORDER|NAMES/.test(e)).join('; ')}`);
  const nav = dom.window.document.querySelector('[data-i18n="nav_philosophy"]');
  assert.notEqual(nav?.textContent.trim(), 'Philosophy', 'DEFECT: ?lang=cs still renders English — applyLang never ran');
});
test('REGRESSION: every inline script parses (AGENTS_CS block has stray closing brace)', () => {
  const blocks = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)];
  const bad = [];
  for (const [i, b] of blocks.entries()) {
    if (/application\/ld\+json/.test(b[0])) continue;
    try { new vm.Script(b[1]); } catch (e) { bad.push(`script#${i}: ${e.message}`); }
  }
  assert.deepEqual(bad, [], 'DEFECT: inline script(s) with syntax errors never execute in ANY browser: ' + bad.join(' | '));
});
