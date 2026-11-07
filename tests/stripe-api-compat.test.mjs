/**
 * tests/stripe-api-compat.test.mjs - the pinned Stripe API version, and the readers that accept both the
 * legacy and the basil+ payload shapes. Pure functions: no network, no KV.
 * Usage: node --test tests/stripe-api-compat.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { STRIPE_API_VERSION } from '../lib/stripe.js';
import { subscriptionPeriodEnd, invoiceSubscriptionId, invoiceSubscriptionPeriodEnd } from '../lib/stripeCompat.js';

test('the pinned API version is the one the installed stripe SDK is built against', () => {
  const src = readFileSync(new URL('../node_modules/stripe/cjs/apiVersion.js', import.meta.url), 'utf8');
  const sdkDefault = /ApiVersion = '([^']+)'/.exec(src)?.[1];
  assert.ok(sdkDefault, 'could not read the SDK default API version');
  assert.equal(STRIPE_API_VERSION, sdkDefault,
    'lib/stripe.js drifted from the SDK default: read the upgrade notes, then change them together');
});

test('subscriptionPeriodEnd reads the legacy top-level field', () => {
  assert.equal(subscriptionPeriodEnd({ current_period_end: 1800000000 }), 1800000000);
});

test('subscriptionPeriodEnd reads the subscription item field (basil and later)', () => {
  assert.equal(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 1800000100 }] } }), 1800000100);
});

test('subscriptionPeriodEnd prefers the legacy field and takes the earliest item period', () => {
  assert.equal(subscriptionPeriodEnd({ current_period_end: 5, items: { data: [{ current_period_end: 9 }] } }), 5);
  assert.equal(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 9 }, { current_period_end: 7 }] } }), 7);
});

test('subscriptionPeriodEnd is null for a bare id, a missing object or a missing period', () => {
  assert.equal(subscriptionPeriodEnd('sub_123'), null);
  assert.equal(subscriptionPeriodEnd(null), null);
  assert.equal(subscriptionPeriodEnd({ items: { data: [] } }), null);
});

test('invoiceSubscriptionId reads the legacy field, as an id or an expanded object', () => {
  assert.equal(invoiceSubscriptionId({ subscription: 'sub_1' }), 'sub_1');
  assert.equal(invoiceSubscriptionId({ subscription: { id: 'sub_2' } }), 'sub_2');
});

test('invoiceSubscriptionId reads parent.subscription_details (basil and later)', () => {
  const inv = { subscription: null, parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_3' } } };
  assert.equal(invoiceSubscriptionId(inv), 'sub_3');
});

test('invoiceSubscriptionId is null for a one-off invoice or another parent type', () => {
  assert.equal(invoiceSubscriptionId({ subscription: null, parent: { type: 'quote_details', quote_details: { quote: 'qt_1' } } }), null);
  assert.equal(invoiceSubscriptionId({}), null);
  assert.equal(invoiceSubscriptionId(null), null);
});

test('invoiceSubscriptionPeriodEnd picks the subscription line, not the first line', () => {
  const inv = {
    lines: { data: [
      { parent: { type: 'invoice_item_details' }, period: { end: 100 } },
      { parent: { type: 'subscription_item_details', subscription_item_details: {} }, period: { end: 200 } },
    ] },
    period_end: 300,
  };
  assert.equal(invoiceSubscriptionPeriodEnd(inv), 200);
});

test('invoiceSubscriptionPeriodEnd reads the legacy subscription line and falls back to the invoice period', () => {
  assert.equal(invoiceSubscriptionPeriodEnd({ lines: { data: [{ type: 'subscription', period: { end: 42 } }] } }), 42);
  assert.equal(invoiceSubscriptionPeriodEnd({ lines: { data: [] }, period_end: 77 }), 77);
  assert.equal(invoiceSubscriptionPeriodEnd({}), null);
});
