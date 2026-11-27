/** Partner page: the headline commission claim must match the terms stated on the same page and config/pricing.json. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const PRICING = JSON.parse(readFileSync('config/pricing.json', 'utf8'));
const html = readFileSync('public/partners.html', 'utf8');
test('the commission rate on the partner page is the configured rate', () => {
  assert.equal(PRICING.partnerCommissionRate, 0.1);
  assert.match(html, /10% of eligible net perpetual licence revenue/);
  assert.match(html, /Continuous Certification subscription revenue earns no commission/);
});
test('no headline says the commission is on "every sale" or "the sale" while the terms deduct taxes, refunds and chargebacks', () => {
  assert.doesNotMatch(html, /flat 10% (commission )?(of|on) every sale/);
  assert.doesNotMatch(html, /you earn (a flat )?10% of the sale/);
  assert.match(html, /eligible net (perpetual )?licence revenue/);
  assert.match(html, /refunded or charged back, the commission for that sale is reversed/);
});

test('the agents-page partner teaser (adopt_p) states the same basis in all eight languages', () => {
  const page = readFileSync('public/agents.html', 'utf8');
  const dict = JSON.parse(/var I18N=(\{.*?\});\n/s.exec(page)[1]);
  const basis = { en: /eligible net licence revenue/, cs: /tržeb z licencí/, de: /Netto-Lizenzerlöse/, fr: /net éligible des licences/, es: /netos elegibles por licencias/, it: /ammissibili da licenze/, pt: /elegível de licenças/, pl: /netto z licencji/ };
  for (const [lang, re] of Object.entries(basis)) {
    assert.match(dict[lang].adopt_p, re, lang);
    assert.doesNotMatch(dict[lang].adopt_p, /flat|paušáln|pauschal|fixe|fijo|fisso|fixos|stałe/i, lang);
  }
});

test('localized partner pages keep a translated meta description (a changed English source must not fall back to English)', () => {
  const en = /<meta name="description" content="([^"]+)"/.exec(readFileSync('public/partners.html', 'utf8'))[1];
  const stale = /paušáln|pauschal|\bfixes?\b|\bfijo\b|\bfisso\b|\bfixos\b|\bstał[aey]\b|every sale|chaque vente|cada venta|ogni vendita|cada venda|każdej sprzedaży|každého prodeje|jedes Verkaufs/i;
  for (const lang of ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']) {
    for (const f of [`public/${lang}/partners.html`, `public/${lang}/partners/index.html`]) {
      const m = /<meta name="description" content="([^"]+)"/.exec(readFileSync(f, 'utf8'));
      assert.ok(m, f);
      assert.notEqual(m[1], en, `${f}: meta description is English`);
      assert.doesNotMatch(m[1], stale, `${f}: still says flat/every sale`);
    }
  }
});

// Founder decision (Round 3): 10% of eligible net PERPETUAL LICENCE revenue; no commission on subscription revenue.
const visible = (f) => readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
test('no localized partner or catalogue page shows the English commission wording (visible text, all seven languages)', () => {
  const english = /eligible net|net licence revenue|earns no commission|you earn 10%|earn a 10%|every agent sale/;
  for (const lang of ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']) {
    for (const f of [`public/${lang}/partners.html`, `public/${lang}/partners/index.html`, `public/${lang}/agents.html`]) {
      const m = english.exec(visible(f));
      assert.equal(m, null, `${f} shows English: ${m && m[0]}`);
    }
  }
});
test('every language states that subscription revenue earns no commission, on the partner terms', () => {
  const no = { cs: /Continuous Certification se provize neplatí/, de: /Continuous Certification fällt keine Provision an/, fr: /Continuous Certification ne donnent lieu à aucune commission/,
    es: /Continuous Certification no generan comisión/, it: /Continuous Certification non generano commissioni/, pl: /Continuous Certification nie podlegają prowizji/, pt: /Continuous Certification não geram comissão/ };
  for (const [lang, re] of Object.entries(no)) assert.match(visible(`public/${lang}/partners.html`), re, lang);
});

test('the rate badge states the commission base, not "every agent sale" (all eight languages)', () => {
  for (const f of ['public/partners.html', ...['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'].map((l) => `public/${l}/partners.html`)]) {
    const label = /<span class="rate-lbl">([^<]*)<\/span>/.exec(readFileSync(f, 'utf8'))?.[1] ?? '';
    assert.doesNotMatch(label, /every agent sale|každého prodeje|jedem Agentenverkauf|chaque vente|cada venta|ogni vendita|każdej sprzedaży|cada venda/i, `${f}: ${label}`);
    assert.ok(label.length > 10, `${f}: rate label missing`);
  }
});
