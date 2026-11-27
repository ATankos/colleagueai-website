/**
 * tests/commission-base.test.mjs - founder decision (Round 3): the standard 10% referral commission is paid on eligible NET
 * perpetual licence revenue only. No commission on tax, and none on Continuous Certification (recurring) revenue, including
 * the first period that is charged in the same checkout. Local only: fake Upstash, fake Stripe API, real api/webhook.js.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Stripe from 'stripe';
import { createFakeKv } from './helpers/fake-kv.mjs';

const SECRET = 'whsec_LOCAL_TEST_HARNESS_DUMMY';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_SECRET_KEY = 'sk_test_LOCAL_DUMMY_NOT_REAL';
delete process.env.VERCEL_ENV;
delete process.env.PARTNER_COMMISSION_RATE;

const SLUG = 'contract-intelligence-and-register';
const kvf = createFakeKv();
const stripe = new Stripe('sk_test_LOCAL_DUMMY_NOT_REAL');
const LINES = {
  cs_sub: [ // licence 14,900.00 + first month of certification 490.00, both with 21% tax
    { id: 'li_1', object: 'item', amount_subtotal: 1490000, amount_discount: 0, amount_tax: 312900, amount_total: 1802900, price: { id: 'p1', recurring: null } },
    { id: 'li_2', object: 'item', amount_subtotal: 49000, amount_discount: 0, amount_tax: 10290, amount_total: 59290, price: { id: 'p2', recurring: { interval: 'month' } } },
  ],
};
let stripeMode = 'ok', handler, licenceNetRevenue, appServer, stripeServer, base, seq = 0;

before(async () => {
  await kvf.start();
  stripeServer = http.createServer((req, res) => {
    const m = /^\/v1\/checkout\/sessions\/([^/]+)\/line_items/.exec(req.url);
    res.setHeader('content-type', 'application/json');
    if (m && stripeMode === 'ok') return res.end(JSON.stringify({ object: 'list', has_more: false, url: req.url, data: LINES[m[1]] ?? [] }));
    res.writeHead(m ? 500 : 404); res.end('{"error":{"message":"not available"}}');
  });
  await new Promise((r) => stripeServer.listen(0, r));
  process.env.STRIPE_API_HOST = `http://127.0.0.1:${stripeServer.address().port}`;
  ({ default: handler, licenceNetRevenue } = await import('../api/webhook.js'));
  appServer = http.createServer((req, res) => {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    handler(req, res);
  });
  await new Promise((r) => appServer.listen(0, r));
  base = `http://127.0.0.1:${appServer.address().port}`;
});
after(() => { kvf.stop(); stripeServer.close(); appServer.closeAllConnections?.(); appServer.close(); });
beforeEach(() => {
  kvf.reset(); stripeMode = 'ok';
  kvf.store.set('partner:reg:P10', JSON.stringify({ code: 'P10', status: 'approved', commissionRate: 0.1, agreementVersion: 'v1' }));
});

async function deliver(session) {
  const payload = JSON.stringify({ id: `evt_c_${++seq}`, object: 'event', type: 'checkout.session.completed', data: { object: session } });
  const r = await fetch(base + '/api/webhook', { method: 'POST', headers: { 'content-type': 'application/json',
    'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }, body: payload });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const session = (over) => ({ object: 'checkout.session', payment_status: 'paid', currency: 'usd',
  customer_details: { email: `b${seq}@example.com` }, metadata: { agent_slug: SLUG, tier: 'L4', partner: 'P10' }, ...over });
const entry = (id) => JSON.parse(kvf.store.get(`commission:${id}`) ?? 'null');

test('one-time licence: 10% of the amount before tax, not of the taxed total', async () => {
  const r = await deliver(session({ id: 'cs_pay', mode: 'payment', amount_total: 1802900, total_details: { amount_tax: 312900 } }));
  assert.equal(r.status, 200);
  const e = entry('cs_pay');
  assert.equal(e.commissionBase, 1490000);
  assert.equal(e.commission, 1490, 'DEFECT: commission was taken on tax');
  assert.equal(e.amountGross, 1802900, 'the charge total is kept for partial-refund shares');
});

test('licence + Continuous Certification: no commission on the certification period, nor on tax', async () => {
  const r = await deliver(session({ id: 'cs_sub', mode: 'subscription', subscription: 'sub_c1', amount_total: 1862190, total_details: { amount_tax: 323190 } }));
  assert.equal(r.status, 200);
  const e = entry('cs_sub');
  assert.equal(e.commissionBase, 1490000, 'only the perpetual licence line, net of tax');
  assert.equal(e.commission, 1490, 'DEFECT: commission was taken on recurring certification revenue');
});

test('a partial refund still reverses the refunded share of the commission', async () => {
  const db = await import('../lib/db.js');
  await deliver(session({ id: 'cs_pay', mode: 'payment', amount_total: 1802900, total_details: { amount_tax: 312900 } }));
  const r = await db.reverseCommission('cs_pay', 'charge.refunded', 901450); // half the charge
  assert.equal(r.reversedAmount, 745);
  assert.equal(r.partialReversal, true);
});

test('if the line items cannot be read the event fails, so Stripe retries instead of over-paying', async () => {
  stripeMode = 'down';
  const r = await deliver(session({ id: 'cs_sub', mode: 'subscription', subscription: 'sub_c2', amount_total: 1862190, total_details: { amount_tax: 323190 } }));
  assert.equal(r.status, 500);
  assert.equal(entry('cs_sub'), null);
  stripeMode = 'ok';
  assert.equal((await deliver(session({ id: 'cs_sub', mode: 'subscription', subscription: 'sub_c2', amount_total: 1862190, total_details: { amount_tax: 323190 } }))).status, 200);
  assert.equal(entry('cs_sub').commission, 1490);
});

test('licenceNetRevenue: discounts already applied, recurring lines excluded, never negative', async () => {
  const fake = { checkout: { sessions: { listLineItems: async () => ({ data: [
    { amount_total: 1341000, amount_tax: 0, price: { recurring: null } },          // licence after a 10% discount, reverse charge
    { amount_total: 49000, amount_tax: 0, price: { recurring: { interval: 'month' } } },
  ] }) } } };
  assert.equal(await licenceNetRevenue(fake, { id: 'x', mode: 'subscription' }), 1341000);
  assert.equal(await licenceNetRevenue(fake, { id: 'x', mode: 'payment', amount_total: 100, total_details: { amount_tax: 300 } }), 0);
});
