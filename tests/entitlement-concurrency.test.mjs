/**
 * tests/entitlement-concurrency.test.mjs - a buyer's entitlement is changed by compare-and-set, never by a blind
 * write, so a stale reader cannot give a refunded or charged-back purchase its access back.
 *
 * The record for one buyer is a single JSON string (entitlement:<email>). grantEntitlement, revokeEntitlement and
 * restoreEntitlement used to read it, change a copy and write the copy back with SET. Two handlers that overlapped
 * each wrote from the state they had read, and the later write won. The sequence that matters: the thank-you page
 * reads an active record, the refund webhook revokes it, the page writes its older copy back, the buyer has the
 * agent again (and the revocation, with the session id that blocks a replay, is gone).
 *
 * These tests force that overlap without any timing. The fake Upstash below can PARK a request on arrival, which is
 * the moment its caller has finished reading and is about to write. The test then runs the competing operation to
 * completion and only afterwards lets the parked request through. Every ordering is the same on every run.
 *
 * Fully local: a fake Upstash REST server (GET-style paths and POST JSON commands, EVAL compare-and-set), a fake
 * Stripe API, and the real api/webhook.js and api/success.js handlers. No network, no secret, and no Stripe object
 * is created or refunded.
 * Usage: node --test tests/entitlement-concurrency.test.mjs
 */
import { test as nodeTest, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import Stripe from 'stripe';
import { casReply } from './kv-cas-fake.mjs';

// dummy local-only values (never real credentials)
const SIGNING_SECRET = 'whsec_LOCAL_TEST_HARNESS_DUMMY';
process.env.STRIPE_WEBHOOK_SECRET = SIGNING_SECRET;
process.env.STRIPE_SECRET_KEY = 'sk_test_LOCAL_DUMMY_NOT_REAL';
process.env.DOWNLOAD_TOKEN_SECRET = 'local-test-only-download-secret-not-real-0123456789';

const EMAIL = 'buyer@example.test';
const KEY = `entitlement:${EMAIL}`;
const SLUG = 'contract-intelligence-and-register';
const RETIRED_SLUG = 'contract-summarisation-agent'; // alias of SLUG in config/products.json
const OTHER = 'onboarding-agent';

// A test that waits for a parked request that never arrives must fail, not hang.
const test = (name, fn) => nodeTest(name, { timeout: 20_000 }, fn);

// ── fake Upstash REST ────────────────────────────────────────────────────────────────────────────────────
const store = new Map();   // key -> string
let seen = [];             // every request, in arrival order: { cmd, key }
let landed = [];           // requests that changed the store: { cmd, key }
let barrier = null;
const faults = { down: false, failWrites: false, noEval: false, rival: null };

const isEntitlementWrite = (c) => c.key === KEY && (c.cmd === 'SET' || c.cmd === 'EVAL');

/* lib/db.js changes a record with an EVAL compare-and-set posted as a JSON command. tests/kv-cas-fake.mjs runs its
   contract natively (atomic here for the same reason it is in Redis: nothing else runs between the compare and the set).
   The Lua itself is exercised against a real redis-server in the pull request notes; what this file controls is the
   ORDER of operations. */

function execute({ cmd, args }) {
  switch (cmd) {
    case 'GET': return store.get(args[0]) ?? null;
    case 'SET': {
      const [key, value, ...flags] = args;
      if (flags.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      landed.push({ cmd, key });
      return 'OK';
    }
    case 'DEL': return store.delete(args[0]) ? 1 : 0;
    case 'EVAL': return faults.noEval ? null : casReply(store, ['EVAL', ...args], (key) => landed.push({ cmd: 'EVAL', key }));
    default: throw new Error(`fake Upstash: unsupported command ${cmd}`);
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const redisServer = http.createServer(async (req, res) => {
  try {
    const raw = await readBody(req);
    const command = req.method === 'POST'
      ? (([cmd, ...args]) => ({ cmd: String(cmd).toUpperCase(), args: args.map(String) }))(JSON.parse(raw))
      : (([, cmd, ...args]) => ({ cmd: cmd.toUpperCase(), args }))(req.url.split('/').map(decodeURIComponent));
    const key = command.cmd === 'EVAL' ? command.args[2] : command.args[0];
    seen.push({ cmd: command.cmd, key });
    if (faults.down) { res.writeHead(500); return res.end('Redis is down'); }
    const write = isEntitlementWrite({ cmd: command.cmd, key });
    if (write && barrier) await barrier.hold();            // parked: the caller has read, and has not yet written
    if (write && faults.failWrites) { res.writeHead(500); return res.end('the write failed'); }
    if (write && faults.rival) faults.rival();             // somebody else writes in the instant before this request is applied
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ result: execute(command) }));
  } catch (err) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'invalid command' }));
  }
});

