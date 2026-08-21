/**
 * tests/demo-booking.test.mjs — the /demo booking endpoint.
 *
 * This path had no coverage and was quietly losing every lead: it validated the
 * submission, logged the visitor's email, company and role, and returned
 * {success:true} while both email sends sat commented out. The rule these tests
 * exist to hold is the one that was broken — never report success for a booking
 * that was not actually recorded — plus the two that follow from it: no personal
 * data in the logs, and no arbitrary payload accepted into the store.
 *
 * Local fake KV implementing SET/EXPIRE/LPUSH/LRANGE/GET/INCR. No network, no secrets.
 * Usage: node --test tests/demo-booking.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

const store = new Map();
const lists = new Map();
let kvDown = false;      // every command fails
let writesDown = false;  // only the writes saveLead needs fail

const kvServer = http.createServer((req, res) => {
  if (kvDown) { res.statusCode = 500; return res.end('kv down'); }
  const [, cmd, ...rest] = req.url.split('/').map(decodeURIComponent);
  // Failing SET/LPUSH but leaving INCR working isolates a store failure from a
  // rate-limiter failure. Without that split, "KV is down" trips the rate limiter
  // first and the 503 assertion below passes without ever reaching saveLead —
  // which is how the first version of this test missed the very regression it
  // was written for.
  if (writesDown && (cmd === 'SET' || cmd === 'LPUSH')) { res.statusCode = 500; return res.end('write failed'); }
  switch (cmd) {
    case 'SET': store.set(rest[0], rest[1]); return res.end(JSON.stringify({ result: 'OK' }));
    case 'GET': return res.end(JSON.stringify({ result: store.get(rest[0]) ?? null }));
    case 'EXPIRE': return res.end(JSON.stringify({ result: 1 }));
    case 'LPUSH': {
      const l = lists.get(rest[0]) ?? [];
      l.unshift(rest[1]); lists.set(rest[0], l);
      return res.end(JSON.stringify({ result: l.length }));
    }
    case 'LRANGE': {
      const l = lists.get(rest[0]) ?? [];
      return res.end(JSON.stringify({ result: l.slice(Number(rest[1]), Number(rest[2]) + 1) }));
    }
    case 'INCR': {
      const n = (Number(store.get(rest[0])) || 0) + 1;
      store.set(rest[0], n);
      return res.end(JSON.stringify({ result: n }));
    }
    default: return res.end(JSON.stringify({ result: null }));
  }
});

let handler, listLeads;

before(async () => {
  await new Promise((r) => kvServer.listen(0, r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  delete process.env.RESEND_API_KEY;         // notification stays off in tests
  delete process.env.DEMO_NOTIFY_EMAIL;
  ({ default: handler } = await import('../api/demo-booking.js'));
  ({ listLeads } = await import('../lib/db.js'));
});
after(() => kvServer.close());
beforeEach(() => { store.clear(); lists.clear(); kvDown = false; writesDown = false; });

/** Minimal req/res doubles matching what the handler touches. */
function call(body, { method = 'POST', ip = '203.0.113.9', headers = {} } = {}) {
  const req = { method, body, headers: { 'x-forwarded-for': ip, ...headers }, socket: {} };
  const res = {
    statusCode: 200, payload: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
    end(p) { this.payload = p; return this; },
  };
  return handler(req, res).then(() => res);
}

const VALID = {
  email: 'cfo@example.com',
  company: 'Example Bank',
  role: 'CFO',
  agentsOfInterest: ['risk', 'data'],
  preferredDate: '2026-09-15',
  timeZone: 'CET',
};

test('rejects anything that is not a POST', async () => {
  const res = await call(VALID, { method: 'GET' });
  assert.equal(res.statusCode, 405);
});

test('stores the booking and returns its id', async () => {
  const res = await call(VALID);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.ok(res.payload.bookingId, 'a booking id is returned');

  const leads = await listLeads('demo');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].email, VALID.email);
  assert.equal(leads[0].company, VALID.company);
  assert.deepEqual(leads[0].agentsOfInterest, ['risk', 'data']);
  assert.equal(leads[0].id, res.payload.bookingId, 'the id returned is the id stored');
});

test('does NOT report success when the booking could not be stored', async () => {
  // Rate limiting still works here; only the write fails. That is the exact
  // shape of the original bug: everything looked fine and the lead vanished.
  writesDown = true;
  const res = await call(VALID);
  assert.equal(res.statusCode, 503, 'the visitor must see the failure, not a false promise');
  assert.ok(!res.payload.success, 'success must not be reported');
  assert.ok(!res.payload.bookingId, 'no booking id for a booking that does not exist');
  assert.match(res.payload.error, /hello@colleagueai\.ai/, 'offers a route that does work');

  writesDown = false;
  assert.equal((await listLeads('demo')).length, 0, 'nothing was stored');
});

