// lib/vatTurnover.js: the Czech VAT-payer threshold watch counts only supplies with place of supply in the Czech
// Republic (read from the tax treatment recorded on the order, never from the buyer's country alone), keeps every
// order it cannot classify or convert explicitly unresolved, never concludes 'ok' over unresolved orders, takes the
// year from the caller or the clock, and detects a threshold crossing at the date of supply before any later refund.
import test from 'node:test';
import assert from 'node:assert/strict';
import { vatTurnover, describeTurnover, placeOfSupplyOf } from '../lib/vatTurnover.js';

const T = { effectiveFrom: 2025, payerFromNextYearCzk: 2000000, payerImmediatelyCzk: 2536500, warnAtShare: 0.8 };
const cz = { applied: true, category: 'cz_business' };
const order = (id, over = {}) => ({
  id, mode: 'live', price: { currency: 'usd', unitAmount: 1490000, quantity: 1 }, tax: cz,
  facts: { paidAt: '2026-03-02T10:00:00Z', fulfilledAt: '2026-03-02T10:00:05Z' }, ...over,
});
const czk = (id, amount, over = {}) => order(id, { price: { currency: 'czk', unitAmount: amount * 100, quantity: 1 }, ...over });

test('only live, paid orders of the year are examined, at the fulfilment date', () => {
  const r = vatTurnover({ thresholds: T, year: 2026, rateFor: () => 23, orders: [
    order('a'),
    order('b', { mode: 'test' }),
    order('d', { facts: { paidAt: '2025-12-31T23:00:00Z', fulfilledAt: '2025-12-31T23:00:10Z' } }),
    order('e', { facts: {} }),
  ] });
  assert.deepEqual(r.rows.map((x) => x.orderId), ['a']);
  assert.equal(r.grossCzk, 14900 * 23);
  assert.equal(r.status, 'ok');
  assert.equal(r.headroomCzk, 2000000 - 14900 * 23);
});

test('place of supply comes from the recorded tax treatment, not from the buyer country', () => {
  assert.equal(placeOfSupplyOf({ tax: cz }), 'CZ');
  assert.equal(placeOfSupplyOf({ tax: { applied: true, category: 'eu_business_vat_verified' } }), 'outside_cz');
  assert.equal(placeOfSupplyOf({ tax: { applied: true, category: 'non_eu_business' } }), 'outside_cz');
  assert.equal(placeOfSupplyOf({ tax: { applied: true, category: 'eu_business_vat_pending' } }), 'unresolved');
  assert.equal(placeOfSupplyOf({ tax: { applied: true, category: 'eu_business_no_vat_id' } }), 'unresolved');
  // a treatment that was NOT applied (policy unapproved at checkout) settles nothing, whatever the buyer country says
  assert.equal(placeOfSupplyOf({ buyer: { country: 'CZ' }, tax: { applied: false, category: 'cz_business' } }), 'unresolved');
  assert.equal(placeOfSupplyOf({ buyer: { country: 'CZ' } }), 'unresolved');
  // an explicit later record wins
  assert.equal(placeOfSupplyOf({ tax: { applied: true, category: 'eu_business_no_vat_id', placeOfSupply: 'outside_cz' } }), 'outside_cz');
});

test('supplies outside the Czech Republic are excluded from turnover and reported as excluded', () => {
  const r = vatTurnover({ thresholds: T, year: 2026, orders: [
    czk('a', 1000),
    czk('de', 5000000, { tax: { applied: true, category: 'eu_business_vat_verified' } }),
    czk('us', 5000000, { tax: { applied: true, category: 'non_eu_business' } }),
  ] });
  assert.equal(r.grossCzk, 1000);
  assert.equal(r.excluded, 2);
  assert.equal(r.status, 'ok');
  assert.equal(r.rows.find((x) => x.orderId === 'de').counts, false);
});