/** Park the first `count` writes to the entitlement key when they arrive; they stay parked until release(). */
function park({ count = 1 } = {}) {
  let arrive; let open;
  const arrived = new Promise((r) => { arrive = r; });
  const opened = new Promise((r) => { open = r; });
  let held = 0;
  barrier = {
    async hold() {
      if (held >= count) return; // later writes (a retry, say) go straight through
      held += 1;
      if (held === count) arrive();
      await opened;
    },
  };
  return { arrived, release: () => open() };
}

/**
 * Start `stale`, wait until it is parked at its write (so it has read the state it will write back), run `between`
 * to completion, then let `stale` write. `overlapped` is false when `stale` never needed to write at all.
 */
async function interleave(stale, between, { count = 1 } = {}) {
  const gate = park({ count });
  const staleRun = Promise.resolve().then(stale).then((value) => ({ value }), (error) => ({ error }));
  const first = await Promise.race([gate.arrived.then(() => 'parked'), staleRun.then(() => 'finished')]);
  if (first === 'finished') barrier = null; // it never wrote (nothing to add): do not let the barrier catch the other side
  const mid = await between();
  gate.release();
  return { overlapped: first === 'parked', stale: await staleRun, between: mid };
}

// ── fake Stripe API (only what the success page asks for) ────────────────────────────────────────────────
const sessions = new Map();
const stripeServer = http.createServer((req, res) => {
  const m = /^\/v1\/checkout\/sessions\/([^/?]+)/.exec(req.url);
  const s = m && sessions.get(decodeURIComponent(m[1]));
  res.setHeader('content-type', 'application/json');
  if (!s) { res.writeHead(404); return res.end('{"error":{"message":"No such checkout.session"}}'); }
  return res.end(JSON.stringify(s));
});

