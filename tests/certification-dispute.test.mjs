/**
 * tests/certification-dispute.test.mjs - founder decision (Round 3): an unresolved payment dispute suspends the commercial
 * subscription benefit and the active certificate claim; it is a PAYMENT status (axis 1), kept separate from the technical
 * certification decision (axis 3). Local only: fake Upstash, fake Stripe API (STRIPE_API_HOST), real api/webhook.js.
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

const SLUG = 'contract-intelligence-and-register';
const EMAIL = 'disputer@example.com';
const SUB = 'sub_d';
const SESSION = 'cs_d1';
const kvf = createFakeKv();
const stripe = new Stripe('sk_test_LOCAL_DUMMY_NOT_REAL');
const cancelled = [];
let db, state, access, products, handler, appServer, stripeServer, base, seq = 0;

const json = (res, body, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const INVOICE_FOR_PI = { pi_purchase: 'in_first', pi_renew: 'in_renew', pi_renew2: 'in_renew' };

before(async () => {
  await kvf.start();
  stripeServer = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/v1/checkout/sessions' && req.method === 'GET') {
      const data = u.searchParams.get('subscription') === SUB
        ? [{ id: SESSION, object: 'checkout.session', mode: 'subscription', subscription: SUB, customer_details: { email: EMAIL }, metadata: { agent_slug: SLUG, tier: 'L4' } }]
        : []; // a subscription-mode session has no payment_intent of its own
      return json(res, { object: 'list', data, has_more: false, url: '/v1/checkout/sessions' });
    }
    if (u.pathname === '/v1/invoice_payments' && req.method === 'GET') {
      const inv = INVOICE_FOR_PI[u.searchParams.get('payment[payment_intent]')];
      return json(res, { object: 'list', has_more: false, url: '/v1/invoice_payments', data: inv ? [{ id: `inpay_${inv}`, object: 'invoice_payment', invoice: inv }] : [] });
    }
    if (u.pathname.startsWith('/v1/invoices/') && req.method === 'GET') {
      const id = u.pathname.split('/')[3];
      return json(res, { id, object: 'invoice', billing_reason: id === 'in_first' ? 'subscription_create' : 'subscription_cycle',
        parent: { type: 'subscription_details', subscription_details: { subscription: SUB } } });
    }
    if (u.pathname.startsWith('/v1/subscriptions/') && req.method === 'DELETE') {
      cancelled.push(u.pathname.split('/')[3]);
      return json(res, { id: SUB, object: 'subscription', status: 'canceled' });
    }
    json(res, { error: { message: 'not faked' } }, 404);
  });
  await new Promise((r) => stripeServer.listen(0, r));
  process.env.STRIPE_API_HOST = `http://127.0.0.1:${stripeServer.address().port}`;

  db = await import('../lib/db.js');
  state = await import('../lib/certificateState.js');
  access = await import('../lib/releaseAccess.js');
  products = await import('../lib/products.js');
  ({ default: handler } = await import('../api/webhook.js'));
  appServer = http.createServer((req, res) => {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    handler(req, res);
  });
  await new Promise((r) => appServer.listen(0, r));
  base = `http://127.0.0.1:${appServer.address().port}`;
});
after(() => { kvf.stop(); stripeServer.close(); appServer.closeAllConnections?.(); appServer.close(); });
beforeEach(() => { kvf.reset(); db.resetSharedSecretCache(); cancelled.length = 0; });

const inDays = (n) => Math.floor(Date.now() / 1000) + n * 86400;
async function deliver(event) {
  const payload = JSON.stringify(event);
  const r = await fetch(base + '/api/webhook', { method: 'POST', headers: { 'content-type': 'application/json',
    'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }, body: payload });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const checkout = () => ({ id: `evt_co_${++seq}`, object: 'event', type: 'checkout.session.completed',
  data: { object: { id: SESSION, object: 'checkout.session', mode: 'subscription', payment_status: 'paid', amount_total: 1490000, currency: 'usd',
    subscription: SUB, customer_details: { email: EMAIL }, metadata: { agent_slug: SLUG, tier: 'L4' } } } });
const invoicePaid = (periodEnd = inDays(30)) => ({ id: `evt_inv_${++seq}`, object: 'event', type: 'invoice.paid',
  data: { object: { id: 'in_x', object: 'invoice', subscription: SUB, period_end: periodEnd, lines: { data: [{ period: { end: periodEnd } }] } } } });
const dispute = (type, { id = 'dp_1', status = 'needs_response', pi = 'pi_purchase' } = {}) => ({ id: `evt_dp_${++seq}`, object: 'event', type, livemode: false,
  data: { object: { id, object: 'dispute', status, livemode: false, amount: 1490000, currency: 'usd', reason: 'fraudulent', payment_intent: pi, metadata: {} } } });

const cert = () => db.getCertificationBySubscription(SUB);
const product = () => products.productFor(SLUG);
const sub = async () => state.certificateState(await cert(), product()).subscription;
const evidence = async () => db.getCertificateEvidence((await cert()).certificateId);
const entitled = () => { const e = kvf.store.get(`entitlement:${EMAIL}`); return !!e && (JSON.parse(e).slugs || []).includes(SLUG); };
async function purchased() {
  assert.equal((await deliver(checkout())).status, 200);
  await deliver(invoicePaid());
  assert.equal(await sub(), 'active', 'precondition: active subscription');
}
const REGISTER = { people: [{ id: 'p-fc', role: 'FC' }, { id: 'p-ir', role: 'IR' }] };
const DECIDERS = [{ role: 'FC', id: 'p-fc' }, { role: 'IR', id: 'p-ir' }];

test('X1. an open dispute on the purchase charge suspends the claim and the subscription benefit, not the decision', async () => {
  await purchased();
  const r = await deliver(dispute('charge.dispute.created'));
  assert.equal(r.status, 200);
  assert.equal(r.body.certification, 'on-hold');
  const c = await cert();
  assert.equal(await sub(), 'disputed');
  assert.equal(state.certificateState(c, product()).active, false);
  assert.match(state.certificateState(c, product()).label, /Payment dispute open/);
  assert.deepEqual(access.certificationCoverage(c), { kind: 'none' }, 'no later certified releases while disputed');
  assert.equal(state.decisionState(c), 'valid', 'the technical decision is not touched');
  assert.equal(c.decision ?? null, null);
  assert.equal((await evidence()).filter((e) => e.event === 'payment-hold').length, 1);
});

test('X2. a dispute won restores the claim and the licence; evidence records both steps', async () => {
  await purchased();
  await deliver(dispute('charge.dispute.created'));
  const won = await deliver(dispute('charge.dispute.closed', { status: 'won' }));
  assert.equal(won.status, 200);
  assert.equal(won.body.certification, 'released');
  assert.equal(await sub(), 'active');
  assert.equal(won.body.access, 'restored');
  assert.deepEqual((await evidence()).filter((e) => /^payment-hold/.test(e.event)).map((e) => e.event), ['payment-hold', 'payment-hold-released']);
});

test('X3. an inquiry that closes without a chargeback (warning_closed) gives the licence and the claim back', async () => {
  await purchased();
  await deliver(dispute('charge.dispute.created', { status: 'warning_needs_response' }));
  assert.equal(entitled(), false, 'precondition: an open inquiry revokes the licence (existing rule)');
  const closed = await deliver(dispute('charge.dispute.closed', { status: 'warning_closed' }));
  assert.equal(closed.body.access, 'restored', 'DEFECT: a closed inquiry left the licence revoked for good');
  assert.equal(entitled(), true);
  assert.equal(await sub(), 'active');
});

test('X4. a dispute lost ends the certification, stops billing, and a later renewal cannot revive it', async () => {
  await purchased();
  await deliver(dispute('charge.dispute.created'));
  const lost = await deliver(dispute('charge.dispute.closed', { status: 'lost' }));
  assert.equal(lost.status, 200);
  assert.equal(lost.body.certification, 'lapsed');
  assert.deepEqual(cancelled, [SUB], 'the subscription is cancelled so the buyer is not billed for a certificate that cannot be active');
  await deliver(invoicePaid(inDays(60)));
  const c = await cert();
  assert.equal(c.status, 'lapsed');
  assert.equal(c.lapseReason, 'dispute_lost');
  assert.deepEqual(access.certificationCoverage(c), { kind: 'none' }, 'money that went back covers no release');
  assert.equal(entitled(), false, 'the licence stays revoked after a lost dispute (existing rule)');
});

test('X5. a dispute on a RENEWAL charge (no Checkout Session) still suspends the certificate', async () => {
  await purchased();
  const r = await deliver(dispute('charge.dispute.created', { id: 'dp_renew', pi: 'pi_renew' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.commission, 'no-session-reference', 'the purchase ledger is untouched by a renewal dispute');
  assert.equal(r.body.certification, 'on-hold', 'DEFECT: a renewal dispute left the certificate active');
  assert.equal(await sub(), 'disputed');
  assert.equal(entitled(), true, 'a renewal dispute does not touch the perpetual licence');
  await deliver(dispute('charge.dispute.closed', { id: 'dp_renew', pi: 'pi_renew', status: 'won' }));
  assert.equal(await sub(), 'active');
});

test('X6. a dispute that arrives BEFORE the delayed checkout event: the certificate is issued on hold', async () => {
  await deliver(dispute('charge.dispute.created', { id: 'dp_early', pi: 'pi_renew' }));
  await deliver(checkout());
  await deliver(invoicePaid());
  assert.equal(await sub(), 'disputed');
  await deliver(dispute('charge.dispute.closed', { id: 'dp_early', pi: 'pi_renew', status: 'won' }));
  assert.equal(await sub(), 'active');
});

test('X7. duplicate and concurrent dispute events record one hold', async () => {
  await purchased();
  const evt = dispute('charge.dispute.created');
  await Promise.all([deliver(evt), deliver(evt), deliver(dispute('charge.dispute.created')), deliver(dispute('charge.dispute.created'))]);
  assert.equal(await sub(), 'disputed');
  assert.equal((await evidence()).filter((e) => e.event === 'payment-hold').length, 1);
});

test('X8. two open disputes: winning one keeps the hold until the other is resolved', async () => {
  await purchased();
  await deliver(dispute('charge.dispute.created', { id: 'dp_a', pi: 'pi_renew' }));
  await deliver(dispute('charge.dispute.created', { id: 'dp_b', pi: 'pi_renew2' }));
  await deliver(dispute('charge.dispute.closed', { id: 'dp_b', pi: 'pi_renew2', status: 'won' }));
  assert.equal(await sub(), 'disputed', 'dp_a is still open');
  await deliver(dispute('charge.dispute.closed', { id: 'dp_a', pi: 'pi_renew', status: 'won' }));
  assert.equal(await sub(), 'active');
});

test('X9. payment status and technical decision stay independent in both directions', async () => {
  await purchased();
  const { certificateId } = await cert();
  // a technical suspension is not lifted by winning a dispute
  assert.equal((await db.setCertificateDecision(certificateId, { state: 'suspended', reason: 'critical-regression-failed', reference: 'CAI-REG-9', deciders: DECIDERS }, { register: REGISTER })).ok, true);
  await deliver(dispute('charge.dispute.created', { pi: 'pi_renew' }));
  await deliver(dispute('charge.dispute.closed', { pi: 'pi_renew', status: 'won' }));
  assert.equal(state.decisionState(await cert()), 'suspended', 'a payment event never lifts a decision');
  // a reinstatement does not clear an open dispute
  await deliver(dispute('charge.dispute.created', { id: 'dp_2', pi: 'pi_renew' }));
  assert.equal((await db.setCertificateDecision(certificateId, { state: 'valid', reference: 'CAI-REG-9-closed', deciders: DECIDERS }, { register: REGISTER })).ok, true);
  const c = await cert();
  assert.equal(state.decisionState(c), 'valid');
  assert.equal(state.subscriptionState(c), 'disputed', 'a decision never clears a payment hold');
  assert.equal(state.certificateState(c, product()).active, false);
});

test('X10. a failed Stripe lookup fails the event so Stripe redelivers it', async () => {
  await purchased();
  const saved = process.env.STRIPE_API_HOST;
  process.env.STRIPE_API_HOST = 'http://127.0.0.1:1'; // nothing listens here
  try {
    const r = await deliver(dispute('charge.dispute.created', { pi: 'pi_renew' }));
    assert.equal(r.status, 500);
  } finally { process.env.STRIPE_API_HOST = saved; }
  const again = await deliver(dispute('charge.dispute.created', { pi: 'pi_renew' }));
  assert.equal(again.body.certification, 'on-hold');
});
