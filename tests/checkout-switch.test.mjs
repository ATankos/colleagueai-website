import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutEnabled } from '../lib/checkoutSwitch.js';

test('live key: only CHECKOUT_ENABLED=true opens checkout (fail closed)', () => {
  for (const flag of [undefined, '', 'false', 'TRUE', 'True', 'yes', '1', 'on', ' true', 'true ', 'ture'])
    assert.equal(checkoutEnabled({ STRIPE_SECRET_KEY: 'sk_live_x', CHECKOUT_ENABLED: flag }), false, `flag ${JSON.stringify(flag)}`);
  assert.equal(checkoutEnabled({ STRIPE_SECRET_KEY: 'sk_live_x', CHECKOUT_ENABLED: 'true' }), true);
  assert.equal(checkoutEnabled({ STRIPE_SECRET_KEY: 'rk_live_x', CHECKOUT_ENABLED: undefined }), false);
});

test('Production deployment needs CHECKOUT_ENABLED=true even with a test key', () => {
  assert.equal(checkoutEnabled({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_x' }), false);
  assert.equal(checkoutEnabled({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_x', CHECKOUT_ENABLED: 'true' }), true);
  assert.equal(checkoutEnabled({ VERCEL_ENV: 'production', CHECKOUT_ENABLED: 'false' }), false);
});

test('test key outside Production: on unless false', () => {
  assert.equal(checkoutEnabled({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: 'sk_test_x' }), true);
  assert.equal(checkoutEnabled({ STRIPE_SECRET_KEY: 'sk_test_x' }), true);
  assert.equal(checkoutEnabled({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: 'sk_test_x', CHECKOUT_ENABLED: 'false' }), false);
});

// Logging: an intentionally closed checkout without a Stripe key is informational; a missing key while
// checkout is enabled is an error. The response is the same 503 either way, and no Stripe call is made.
async function callWithoutKey(env) {
  const saved = { ...process.env };
  delete process.env.STRIPE_SECRET_KEY;
  Object.assign(process.env, env);
  for (const k of ['VERCEL_ENV', 'CHECKOUT_ENABLED']) if (!(k in env)) delete process.env[k];
  const logs = { error: [], info: [] };
  const orig = { error: console.error, info: console.info };
  console.error = (...a) => logs.error.push(a.join(' '));
  console.info = (...a) => logs.info.push(a.join(' '));
  const res = { code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  try {
    const { default: handler } = await import('../api/checkout.js');
    await handler({ method: 'GET', query: {}, headers: {} }, res);
  } finally {
    console.error = orig.error; console.info = orig.info;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  return { res, logs };
}

test('no Stripe key, checkout switched off (Production default): 503, logged as info, not error', async () => {
  const { res, logs } = await callWithoutKey({ VERCEL_ENV: 'production' });
  assert.equal(res.code, 503);
  assert.equal(res.body.code, 'checkout_disabled');
  assert.equal(logs.error.length, 0);
  assert.equal(logs.info.length, 1);
});

test('no Stripe key while checkout is enabled: 503 and an error', async () => {
  const { res, logs } = await callWithoutKey({ VERCEL_ENV: 'production', CHECKOUT_ENABLED: 'true' });
  assert.equal(res.code, 503);
  assert.equal(logs.error.length, 1);
  assert.match(logs.error[0], /STRIPE_SECRET_KEY not set while checkout is enabled/);
});

test('no Stripe key outside Production (checkout open by default): error', async () => {
  const { logs } = await callWithoutKey({ VERCEL_ENV: 'preview' });
  assert.equal(logs.error.length, 1);
});
