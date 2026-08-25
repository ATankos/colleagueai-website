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
import PRICING from '../config/pricing.json' with { type: 'json' };

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

// ── proposal call to action ─────────────────────────────────────────────────
test('pricing page routes proposals to email, with no form to submit', () => {
  const { window } = load('pricing.html', 'https://www.colleagueai.ai/pricing');
  const doc = window.document;
  assert.equal(doc.getElementById('pricing-form'), null, 'the lead form should no longer exist');
  assert.ok(doc.querySelector('#proposal'), 'the #proposal anchor must survive for the jump navigation');
  const cta = doc.querySelector('a[data-cta="proposal_email"]');
  assert.ok(cta, 'no email call to action on the pricing page');
  assert.match(cta.getAttribute('href'), /^mailto:hello@colleagueai\.ai\?subject=/,
    'the email CTA must be a mailto carrying a subject line');
  assert.equal(doc.querySelectorAll('.ask li').length, 4, 'expected four "what to include" items');
});

test('no pricing or partner page still posts to the retired lead endpoint', () => {
  const stale = [];
  for (const loc of ['en', ...LOCALES]) {
    for (const page of ['pricing', 'partners']) {
      const f = loc === 'en' ? `${page}.html` : `${loc}/${page}.html`;
      const html = read(f);
      if (html.includes('/api/lead')) stale.push(`${loc}/${page}: /api/lead`);
      if (html.includes('website_confirm')) stale.push(`${loc}/${page}: honeypot field`);
    }
  }
  assert.deepEqual(stale, [], 'retired form plumbing left behind: ' + stale.join(', '));
});

test('every localised partner page offers the email application route', () => {
  const missing = [];
  for (const loc of ['en', ...LOCALES]) {
    const f = loc === 'en' ? 'partners.html' : `${loc}/partners.html`;
    const html = read(f);
    if (!html.includes('data-partner-cta="apply_email"')) missing.push(loc);
    if (!html.includes('id="partner-apply"')) missing.push(`${loc} (anchor)`);
  }
  assert.deepEqual(missing, [], 'partner pages without a working apply route: ' + missing.join(', '));
});

// ── partner page ─────────────────────────────────────────────────────────────
// The programme is referral-only at a flat 10% (Sales 15% and Strategic "from 20%"
// were retired in the GTM remediation). These pin that model and the two defects
// the re-audit found on this page: the worked example that still used the old
// 40% tier arithmetic, and the referral card leaking English on locale pages.
test('partner page offers a single referral level at a flat 10% rate', () => {
  const { window } = load('partners.html', 'https://www.colleagueai.ai/partners');
  const levels = [...window.document.querySelectorAll('[data-partner-level]')];
  assert.equal(levels.length, 1, 'expected exactly one partner level (referral)');
  assert.equal(levels[0].getAttribute('data-partner-level'), 'referral');
  assert.ok(levels[0].querySelector('.pl-rate').textContent.includes('10%'), 'referral rate missing');
  const rates = window.document.body.textContent;
  assert.ok(!/\b15%|From 20%/.test(rates), 'retired Sales/Strategic tier rates must not reappear');
});

test('partner worked example reconciles: contract minus 10% commission equals retained revenue', () => {
  // Derived from config/pricing.json so a price change cannot leave the partner
  // page quoting an economics story the catalogue no longer sells.
  const usd = (n) => '$' + n.toLocaleString('en-US');
  const contract = PRICING.tiers.L4.oneTimeCents / 100;
  const commission = contract * PRICING.partnerCommissionRate;
  const retained = contract - commission;

  const html = read('partners.html');
  for (const figure of [usd(contract), usd(commission), usd(retained)]) {
    assert.ok(html.includes(figure), `worked example is missing ${figure}`);
  }
  for (const stale of ['$27,000', '$45,000', '$40,500']) {
    assert.ok(!html.includes(stale), `stale figure from a retired price list reappeared: ${stale}`);
  }
});