// ── the real handlers behind local servers ───────────────────────────────────────────────────────────────
let db; let webhookBase; let successBase; let webhookServer; let successServer; let restoreConsole;
before(async () => {
  await Promise.all([redisServer, stripeServer].map((s) => new Promise((r) => s.listen(0, '127.0.0.1', r))));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${redisServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  process.env.STRIPE_API_HOST = `http://127.0.0.1:${stripeServer.address().port}`;
  db = await import('../lib/db.js');
  const { default: webhook } = await import('../api/webhook.js');
  const { default: success } = await import('../api/success.js');
  webhookServer = http.createServer((req, res) => {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    webhook(req, res);
  });
  successServer = http.createServer((req, res) => {
    req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.send = (body) => { res.end(body); return res; };
    success(req, res);
  });
  await Promise.all([webhookServer, successServer].map((s) => new Promise((r) => s.listen(0, '127.0.0.1', r))));
  webhookBase = `http://127.0.0.1:${webhookServer.address().port}`;
  successBase = `http://127.0.0.1:${successServer.address().port}`;
  // The handlers narrate every event; keep the report readable. Errors stay visible.
  const quietLevels = ['log', 'info', 'warn'].map((l) => mock.method(console, l, () => {}));
  restoreConsole = () => quietLevels.forEach((m) => m.mock.restore());
});
after(async () => {
  restoreConsole?.();
  for (const s of [redisServer, stripeServer, webhookServer, successServer]) {
    s.closeAllConnections?.();
    await new Promise((r) => s.close(r));
  }
});
beforeEach(() => {
  store.clear(); sessions.clear(); seen = []; landed = []; barrier = null;
  Object.assign(faults, { down: false, failWrites: false, noEval: false, rival: null });
});

/** Run fn with console.error muted (the handlers log the failures these tests cause on purpose). */
async function quiet(fn) {
  const patched = mock.method(console, 'error', () => {});
  try { return await fn(); } finally { patched.mock.restore(); }
}

// ── event and page helpers ───────────────────────────────────────────────────────────────────────────────
const signer = new Stripe('sk_test_LOCAL_DUMMY_NOT_REAL');
let seq = 0;
async function deliver(event) {
  const payload = JSON.stringify(event);
  const r = await fetch(`${webhookBase}/api/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signer.webhooks.generateTestHeaderString({ payload, secret: SIGNING_SECRET }),
    },
    body: payload,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function successPage(sessionId) {
  const r = await fetch(`${successBase}/api/success?session_id=${encodeURIComponent(sessionId)}`);
  return { status: r.status, html: await r.text() };
}
const paidSession = (id, { slug = SLUG } = {}) => ({
  id, object: 'checkout.session', livemode: false, payment_status: 'paid', status: 'complete', amount_total: 120000,
  currency: 'usd', customer_details: { email: EMAIL }, metadata: { agent_slug: slug },
});
const checkoutCompleted = (id, o) => ({
  id: `evt_checkout_${id}_${++seq}`, object: 'event', type: 'checkout.session.completed', livemode: false,
  data: { object: paidSession(id, o) },
});
const refundEvent = (id, { slug = SLUG } = {}) => ({
  id: `evt_refund_${id}_${++seq}`, object: 'event', type: 'charge.refunded', livemode: false,
  data: { object: { id: `ch_${id}`, object: 'charge', payment_intent: `pi_${id}`, refunded: true, amount: 120000,
    amount_refunded: 120000, billing_details: { email: EMAIL }, metadata: { checkout_session_id: id, agent_slug: slug } } },
});
const disputeEvent = (type, id, { status = 'needs_response', slug = SLUG } = {}) => ({
  id: `evt_${type}_${id}_${++seq}`, object: 'event', type, livemode: false,
  data: { object: { id: `dp_${id}`, object: 'dispute', status, livemode: false, amount: 120000, currency: 'usd',
    payment_intent: `pi_${id}`, metadata: { checkout_session_id: id, agent_slug: slug, email: EMAIL } } },
});

// ── small readers ────────────────────────────────────────────────────────────────────────────────────────
const record = () => JSON.parse(store.get(KEY) ?? 'null');
const entitled = (slug = SLUG) => db.isEntitled(EMAIL, slug);
const has = (field, sid) => (record()?.[field] ?? []).includes(sid);
const settled = (r, what) => assert.equal(r.stale.error, undefined, `${what} failed: ${r.stale.error?.message}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 1 and 2. A grant that overlaps a refund (1) or a dispute (2)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
for (const [n, label, opts] of [[1, 'refund', { refunded: true }], [2, 'dispute', { refunded: false }]]) {
  test(`${n}a. ${label}: a first grant that read "nothing stored" cannot swallow it`, async () => {
    const r = await interleave(
      () => db.grantEntitlement(EMAIL, [SLUG], 'cs_1'),                 // the thank-you page: reads no record
      () => db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', opts));         // the charge is taken back in between
    settled(r, 'grant');
    assert.equal(await entitled(), false, `DEFECT: the purchase was ${label === 'refund' ? 'refunded' : 'charged back'} and the buyer still has the agent`);
    assert.ok(has('revokedSessionIds', 'cs_1'), `DEFECT: the ${label} left no trace, so a replay of the checkout event would grant it`);
    assert.equal(has('refundedSessionIds', 'cs_1'), opts.refunded);
  });

  test(`${n}b. ${label}: a thank-you page reload that read the active record cannot write it back over it`, async () => {
    await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');                   // the webhook granted it earlier
    const r = await interleave(
      () => db.grantEntitlement(EMAIL, [SLUG], 'cs_1'),                 // reload: reads the active record
      () => db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', opts));
    settled(r, 'reload');
    assert.equal(await entitled(), false, `DEFECT: the reload wrote its earlier state back and the ${label} was undone`);
    assert.ok(has('revokedSessionIds', 'cs_1'));
    assert.equal(has('refundedSessionIds', 'cs_1'), opts.refunded);
    const replay = await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
    assert.equal(replay.refused, 'session-revoked');
  });
}

test('2c. a won dispute (restore) overlapping a refund of the same purchase cannot undo the refund', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: false });          // dispute.created
  const r = await interleave(
    () => db.restoreEntitlement(EMAIL, [SLUG], 'cs_1'),                            // dispute.closed (won): reads "revoked, not refunded"
    () => db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }));        // the money goes back to the buyer meanwhile
  settled(r, 'restore');
  assert.equal(await entitled(), false, 'DEFECT: a refunded purchase came back through a stale dispute restore');
  assert.ok(has('refundedSessionIds', 'cs_1'), 'DEFECT: the restore erased the refund from the history');
  assert.ok(has('revokedSessionIds', 'cs_1'));
  assert.equal((await db.grantEntitlement(EMAIL, [SLUG], 'cs_1')).refused, 'session-revoked');
});

