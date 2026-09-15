/**
 * tests/pricing-consistency.test.mjs — one price list, everywhere.
 *
 * Commercial numbers used to live in six places (catalogue dictionary, checkout
 * endpoint, pricing page, partner worked example, demo form, locale copy) and
 * drifted: the $27,000 partner figure and the "$12,000 / $25,000 / $45,000" note
 * outlived two repricings and were rediscovered by external audits both times.
 *
 * config/pricing.json is now the single source of truth. This suite fails the
 * build if any surface disagrees with it, so a price change is a one-file edit
 * plus whatever this test tells you is still stale.
 *
 * Usage: node --test tests/pricing-consistency.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import PRICING from '../config/pricing.json' with { type: 'json' };

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const usd = (cents) => '$' + (cents / 100).toLocaleString('en-US');
const dollars = (cents) => cents / 100;
const TIERS = ['L2', 'L3', 'L4'];        // the tiers with catalogue agents today

test('the config itself is coherent', () => {
  for (const [tier, v] of Object.entries(PRICING.tiers)) {
    assert.ok(v.oneTimeCents > 0 && v.monthlyCents > 0, `${tier} has a non-positive price`);
    assert.equal(v.annualCents, v.monthlyCents * PRICING.annualIsMonths,
      `${tier}: annual price should be ${PRICING.annualIsMonths} months of the monthly price`);
  }
  const order = Object.values(PRICING.tiers).map((v) => v.oneTimeCents);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'higher tiers must not cost less than lower ones');
});

test('the checkout endpoint prices from the config, with no hard-coded fallbacks', () => {
  const src = read('api/checkout.js');
  assert.ok(src.includes("from '../config/pricing.json'"), 'checkout.js must import the price config');
  for (const stale of ['1200000', '2500000', '4500000']) {
    assert.ok(!src.includes(stale), `checkout.js still carries the retired literal ${stale}`);
  }
});

test('every catalogue agent is priced at its tier price', () => {
  const html = read('public/agents.html');
  const tierMap = JSON.parse(read('api/checkout.js').match(/const SLUG_TIER = (\{[\s\S]*?\});/)[1]);
  // both tables live in one page-level global now, shared by the cards and the panel
  const prices = JSON.parse(html.match(/perAgent:(\{[^}]*\})/)[1]);

  const wrong = [];
  for (const [slug, price] of Object.entries(prices)) {
    const expected = dollars(PRICING.tiers[tierMap[slug]].oneTimeCents);
    if (price !== expected) wrong.push(`${slug}: ${price} (expected ${expected} for ${tierMap[slug]})`);
  }
  assert.deepEqual(wrong, [], 'catalogue prices out of step with the config: ' + wrong.join(', '));
  assert.equal(Object.keys(prices).length, Object.keys(tierMap).length, 'every catalogue agent needs a price');
});

test('the catalogue advertises the certification price for every tier', () => {
  const html = read('public/agents.html');
  const cert = JSON.parse(html.match(/certMonthly:(\{[^}]*\})/)[1]);
  for (const [tier, v] of Object.entries(PRICING.tiers)) {
    assert.equal(cert[tier], dollars(v.monthlyCents), `catalogue certMonthly.${tier} disagrees with the config`);
  }
});

/* The commercial ask was that the choice is visible AT the agent, not buried on
   /pricing. These pin that: both numbers on the card, the comparison in the
   drawer with the recommendation, and the same story on all 36 factsheets. */
test('every catalogue card shows the one-time price and the certification price', () => {
  const html = read('public/agents.html');
  assert.ok(html.includes('class="cprice"'), 'cards no longer carry a price row');
  assert.ok(/cardPrice=.*card_onetime/s.test(html), 'card price line is not built from the shared table');
  assert.ok(/cardCert=.*certMonthly\[a\.t\]|CAI_PRICING\.certMonthly\[a\.t\]/s.test(html),
    'card certification line is not priced per tier');
});

