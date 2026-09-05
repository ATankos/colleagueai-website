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
