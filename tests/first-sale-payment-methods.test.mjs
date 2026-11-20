// First-sale configuration: CAI_PAYMENT_METHODS caps the payment methods a checkout session may offer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedMethods, methodTypes } from '../api/checkout.js';

test('unset: today\'s behaviour (bank + card, buyer button decides)', () => {
  assert.equal(allowedMethods({}), null);
  assert.deepEqual(methodTypes('', null), ['customer_balance', 'card', 'link']);
  assert.deepEqual(methodTypes('bank', null), ['customer_balance']);
  assert.deepEqual(methodTypes('card', null), ['card', 'link']);
});

test('CAI_PAYMENT_METHODS=card: bank transfer is never offered, even when the button asks for it', () => {
  const a = allowedMethods({ CAI_PAYMENT_METHODS: 'card' });
  assert.deepEqual(a, { bank: false, card: true });
  assert.deepEqual(methodTypes('', a), ['card', 'link']);
  assert.deepEqual(methodTypes('bank', a), ['card', 'link']);
  assert.deepEqual(methodTypes('card', a), ['card', 'link']);
});

test('CAI_PAYMENT_METHODS=card,bank restores both; a list without card still keeps card', () => {
  assert.deepEqual(methodTypes('', allowedMethods({ CAI_PAYMENT_METHODS: 'card, bank' })), ['customer_balance', 'card', 'link']);
  assert.deepEqual(methodTypes('card', allowedMethods({ CAI_PAYMENT_METHODS: 'bank' })), ['card', 'link']);
});