test('the drawer presents the certified option as the recommended one, with its limits', () => {
  const html = read('public/agents.html');
  for (const marker of ['cert-cols', 'cert-col best', 'data-i18n="cert_rec"', 'id="cert-price-a"', 'id="cert-price-b"']) {
    assert.ok(html.includes(marker), `drawer comparison is missing ${marker}`);
  }
  // The recommendation must never be made by disparaging what the buyer still keeps.
  const lede = html.match(/data-i18n="cert_lede">([^<]*)</)[1];
  assert.ok(/yours forever/i.test(lede), 'the lede should state what the buyer keeps either way');
  assert.ok(html.includes('data-i18n="cert_a1">Perpetual licence to this version'),
    'the package-only column must still say the licence is perpetual');
});

test('the comparison copy exists in all eight languages', () => {
  const html = read('public/agents.html');
  const dict = JSON.parse(html.match(/var I18N=(\{[\s\S]*?\});\r?\n/)[1]);
  const keys = ['cert_rec', 'cert_lede', 'cert_col_a', 'cert_col_b', 'cert_a1', 'cert_a2', 'cert_a3', 'cert_a4',
    'cert_b1', 'cert_b2', 'cert_b3', 'cert_b4', 'cert_foot', 'card_onetime', 'card_permonth', 'card_certified'];
  for (const loc of ['en', 'cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']) {
    for (const k of keys) {
      assert.ok(dict[loc] && dict[loc][k], `${loc} is missing the ${k} string`);
    }
  }
});

test('the factsheet generator prices from the config and states the trade-off', () => {
  const gen = read('scripts/generate-agent-pages.mjs');
  assert.ok(gen.includes("config/pricing.json"), 'the generator must not hard-code prices');
  assert.ok(gen.includes('the only route to updated certified releases'), 'factsheets lost the recommendation');
  assert.ok(gen.includes('not third-party accreditation'), 'factsheets lost the scope limit');
});

test('the pricing page quotes the current package prices and no retired ones', () => {
  const html = read('public/pricing.html');
  for (const tier of TIERS) {
    assert.ok(html.includes(usd(PRICING.tiers[tier].oneTimeCents)),
      `pricing page does not mention the ${tier} price ${usd(PRICING.tiers[tier].oneTimeCents)}`);
  }
  for (const retired of ['$12,000', '$25,000 (L3)', '$45,000']) {
    assert.ok(!html.includes(retired), `pricing page still quotes the retired price ${retired}`);
  }
  assert.ok(!/not recurring software subscriptions/i.test(html),
    'the page still denies recurring pricing, which Continuous Certification contradicts');
});

test('the partner worked example uses the current L4 price and its own 10%', () => {
  const html = read('public/partners.html');
  const contract = dollars(PRICING.tiers.L4.oneTimeCents);
  const commission = contract * PRICING.partnerCommissionRate;
  assert.ok(html.includes(usd(PRICING.tiers.L4.oneTimeCents)), 'partner page is not on the current L4 price');
  assert.ok(html.includes('$' + commission.toLocaleString('en-US')), 'partner commission figure is stale');
  assert.ok(html.includes('$' + (contract - commission).toLocaleString('en-US')), 'retained-revenue figure is stale');
});

/* The three tier-price assertions above are why the ten-referral example rotted
   unseen: the L4 figures on this page ARE tier prices and were duly reprised,
   while the example is the one set of numbers derived from the CATALOGUE, which
   nothing here was reading. It advertised "avg. $22,000" - above the dearest
   agent ColleagueAI sells - overstating a partner's year by 125%.

   The invariant worth keeping is the cheap one: an average of the catalogue
   cannot exceed the dearest thing in it. That comparison alone would have failed
   the moment the reprice landed, without anyone needing to know the new mean.
   The exact-mean and arithmetic checks below then say what the figures should
   be, so the next reprice is told rather than discovered. */