test('2d. a refund (revoke) overlapping a won dispute (restore) ends revoked, whichever wrote last', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: false });
  const r = await interleave(
    () => db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }),        // reads "revoked by dispute"
    () => db.restoreEntitlement(EMAIL, [SLUG], 'cs_1'));                           // the dispute is won and restored first
  settled(r, 'refund');
  assert.equal(await entitled(), false, 'a refund that lands after a restored dispute must still take the agent back');
  assert.ok(has('refundedSessionIds', 'cs_1'));
  assert.ok(has('revokedSessionIds', 'cs_1'));
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. Replaying a checkout event after a refund
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
test('3a. replaying the checkout event after a refund does not bring the purchase back', async () => {
  const placed = checkoutCompleted('cs_1');
  assert.equal((await deliver(placed)).status, 200);
  assert.equal(await entitled(), true, 'precondition: the checkout granted the agent');
  assert.equal((await deliver(refundEvent('cs_1'))).status, 200);
  assert.equal(await entitled(), false, 'precondition: the refund took it back');

  assert.equal((await deliver(placed)).status, 200);                       // the same event again
  assert.equal((await deliver(checkoutCompleted('cs_1'))).status, 200);    // a different event for the same session
  assert.equal(await entitled(), false, 'DEFECT: a replayed checkout event reinstated a refunded purchase');
  assert.equal((await db.grantEntitlement(EMAIL, [SLUG], 'cs_1')).refused, 'session-revoked');
});

test('3b. a checkout event that reaches us AFTER the refund (the sale was never stored) is refused', async () => {
  // The delivery of the checkout event kept failing (Stripe retries for days); the order was refunded meanwhile.
  assert.equal((await deliver(refundEvent('cs_1'))).status, 200);
  assert.equal(await entitled(), false);
  assert.equal((await deliver(checkoutCompleted('cs_1'))).status, 200);
  assert.equal(await entitled(), false, 'DEFECT: a late checkout event granted a purchase that was already refunded');
  assert.ok(has('revokedSessionIds', 'cs_1'));
  assert.ok(has('refundedSessionIds', 'cs_1'));
});

