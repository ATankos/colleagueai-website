/**
 * tests/ratelimit.test.mjs — unit tests for the KV-backed rate limiter (lib/db.js).
 * Local fake KV implementing SET (NX, EX), INCR and EXPIRE, with an expiry table, a command log and failure
 * injection; no network, no secrets.
 *
 * The case that matters: a counter must never exist without an expiry. The limiter used to INCR and then EXPIRE on
 * the first hit; if that EXPIRE failed the counter never reset and the caller (an address, or a shared office IP)
 * was locked out for good. The tests below model exactly that failure, show the old order strands a counter, and
 * hold the new one to leaving none.
 *
 * Usage: node --test tests/ratelimit.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

const store = new Map();   // key -> string value
const ttls = new Map();    // key -> seconds, for the keys that have an expiry
let log = [];              // commands received, in order
let failing = new Set();   // commands that answer 500
let beforeIncr = null;     // hook run just before an INCR is applied

const kvServer = http.createServer((req, res) => {
  const [, cmd, key, ...rest] = req.url.split('/').map(decodeURIComponent);
  log.push(cmd);
  if (failing.has(cmd)) { res.statusCode = 500; return res.end(`injected failure of ${cmd}`); } // the body names the command, so a test can tell whose error it caught
  const reply = (result) => res.end(JSON.stringify({ result }));
  if (cmd === 'SET') {
    if (rest.includes('NX') && store.has(key)) return reply(null);
    store.set(key, rest[0]);
    const i = rest.indexOf('EX');
    if (i >= 0) ttls.set(key, Number(rest[i + 1])); else ttls.delete(key);
    return reply('OK');
  }
  if (cmd === 'INCR') {
    beforeIncr?.(key);
    const n = (Number(store.get(key)) || 0) + 1;
    store.set(key, String(n));
    return reply(n);
  }
  if (cmd === 'EXPIRE') {
    if (!store.has(key)) return reply(0);
    ttls.set(key, Number(rest[0]));
    return reply(1);
  }
  if (cmd === 'DEL') {
    ttls.delete(key);
    return reply(store.delete(key) ? 1 : 0);
  }
  return reply(null);
});

/** Time passing: every key that has an expiry goes. A key without one stays, which is the whole problem. */
const timePasses = () => { for (const k of [...ttls.keys()]) { store.delete(k); ttls.delete(k); } };