test('the ten-referral example averages the catalogue that exists, not a retired one', () => {
  const html = read('public/partners.html');
  const prices = Object.values(JSON.parse(read('public/agents.html').match(/perAgent:(\{[^}]*\})/)[1]));
  const dearest = Math.max(...prices);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length / 100) * 100;
  const referrals = 10;
  const total = avg * referrals;
  const earn = Math.round(total * PRICING.partnerCommissionRate);
  const shown = (s) => Number(String(s).replace(/[^0-9]/g, ''));

  // Every language carries its own copy of the tag, so a fix that reaches only
  // the English card leaves seven pages advertising the old number.
  const tags = [...html.matchAll(/"ag3_tag":"([^"]*)"/g)].map((m) => m[1]);
  assert.equal(tags.length, 8, `the ten-referral tag should exist in all eight languages, found ${tags.length}`);
  for (const tag of tags) {
    const n = shown(tag.match(/\$[\d,]+/)[0]);
    assert.ok(n <= dearest,
      `a locale advertises an average of $${n.toLocaleString('en-US')}, above the dearest agent in the catalogue ($${dearest.toLocaleString('en-US')})`);
    assert.equal(n, avg, `locale tag "${tag}" is not the catalogue mean $${avg.toLocaleString('en-US')}`);
  }

  // The visible card: average, total and commission must agree with each other
  // and with the rate, each computed independently rather than assumed equal --
  // they coincide only because ten referrals at 10% happens to return exactly
  // one average, which a change to either number would quietly end.
  const card = html.slice(html.indexOf('>10 referrals in a year<'));
  assert.equal(shown(card.match(/class="ag-tag">[^<]*?(\$[\d,]+)/)[1]), avg, 'the card average is not the catalogue mean');
  assert.equal(shown(card.match(/class="pr-val">(\$[\d,]+)/)[1]), total,
    `${referrals} referrals averaging $${avg.toLocaleString('en-US')} is $${total.toLocaleString('en-US')} of sales`);
  assert.equal(shown(card.match(/class="earn-val">(\$[\d,]+)/)[1]), earn,
    `${PRICING.partnerCommissionRate * 100}% of $${total.toLocaleString('en-US')} is $${earn.toLocaleString('en-US')}`);
});


// reads dist/, so run after `npm run build`
test('the demo form and the certification page read from the config too', () => {
  assert.ok(read('src/Demo.jsx').includes("config/pricing.json"), 'Demo.jsx must not hard-code package prices');
  // the certification page is generated for eight languages, so its prices are
  // checked on the BUILT English page rather than a master that no longer exists
  const cert = read('dist/certified.html');
  for (const [tier, v] of Object.entries(PRICING.tiers)) {
    assert.ok(cert.includes(usd(v.oneTimeCents)), `/certified is missing the ${tier} package price`);
    assert.ok(cert.includes(`$${dollars(v.monthlyCents)} / month`), `/certified is missing the ${tier} monthly price`);
  }
});

test('no retired price survives anywhere in the English masters', () => {
  const retired = ['$27,000', '$40,500', '$4,500'];
  const pages = ['agents.html', 'pricing.html', 'partners.html', 'home.html', 'score.html'];
  for (const p of pages) {
    const html = read('public/' + p);
    for (const r of retired) {
      assert.ok(!html.includes(r), `${p} still quotes the retired figure ${r}`);
    }
  }
});

/* Two translation systems localise the partner page, and only one of them is
   visible from the page itself. public/partners.html carries a `var I18N`
   dictionary, but the BUILT locale pages take this element from
   scripts/i18n/reviewed-copy.json, which is keyed by the ENGLISH SOURCE STRING.
   Renumbering the English tag from $22,000 to $9,800 orphaned all seven
   translations, and /cs/partneri served "Mix of agents - avg. $9,800" under a
   Czech heading until this was caught in production.

   This pins the one string. A general "every key must still match something"
   guard was tried and abandoned: the restorer runs over locale pages, so many
   legitimate keys target text that exists only there and never in an English
   master ("Bereitstellung & data" corrects a half-translated German heading).
   Twenty of the eighty-six keys are unmatched against the English masters and
   most of those are correct, so the broad assertion would have been noise.

   One of the twenty is not noise: the /pricing paragraph listing the tier
   prices is keyed to English that predates the <a href="/certified"> link now
   inside it, so it is already orphaned and /cs/cenik serves that paragraph in
   English today. That needs its own fix and its own assertion; it is not this
   commit. */
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const reviewedCopy = () => JSON.parse(read('scripts/i18n/reviewed-copy.json'));
const figuresIn = (s) => (String(s).match(/\$[\d,]+/g) || []);