// One approved claims dictionary, everywhere. "aligned" overstates the evidence
// the Trust Center actually presents; retired wordings must not creep back in
// through any master, generator or footer — in any language.
test('no page still carries a retired compliance claim', () => {
  const retired = ['ISO/IEC 42001 aligned', 'EU AI Act + DORA mapped', 'DORA mapped', 'Certified under CAI Score',
    'certification framework', 'No customer data is ever processed', 'auditors will actually sign off',
    // Round-5 retirements: readiness claims the Trust Center cannot evidence, in
    // English and the German translations that outlived the English fix.
    'production-grade', 'production-ready', 'produktionsreif', 'pass your audit', 'bestehen Ihr Audit'];
  const pages = ['terms.html', 'privacy.html', 'license.html', 'partner-agreement.html', 'agents.html', 'score.html', 'home.html', 'usage.html',
    ...LOCALES.flatMap((l) => ['terms.html', 'privacy.html', 'license.html', 'partner-agreement.html', 'agents.html', 'score.html', 'usage.html'].map((p) => `${l}/${p}`))];
  for (const p of pages) {
    const html = read(p);
    for (const claim of retired) assert.ok(!html.includes(claim), `${p} still says "${claim}"`);
  }
});

// The CAI Score is ColleagueAI's own classification, not independent assurance.
// "Certified" reads as third-party attestation to a risk buyer, so the word is
// retired in every language; only the dictionary key `dr_certify` may remain.
/* The word "certified" came back — deliberately, and narrowly.
 *
 * Rounds 1-5 retired it because it read as third-party attestation of the
 * CUSTOMER's compliance. Continuous Certification reintroduces it for one thing
 * only: Colleague AI's own programme, certifying its own releases against its own
 * standard. So this guard changed from "block the stem" to "block the claim".
 * The permitted and blocked vocabularies are specified in
 * docs/continuous-certification.md section 3 and enforced here. */
const CERT_PROGRAMME_OK = [
  'Continuous Certification',
  'Colleague AI Certified Release',
  'Colleague AI Certified — Active',
  'Colleague AI Certified standard',
  'Certificate ID',
  'certified release',
  'certified version',
];

test('no page implies third-party or regulatory certification, in any language', () => {
  // Claims that would put an auditor's finding straight back on the register.
  const forbidden = [
    /certified\s+compliant/i,
    /compliant\s+with\s+all/i,
    /guarantee[sd]?\s+compliance/i,
    /ensures?\s+compliance/i,
    /independently\s+certified/i,
    /third[- ]party\s+certified/i,
    /\baccredited\b/i,
    /ISO\/IEC 42001[- ]certified/i,
    /EU AI Act[- ]certified/i,
    /DORA[- ]certified/i,
    /Certified under CAI Score/i,
    /certification framework/i,          // the CAI Score is a risk-classification framework
  ];
  const pages = ['home.html', 'agents.html', 'score.html', 'trust.html', 'responsible-ai.html', 'usage.html',
    'partners.html', 'pricing.html', 'certified.html',
    ...LOCALES.flatMap((l) => ['home.html', 'agents.html', 'score.html', 'trust.html', 'responsible-ai.html'].map((p) => `${l}/${p}`))];
  for (const p of pages) {
    const html = read(p);
    for (const re of forbidden) {
      assert.ok(!re.test(html), `${p} makes a retired certification claim: ${re}`);
    }
  }
});