test('3c. the same holds for a charge-back that arrives before the sale is stored, and a won dispute then restores it', async () => {
  assert.equal((await deliver(disputeEvent('charge.dispute.created', 'cs_1'))).status, 200);
  assert.equal((await deliver(checkoutCompleted('cs_1'))).status, 200);
  assert.equal(await entitled(), false, 'a purchase under dispute must not be granted by a late checkout event');
  assert.equal(has('refundedSessionIds', 'cs_1'), false);
  const won = await deliver(disputeEvent('charge.dispute.closed', 'cs_1', { status: 'won' }));
  assert.equal(won.status, 200);
  assert.equal(await entitled(), true, 'a dispute the merchant wins puts the purchase back');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. Reopening the thank-you page after a refund
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
test('4a. reopening the thank-you page after a refund shows the refunded notice and grants nothing', async () => {
  sessions.set('cs_1', paidSession('cs_1'));
  const first = await successPage('cs_1');
  assert.ok(first.html.includes('/api/download'), 'precondition: the paid page offers the download');
  assert.equal((await deliver(refundEvent('cs_1'))).status, 200);
  const again = await successPage('cs_1');
  assert.equal(again.status, 200);
  assert.match(again.html, /Order refunded/);
  assert.ok(!again.html.includes('/api/download'), 'DEFECT: the refunded order still offers the download');
  assert.equal(await entitled(), false);
});

test('4b. the same when the refund was processed before the page was ever opened', async () => {
  sessions.set('cs_1', paidSession('cs_1'));
  assert.equal((await deliver(refundEvent('cs_1'))).status, 200);
  const page = await successPage('cs_1');
  assert.match(page.html, /Order refunded/, 'DEFECT: the thank-you page treated a refunded order as a fresh sale');
  assert.ok(!page.html.includes('/api/download'));
  assert.equal(await entitled(), false);
});

test('4c. a page reload in flight while the refund webhook is delivered cannot restore access (end to end)', async () => {
  sessions.set('cs_1', paidSession('cs_1'));
  assert.equal((await deliver(checkoutCompleted('cs_1'))).status, 200);   // the webhook granted it
  const r = await interleave(
    () => successPage('cs_1'),                                              // the buyer reloads the thank-you page
    () => deliver(refundEvent('cs_1')));                                    // the refund webhook lands meanwhile
  settled(r, 'page');
  assert.equal(r.between.status, 200);
  assert.equal(await entitled(), false, 'DEFECT: the reloaded thank-you page wrote its earlier state back and the refund was undone');
  const after = await successPage('cs_1');
  assert.match(after.html, /Order refunded/);
  assert.ok(!after.html.includes('/api/download'));
});

test('4d. a first visit to the thank-you page overlapping the refund webhook cannot restore access (end to end)', async () => {
  sessions.set('cs_1', paidSession('cs_1'));
  const r = await interleave(
    () => successPage('cs_1'),                                              // first visit: reads no record
    () => deliver(refundEvent('cs_1')));
  settled(r, 'page');
  assert.equal(r.between.status, 200);
  assert.equal(await entitled(), false, 'DEFECT: the first visit granted a purchase that was refunded while it was being fulfilled');
  assert.match((await successPage('cs_1')).html, /Order refunded/);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 5. Two purchases of the same agent, only one refunded
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
test('5a. one of two purchases of the same agent is refunded: access stays, the refunded session cannot return', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_2');
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true });
  assert.equal(await entitled(), true, 'the second, independently paid purchase still entitles the buyer');
  assert.ok(has('refundedSessionIds', 'cs_1'));
  assert.equal(has('refundedSessionIds', 'cs_2'), false);
  assert.equal((await db.grantEntitlement(EMAIL, [SLUG], 'cs_1')).refused, 'session-revoked');
  assert.equal(await entitled(), true);
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_2', { refunded: true });
  assert.equal(await entitled(), false, 'with both refunded nothing is left');
});

test('5b. refunding the first purchase while the second is being granted: the buyer keeps what they paid for', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  const r = await interleave(
    () => db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }),  // the refund read the record without cs_2
    () => db.grantEntitlement(EMAIL, [SLUG], 'cs_2'));                       // the second purchase is stored in between
  settled(r, 'refund');
  assert.equal(await entitled(), true, 'DEFECT: the refund of one purchase erased the other, paid, purchase');
  assert.ok(has('stripeSessionIds', 'cs_2'));
  assert.deepEqual(record().sessionSlugs.cs_2, [SLUG]);
  assert.ok(has('refundedSessionIds', 'cs_1'));
});

test('5c. granting the second purchase while the first is being refunded: the refund is not lost', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  const r = await interleave(
    () => db.grantEntitlement(EMAIL, [SLUG], 'cs_2'),                        // reads the record where cs_1 is still active
    () => db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }));
  settled(r, 'grant');
  assert.equal(await entitled(), true, 'cs_2 is independently paid');
  assert.ok(has('refundedSessionIds', 'cs_1'), 'DEFECT: the grant of another purchase erased the refund of this one');
  assert.ok(has('revokedSessionIds', 'cs_1'));
  assert.equal((await db.grantEntitlement(EMAIL, [SLUG], 'cs_1')).refused, 'session-revoked');
});

