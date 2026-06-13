/**
 * tests/ratelimit.test.mjs — unit tests for the KV-backed rate limiter (lib/db.js).
 * Local fake KV implementing INCR/EXPIRE; no network, no secrets.
 * Usage: node --test tests/ratelimit.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

const store = new Map();
const kvServer = http.createServer((req, res) => {
  const [, cmd, ...rest] = req.url.split('/').map(decodeURIComponent);
  if (cmd === 'INCR') { const n = (Number(store.get(rest[0])) || 0) + 1; store.set(rest[0], n); return res.end(JSON.stringify({ result: n })); }
  if (cmd === 'EXPIRE') return res.end(JSON.stringify({ result: 1 }));
  res.end(JSON.stringify({ result: null }));
});
let rateLimit;
before(async () => {
  await new Promise(r => kvServer.listen(0, r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  ({ rateLimit } = await import('../lib/db.js'));
});
after(() => kvServer.close());
beforeEach(() => store.clear());

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
