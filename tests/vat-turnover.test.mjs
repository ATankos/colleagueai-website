// lib/vatTurnover.js: the Czech VAT-payer threshold watch counts only what should count and never hides an order
// it could not convert.
import test from 'node:test';
import assert from 'node:assert/strict';
import { vatTurnover, describeTurnover } from '../lib/vatTurnover.js';

const T = { year: 2026, payerFromNextYearCzk: 2000000, payerImmediatelyCzk: 2536500, warnAtShare: 0.8 };
const order = (id, over = {}) => ({
  id, mode: 'live', price: { currency: 'usd', unitAmount: 1490000, quantity: 1 },
  facts: { paidAt: '2026-03-02T10:00:00Z', fulfilledAt: '2026-03-02T10:00:05Z' }, ...over,
});

test('only live, paid, not fully refunded orders of the year count, at the fulfilment date', () => {
  const r = vatTurnover({ thresholds: T, year: 2026, rateFor: () => 23, orders: [
    order('a'),
    order('b', { mode: 'test' }),
    order('c', { facts: { paidAt: '2026-05-01T00:00:00Z', refunded: { full: true, amount: 1490000 } } }),
    order('d', { facts: { paidAt: '2025-12-31T23:00:00Z', fulfilledAt: '2025-12-31T23:00:10Z' } }),
    order('e', { facts: {} }),
  ] });
  assert.deepEqual(r.rows.map((x) => x.orderId), ['a']);
  assert.equal(r.totalCzk, 14900 * 23);
  assert.equal(r.status, 'ok');
  assert.equal(r.headroomCzk, 2000000 - 14900 * 23);
});

test('the invoice conversion wins over a supplied rate, and a partial refund reduces the amount', () => {
  const r = vatTurnover({ thresholds: T, year: 2026, rateFor: () => 99, orders: [
    order('a', { invoice: { conversion: { amountCzk: 350000, rate: 23.49, source: 'CNB', date: '2026-03-02' } } }),
    order('b', { facts: { paidAt: '2026-04-01T00:00:00Z', refunded: { amount: 490000 } } }),
  ] });
  assert.equal(r.rows[0].czk, 350000);
  assert.equal(r.rows[1].amount, 10000);
  assert.equal(r.rows[1].czk, 10000 * 99);
});

test('an order without a rate is listed as unconverted and excluded, never silently counted at zero', () => {
  const r = vatTurnover({ thresholds: T, year: 2026, orders: [order('a'), order('b', { price: { currency: 'czk', unitAmount: 100000 } })] });
  assert.deepEqual(r.unconverted, ['a']);
  assert.equal(r.totalCzk, 1000);
  assert.match(describeTurnover(r), /1 order\(s\) not yet converted to CZK \(a\) are NOT included/);
});

test('the status escalates at 80 %, at the next-year threshold and at the immediate threshold', () => {
  const at = (czk) => vatTurnover({ thresholds: T, year: 2026, orders: [order('a', { price: { currency: 'czk', unitAmount: czk * 100 } })] }).status;
  assert.equal(at(1599999), 'ok');
  assert.equal(at(1600000), 'approaching');
  assert.equal(at(2000001), 'over_next_year_threshold');
  assert.equal(at(2536501), 'over_immediate_threshold');
  assert.match(describeTurnover(vatTurnover({ thresholds: T, year: 2026, orders: [order('a', { price: { currency: 'czk', unitAmount: 253650100 } })] })), /stop selling under the identified-person configuration/);
});