test('5d. two different agents bought at the same moment: both are stored', async () => {
  const r = await interleave(
    () => db.grantEntitlement(EMAIL, [SLUG], 'cs_1'),
    () => db.grantEntitlement(EMAIL, [OTHER], 'cs_2'));
  settled(r, 'first grant');
  assert.equal(await entitled(SLUG), true, 'DEFECT: a paid purchase was overwritten by a concurrent one');
  assert.equal(await entitled(OTHER), true, 'DEFECT: a paid purchase was overwritten by a concurrent one');
  assert.deepEqual(Object.keys(record().sessionSlugs).sort(), ['cs_1', 'cs_2']);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 6. Repeated refund events
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
test('6a. the same refund delivered several times leaves one clean history', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  for (let i = 0; i < 3; i += 1) assert.equal((await deliver(refundEvent('cs_1'))).status, 200);
  const r = record();
  assert.deepEqual(r.slugs, []);
  assert.deepEqual(r.revokedSessionIds, ['cs_1']);
  assert.deepEqual(r.refundedSessionIds, ['cs_1']);
  assert.equal(await entitled(), false);
});

test('6b. a refund that changes nothing writes nothing', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true });
  const stored = store.get(KEY);
  const writes = landed.length;
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true });
  assert.equal(store.get(KEY), stored, 'the stored record must be byte-for-byte what it was');
  assert.equal(landed.length, writes, 'a repeated event must not rewrite the record');
});

test('6c. two copies of the same refund overlapping end in the same state as one', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  const r = await interleave(
    () => db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }),
    () => db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }));
  settled(r, 'first refund');
  assert.deepEqual(record().revokedSessionIds, ['cs_1']);
  assert.deepEqual(record().refundedSessionIds, ['cs_1']);
  assert.deepEqual(record().slugs, []);
});

test('6d. a refund after a dispute adds the refund to the history, and a refund seen twice before any record is one tombstone', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: false });
  assert.equal(has('refundedSessionIds', 'cs_1'), false);
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true });
  assert.ok(has('refundedSessionIds', 'cs_1'), 'the refund after a dispute must be recorded');
  assert.deepEqual((await db.restoreEntitlement(EMAIL, [SLUG], 'cs_1')), { restored: false, reason: 'refunded' });

  store.clear();
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_9', { refunded: true });
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_9', { refunded: true });
  assert.deepEqual(record().revokedSessionIds, ['cs_9']);
  assert.deepEqual(record().slugs, []);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 7. Existing (legacy) entitlement records
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
const seed = (obj) => store.set(KEY, JSON.stringify(obj));

test('7a. a record from before sessionSlugs existed: a new purchase is added, the old agent kept, and refunding the new one leaves the old', async () => {
  seed({ email: EMAIL, slugs: [SLUG], grantedAt: '2025-01-01T00:00:00.000Z', stripeSessionIds: ['cs_old'], note: 'kept' });
  await db.grantEntitlement(EMAIL, [OTHER], 'cs_new');
  let r = record();
  assert.deepEqual(r.slugs.sort(), [OTHER, SLUG].sort());
  assert.equal(r.grantedAt, '2025-01-01T00:00:00.000Z', 'grantedAt is the first grant and does not move');
  assert.equal(r.note, 'kept', 'fields this code does not know about survive');
  assert.deepEqual(r.stripeSessionIds.sort(), ['cs_new', 'cs_old']);
  assert.deepEqual(r.sessionSlugs, { cs_new: [OTHER] });

  await db.revokeEntitlement(EMAIL, [OTHER], 'cs_new', { refunded: true });
  assert.equal(await entitled(OTHER), false);
  assert.equal(await entitled(SLUG), true, 'the legacy purchase is not touched by the refund of another');
  assert.equal((await db.grantEntitlement(EMAIL, [OTHER], 'cs_new')).refused, 'session-revoked');
});

test('7b. a legacy record loses the refunded agent exactly as before (no per-session history to vouch for another purchase)', async () => {
  seed({ email: EMAIL, slugs: [SLUG], stripeSessionIds: ['cs_old'] });
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_old', { refunded: true });
  assert.equal(await entitled(), false);
  assert.deepEqual(record().revokedSessionIds, ['cs_old']);
  assert.deepEqual(record().refundedSessionIds, ['cs_old']);
});

test('7c. a record that holds a retired slug is judged as the product it now names', async () => {
  seed({ email: EMAIL, slugs: [RETIRED_SLUG], stripeSessionIds: ['cs_old'] });
  assert.equal(await entitled(SLUG), true);
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_new');                       // stored under the current slug; the old entry stays
  assert.deepEqual(record().slugs.sort(), [RETIRED_SLUG, SLUG].sort());
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_new', { refunded: true });
  assert.equal(await entitled(SLUG), false, 'a refund drops the whole slug family (the legacy rule)');
});

