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
