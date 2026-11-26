// Release safety as committed: with a LIVE key no sale can start while the kill switch, the product's sale approval
// or the tax policy says no, and no sandbox override reaches live mode. Each layer is checked on its own, with the
// others open, so removing any one of them fails here. Nothing calls Stripe: every refusal happens before.
import { approveCommercially } from './helpers/commercial-approval.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.KV_REST_API_URL = 'http://kv.test';
process.env.KV_REST_API_TOKEN = 'test-token';
const stripeCalls = [];
global.fetch = async (url) => {
  if (String(url).includes('stripe')) stripeCalls.push(String(url));
  return { ok: true, json: async () => ({ result: null }) };
};

const products = await import('../lib/products.js');
const { policyFor, liveTaxBlocked, TAX_POLICY } = await import('../lib/taxPolicy.js');
const checkout = (await import('../api/checkout.js')).default;
const SLUG = 'contract-intelligence-and-register';
const LIVE = 'sk_live_release_safety_not_real';

function res() {
  const r = { statusCode: 200, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = r.end = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.redirect = (c, u) => { r.statusCode = c; r.headers.location = u; return r; };
  return r;
}
async function run(env, { approved } = {}) {
  const keys = ['STRIPE_SECRET_KEY', 'CHECKOUT_ENABLED', 'VERCEL_ENV', 'TAX_POLICY_SANDBOX', 'TAX_SANDBOX_INVOICE_ROUTE', 'LAUNCH_SCOPE_TEST_BYPASS'];
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  const rec = products.productFor(SLUG); const was = rec.saleApproved;
  if (approved !== undefined) rec.saleApproved = approved;
  const restore = approved ? approveCommercially(SLUG) : () => {};
  try { const r = res(); await checkout({ method: 'GET', query: { agent: SLUG }, headers: { host: 'x' } }, r); return r; }
  finally { restore(); rec.saleApproved = was; for (const k of keys) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
}

test('as committed: the product is not approved for sale and the tax policy is not approved', () => {
  assert.equal(products.productFor(SLUG).saleApproved, false);
  assert.notEqual(TAX_POLICY.status, 'approved');
  assert.equal(liveTaxBlocked(LIVE), true);
});

test('CHECKOUT_ENABLED=false closes live checkout even with the sale approved', async () => {
  for (const flag of ['false', undefined, '', 'TRUE', '1']) {
    const r = await run({ STRIPE_SECRET_KEY: LIVE, CHECKOUT_ENABLED: flag, VERCEL_ENV: 'production' }, { approved: true });
    assert.equal(r.statusCode, 503, `flag ${JSON.stringify(flag)}`);
    assert.equal(r.body.code, 'checkout_disabled');
  }
});

test('saleApproved=false refuses a live sale with the switch open', async () => {
  const r = await run({ STRIPE_SECRET_KEY: LIVE, CHECKOUT_ENABLED: 'true', VERCEL_ENV: 'production' }, { approved: false });
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.code, 'not_approved_for_sale');
});

test('the unapproved tax policy refuses a live sale with the switch open and the sale approved', async () => {
  const r = await run({ STRIPE_SECRET_KEY: LIVE, CHECKOUT_ENABLED: 'true', VERCEL_ENV: 'production' }, { approved: true });
  assert.ok(r.statusCode >= 400, `status ${r.statusCode}`);
  assert.notEqual(r.statusCode, 503, 'must be the tax gate, not the kill switch');
  assert.match(JSON.stringify(r.body), /tax/i);
});

test('sandbox overrides never reach a live key', async () => {
  const env = { TAX_POLICY_SANDBOX: '1', TAX_SANDBOX_INVOICE_ROUTE: 'company_ledger' };
  assert.equal(policyFor(LIVE, { env }), TAX_POLICY, 'a live key always gets the committed policy');
  assert.equal(liveTaxBlocked(LIVE), true);
  const r = await run({ STRIPE_SECRET_KEY: LIVE, CHECKOUT_ENABLED: 'true', VERCEL_ENV: 'production', ...env, LAUNCH_SCOPE_TEST_BYPASS: '1' }, { approved: true });
  assert.ok(r.statusCode >= 400, `status ${r.statusCode}`);
});

test('no refusal above reached Stripe', () => assert.deepEqual(stripeCalls, []));