test('7d. reloading a purchase that is already fully recorded changes nothing, byte for byte', async () => {
  seed({ email: EMAIL, slugs: [SLUG], grantedAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z',
    stripeSessionIds: ['cs_1'], sessionSlugs: { cs_1: [SLUG] } });
  const before = store.get(KEY);
  const granted = await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  assert.equal(store.get(KEY), before);
  assert.equal(landed.length, 0);
  assert.deepEqual(granted.slugs, [SLUG]);
  assert.equal(granted.refused, undefined);
});

test('7e. a stored value that is not JSON counts as no record; a grant replaces it, a refund leaves a tombstone', async () => {
  store.set(KEY, 'not json {');
  assert.equal(await entitled(), false);
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  assert.deepEqual(record().slugs, [SLUG]);

  store.set(KEY, 'not json {');
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_2', { refunded: true });
  assert.deepEqual(record().revokedSessionIds, ['cs_2']);
  assert.equal(await entitled(), false);
});

test('7f. what the functions return is unchanged for the callers (webhook and success page)', async () => {
  const none = await db.revokeEntitlement(EMAIL, [SLUG], undefined, { refunded: true });
  assert.deepEqual(none, { revoked: false, reason: 'no-entitlement' }, 'with no session id there is nothing to remember');
  assert.equal(store.has(KEY), false);
  assert.deepEqual(await db.restoreEntitlement(EMAIL, [SLUG], 'cs_1'), { restored: false, reason: 'no-entitlement' });
  const granted = await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  assert.deepEqual(Object.keys(granted).sort(), ['email', 'grantedAt', 'sessionSlugs', 'slugs', 'stripeSessionIds', 'updatedAt']);
  const revoked = await db.revokeEntitlement(EMAIL, [SLUG], 'cs_1');
  assert.deepEqual(revoked.slugs, []);
  assert.deepEqual(await db.restoreEntitlement(EMAIL, [SLUG], 'cs_1'), { restored: true });
  assert.deepEqual(await db.restoreEntitlement(EMAIL, [SLUG], 'cs_1'), { restored: false, reason: 'not-revoked' });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 8. Fail closed when Redis misbehaves
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
test('8a. Redis unreachable: nothing is granted, revoked or restored, and the access check refuses to answer', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  const before = store.get(KEY);
  faults.down = true;
  await assert.rejects(db.grantEntitlement(EMAIL, [SLUG], 'cs_2'), /KV error/);
  await assert.rejects(db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }), /KV error/);
  await assert.rejects(db.restoreEntitlement(EMAIL, [SLUG], 'cs_1'), /KV error/);
  await assert.rejects(db.isEntitled(EMAIL, SLUG), /KV error/, 'the download endpoint turns this into a 500, never a file');
  faults.down = false;
  assert.equal(store.get(KEY), before, 'nothing changed');
});

test('8b. a write that fails after a successful read throws and leaves the record as it was', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  const before = store.get(KEY);
  faults.failWrites = true;
  await assert.rejects(db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }), /KV error/);
  await assert.rejects(db.grantEntitlement(EMAIL, [OTHER], 'cs_2'), /KV error/);
  faults.failWrites = false;
  assert.equal(store.get(KEY), before);
  assert.equal(await entitled(), true, 'a failed refund is not half applied: Stripe retries the event');
});

test('8c. a Redis that cannot run the script is never mistaken for success', async () => {
  faults.noEval = true;
  await assert.rejects(db.grantEntitlement(EMAIL, [SLUG], 'cs_1'));
  await assert.rejects(db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }));
  assert.equal(store.has(KEY), false);
});

test('8d. endless contention gives up with an error; it neither loops forever nor overwrites the rival', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  let bumps = 0;
  faults.rival = () => { bumps += 1; seed({ ...record(), rival: bumps }); };   // someone else changes the record before every write lands
  const attempts = () => seen.filter((c) => c.cmd === 'EVAL').length;
  const before = attempts();
  await assert.rejects(db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true }), /did not settle|contention/i);
  const used = attempts() - before;
  assert.ok(used >= 2 && used <= 16, `expected a small bounded number of attempts, saw ${used}`);
  assert.equal(record().rival, bumps, 'the rival\'s record is intact: our write never landed');
  assert.equal(has('refundedSessionIds', 'cs_1'), false);
});

