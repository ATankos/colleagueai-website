/**
 * tests/fulfilment-check.test.mjs - the daily payment-to-licence check (lib/fulfilmentCheck.js) names every paid
 * session whose records do not match its payment, and stays silent when they do. The end-to-end case (a webhook that
 * never arrived, through the real handlers) is in tests/purchase-journey.test.mjs.
 * Usage: node --test tests/fulfilment-check.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { checkFulfilment, fulfilmentCsv } from '../lib/fulfilmentCheck.js';

const SLUG = 'contract-intelligence-and-register';
const sess = (id, o = {}) => ({
  id, status: 'complete', payment_status: 'paid', livemode: false,
  customer_details: { email: `${id}@buyer.example` }, metadata: { order_id: `ord_20261111_${id.padEnd(12, '0').slice(0, 12)}`, agent_slug: SLUG }, ...o,
});
const ord = (s, facts) => ({ id: s.metadata.order_id, facts });
const ent = (s, extra = {}) => ({ email: s.customer_details.email, slugs: [SLUG], sessionSlugs: { [s.id]: [SLUG] }, ...extra });
const check = (s, { order, entitlement, withheld } = {}) => checkFulfilment({
  sessions: [s],
  orders: { [s.metadata.order_id]: order ?? null },
  entitlements: { [s.customer_details.email]: entitlement ?? null },
  withheld: { [s.id]: withheld ?? null },
});

test('a paid, licensed and recorded purchase produces no row', () => {
  const s = sess('aaa1');
  assert.deepEqual(check(s, { order: ord(s, { paidAt: 'x', fulfilledAt: 'y' }), entitlement: ent(s) }).rows, []);
});

test('sessions that are not complete are not checked', () => {
  const r = checkFulfilment({ sessions: [sess('open1', { status: 'open' }), sess('exp1', { status: 'expired' })] });
  assert.equal(r.checked, 0);
  assert.deepEqual(r.rows, []);
});

test('refunded or disputed orders whose licence is still held for that purchase are reported', () => {
  for (const facts of [{ paidAt: 'x', refunded: { full: true } }, { paidAt: 'x', dispute: { status: 'needs_response' } }, { paidAt: 'x', dispute: { status: 'lost' } }]) {
    const s = sess('rev1');
    const r = check(s, { order: ord(s, facts), entitlement: ent(s) });
    assert.equal(r.rows[0].problem, 'revoked_still_licensed', JSON.stringify(facts));
    assert.equal(r.problems, 1);
  }
  const s = sess('rev2');
  const revoked = ent(s, { revokedSessionIds: [s.id] });
  assert.deepEqual(check(s, { order: ord(s, { paidAt: 'x', refunded: { full: true } }), entitlement: revoked }).rows, [], 'a revoked purchase is not counted as held');
});

test('a won dispute counts as a normal sale again', () => {
  const s = sess('won1');
  assert.deepEqual(check(s, { order: ord(s, { paidAt: 'x', fulfilledAt: 'y', dispute: { status: 'won' } }), entitlement: ent(s) }).rows, []);
});

test('withheld sales, missing orders and orders that never learned of the payment are each named', () => {
  const s1 = sess('held1');
  assert.equal(check(s1, { order: ord(s1, { paidAt: 'x' }), withheld: { reason: 'amount-mismatch' } }).rows[0].problem, 'withheld_for_review');
  assert.equal(check(s1, { order: ord(s1, { paidAt: 'x' }), withheld: { reason: 'amount-mismatch' } }).rows[0].detail, 'amount-mismatch');
  const s2 = sess('miss1');
  assert.equal(check(s2, { entitlement: ent(s2) }).rows[0].problem, 'order_missing');
  const s3 = sess('nopaid1');
  assert.equal(check(s3, { order: ord(s3, {}), entitlement: ent(s3) }).rows[0].problem, 'order_not_updated');
});

test('a licence held only through another purchase does not cover this one', () => {
  const s = sess('two1');
  const other = { email: s.customer_details.email, slugs: [SLUG], sessionSlugs: { cs_other: [SLUG] } };
  assert.equal(check(s, { order: ord(s, { paidAt: 'x' }), entitlement: other }).rows[0].problem, 'paid_not_licensed');
});

test('purchases from before order ids (test mode) are checked against the licence alone', () => {
  const s = sess('legacy1', { metadata: { agent_slug: SLUG } });
  const legacyEnt = { email: s.customer_details.email, slugs: [SLUG] };
  const r = checkFulfilment({ sessions: [s], entitlements: { [s.customer_details.email]: legacyEnt } });
  assert.deepEqual(r.rows, []);
  assert.equal(checkFulfilment({ sessions: [s] }).rows[0].problem, 'paid_not_licensed');
});

test('rows are ordered worst first and the CSV quotes what needs quoting', () => {
  const a = sess('csv1'); const b = sess('csv2', { payment_status: 'unpaid' }); const c = sess('csv3');
  const r = checkFulfilment({
    sessions: [b, a, c],
    orders: { [a.metadata.order_id]: ord(a, { paidAt: 'x' }), [c.metadata.order_id]: ord(c, { paidAt: 'x' }) },
    withheld: { [c.id]: { reason: 'billing, "country" mismatch' } },
  });
  assert.deepEqual(r.rows.map((x) => x.problem), ['withheld_for_review', 'paid_not_licensed', 'awaiting_payment']);
  assert.equal(r.problems, 2);
  const csv = fulfilmentCsv(r).split('\n');
  assert.equal(csv[0], 'problem,session,order_id,order_status,email,product,detail');
  assert.match(csv[1], /"billing, ""country"" mismatch"$/);
});