let rateLimit;
before(async () => {
  await new Promise(r => kvServer.listen(0, r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  delete process.env.VERCEL_ENV;
  ({ rateLimit } = await import('../lib/db.js'));
});
after(() => kvServer.close());
beforeEach(() => { store.clear(); ttls.clear(); log = []; failing = new Set(); beforeIncr = null; });

/** The limiter as it was before this fix (INCR, then EXPIRE on the first hit), kept to show the harness sees the defect. */
async function legacyRateLimit(key, max, windowSeconds) {
  const k = `rl:${key}`;
  const call = async (cmd, ...args) => {
    const r = await fetch(`${process.env.KV_REST_API_URL}/${cmd}/${[k, ...args].map(encodeURIComponent).join('/')}`);
    if (!r.ok) throw new Error(`KV error: ${r.status}`);
    return (await r.json()).result;
  };
  const n = Number(await call('INCR'));
  if (n === 1) await call('EXPIRE', String(windowSeconds));
  return n <= max;
}

test('allows up to max hits in the window', async () => {
  for (let i = 1; i <= 10; i++) assert.equal(await rateLimit('t:ip1', 10, 60), true, `hit ${i}`);
});
test('blocks the (max+1)th hit', async () => {
  for (let i = 1; i <= 10; i++) await rateLimit('t:ip2', 10, 60);
  assert.equal(await rateLimit('t:ip2', 10, 60), false);
});
test('separate keys do not interfere', async () => {
  for (let i = 1; i <= 10; i++) await rateLimit('t:ip3', 10, 60);
  assert.equal(await rateLimit('t:ip4', 10, 60), true);
});
test('throws (rather than silently passing) when KV is down — caller fails closed', async () => {
  const goodUrl = process.env.KV_REST_API_URL;
  // point lib/db.js fetch at a dead port via a one-off limiter call with the server closed
  kvServer.close();
  await assert.rejects(() => rateLimit('t:ip5', 10, 60));
  await new Promise(r => kvServer.listen(new URL(goodUrl).port, r)); // restore for other tests
});

test('the first hit creates the counter and its expiry in ONE command', async () => {
  assert.equal(await rateLimit('t:one', 3, 90), true);
  assert.deepEqual(log, ['SET'], 'one command, so no moment exists with a counter and no expiry');
  assert.equal(store.get('rl:t:one'), '1');
  assert.equal(ttls.get('rl:t:one'), 90);
});

test('later hits count with INCR and keep the expiry set by the first', async () => {
  await rateLimit('t:two', 3, 90);
  log = [];
  assert.equal(await rateLimit('t:two', 3, 90), true);
  assert.deepEqual(log, ['SET', 'INCR']);
  assert.equal(store.get('rl:t:two'), '2');
  assert.equal(ttls.get('rl:t:two'), 90, 'untouched: INCR does not clear an expiry');
});

test('a failing EXPIRE can no longer strand a counter without an expiry', async () => {
  failing.add('EXPIRE');
  for (let i = 1; i <= 5; i++) {
    assert.equal(await rateLimit('t:expfail', 4, 60), i <= 4, `hit ${i}`);
    assert.ok(ttls.has('rl:t:expfail'), `after hit ${i} the counter has an expiry`);
  }
  assert.ok(!log.includes('EXPIRE'), 'the normal path no longer depends on EXPIRE at all');
  timePasses();
  assert.equal(await rateLimit('t:expfail', 4, 60), true, 'the window reset: the caller is not locked out');
});

test('why this fix exists: the old order strands a counter, and the caller stays locked out after the window', async () => {
  failing.add('EXPIRE');
  await assert.rejects(() => legacyRateLimit('t:legacy', 2, 60), /KV error/);
  assert.ok(store.has('rl:t:legacy'), 'the old order left the counter behind');
  assert.ok(!ttls.has('rl:t:legacy'), '...with no expiry');
  failing.clear();
  assert.equal(await legacyRateLimit('t:legacy', 2, 60), true);   // 2
  assert.equal(await legacyRateLimit('t:legacy', 2, 60), false);  // 3: blocked
  timePasses();
  assert.equal(await legacyRateLimit('t:legacy', 2, 60), false, 'a whole window later it is still blocked, for good');
});

test('a counter that lapses between the two commands is given its expiry', async () => {
  await rateLimit('t:lapse', 3, 45);                       // creates the counter
  beforeIncr = (key) => { store.delete(key); ttls.delete(key); beforeIncr = null; }; // it expires just before the INCR lands
  log = [];
  assert.equal(await rateLimit('t:lapse', 3, 45), true);
  assert.deepEqual(log, ['SET', 'INCR', 'EXPIRE']);
  assert.equal(store.get('rl:t:lapse'), '1', 'a fresh window starts at 1');
  assert.equal(ttls.get('rl:t:lapse'), 45, 'and it has its expiry');
});

test('a counter the lapse re-created is removed, not left without an expiry, when its EXPIRE fails too', async () => {
  await rateLimit('t:lapsefail', 3, 45);
  beforeIncr = (key) => { store.delete(key); ttls.delete(key); beforeIncr = null; };
  failing.add('EXPIRE');
  log = [];
  await assert.rejects(() => rateLimit('t:lapsefail', 3, 45), /KV error/, 'the caller still sees the failure and fails closed');
  assert.deepEqual(log, ['SET', 'INCR', 'EXPIRE', 'DEL']);
  assert.ok(!store.has('rl:t:lapsefail'), 'the counter that would have had no expiry is gone');
  failing.clear();
  assert.equal(await rateLimit('t:lapsefail', 3, 45), true, 'the caller is not locked out: the next hit starts a fresh window');
  assert.equal(ttls.get('rl:t:lapsefail'), 45);
});

test('if the clean-up fails as well, the error the caller sees is still the original one', async () => {
  await rateLimit('t:both', 3, 45);
  beforeIncr = (key) => { store.delete(key); ttls.delete(key); beforeIncr = null; };
  failing.add('EXPIRE'); failing.add('DEL');
  await assert.rejects(() => rateLimit('t:both', 3, 45), (err) => /injected failure of EXPIRE/.test(err.message),
    'the caller is told what went wrong first (the expiry), not what the clean-up then hit');
  assert.deepEqual(log.slice(-2), ['EXPIRE', 'DEL'], 'the delete was attempted');
});

test('the window resets when the counter expires', async () => {
  for (let i = 1; i <= 3; i++) await rateLimit('t:reset', 3, 60);
  assert.equal(await rateLimit('t:reset', 3, 60), false);
  timePasses();
  assert.equal(await rateLimit('t:reset', 3, 60), true);
  assert.equal(store.get('rl:t:reset'), '1');
});

test('a limit of one allows exactly one hit, and a limit of zero allows none', async () => {
  assert.equal(await rateLimit('t:single', 1, 60), true);
  assert.equal(await rateLimit('t:single', 1, 60), false);
  assert.equal(await rateLimit('t:none', 0, 60), false, 'the creating hit is judged against the limit too');
});

test('a store error on the creating command throws, and nothing is left half-made', async () => {
  failing.add('SET');
  await assert.rejects(() => rateLimit('t:setfail', 3, 60), /KV error/);
  assert.equal(store.size, 0);
  assert.equal(ttls.size, 0);
});