test('8e. the thank-you page with Redis down gives no download and stores nothing', async () => {
  sessions.set('cs_1', paidSession('cs_1'));
  faults.down = true;
  const page = await quiet(() => successPage('cs_1'));
  faults.down = false;
  assert.equal(page.status, 200);
  assert.match(page.html, /Payment received/);
  assert.ok(!page.html.includes('/api/download'), 'no link may be issued when the entitlement could not be recorded');
  assert.equal(store.size, 0);
});

test('8f. a refund whose write fails answers 5xx so Stripe retries; the retry then revokes', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  const refund = refundEvent('cs_1');
  faults.failWrites = true;
  const failed = await quiet(() => deliver(refund));
  faults.failWrites = false;
  assert.ok(failed.status >= 500, `expected a retryable 5xx, got ${failed.status}`);
  assert.equal(await entitled(), true, 'precondition: nothing was applied');
  assert.equal((await deliver(refund)).status, 200);
  assert.equal(await entitled(), false);
});

test('8g. a checkout whose entitlement write fails answers 5xx and releases its claims, so the retry is processed', async () => {
  const placed = checkoutCompleted('cs_1');
  faults.failWrites = true;
  const failed = await quiet(() => deliver(placed));
  faults.failWrites = false;
  assert.ok(failed.status >= 500, `expected a retryable 5xx, got ${failed.status}`);
  assert.equal(await entitled(), false);
  assert.equal((await deliver(placed)).status, 200, 'the same event is accepted on retry');
  assert.equal(await entitled(), true);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 9. Duplicates and refreshes
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
test('9a. the same checkout delivered twice plus a page reload, all three overlapping, leave one clean record', async () => {
  const r = await interleave(
    () => db.grantEntitlement(EMAIL, [SLUG], 'cs_1'),
    () => Promise.all([db.grantEntitlement(EMAIL, [SLUG], 'cs_1'), db.grantEntitlement(EMAIL, [SLUG], 'cs_1')]),
    { count: 1 });
  settled(r, 'first grant');
  const rec = record();
  assert.deepEqual(rec.slugs, [SLUG]);
  assert.deepEqual(rec.stripeSessionIds, ['cs_1']);
  assert.deepEqual(rec.sessionSlugs, { cs_1: [SLUG] });
  assert.equal(await entitled(), true);
});

test('9b. three identical grants that all read "nothing stored" before any of them writes', async () => {
  const gate = park({ count: 3 });
  const runs = [1, 2, 3].map(() => db.grantEntitlement(EMAIL, [SLUG], 'cs_1').then((value) => ({ value }), (error) => ({ error })));
  await Promise.race([gate.arrived, Promise.all(runs)]);
  gate.release();
  const results = await Promise.all(runs);
  for (const r of results) assert.equal(r.error, undefined, r.error?.message);
  const rec = record();
  assert.deepEqual(rec.slugs, [SLUG]);
  assert.deepEqual(rec.stripeSessionIds, ['cs_1']);
  assert.deepEqual(rec.sessionSlugs, { cs_1: [SLUG] });
});

test('9c. refreshing the thank-you page many times is read-only after the first visit', async () => {
  sessions.set('cs_1', paidSession('cs_1'));
  await successPage('cs_1');
  const stored = store.get(KEY);
  const writes = landed.filter((c) => c.key === KEY).length;
  for (let i = 0; i < 5; i += 1) assert.ok((await successPage('cs_1')).html.includes('/api/download'));
  assert.equal(store.get(KEY), stored);
  assert.equal(landed.filter((c) => c.key === KEY).length, writes, 'a page refresh must not rewrite the record');
});

test('9d. the Redis commands are scoped like every other: the entitlement script touches only the entitlement key', async () => {
  await db.grantEntitlement(EMAIL, [SLUG], 'cs_1');
  await db.revokeEntitlement(EMAIL, [SLUG], 'cs_1', { refunded: true });
  const scripted = seen.filter((c) => c.cmd === 'EVAL');
  assert.ok(scripted.length >= 2, 'the entitlement writes go through the compare-and-set script');
  assert.deepEqual([...new Set(scripted.map((c) => c.key))], [KEY]);
  assert.equal(seen.filter((c) => c.cmd === 'SET' && c.key === KEY).length, 0, 'no blind SET of the entitlement key remains');
});