test('the ten-referral tag is still translated in every locale', () => {
  const html = read('public/partners.html');
  const card = html.slice(html.indexOf('>10 referrals in a year<'), html.indexOf('>10 referrals in a year<') + 900);
  const english = card.match(/class="ag-tag">([^<]*)/)[1].trim();
  const copy = reviewedCopy();

  for (const loc of LOCALES) {
    const translated = copy[loc] && copy[loc][english];
    assert.ok(translated,
      `${loc} has no reviewed translation keyed to "${english}" -- the English text changed and orphaned it, so /${loc} renders this line in English`);
    assert.deepEqual(figuresIn(translated), figuresIn(english),
      `${loc}: the translation quotes ${figuresIn(translated).join(', ') || 'no figure'} where the English says ${figuresIn(english).join(', ')}`);
  }
});

/* The /pricing note -- the paragraph stating the tier prices and the $99
   subscription -- contains an inline link, so generate-pricing-pages.cjs cannot
   translate it: that translator matches whole text nodes. It is localised by the
   reviewed-copy restorer instead, keyed by English source text. The key fell
   behind the page twice over (the /certified link was added, and a sentence was
   reworded), and /cs/cenik served the whole paragraph in English until this was
   caught. One key covers all seven locales because the href is still the English
   /certified when the restorer runs; localize-internal-links.cjs rewrites it in
   postbuild, which is why the translations must keep that href too. */
test('the /pricing note paragraph is keyed to the paragraph that is on the page', () => {
  const html = read('public/pricing.html');
  const english = html.match(/<p class="note">([\s\S]*?)<\/p>/)[1];
  assert.match(english, /An individual agent package/, 'the page note is no longer the pricing note');
  assert.ok(english.includes('<a href="/certified">'),
    'the note no longer links /certified -- the reviewed key and localize-internal-links both assume it does');

  const copy = reviewedCopy();
  for (const loc of LOCALES) {
    const translated = copy[loc] && copy[loc][english];
    assert.ok(translated,
      `${loc} has no reviewed translation keyed to the current /pricing note, so /${loc} serves that whole paragraph in English`);
    assert.ok(translated.includes('<a href="/certified">'),
      `${loc}: the translation drops the /certified link, so postbuild cannot localise it`);
    assert.deepEqual(figuresIn(translated), figuresIn(english),
      `${loc}: the note quotes ${figuresIn(translated).join(', ')} where the English says ${figuresIn(english).join(', ')}`);
  }
});

/* generate-pricing-pages.cjs translates this page by looking each English string
   up in pricing-content.json, so a string on the page with no entry is simply
   served in English in all seven languages -- in the visible FAQ and in the
   FAQPage JSON-LD, which is what search engines read. Two answers were in that
   state: one had never been translated, and one was orphaned by a single word
   ("integrations" became "integration requirements" on the English side). */
test('every /pricing FAQ question and answer has a reviewed translation', () => {
  const html = read('public/pricing.html');
  const dict = JSON.parse(read('scripts/i18n/pricing-content.json'));
  const pairs = [...html.matchAll(/<details><summary>([^<]*)<\/summary><p>([^<]*)<\/p>/g)];
  assert.ok(pairs.length >= 6, `expected the pricing FAQ to still be on the page, found ${pairs.length} entries`);

  for (const [, question, answer] of pairs) {
    for (const [what, english] of [['question', question], ['answer', answer]]) {
      const entry = dict[english];
      assert.ok(entry,
        `this ${what} has no entry in pricing-content.json, so all seven locales serve it in English: "${english.slice(0, 80)}${english.length > 80 ? '...' : ''}"`);
      for (const loc of LOCALES) {
        assert.ok(entry[loc] && entry[loc] !== english,
          `${loc}: the ${what} "${english.slice(0, 60)}..." is untranslated`);
      }
    }
  }
});