test('an unresolved order is never counted at zero and the report never says ok while one exists', () => {
  const unresolvedPlace = vatTurnover({ thresholds: T, year: 2026, orders: [czk('a', 1000), czk('p', 1000, { tax: { applied: true, category: 'eu_business_vat_pending' } })] });
  assert.deepEqual(unresolvedPlace.unresolved, ['p']);
  assert.equal(unresolvedPlace.grossCzk, 1000);
  assert.equal(unresolvedPlace.status, 'unresolved');
  assert.match(describeTurnover(unresolvedPlace), /1 order\(s\) UNRESOLVED \(p\)/);
  assert.match(describeTurnover(unresolvedPlace), /no conclusion until the unresolved orders are classified/);

  const unapplied = vatTurnover({ thresholds: T, year: 2026, orders: [czk('a', 1000), czk('n', 1000, { tax: { applied: false, category: 'cz_business' } })] });
  assert.deepEqual(unapplied.unresolved, ['n']);
  assert.equal(unapplied.status, 'unresolved');
  assert.match(unapplied.rows[1].how, /no tax treatment applied at checkout/);

  const noRate = vatTurnover({ thresholds: T, year: 2026, orders: [order('a'), czk('b', 1000)] });
  assert.deepEqual(noRate.unresolved, ['a']);
  assert.equal(noRate.grossCzk, 1000);
  assert.equal(noRate.status, 'unresolved');
  assert.match(noRate.rows[0].how, /no CZK conversion/);
});

test('a resolved crossing is reported even when other orders are unresolved', () => {
  const r = vatTurnover({ thresholds: T, year: 2026, orders: [czk('a', 2000001), order('u')] });
  assert.equal(r.status, 'over_next_year_threshold');
  assert.deepEqual(r.unresolved, ['u']);
});

test('the invoice conversion wins over a supplied rate; a partial refund reduces the net figure only', () => {
  const r = vatTurnover({ thresholds: T, year: 2026, rateFor: () => 99, orders: [
    order('a', { invoice: { conversion: { amountCzk: 350000, rate: 23.49, source: 'CNB', date: '2026-03-02' } } }),
    order('b', { facts: { paidAt: '2026-04-01T00:00:00Z', refunded: { amount: 490000 } } }),
  ] });
  assert.equal(r.rows[0].grossCzk, 350000);
  assert.equal(r.rows[0].netCzk, 350000);
  assert.equal(r.rows[1].grossCzk, 14900 * 99);
  assert.equal(r.rows[1].netCzk, (14900 - 4900) * 99);
  assert.equal(r.grossCzk, 350000 + 14900 * 99);
  assert.equal(r.netCzk, 350000 + 10000 * 99);
});

test('a threshold crossed at the date of supply stays crossed after a later refund, and a full refund is still examined', () => {
  const r = vatTurnover({ thresholds: T, year: 2026, orders: [
    czk('a', 1500000, { facts: { paidAt: '2026-02-01T00:00:00Z', fulfilledAt: '2026-02-01T00:00:05Z' } }),
    czk('b', 600000, { facts: { paidAt: '2026-03-01T00:00:00Z', fulfilledAt: '2026-03-01T00:00:05Z', refunded: { full: true, amount: 60000000 } } }),
    czk('c', 100000, { facts: { paidAt: '2026-04-01T00:00:00Z', fulfilledAt: '2026-04-01T00:00:05Z' } }),
  ] });
  assert.equal(r.grossCzk, 2200000);
  assert.equal(r.netCzk, 1600000);
  assert.equal(r.crossedLowAt, '2026-03-01');
  assert.equal(r.crossedHighAt, null);
  assert.equal(r.status, 'over_next_year_threshold');
  assert.match(describeTurnover(r), /crossed on 2026-03-01 \(a later refund does not undo it\)/);
  // net alone would read as 'approaching'; the status must not
  assert.notEqual(r.status, 'approaching');
});

test('the status escalates at 80 %, at the next-year threshold and at the immediate threshold', () => {
  const at = (amount) => vatTurnover({ thresholds: T, year: 2026, orders: [czk('a', amount)] }).status;
  assert.equal(at(1599999), 'ok');
  assert.equal(at(1600000), 'approaching');
  assert.equal(at(2000001), 'over_next_year_threshold');
  assert.equal(at(2536501), 'over_immediate_threshold');
  assert.match(describeTurnover(vatTurnover({ thresholds: T, year: 2026, orders: [czk('a', 2536501)] })), /stop selling under the identified-person configuration/);
});

test('the year is the caller\'s or the current one, never a constant, and the config must be in force for it', () => {
  const now = new Date('2031-06-15T00:00:00Z');
  const r = vatTurnover({ thresholds: T, now, orders: [czk('a', 1000, { facts: { paidAt: '2031-01-05T00:00:00Z', fulfilledAt: '2031-01-05T00:00:05Z' } })] });
  assert.equal(r.year, 2031);
  assert.equal(r.grossCzk, 1000);
  assert.equal(vatTurnover({ thresholds: T, year: 2027, orders: [] }).year, 2027);
  assert.throws(() => vatTurnover({ thresholds: { ...T, effectiveFrom: 2030 }, year: 2029, orders: [] }), /applies from 2030/);
});
