/* commission-ledger.test.mjs — guards the partner commission money path.
 *
 * Runs against an in-memory KV stub, so it needs no credentials and no network.
 * These are the invariants that must not regress before automated payouts are
 * switched on:
 *   - a partner record existing is not accreditation; status must be "approved"
 *   - the rate and agreement version are locked onto each sale
 *   - webhook replays cannot pay twice
 *   - refunds and disputes reverse exactly once
 */
import test from 'node:test';
import assert from 'node:assert';

process.env.KV_REST_API_URL = 'http://kv.test';
process.env.KV_REST_API_TOKEN = 'test-token';

const store = new Map();
const sets = new Map();

global.fetch = async (url) => {
  const [cmd, ...args] = String(url).replace('http://kv.test/', '').split('/').map(decodeURIComponent);
  let result = null;
  if (cmd === 'GET') result = store.has(args[0]) ? store.get(args[0]) : null;
  else if (cmd === 'SET') { store.set(args[0], args.slice(1).join('/')); result = 'OK'; }
  else if (cmd === 'SADD') { if (!sets.has(args[0])) sets.set(args[0], new Set()); sets.get(args[0]).add(args[1]); result = 1; }
  else if (cmd === 'SMEMBERS') result = [...(sets.get(args[0]) || [])];
  return { ok: true, json: async () => ({ result }) };
};

const db = await import('../lib/db.js');
const partner = (code, rec) => store.set(`partner:reg:${code}`, JSON.stringify({ code, ...rec }));
const readPartner = (code) => JSON.parse(store.get(`partner:reg:${code}`));

test('a registered but unapproved partner earns nothing', async () => {
  partner('P1', { status: 'pending', commissionRate: 0.1 });
  const r = await db.recordCommission({ code: 'P1', amountGross: 100000, commissionRate: 0.2, stripeSessionId: 'unapproved-1' });
  assert.equal(r.withheld, 'partner-not-approved');
  assert.equal(store.has('commission:unapproved-1'), false, 'no ledger entry may be written');
});

test('the agreed rate and agreement version are locked onto the sale', async () => {
  partner('P2', { status: 'approved', commissionRate: 0.1, agreementVersion: 'v2.1' });
  const e = await db.recordCommission({ code: 'P2', amountGross: 100000, commissionRate: 0.2, stripeSessionId: 'sale-1' });
  assert.equal(e.state, 'pending');
  assert.equal(e.commissionRate, 0.1, 'the partner rate must win over the global default');
  assert.equal(e.commission, 100);
  assert.equal(e.agreementVersion, 'v2.1');
});

test('replaying a webhook cannot pay the same sale twice', async () => {
  await db.recordCommission({ code: 'P2', amountGross: 100000, commissionRate: 0.2, stripeSessionId: 'sale-1' });
  assert.equal(readPartner('P2').salesCount, 1);
});

test('a refund reverses the commission and reduces the pending balance', async () => {
  const before = readPartner('P2').pendingAmount;
  const r = await db.reverseCommission('sale-1', 'charge.refunded');
  assert.equal(r.state, 'reversed');
  assert.equal(before - readPartner('P2').pendingAmount, 100);
});

test('a second reversal does not subtract twice', async () => {
  const before = readPartner('P2').pendingAmount;
  await db.reverseCommission('sale-1', 'charge.dispute.created');
  assert.equal(readPartner('P2').pendingAmount, before);
});

test('reversing an unknown sale is a safe no-op', async () => {
  const r = await db.reverseCommission('never-happened');
  assert.equal(r.reversed, false);
});

test('the ledger is readable per partner', async () => {
  const rows = await db.listCommissions('P2');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'reversed');
});
