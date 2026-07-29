/**
 * tests/journey.test.mjs — browserless end-to-end journeys over the real static pages.
 *
 * Covers the buyer path (home -> pricing -> proposal form) and the partner path,
 * plus cross-page navigation and localisation invariants. Runs in jsdom, so it
 * executes the inline page scripts without needing a browser download.
 * Usage: node --test tests/journey.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const MAIN_PAGES = ['home', 'pricing', 'trust', 'partners', 'contact'];
const routes = JSON.parse(readFileSync(new URL('../i18n.routes.json', import.meta.url), 'utf8'));
const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const slug = (loc, page) => routes.slugs[page][loc];
const pricingPath = (loc) => (loc === 'en' ? '/pricing' : `/${loc}/${slug(loc, 'pricing')}`);

function load(file, url) {
  const dom = new JSDOM(read(file), { url, runScripts: 'dangerously', pretendToBeVisual: true });
  dom.window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {} });
  return dom;
}

// ── navigation ───────────────────────────────────────────────────────────────
test('every main page exposes the same primary navigation, including Pricing', () => {
  for (const page of MAIN_PAGES) {
    const html = read(`${page}.html`);
    assert.ok(html.includes('href="/pricing"'), `${page}.html has no link to /pricing`);
    assert.ok(html.includes('href="/agents"'), `${page}.html has no link to /agents`);
    assert.ok(html.includes('href="/trust"'), `${page}.html has no link to /trust`);
    assert.ok(html.includes('href="/partners"'), `${page}.html has no link to /partners`);
  }
});

test('the pricing nav is not duplicated and keeps Contact reachable', () => {
  const { window } = load('pricing.html', 'https://www.colleagueai.ai/pricing');
  const nav = window.document.querySelector('nav.links');
  const hrefs = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  const pricingLinks = hrefs.filter((h) => h === '/pricing');
  assert.equal(pricingLinks.length, 1, `expected one /pricing link in nav, got ${pricingLinks.length}`);
  assert.ok(hrefs.includes('/contact'), 'Contact missing from the pricing nav');
});

test('every internal nav target resolves to a file or a configured rewrite', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrites = new Set(vercel.rewrites.map((r) => r.source));
  const resolves = (href) => {
    const p = href.split('#')[0].split('?')[0].replace(/\/$/, '');
    if (p === '' || rewrites.has(p) || rewrites.has(href)) return true;
    return ['public' + p, 'public' + p + '.html', 'public' + p + '/index.html']
      .some((f) => existsSync(new URL('../' + f, import.meta.url)));
  };
  const missing = [];
  for (const page of MAIN_PAGES) {
    const { window } = load(`${page}.html`, 'https://www.colleagueai.ai/');
    const header = window.document.querySelector('header');
    for (const a of header ? header.querySelectorAll('a[href^="/"]') : []) {
      const href = a.getAttribute('href');
      if (!href.startsWith('//') && !resolves(href)) missing.push(`${page}: ${href}`);
    }
  }
  assert.deepEqual(missing, [], 'unresolved header links: ' + missing.join(', '));
});

// ── pricing page ─────────────────────────────────────────────────────────────
test('pricing page presents five tiers with Tier 2 highlighted and ranges shown', () => {
  const { window } = load('pricing.html', 'https://www.colleagueai.ai/pricing');
  const tiers = [...window.document.querySelectorAll('[data-tier]')];
  assert.equal(tiers.length, 5, 'expected 5 pricing tiers');
  const featured = tiers.filter((t) => t.classList.contains('feat'));
  assert.equal(featured.length, 1, 'exactly one tier should carry the emphasis');
  assert.equal(featured[0].getAttribute('data-tier'), '2', 'Tier 2 should be the highlighted one');
  for (const t of tiers) {
    assert.match(t.querySelector('.range').textContent, /\$[\d,]+/, 'tier is missing a price range');
  }
});

test('pricing ranges are framed as indicative, never as a fixed quote', () => {
  const html = read('pricing.html');
  assert.ok(html.includes('indicative starting points, not binding quotations'), 'disclaimer missing');
  assert.ok(!/\bfixed price\b|\bfinal price is\b/i.test(html), 'page implies a fixed quotation');
});

test('pricing structured data is valid and advertises no fixed offer price', () => {
  const html = read('pricing.html');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, 'no JSON-LD on the pricing page');
  const graph = JSON.parse(blocks[0][1]);
  const types = (graph['@graph'] || [graph]).map((n) => n['@type']);
  assert.ok(types.includes('FAQPage'), 'FAQPage schema missing');
  assert.ok(!JSON.stringify(graph).includes('"Offer"'), 'must not publish Offer prices for indicative ranges');
});

test('pricing FAQ renders every question as a keyboard-accessible disclosure', () => {
  const { window } = load('pricing.html', 'https://www.colleagueai.ai/pricing');
  const items = window.document.querySelectorAll('.faq details');
  assert.equal(items.length, 8, 'expected 8 FAQ entries');
  for (const d of items) assert.ok(d.querySelector('summary'), 'FAQ entry without a summary');
});

// ── proposal form ────────────────────────────────────────────────────────────
function fillAndSubmit(dom, values, { consent }) {
  const { window } = dom;
  const form = window.document.getElementById('pricing-form');
  for (const [id, v] of Object.entries(values)) window.document.getElementById(id).value = v;
  window.document.getElementById('pf-consent').checked = consent;
  const calls = [];
  window.fetch = (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); };
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  return calls;
}

test('proposal form refuses to submit without required fields and consent', () => {
  const dom = load('pricing.html', 'https://www.colleagueai.ai/pricing');
  const calls = fillAndSubmit(dom, { 'pf-name': '', 'pf-email': 'not-an-email', 'pf-company': '' }, { consent: false });
  assert.equal(calls.length, 0, 'invalid form was submitted to the API');
  assert.ok(dom.window.document.querySelectorAll('.fld.bad').length > 0, 'no field was flagged invalid');
});

test('proposal form posts a consented lead to /api/lead when valid', () => {
  const dom = load('pricing.html', 'https://www.colleagueai.ai/pricing');
  const calls = fillAndSubmit(dom, { 'pf-name': 'Alex Buyer', 'pf-email': 'alex@example.com', 'pf-company': 'Example Bank' }, { consent: true });
  assert.equal(calls.length, 1, 'valid form did not reach the API');
  assert.equal(calls[0].url, '/api/lead');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.type, 'pricing');
  assert.equal(body.consent, true);
  assert.equal(body.email, 'alex@example.com');
});

// ── partner page ─────────────────────────────────────────────────────────────
test('partner page shows three levels with qualified commission rates', () => {
  const { window } = load('partners.html', 'https://www.colleagueai.ai/partners');
  const levels = [...window.document.querySelectorAll('[data-partner-level]')];
  assert.equal(levels.length, 3, 'expected 3 partner levels');
  const rates = levels.map((l) => l.querySelector('.pl-rate').textContent);
  assert.ok(rates.some((r) => r.includes('10%')), 'referral rate missing');
  assert.ok(rates.some((r) => r.includes('15%')), 'sales rate missing');
  assert.ok(rates.some((r) => /From 20%|20%/.test(r)), 'strategic rate missing');
  assert.ok(!rates.some((r) => /^\s*20%\s*Commission/.test(r)), 'strategic rate must not read as a flat entitlement');
});

test('partner commission terms are qualified as non-binding', () => {
  const html = read('partners.html');
  assert.ok(html.includes('do not create an entitlement to payment'), 'commission disclaimer missing');
  assert.ok(html.includes('subject to approval and a signed partner agreement'), 'agreement caveat missing');
});

test('partner pages render exactly one header and keep the language selector', () => {
  for (const f of ['partners.html', ...LOCALES.map((l) => `${l}/partners.html`)]) {
    const html = read(f);
    const headers = (html.match(/<header\b/g) || []).length;
    assert.equal(headers, 1, `${f} renders ${headers} headers`);
    assert.ok(html.includes('id="langsel"'), `${f} lost its language selector`);
  }
});

// ── localisation ─────────────────────────────────────────────────────────────
test('each locale serves pricing on its own slug with matching lang and canonical', () => {
  for (const loc of LOCALES) {
    const html = read(`${loc}/pricing.html`);
    const htmlTag = html.match(/<html\b[^>]*>/)[0];
    assert.match(htmlTag, new RegExp(`lang="${loc}"`), `${loc}: wrong lang attribute -> ${htmlTag}`);
    assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1, `${loc}: expected exactly one canonical`);
    assert.ok(html.includes(`https://www.colleagueai.ai${pricingPath(loc)}`), `${loc}: canonical does not use the localised slug`);
    assert.ok(html.includes('hreflang="x-default"'), `${loc}: hreflang block missing`);
  }
});

test('localised pricing pages carry no leftover English calls to action', () => {
  const leaks = [];
  for (const loc of LOCALES) {
    const html = read(`${loc}/pricing.html`);
    for (const phrase of ['>Book a demo<', '>Request a tailored proposal<', '>Send request<', '>Most popular<']) {
      if (html.includes(phrase)) leaks.push(`${loc}: ${phrase}`);
    }
  }
  assert.deepEqual(leaks, [], 'untranslated strings: ' + leaks.join(', '));
});

test('every main page links a wordmark home from the header', () => {
  const missing = [];
  for (const page of MAIN_PAGES) {
    for (const loc of ['en', ...LOCALES]) {
      const f = loc === 'en' ? `${page}.html` : `${loc}/${page}.html`;
      if (!existsSync(new URL('../public/' + f, import.meta.url))) continue;
      const html = read(f);
      const header = (html.match(/<header[\s\S]*?<\/header>/) || [''])[0];
      const logo = /<a[^>]*class="[^"]*logo[^"]*"[^>]*href="\/"|<a[^>]*href="\/"[^>]*class="[^"]*logo[^"]*"/.test(header);
      if (!logo) missing.push(f);
    }
  }
  assert.deepEqual(missing, [], 'pages without a header wordmark linking home: ' + missing.join(', '));
});

test('the pricing jump navigation resolves to real sections in every language', () => {
  for (const loc of ['en', ...LOCALES]) {
    const file = loc === 'en' ? 'pricing.html' : `${loc}/pricing.html`;
    const dom = load(file, 'https://www.colleagueai.ai' + pricingPath(loc));
    const doc = dom.window.document;
    const jump = doc.querySelector('nav.jump');
    assert.ok(jump, `${loc}: jump navigation missing`);
    const links = [...jump.querySelectorAll('a')];
    assert.ok(links.length >= 4, `${loc}: jump navigation has too few entries`);
    for (const a of links) {
      const id = a.getAttribute('href').slice(1);
      assert.ok(doc.getElementById(id), `${loc}: jump link #${id} has no matching section`);
    }
  }
});
