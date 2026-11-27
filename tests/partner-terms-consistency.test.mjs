/** Partner page: the headline commission claim must match the terms stated on the same page and config/pricing.json. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const PRICING = JSON.parse(readFileSync('config/pricing.json', 'utf8'));
const html = readFileSync('public/partners.html', 'utf8');
test('the commission rate on the partner page is the configured rate', () => {
  assert.equal(PRICING.partnerCommissionRate, 0.1);
  assert.match(html, /10% of eligible net revenue/);
});
test('no headline says the commission is on "every sale" or "the sale" while the terms deduct taxes, refunds and chargebacks', () => {
  assert.doesNotMatch(html, /flat 10% (commission )?(of|on) every sale/);
  assert.doesNotMatch(html, /you earn (a flat )?10% of the sale/);
  assert.match(html, /eligible net revenue/);
  assert.match(html, /refunded or charged back, the commission for that sale is reversed/);
});

test('the agents-page partner teaser (adopt_p) states the same basis in all eight languages', () => {
  const page = readFileSync('public/agents.html', 'utf8');
  const dict = JSON.parse(/var I18N=(\{.*?\});\n/s.exec(page)[1]);
  const basis = { en: /eligible net revenue/, cs: /čistých způsobilých tržeb/, de: /Nettoerlöse/, fr: /chiffre d’affaires net éligible/, es: /ingresos netos elegibles/, it: /ricavi netti ammissibili/, pt: /receita líquida elegível/, pl: /przychodów netto/ };
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