test('the pricing page cannot imply discovery-based variable licence pricing', () => {
  const html = read('public/pricing.html');
  const dict = JSON.parse(read('scripts/i18n/pricing-content.json'));

  const forbidden = [
    /Why the Governance package carries a higher range/i,
    /indicative range/i,
    /What determines your final investment\?/i,
    /move an engagement within, or outside/i,
    /The exact package varies by engagement/i,
    /prepare an indicative proposal/i
  ];
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(html), `pricing page still contains legacy variable-pricing copy: ${pattern}`);
  }

  assert.ok(html.includes('What affects customer deployment effort?'),
    'pricing page must separate customer deployment effort from the fixed licence price');
  assert.ok(html.includes('The published agent licence price is fixed.'),
    'pricing page must explicitly state that the published licence price is fixed');
  assert.ok(html.includes('Each agent package is a standardized product sold at its published CAI-tier licence price.'),
    'pricing page must state that the package is standardized');

  const retiredKey = /(indicative (pricing|price|range|proposal)|priced by complexity|pricing.*complexity|higher range|final investment|ranges shown|final price depends|range reflects|move an engagement|exact package varies by engagement|tailored proposal|what affects price)/i;
  const staleKeys = Object.keys(dict).filter((key) => retiredKey.test(key));
  assert.deepEqual(staleKeys, [], 'pricing translation dictionary still carries retired variable-pricing keys: ' + staleKeys.join(' | '));

  const localizedKeys = [
    'What affects customer deployment effort?',
    "The published agent licence price is fixed. Customer deployment effort may vary depending on integrations, data readiness, governance requirements and the customer's implementation approach. These deployment costs are borne by the customer or agreed separately with its implementation partner.",
    'What the agent package includes',
    'Each agent package is a standardized product sold at its published CAI-tier licence price. Package contents are defined for the selected agent; customer-specific deployment work is outside the licence and remains with the customer or its implementation partner.',
    'Discuss your agent portfolio'
  ];
  for (const key of localizedKeys) {
    assert.ok(dict[key], `pricing translation dictionary is missing: ${key}`);
    for (const loc of ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']) {
      assert.ok(dict[key][loc], `${loc} is missing pricing translation for: ${key}`);
    }
  }

  // CI runs this suite after npm run build. Verify the generated locale pages
  // actually received the new reviewed copy rather than falling back to English.
  for (const loc of ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']) {
    const built = read(`dist/${loc}/pricing.html`);
    assert.ok(built.includes(dict['What affects customer deployment effort?'][loc]),
      `dist/${loc}/pricing.html is missing the localized deployment-effort heading`);
    assert.ok(built.includes(dict['What the agent package includes'][loc]),
      `dist/${loc}/pricing.html is missing the localized standardized-package heading`);
  }
});


test('the pricing CTA cannot reintroduce tailored-proposal scoping', () => {
  const html = read('public/pricing.html');
  const dict = JSON.parse(read('scripts/i18n/pricing-content.json'));

  assert.ok(!/Request a tailored proposal/i.test(html),
    'pricing page still contains the legacy Request a tailored proposal CTA');
  assert.ok(!/prepare a tailored proposal/i.test(html),
    'pricing page still implies a tailored proposal after scoping');

  const band = "Bring a use case and we will help you identify the appropriate fixed-price agent package and clarify customer-managed deployment prerequisites.";
  assert.ok(html.includes(band),
    'pricing page is missing the fixed-price package-selection bottom-band copy');
  assert.ok(dict[band],
    'pricing translation dictionary is missing the new bottom-band copy');

  for (const loc of ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']) {
    assert.ok(dict[band][loc], `${loc} is missing the localized bottom-band copy`);
    const built = read(`dist/${loc}/pricing.html`);
    assert.ok(!/Request a tailored proposal/i.test(built),
      `dist/${loc}/pricing.html still exposes the English legacy CTA`);
    assert.ok(built.includes(dict['Discuss your agent portfolio'][loc]),
      `dist/${loc}/pricing.html is missing the localized portfolio CTA`);
    assert.ok(built.includes(dict[band][loc]),
      `dist/${loc}/pricing.html is missing the localized bottom-band paragraph`);
  }
});


