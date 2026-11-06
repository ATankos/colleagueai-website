/* tests/entitlement.test.mjs — guards grantEntitlement's idempotency claim.
 *
 * api/success.js (self-fulfil on the redirect back from Stripe) and
 * api/webhook.js (checkout.session.completed / async_payment_succeeded) both
 * call grantEntitlement for the SAME session by design — success.js exists
 * precisely so the flow works "even without the webhook", and the webhook
 * exists so it works even if the buyer closes the tab before the redirect.
 * Both firing for one purchase is the normal case, not an edge case.
 *
 * Runs against an in-memory KV stub, so it needs no credentials and no network.
 */
import test from 'node:test';
import assert from 'node:assert';

process.env.KV_REST_API_URL = 'http://kv.test';
process.env.KV_REST_API_TOKEN = 'test-token';

const store = new Map();

global.fetch = async (url) => {
  const [cmd, ...args] = String(url).replace('http://kv.test/', '').split('/').map(decodeURIComponent);
  let result = null;
  if (cmd === 'GET') result = store.has(args[0]) ? store.get(args[0]) : null;
  else if (cmd === 'SET') { store.set(args[0], args.slice(1).join('/')); result = 'OK'; }
  return { ok: true, json: async () => ({ result }) };
};

const db = await import('../lib/db.js');

test('the same Stripe session granted twice (success.js then webhook.js) is not duplicated', async () => {
  await db.grantEntitlement('buyer@example.com', ['contract-intelligence-and-register'], 'cs_test_123');
  const after = await db.grantEntitlement('buyer@example.com', ['contract-intelligence-and-register'], 'cs_test_123');

  assert.deepEqual(after.stripeSessionIds, ['cs_test_123'],
    'DEFECT: calling grantEntitlement twice for one session duplicates it in the audit trail');
  assert.deepEqual(after.slugs, ['contract-intelligence-and-register']);
});

test('a second, different purchase adds its own session id and slug without dropping the first', async () => {
  await db.grantEntitlement('buyer2@example.com', ['agent-a'], 'cs_a');
  const after = await db.grantEntitlement('buyer2@example.com', ['agent-b'], 'cs_b');

  assert.deepEqual(after.slugs, ['agent-a', 'agent-b']);
  assert.deepEqual(after.stripeSessionIds, ['cs_a', 'cs_b']);
});

test('grantedAt is stable across repeat grants; updatedAt and isEntitled reflect the latest state', async () => {
  const first = await db.grantEntitlement('buyer3@example.com', ['agent-c'], 'cs_c1');
  const second = await db.grantEntitlement('buyer3@example.com', ['agent-c'], 'cs_c2');

  assert.equal(second.grantedAt, first.grantedAt);
  assert.ok(second.updatedAt >= first.updatedAt);
  assert.equal(await db.isEntitled('buyer3@example.com', 'agent-c'), true);
  assert.equal(await db.isEntitled('buyer3@example.com', 'agent-not-purchased'), false);
});

test('a refunded purchase stays revoked: reopening the thank-you link or a replayed webhook cannot re-grant it', async () => {
  await db.grantEntitlement('refund1@example.com', ['contract-intelligence-and-register'], 'cs_paid_then_refunded');
  await db.revokeEntitlement('refund1@example.com', ['contract-intelligence-and-register'], 'cs_paid_then_refunded');
  assert.equal(await db.isEntitled('refund1@example.com', 'contract-intelligence-and-register'), false);

  const again = await db.grantEntitlement('refund1@example.com', ['contract-intelligence-and-register'], 'cs_paid_then_refunded');
  assert.equal(again.refused, 'session-revoked', 'DEFECT: Stripe keeps payment_status "paid" after a refund, so the success page re-granted access');
  assert.equal(await db.isEntitled('refund1@example.com', 'contract-intelligence-and-register'), false);
  assert.equal(await db.isSessionRevoked('refund1@example.com', 'cs_paid_then_refunded'), true);
});

test('bought twice, one refunded: the buyer keeps access paid by the other purchase; refund both and it goes', async () => {
  const slug = 'contract-intelligence-and-register';
  await db.grantEntitlement('twice@example.com', [slug], 'cs_first');
  await db.grantEntitlement('twice@example.com', [slug], 'cs_second');

  await db.revokeEntitlement('twice@example.com', [slug], 'cs_first');
  assert.equal(await db.isEntitled('twice@example.com', slug), true, 'DEFECT: refunding one of two purchases removed access the other still pays for');

  await db.revokeEntitlement('twice@example.com', [slug], 'cs_second');
  assert.equal(await db.isEntitled('twice@example.com', slug), false);
});

test('a refund only removes the agents that purchase paid for', async () => {
  await db.grantEntitlement('multi@example.com', ['agent-a'], 'cs_a');
  await db.grantEntitlement('multi@example.com', ['agent-b'], 'cs_b');
  await db.revokeEntitlement('multi@example.com', ['agent-a'], 'cs_a');
  assert.equal(await db.isEntitled('multi@example.com', 'agent-a'), false);
  assert.equal(await db.isEntitled('multi@example.com', 'agent-b'), true);
});

test('records written before per-purchase tracking still lose the agent on refund (old behaviour kept)', async () => {
  store.set('entitlement:legacy@example.com', JSON.stringify({ email: 'legacy@example.com', slugs: ['agent-l'], stripeSessionIds: ['cs_old1', 'cs_old2'] }));
  await db.revokeEntitlement('legacy@example.com', ['agent-l'], 'cs_old1');
  assert.equal(await db.isEntitled('legacy@example.com', 'agent-l'), false);
});