test('the CAI Score itself is still never called a certification, in any language', () => {
  /* Everywhere OUTSIDE the programme's own vocabulary, the stem stays banned:
     the score classifies, it does not certify. Occurrences are allowed only when
     they are part of an approved programme phrase. */
  const stems = /\b\w*(certif|zertifi|certyfik|certifik)\w*/gi;
  const pages = ['home.html', 'agents.html', 'score.html', 'trust.html', 'responsible-ai.html', 'usage.html', 'partners.html',
    ...LOCALES.flatMap((l) => ['home.html', 'agents.html', 'score.html', 'trust.html', 'responsible-ai.html'].map((p) => `${l}/${p}`))];
  for (const p of pages) {
    /* This guard is about VISIBLE copy, so strip what a reader never sees, then
       strip the approved programme copy: its translated sentences legitimately
       carry the stem in seven languages (the pay_cert* dictionary values and the
       #pay-cert-note paragraph). What is left must be clean. */
    const PROGRAMME_KEY = '(pay_cert|cert_|card_certified|dr_certify|dr_cert)[a-z0-9_]*';
    let html = read(p)
      .replace(/<!--[\s\S]*?-->/g, ' ')                                    // HTML comments
      .replace(/^\s*\/\/.*$/gm, ' ')                                       // JS line comments
      .replace(/\/\*[\s\S]*?\*\//g, ' ')                                    // JS block comments
      // in-code fallbacks for the programme's own keys, e.g. (T('card_certified'))||'certified'
      .replace(/\(\(window\.T&&T\('(?:pay_cert|cert_|card_|dr_cert)[a-z0-9_]*'\)\)\|\|'[^']*'\)/g, ' ')
      .replace(new RegExp(`"${PROGRAMME_KEY}":"(\\\\.|[^"\\\\])*"`, 'g'), ' ')  // programme dictionary values
      // the programme's own visible copy: every element bound to one of its keys
      .replace(new RegExp(`<([a-z]+)[^>]*data-i18n(?:-html|-cai)?="${PROGRAMME_KEY}"[^>]*>[\\s\\S]*?<\\/\\1>`, 'g'), ' ')
      .replace(/<p[^>]*id="pay-cert-note"[^>]*>[\s\S]*?<\/p>/g, ' ')
      .replace(new RegExp(`data-i18n(?:-html|-cai)?="${PROGRAMME_KEY}"`, 'g'), ' ');
    for (const ok of CERT_PROGRAMME_OK) html = html.split(ok).join(' ');
    for (const ok of ['Certified Release', 'Certified — Active', 'certified release']) {
      html = html.split(ok).join(' ');
    }
    const hits = (html.match(stems) || []).filter((w) => w !== 'dr_certify');
    assert.deepEqual([...new Set(hits)], [], `${p} uses the stem outside the approved programme vocabulary: ${[...new Set(hits)].join(', ')}`);
  }
});

test('the certification programme page carries its scope limits', () => {
  const html = read('certified.html');
  const required = [
    'not</b> accreditation, attestation or certification by any third party',
    'not legal, regulatory or compliance advice',
    'licence to the agent package is unaffected',
    'conditional, not periodic',
    'stops applying to the modified version',
  ];
  for (const r of required) {
    assert.ok(html.includes(r), `/certified is missing its scope limit: "${r}"`);
  }
  // The obligation must never be stated as covering the customer's own obligations.
  assert.ok(!/your (use|agent) (is|will be) compliant/i.test(html));
});

test('partner page does not contradict its flat 10% offer', () => {
  const html = read('partners.html');
  assert.ok(!html.includes('Rates vary by partner level'), 'FAQ still says rates vary by partner level');
  assert.ok(!/the partner level you are interested in/i.test(html), 'application copy still asks for a partner level');
});

test('catalogue drawer links never point at the partner page', () => {
  const html = read('agents.html');
  assert.ok(!/id="d-(doc|cs|m365)" href="\/partners"/.test(html), 'drawer link hard-wired to /partners');
  assert.ok(html.includes('id="d-doc" href="/docs/agents/"'), 'dossier button should fall back to the dossier library');
});

test('partner referral card is localized on every locale page', () => {
  const leaks = ['One simple referral commission', '>Become a Referral Partner<', '>You do<', 'Introduce an enterprise customer'];
  for (const l of LOCALES) {
    const html = read(`${l}/partners.html`);
    for (const leak of leaks) assert.ok(!html.includes(leak), `${l}/partners.html leaks English: ${leak}`);
  }
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
    for (const phrase of ['>Book a demo<', '>Request a tailored proposal<', '>Email hello@colleagueai.ai<', '>Other ways to contact us<', '>Most popular<']) {
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
