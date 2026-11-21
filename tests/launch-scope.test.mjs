/**
 * tests/launch-scope.test.mjs - the first-sale launch scope (config/launch-scope.json, lib/launchScope.js): one product
 * at the approved release and bundle revision, USD, card, licence only, Czech businesses with a valid IČO. The
 * handler-level journeys (refusals, card-only session, billing address changed on Stripe's page) are in
 * tests/purchase-journey.test.mjs; this file pins the rules and the configuration.
 * Usage: node --test tests/launch-scope.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { isValidIco, scopeEnforced, requestScopeError, buyerScopeError, sessionScopeError, scopePaymentMethodTypes, LAUNCH_SCOPE } from '../lib/launchScope.js';
import { parseCnbList, cnbConversion, __setCnbFetchForTests } from '../lib/cnbRate.js';

const PRODUCTS = JSON.parse(readFileSync(new URL('../config/products.json', import.meta.url), 'utf8'));
const SLUG = 'contract-intelligence-and-register';
const P = PRODUCTS[SLUG];

test('the scope names exactly one product, at the release and bundle revision config/products.json delivers', () => {
  assert.deepEqual(Object.keys(LAUNCH_SCOPE.products), [SLUG]);
  const s = LAUNCH_SCOPE.products[SLUG];
  assert.equal(s.sku, P.sku);
  assert.equal(s.release, P.release.version);
  assert.equal(s.bundleRevision, P.release.bundleRevision);
  assert.equal(P.release.package, 'CAI-L4-CI-001_1.0.3.6-r2.zip');
  assert.deepEqual(LAUNCH_SCOPE.buyer.countries, ['CZ']);
  assert.deepEqual(LAUNCH_SCOPE.currencies, ['usd']);
  assert.deepEqual(LAUNCH_SCOPE.paymentMethods, ['card']);
  assert.equal(LAUNCH_SCOPE.certification, false);
  assert.deepEqual(scopePaymentMethodTypes(), ['card']);
  assert.equal(P.saleApproved, false, 'the scope never opens a sale by itself');
});

test('IČO check digit (mod 11, weights 8..2)', () => {
  for (const ok of ['29540852', '12345679', '1234 5679']) assert.ok(isValidIco(ok), ok);
  for (const bad of ['29540853', '12345678', '1234567', '123456789', 'CZ29540852', '', null, 'abcdefgh']) assert.ok(!isValidIco(bad), String(bad));
});

test('the scope applies to live keys always; the test-suite bypass works only with a test key', () => {
  assert.equal(scopeEnforced('sk_live_x', { LAUNCH_SCOPE_TEST_BYPASS: '1' }), true);
  assert.equal(scopeEnforced('rk_live_x', { LAUNCH_SCOPE_TEST_BYPASS: '1' }), true);
  assert.equal(scopeEnforced('sk_test_x', {}), true);
  assert.equal(scopeEnforced('sk_test_x', { LAUNCH_SCOPE_TEST_BYPASS: '1' }), false);
});

test('request parameters: another product, a changed release or revision, EUR, bank and certification are out of scope', () => {
  const base = { slug: SLUG, product: P, currency: 'usd', method: 'card' };
  assert.equal(requestScopeError(base), null);
  assert.equal(requestScopeError({ ...base, method: '' }), null, 'no method chosen = card');
  assert.equal(requestScopeError({ ...base, slug: 'risk-control-oversight-agent' }).code, 'not_in_launch_scope');
  assert.equal(requestScopeError({ ...base, slug: '__proto__' }).code, 'not_in_launch_scope');
  assert.equal(requestScopeError({ ...base, product: { ...P, release: { ...P.release, bundleRevision: 1 } } }).code, 'release_not_in_launch_scope');
  assert.equal(requestScopeError({ ...base, product: { ...P, release: { ...P.release, version: '1.0.3.7' } } }).code, 'release_not_in_launch_scope');
  assert.equal(requestScopeError({ ...base, currency: 'eur' }).code, 'currency_not_in_launch_scope');
  assert.equal(requestScopeError({ ...base, method: 'bank' }).code, 'payment_method_not_in_launch_scope');
  assert.equal(requestScopeError({ ...base, certification: true }).code, 'certification_not_in_launch_scope');
});

test('buyer: Czech company with a valid IČO; a VAT ID, if given, must be CZ + that IČO', () => {
  const b = { country: 'CZ', registrationNumber: '12345679', taxId: null };
  assert.equal(buyerScopeError(b), null);
  assert.equal(buyerScopeError({ ...b, taxId: { value: 'CZ12345679' } }), null);
  assert.equal(buyerScopeError({ ...b, country: 'SK' }).code, 'buyer_country_not_in_launch_scope');
  assert.equal(buyerScopeError({ ...b, country: 'cz' }), null, 'case-insensitive country');
  assert.equal(buyerScopeError({ ...b, registrationNumber: null }).code, 'registration_number_required');
  assert.equal(buyerScopeError({ ...b, registrationNumber: '12345678' }).code, 'registration_number_invalid');
  assert.equal(buyerScopeError({ ...b, taxId: { value: 'CZ29540852' } }).code, 'vat_id_mismatch');
  assert.equal(buyerScopeError({ ...b, taxId: { value: 'SK2020202020' } }).code, 'vat_id_mismatch');
});

test('paid session: billing country and Stripe-collected tax IDs are checked again', () => {
  const order = { buyer: { country: 'CZ', registrationNumber: '12345679' } };
  assert.equal(sessionScopeError({ order, billingCountry: 'CZ' }), null);
  assert.equal(sessionScopeError({ order, billingCountry: 'CZ', taxIds: [{ value: 'CZ12345679' }] }), null);
  assert.equal(sessionScopeError({ order, billingCountry: 'AT' }), 'billing-country-out-of-launch-scope');
  assert.equal(sessionScopeError({ order, billingCountry: null }), 'billing-country-missing');
  assert.equal(sessionScopeError({ order, billingCountry: 'CZ', taxIds: [{ value: 'ATU12345678' }] }), 'tax-id-out-of-launch-scope');
  assert.equal(sessionScopeError({ order, billingCountry: 'CZ', taxIds: [{ value: 'CZ87654321' }] }), 'tax-id-out-of-launch-scope');
  assert.equal(sessionScopeError({ order: { buyer: { country: 'DE' } }, billingCountry: 'CZ' }), 'buyer-out-of-launch-scope');
});

const CNB = `20.11.2026 #225
země|měna|množství|kód|kurz
EMU|euro|1|EUR|25,105
USA|dolar|1|USD|23,456
Japonsko|jen|100|JPY|15,123
`;
test('ČNB daily list: parsed per unit; a conversion records its source list and never guesses a missing rate', async () => {
  const l = parseCnbList(CNB);
  assert.equal(l.listDate, '2026-11-20');
  assert.deepEqual(l.rates.USD, { amount: 1, rate: 23.456 });
  assert.deepEqual(l.rates.JPY, { amount: 100, rate: 15.123 });
  const urls = [];
  __setCnbFetchForTests(async (u) => { urls.push(u); return CNB; });
  const c = await cnbConversion({ amountMinor: 1490000, currency: 'usd', date: '2026-11-21' });
  assert.match(urls[0], /denni_kurz\.txt\?date=21\.11\.2026$/);
  assert.equal(c.amountCzk, 34949440, 'USD 14,900.00 x 23.456 = CZK 349,494.40, in haléře');
  assert.equal(c.rate, 23.456);
  assert.equal(c.listDate, '2026-11-20', 'a Saturday tax point uses the last list ČNB published, and says which');
  await assert.rejects(cnbConversion({ amountMinor: 100, currency: 'gbp', date: '2026-11-21' }), /no rate for GBP/);
  await assert.rejects(cnbConversion({ amountMinor: 100, currency: 'usd', date: '21.11.2026' }), /YYYY-MM-DD/);
  __setCnbFetchForTests(async () => 'garbage');
  await assert.rejects(cnbConversion({ amountMinor: 100, currency: 'usd', date: '2026-11-21' }), /header/);
  __setCnbFetchForTests(null);
});