test('fails closed when the store is unreachable entirely', async () => {
  kvDown = true;
  const res = await call(VALID, { ip: '198.51.100.77' });
  assert.equal(res.statusCode, 503);
  assert.ok(!res.payload.success);
});

test('rejects incomplete submissions', async () => {
  for (const missing of ['email', 'company', 'role', 'preferredDate']) {
    const body = { ...VALID }; delete body[missing];
    const res = await call(body, { ip: `198.51.100.${missing.length}` });
    assert.equal(res.statusCode, 400, `missing ${missing} should be rejected`);
  }
});

test('records which agent the enquiry came from', async () => {
  await call({ ...VALID, agentSlug: 'reconciliation-root-cause-agent', agentTier: 'l3' })
  const [lead] = await listLeads('demo')
  assert.equal(lead.agentSlug, 'reconciliation-root-cause-agent')
  assert.equal(lead.agentTier, 'L3', 'tier is normalised to upper case')
})

test('refuses a junk agent slug rather than storing it', async () => {
  await call({ ...VALID, agentSlug: '../../etc/passwd', agentTier: 'L9' }, { ip: '198.51.100.41' })
  const [lead] = await listLeads('demo')
  assert.equal(lead.agentSlug, null, 'a slug that is not catalogue-shaped is dropped')
  assert.equal(lead.agentTier, null, 'a tier outside L1-L5 is dropped')
})

test('a booking with no agent context is still accepted', async () => {
  const res = await call(VALID, { ip: '198.51.100.42' })
  assert.equal(res.statusCode, 200)
  const [lead] = await listLeads('demo')
  assert.equal(lead.agentSlug, null)
})

test('rejects a preferred date that has already passed', async () => {
  const res = await call({ ...VALID, preferredDate: '2020-01-01' }, { ip: '198.51.100.31' })
  assert.equal(res.statusCode, 400)
  assert.match(res.payload.error, /today or later/i)
  assert.equal((await listLeads('demo')).length, 0, 'a past booking is not stored')
})

test('accepts today, so a visitor a day behind UTC is not turned away', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const res = await call({ ...VALID, preferredDate: today }, { ip: '198.51.100.32' })
  assert.equal(res.statusCode, 200)
})

test('rejects a malformed email or date', async () => {
  const bad = await call({ ...VALID, email: 'not-an-email' }, { ip: '198.51.100.20' });
  assert.equal(bad.statusCode, 400);
  const badDate = await call({ ...VALID, preferredDate: '15/09/2026' }, { ip: '198.51.100.21' });
  assert.equal(badDate.statusCode, 400);
});

test('keeps only the catalogue\'s own pillar ids', async () => {
  await call({ ...VALID, agentsOfInterest: ['risk', 'evil', { drop: 1 }, 'corp'] });
  const [lead] = await listLeads('demo');
  assert.deepEqual(lead.agentsOfInterest, ['risk', 'corp']);
});

test('caps oversized field values rather than storing them whole', async () => {
  await call({ ...VALID, company: 'A'.repeat(5000) });
  const [lead] = await listLeads('demo');
  assert.ok(lead.company.length <= 200, `company capped, got ${lead.company.length}`);
});

test('ignores a non-string field instead of throwing', async () => {
  const res = await call({ ...VALID, role: { $ne: null } });
  assert.equal(res.statusCode, 400, 'a non-string role reads as missing');
});

test('rate-limits repeat submissions from one address', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await call(VALID, { ip: '203.0.113.77' });
  assert.equal(last.statusCode, 429);
  assert.match(last.payload.error, /hello@colleagueai\.ai/);
});

test('a different address is unaffected by another one hitting the limit', async () => {
  for (let i = 0; i < 6; i++) await call(VALID, { ip: '203.0.113.88' });
  const other = await call(VALID, { ip: '203.0.113.99' });
  assert.equal(other.statusCode, 200);
});

test('writes no personal data to the logs', async () => {
  const written = [];
  const realLog = console.log;
  console.log = (...args) => written.push(args.map((a) => JSON.stringify(a)).join(' '));
  try {
    await call(VALID, { ip: '203.0.113.55' });
  } finally {
    console.log = realLog;
  }
  const all = written.join('\n');
  assert.ok(all.length > 0, 'the handler still logs something');
  for (const secret of [VALID.email, VALID.company, VALID.role]) {
    assert.ok(!all.includes(secret), `log must not contain ${secret}`);
  }
});