test('the pricing page cannot claim five package tiers', () => {
  const html = read('public/pricing.html');
  const dict = JSON.parse(read('scripts/i18n/pricing-content.json'));

  assert.ok(!/Five packaging tiers/i.test(html),
    'pricing page still claims five package tiers');
  assert.ok(html.includes('Three package tiers'),
    'pricing page must state that the catalogue has three package tiers');
  assert.ok(!dict['Five packaging tiers'],
    'pricing translation dictionary still contains the retired five-tier heading');
  assert.ok(dict['Three package tiers'],
    'pricing translation dictionary is missing the three-tier heading');

  for (const loc of ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']) {
    assert.ok(dict['Three package tiers'][loc],
      loc + ' is missing the localized three-tier heading');
    const built = read('dist/' + loc + '/pricing.html');
    assert.ok(built.includes(dict['Three package tiers'][loc]),
      'dist/' + loc + '/pricing.html is missing the localized three-tier heading');
  }
});


test('pricing final polish keeps fixed commercial terms, localized SEO and working tier analytics', () => {
  const html = read('public/pricing.html');
  const dict = JSON.parse(read('scripts/i18n/pricing-content.json'));
  const metaEn = "Explore fixed one-time licence pricing for governed enterprise AI agent packages: $7,900 for L2, $9,900 for L3 and $14,900 for L4, with optional Continuous Certification.";
  const ogEn = "Fixed one-time licence pricing for governed enterprise AI agent packages: $7,900 for L2, $9,900 for L3 and $14,900 for L4, with optional Continuous Certification.";
  const foundingNew = "Founding customers may qualify for preferential payment or Continuous Certification terms in exchange for structured product and deployment feedback and permission to develop an approved case study. Published agent licence prices remain fixed.";
  const deploymentNew = "The published agent licence price is fixed. Customer deployment effort may vary depending on integrations, data readiness, governance requirements and the customer's deployment approach. These deployment costs are borne by the customer or agreed separately with its implementation partner.";

  assert.ok(!/preferential commercial terms/i.test(html),
    'founding-customer copy still makes the fixed licence price sound negotiable');
  assert.ok(html.includes(foundingNew),
    'founding-customer copy must explicitly preserve fixed published agent licence prices');

  assert.ok(!html.includes("customer's implementation approach"),
    'pricing copy must not describe customer deployment as an implementation approach');
  assert.ok(html.includes(deploymentNew),
    'pricing copy must use customer deployment approach wording');
  assert.ok(!Object.prototype.hasOwnProperty.call(dict, "The published agent licence price is fixed. Customer deployment effort may vary depending on integrations, data readiness, governance requirements and the customer's implementation approach. These deployment costs are borne by the customer or agreed separately with its implementation partner."),
    'pricing translation dictionary still carries the retired implementation-approach source key');
  assert.ok(Object.prototype.hasOwnProperty.call(dict, deploymentNew),
    'pricing translation dictionary is missing the deployment-approach source key');

  const expectedDeploymentTranslations = {
    "cs": "Zveřejněná cena licence agenta je pevná. Náročnost nasazení u zákazníka se může lišit podle integrací, připravenosti dat, požadavků na governance a zvoleného způsobu nasazení. Tyto náklady na nasazení nese zákazník nebo jsou samostatně dohodnuty s jeho implementačním partnerem.",
    "de": "Der veröffentlichte Lizenzpreis des Agenten ist fest. Der Bereitstellungsaufwand beim Kunden kann je nach Integrationen, Datenreife, Governance-Anforderungen und gewähltem Bereitstellungsansatz variieren. Diese Bereitstellungskosten trägt der Kunde oder vereinbart sie separat mit seinem Implementierungspartner.",
    "fr": "Le prix de licence publié de l’agent est fixe. L’effort de déploiement côté client peut varier selon les intégrations, la préparation des données, les exigences de gouvernance et l’approche de déploiement choisie par le client. Ces coûts de déploiement sont à la charge du client ou convenus séparément avec son partenaire d’implémentation.",
    "es": "El precio de licencia publicado del agente es fijo. El esfuerzo de despliegue del cliente puede variar según las integraciones, la preparación de los datos, los requisitos de gobernanza y el enfoque de despliegue elegido por el cliente. Estos costes de despliegue corren a cargo del cliente o se acuerdan por separado con su socio de implementación.",
    "it": "Il prezzo di licenza pubblicato dell’agente è fisso. L’impegno di deployment del cliente può variare in base alle integrazioni, alla preparazione dei dati, ai requisiti di governance e all’approccio di deployment scelto dal cliente. Questi costi di deployment sono a carico del cliente o concordati separatamente con il suo partner di implementazione.",
    "pl": "Opublikowana cena licencji agenta jest stała. Nakład wdrożeniowy po stronie klienta może się różnić w zależności od integracji, gotowości danych, wymagań governance oraz wybranego podejścia do wdrożenia. Koszty te ponosi klient lub są one uzgadniane oddzielnie z jego partnerem wdrożeniowym.",
    "pt": "O preço publicado da licença do agente é fixo. O esforço de deployment do cliente pode variar consoante as integrações, a preparação dos dados, os requisitos de governação e a abordagem de deployment escolhida pelo cliente. Estes custos de deployment são suportados pelo cliente ou acordados separadamente com o seu parceiro de implementação."
  };
  for (const [loc, expected] of Object.entries(expectedDeploymentTranslations)) {
    assert.equal(dict[deploymentNew]?.[loc], expected,
      `${loc}: deployment-approach translation is stale or missing`);
  }

  for (const tier of ['L2', 'L3', 'L4']) {
    assert.ok(html.includes(`data-tier="${tier}"`),
      `pricing card ${tier} is missing analytics data-tier`);
  }
  assert.equal((html.match(/data-tier="L[234]"/g) || []).length, 3,
    'pricing page should expose exactly three tier cards to the analytics observer');

  for (const key of [metaEn, ogEn, foundingNew]) {
    assert.ok(dict[key], `pricing dictionary is missing reviewed copy: ${key}`);
    for (const loc of ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']) {
      assert.ok(dict[key][loc], `${loc} is missing reviewed copy for: ${key}`);
    }
  }

  for (const loc of ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']) {
    const built = read(`dist/${loc}/pricing.html`);
    assert.ok(built.includes(`meta name="description" content="${dict[metaEn][loc]}"`),
      `dist/${loc}/pricing.html still has an English meta description`);
    assert.ok(built.includes(`meta property="og:description" content="${dict[ogEn][loc]}"`),
      `dist/${loc}/pricing.html still has an English og:description`);

    const blocks = [...built.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]));
    const graph = blocks.flatMap((block) => block['@graph'] || []);
    const crumbs = graph.find((node) => node['@type'] === 'BreadcrumbList');
    assert.ok(crumbs, `dist/${loc}/pricing.html is missing BreadcrumbList JSON-LD`);
    const pricingUrl = `https://www.colleagueai.ai/${loc}/` + ({cs:'cenik',de:'preise',fr:'tarifs',es:'precios',it:'prezzi',pl:'cennik',pt:'precos'})[loc];
    assert.equal(crumbs.itemListElement[1].item, pricingUrl,
      `${loc} pricing breadcrumb still points at the English /pricing URL`);
    assert.equal(crumbs.itemListElement[0].item, `https://www.colleagueai.ai/${loc}/`,
      `${loc} pricing home breadcrumb should point at the locale home`);
    for (const node of graph.filter((node) => typeof node['@id'] === 'string' && /#(breadcrumb|service|faq)$/.test(node['@id']))) {
      assert.ok(node['@id'].startsWith(pricingUrl + '#'),
        `${loc} pricing JSON-LD @id is still anchored to the English pricing URL: ${node['@id']}`);
    }
  }
});
