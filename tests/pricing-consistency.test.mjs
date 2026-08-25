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
  const prices = JSON.parse(html.match(/perAgentPrice:(\{[\s\S]*?\}),/)[1]);

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
  const cert = JSON.parse(html.match(/certMonthly:(\{[\s\S]*?\}),/)[1]);
  for (const [tier, v] of Object.entries(PRICING.tiers)) {
    assert.equal(cert[tier], dollars(v.monthlyCents), `catalogue certMonthly.${tier} disagrees with the config`);
  }
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

test('the demo form and the certification page read from the config too', () => {
  assert.ok(read('src/Demo.jsx').includes("config/pricing.json"), 'Demo.jsx must not hard-code package prices');
  const cert = read('public/certified.html');
  for (const [tier, v] of Object.entries(PRICING.tiers)) {
    assert.ok(cert.includes(usd(v.oneTimeCents)), `/certified is missing the ${tier} package price`);
    assert.ok(cert.includes(`$${dollars(v.monthlyCents)} / month`), `/certified is missing the ${tier} monthly price`);
  }
});

test('no retired price survives anywhere in the English masters', () => {
  const retired = ['$27,000', '$40,500', '$4,500'];
  const pages = ['agents.html', 'pricing.html', 'partners.html', 'home.html', 'score.html', 'certified.html'];
  for (const p of pages) {
    const html = read('public/' + p);
    for (const r of retired) {
      assert.ok(!html.includes(r), `${p} still quotes the retired figure ${r}`);
    }
  }
});
