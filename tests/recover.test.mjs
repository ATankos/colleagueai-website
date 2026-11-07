/* tests/recover.test.mjs - buyer recovery (release gate A8): a buyer who closed the thank-you page gets a fresh
 * download link by email.
 *
 * What these hold, because each is a way this kind of endpoint goes wrong:
 *   - it is OFF unless the owner switched it on (RECOVERY_ENABLED) AND a link can be sealed and mailed, and says so
 *     (no "sent" that did not happen). A mail key set up for another purpose must not turn it on;
 *   - it does not reveal who has bought: an address with an order and one without get the same answer;
 *   - the link goes only to the address that holds the entitlement, and carries a sealed token, not the address;
 *   - it cannot be used to flood a mailbox, and it refuses (not sends) when its counter is down;
 *   - a refund leaves nothing to recover, before the email or after it;
 *   - a recovery token opens nothing else, and nothing else opens it.
 *
 * Runs against an in-memory KV and a fake mail API. No credentials, no network.
 * Usage: node --test tests/recover.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

process.env.KV_REST_API_URL = 'http://kv.test';
process.env.KV_REST_API_TOKEN = 'test-token';
process.env.DOWNLOAD_TOKEN_SECRET = 'recover-test-secret-0123456789abcdef';
process.env.RESEND_API_KEY = 're_test_not_a_real_key';
process.env.RECOVERY_ENABLED = '1';
process.env.PUBLIC_BASE_URL = 'https://shop.test';
process.env.RECOVER_MIN_RESPONSE_MS = '0';
delete process.env.VERCEL_ENV;

const store = new Map();
const ttls = new Map();   // key -> seconds, for the keys that have an expiry
const mails = [];
let kvDown = false;       // every command fails
let counterDown = false;  // only the rate limiter's commands fail (SET rl:… NX EX, INCR): the lookup would still work
let lookupDown = false;   // only GET fails: the rate limiter would still work
let mailStatus = 200;
const isLimiterKey = (key) => /(^|:)rl:/.test(key ?? '');

global.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u === 'https://api.resend.com/emails') {
    if (mailStatus !== 200) return { ok: false, status: mailStatus, text: async () => 'provider error' };
    mails.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ id: 'mail_1' }) };
  }
  if (!u.startsWith('http://kv.test/')) throw new Error(`unexpected network call: ${u}`);
  if (kvDown) return { ok: false, status: 500, text: async () => 'kv down' };
  const [cmd, ...args] = u.replace('http://kv.test/', '').split('/').map(decodeURIComponent);
  const limiterCmd = cmd === 'INCR' || (cmd === 'SET' && isLimiterKey(args[0]));
  if ((counterDown && limiterCmd) || (lookupDown && cmd === 'GET')) return { ok: false, status: 500, text: async () => 'partial outage' };
  let result = null;
  if (cmd === 'GET') result = store.has(args[0]) ? store.get(args[0]) : null;
  else if (cmd === 'SET') {
    const opts = args.slice(2);
    if (opts.includes('NX') && store.has(args[0])) result = null;               // SET … NX on an existing key: not set
    else {
      store.set(args[0], args[1]); result = 'OK';
      const i = opts.indexOf('EX');
      if (i >= 0) ttls.set(args[0], Number(opts[i + 1])); else ttls.delete(args[0]); // a plain SET clears any expiry, as Redis does
    }
  }
  else if (cmd === 'INCR') { const n = (Number(store.get(args[0])) || 0) + 1; store.set(args[0], n); result = n; }
  else if (cmd === 'EXPIRE') { if (store.has(args[0])) { ttls.set(args[0], Number(args[1])); result = 1; } else result = 0; }
  return { ok: true, json: async () => ({ result }) };
};

const db = await import('../lib/db.js');
const { default: recover } = await import('../api/recover.js');
const { signRecovery, openRecovery } = await import('../lib/recoveryToken.js');
const { signDownload, openDownload } = await import('../lib/downloadToken.js');
const { recoveryAvailable, recoverHint, publicBaseUrl } = await import('../lib/recovery.js');
const { sendMail } = await import('../lib/mail.js');

const SLUG = 'contract-intelligence-and-register';
let ipCounter = 0;
const freshIp = () => `10.20.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
const ids = { n: 0 };
const freshEmail = (name = 'buyer') => `${name}${++ids.n}@example.com`;

function makeRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { if (!this.headers['content-type']) this.headers['content-type'] = 'application/json'; this.body = p; return this; },
    send(p) { this.body = p; return this; },
    end(p) { this.body = p; return this; },
  };
}

async function call({ method = 'POST', body, query = {}, headers = {}, ip = freshIp() } = {}) {
  const req = { method, body, query, headers: { 'x-forwarded-for': ip, ...headers }, socket: {} };
  const res = makeRes();
  await recover(req, res);
  return res;
}
const ask = (email, extra = {}) => call({ body: { email, ...extra.body }, ...extra.opts });
const tokenFrom = (mail) => new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('t');
const buy = (email, session = `cs_${email}`) => db.grantEntitlement(email, [SLUG], session);

function withEnv(patch, fn) {
  const saved = {};
  for (const k of Object.keys(patch)) { saved[k] = process.env[k]; if (patch[k] === undefined) delete process.env[k]; else process.env[k] = patch[k]; }
  const restore = () => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
  return Promise.resolve().then(fn).finally(restore);
}

test.beforeEach(() => { mails.length = 0; kvDown = false; counterDown = false; lookupDown = false; mailStatus = 200; });

test('recovery is off unless the owner switched it on AND a link can be sealed AND mailed, and it says so instead of pretending', async () => {
  const off = [
    { RESEND_API_KEY: undefined },
    { DOWNLOAD_TOKEN_SECRET: undefined },
    // Mail and secret are both fine here: the mail key may be there for demo-request alerts, which is not consent to this.
    { RECOVERY_ENABLED: undefined }, { RECOVERY_ENABLED: '' }, { RECOVERY_ENABLED: '0' }, { RECOVERY_ENABLED: 'false' }, { RECOVERY_ENABLED: 'yes' },
  ];
  for (const patch of off) {
    await withEnv(patch, async () => {
      assert.equal(recoveryAvailable(), false);
      const email = freshEmail();
      await buy(email);
      const post = await ask(email);
      assert.equal(post.statusCode, 503);
      assert.equal(post.body.code, 'recovery_not_configured');
      assert.equal(mails.length, 0, 'nothing is sent when recovery is off');
      const form = await call({ method: 'GET' });
      assert.equal(form.statusCode, 503);
      assert.ok(!String(form.body).includes('<form'), 'no form is offered when it cannot work');
      assert.equal(recoverHint('en'), '', 'the thank-you page does not mention recovery when it is off');
    });
  }
  assert.equal(recoveryAvailable(), true);
  for (const on of ['1', 'true', 'TRUE', ' 1 ']) {
    await withEnv({ RECOVERY_ENABLED: on }, () => assert.equal(recoveryAvailable(), true, `on for ${JSON.stringify(on)}`));
  }
});

test('switching recovery off also stops the links already mailed from opening', async () => {
  const email = freshEmail('switched');
  await buy(email);
  const { t } = signRecovery({ email });
  const open = await call({ method: 'GET', query: { t } });
  assert.equal(open.statusCode, 200);
  assert.ok(open.body.includes('/api/download?t='));
  await withEnv({ RECOVERY_ENABLED: undefined }, async () => {
    const shut = await call({ method: 'GET', query: { t } });
    assert.equal(shut.statusCode, 503);
    assert.ok(!shut.body.includes('/api/download?t='), 'no download link while it is switched off');
  });
  await withEnv({ RESEND_API_KEY: undefined }, async () => {
    const still = await call({ method: 'GET', query: { t } });
    assert.equal(still.statusCode, 200, 'a link already mailed needs the switch, not the mail transport, to open');
  });
});

test('a malformed address is refused (400) before anything is counted, looked up or sent', async () => {
  const before = [...store.keys()].filter((k) => k.startsWith('rl:recover:')).length;
  for (const bad of ['', '   ', 'abc', 'a@b', 'two words@example.com', `${'x'.repeat(250)}@example.com`, { not: 'a string' }, 12345, undefined]) {
    const res = await ask(bad);
    assert.equal(res.statusCode, 400, `refused: ${JSON.stringify(bad)?.slice(0, 40)}`);
    assert.equal(res.body.code, 'invalid_email');
  }
  assert.equal([...store.keys()].filter((k) => k.startsWith('rl:recover:')).length, before);
  assert.equal(mails.length, 0);
});

test('an address with an order and one without get the same answer, as JSON and as HTML', async () => {
  const known = freshEmail('known'); const unknown = freshEmail('unknown');
  await buy(known);
  const a = await ask(known); const b = await ask(unknown);
  assert.equal(a.statusCode, 202);
  assert.deepEqual([b.statusCode, b.body, b.headers['content-type']], [a.statusCode, a.body, a.headers['content-type']]);
  assert.equal(mails.length, 1, 'only the address with an order is mailed');

  const html = { headers: { accept: 'text/html,application/xhtml+xml' } };
  const c = await call({ body: { email: known, lang: 'en' }, ...html });
  const d = await call({ body: { email: unknown, lang: 'en' }, ...html });
  assert.equal(c.statusCode, 202);
  assert.match(String(c.headers['content-type']), /text\/html/);
  assert.equal(d.statusCode, c.statusCode);
  assert.equal(d.body, c.body, 'the confirmation page is byte-identical');
});

test('the link goes to the address that holds the order and only to it, sealed, with no address in the URL', async () => {
  const email = freshEmail('Casey');
  await buy(email);
  const res = await ask(`  ${email.toUpperCase()} `);
  assert.equal(res.statusCode, 202);
  assert.equal(mails.length, 1);
  const [mail] = mails;
  assert.deepEqual(mail.to, [email.toLowerCase()], 'case and spaces do not matter, and there is exactly one recipient');
  assert.match(mail.subject, /download link/i);
  const link = mail.text.match(/https?:\/\/\S+/)[0];
  assert.ok(link.startsWith('https://shop.test/recover?t='), link);
  assert.ok(!mail.text.includes(email.toLowerCase()), 'the buyer address is not in the body');
  assert.ok(!decodeURIComponent(link).includes('@'), 'no address in the URL');
  const opened = openRecovery(tokenFrom(mail));
  assert.equal(opened.ok, true);
  assert.equal(opened.email, email.toLowerCase());
  assert.ok(opened.exp - Math.floor(Date.now() / 1000) <= 30 * 60, 'valid for 30 minutes at most');
});

test('mail goes out from the configured sender, and replies go to support, not to a sending subdomain nobody reads', async () => {
  const sender = 'ColleagueAI <no-reply@notify.example.test>';
  const cases = [
    { env: { MAIL_FROM: sender, MAIL_REPLY_TO: undefined }, replyTo: 'hello@colleagueai.ai', why: 'default: the support address' },
    { env: { MAIL_FROM: sender, MAIL_REPLY_TO: '   ' }, replyTo: 'hello@colleagueai.ai', why: 'a blank value is the same as unset' },
    { env: { MAIL_FROM: sender, MAIL_REPLY_TO: '  desk@example.test ' }, replyTo: 'desk@example.test', why: 'an explicit value wins, trimmed' },
  ];
  for (const { env, replyTo, why } of cases) {
    const email = freshEmail('replyto');
    await buy(email);
    mails.length = 0;
    await withEnv(env, () => ask(email));
    assert.equal(mails.length, 1, why);
    assert.equal(mails[0].from, sender, `${why}: sent from the sending subdomain`);
    assert.equal(mails[0].reply_to, replyTo, why);
    assert.deepEqual(mails[0].to, [email], `${why}: still exactly one recipient`);
  }
});

test('sendMail names a reply address only when the caller asks for one', async () => {
  await sendMail({ to: 'a@example.test', subject: 's', text: 't' });
  await sendMail({ to: 'b@example.test', subject: 's', text: 't', replyTo: 'desk@example.test' });
  assert.equal(mails.length, 2);
  assert.ok(!('reply_to' in mails[0]), 'no reply_to key at all, not a null or an empty one');
  assert.equal(mails[1].reply_to, 'desk@example.test');
});

test('every counter the endpoint creates carries its one-hour expiry from the first request', async () => {
  const email = freshEmail('ttl');
  const existing = new Set(store.keys());   // the store is shared with the other tests: look only at what this request made
  await ask(email);
  const counters = [...store.keys()].filter((k) => !existing.has(k) && isLimiterKey(k));
  assert.equal(counters.length, 2, 'one counter for the client address, one for the buyer address');
  for (const key of counters) assert.equal(ttls.get(key), 3600, `${key.slice(0, 24)}… is born with its expiry`);
  assert.ok(!counters.some((k) => k.includes(email)), 'and no counter is keyed by the address itself, only by its hash');
});

test('a refunded purchase gets no email', async () => {
  const email = freshEmail('refunded');
  await buy(email, 'cs_refunded_1');
  await db.revokeEntitlement(email, [SLUG], 'cs_refunded_1', { refunded: true });
  const res = await ask(email);
  assert.equal(res.statusCode, 202);
  assert.equal(mails.length, 0);
});

test('three requests per address per hour; the fourth is refused, for an address with no order too', async () => {
  const unknown = freshEmail('nobody');
  for (let i = 0; i < 3; i++) assert.equal((await ask(unknown)).statusCode, 202);
  const fourth = await ask(unknown);
  assert.equal(fourth.statusCode, 429);
  assert.equal(fourth.body.code, 'rate_limited');

  const known = freshEmail('flood');
  await buy(known);
  for (let i = 0; i < 3; i++) assert.equal((await ask(known)).statusCode, 202);
  assert.equal((await ask(known)).statusCode, 429);
  assert.equal(mails.length, 3, 'a flood sends three mails, not more');
});

test('five requests per client address per hour, counted per address of the caller', async () => {
  const ip = '198.51.100.7';
  for (let i = 0; i < 5; i++) assert.equal((await call({ body: { email: freshEmail('sweep') }, ip })).statusCode, 202);
  assert.equal((await call({ body: { email: freshEmail('sweep') }, ip })).statusCode, 429);
  assert.equal((await call({ body: { email: freshEmail('sweep') }, ip: '198.51.100.8' })).statusCode, 202);
});

test('if the counter cannot be read it refuses (503) and sends nothing, even though the lookup would work', async () => {
  const email = freshEmail('outage');
  await buy(email);
  counterDown = true;
  const res = await ask(email);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'store_unavailable');
  assert.equal(mails.length, 0, 'no limiter, no mail: an unmetered mail sender is the flood this endpoint must not become');
});

test('if the lookup fails it refuses (503) and sends nothing, and a full outage does the same', async () => {
  const email = freshEmail('lookupdown');
  await buy(email);
  for (const down of ['lookupDown', 'kvDown']) {
    lookupDown = down === 'lookupDown'; kvDown = down === 'kvDown';
    const res = await ask(email);
    assert.equal(res.statusCode, 503, down);
    assert.equal(res.body.code, 'store_unavailable');
    lookupDown = false; kvDown = false;
  }
  assert.equal(mails.length, 0);
  const page = await (async () => { lookupDown = true; try { return await call({ method: 'GET', query: { t: signRecovery({ email }).t } }); } finally { lookupDown = false; } })();
  assert.equal(page.statusCode, 503, 'the emailed link shows an outage, not an empty or a wrong page');
  assert.ok(!page.body.includes('/api/download?t='));
});

test('a mail provider failure does not change the answer to the caller', async () => {
  const email = freshEmail('providerdown');
  await buy(email);
  mailStatus = 500;
  const failed = await ask(email);
  mailStatus = 200;
  const unknown = await ask(freshEmail('someoneelse'));
  assert.equal(failed.statusCode, 202);
  assert.deepEqual(failed.body, unknown.body);
  assert.equal(mails.length, 0);
});

test('the emailed link opens to the downloads, each with a fresh signed link, and is never cached', async () => {
  const email = freshEmail('open');
  await buy(email);
  await ask(email);
  const token = tokenFrom(mails[0]);
  const res = await call({ method: 'GET', query: { t: token } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(String(res.headers['x-robots-tag']), /noindex/);
  assert.match(res.body, /noindex/);
  const href = res.body.match(/href="(\/api\/download\?t=[^"]+)"/);
  assert.ok(href, 'a signed download link is on the page');
  const dl = openDownload(new URL(href[1], 'https://x.test').searchParams.get('t'));
  assert.equal(dl.ok, true);
  assert.equal(dl.email, email.toLowerCase());
  assert.equal(dl.slug, SLUG);
  assert.ok(dl.exp - Math.floor(Date.now() / 1000) <= 900, 'download links stay at 15 minutes');
});

test('a tampered, expired or wrong-purpose token opens nothing, and a recovery token opens nothing else', async () => {
  const email = freshEmail('tokens');
  await buy(email);
  const { t } = signRecovery({ email });
  const tampered = t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA');
  const expired = signRecovery({ email, ttlSeconds: -5 }).t;
  const downloadToken = signDownload({ email, slug: SLUG, file: 'dossier.pdf' }).t;
  for (const [name, token] of [['tampered', tampered], ['expired', expired], ['a download token', downloadToken], ['garbage', 'x'], ['empty', '']]) {
    const res = await call({ method: 'GET', query: { t: token } });
    const form = !token;
    assert.equal(res.statusCode, form ? 200 : 403, name);
    assert.ok(!String(res.body).includes('/api/download?t='), `${name}: no download link`);
  }
  assert.deepEqual(openDownload(t), { ok: false, reason: 'bad-token' }, 'a recovery token is not a download token');
  assert.equal(openRecovery(downloadToken).ok, false, 'a download token is not a recovery token');
});

test('a token sealed under the recovery key but for another purpose is refused (the purpose claim is checked, not just the key)', async () => {
  const { createCipheriv, createHash, randomBytes } = await import('node:crypto');
  const seal = (claims) => {
    const key = createHash('sha256').update(`colleagueai:recovery-token:v1:${process.env.DOWNLOAD_TOKEN_SECRET}`).digest();
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const sealed = Buffer.concat([c.update(Buffer.from(JSON.stringify(claims))), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), sealed]).toString('base64url');
  };
  const exp = Math.floor(Date.now() / 1000) + 600;
  assert.equal(openRecovery(seal({ p: 'recover', e: 'a@example.com', x: exp })).ok, true, 'the forgery helper itself produces a valid token');
  assert.equal(openRecovery(seal({ p: 'download', e: 'a@example.com', x: exp })).ok, false);
  assert.equal(openRecovery(seal({ e: 'a@example.com', x: exp })).ok, false);
  assert.equal(openRecovery(seal({ p: 'recover', x: exp })).ok, false, 'no address, no token');
});

test('a link opened after a refund shows nothing to download', async () => {
  const email = freshEmail('late');
  await buy(email, 'cs_late_1');
  await ask(email);
  const token = tokenFrom(mails[0]);
  await db.revokeEntitlement(email, [SLUG], 'cs_late_1', { refunded: true });
  const res = await call({ method: 'GET', query: { t: token } });
  assert.equal(res.statusCode, 404);
  assert.ok(!res.body.includes('/api/download?t='));
});

test('the email and the pages follow the buyer\'s language', async () => {
  const email = freshEmail('lang');
  await buy(email);
  await ask(email, { body: { lang: 'de' } });
  assert.match(mails[0].text, /^Guten Tag,/);
  assert.match(mails[0].subject, /Download-Link/);
  assert.match(mails[0].text.match(/https?:\/\/\S+/)[0], /lang=de/);
  const page = await call({ method: 'GET', query: { t: tokenFrom(mails[0]), lang: 'de' } });
  assert.match(page.body, /<html lang="de">/);
  assert.ok(page.body.includes('Ihre <em>Downloads.</em>'));
  const form = await call({ method: 'GET', query: { lang: 'fr' } });
  assert.match(form.body, /<html lang="fr">/);
});

test('the form posts to the recovery endpoint, names its field, and is not indexed', async () => {
  const res = await call({ method: 'GET' });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<form class="o-form" method="post" action="\/api\/recover">/);
  assert.match(res.body, /name="email" type="email"/);
  assert.match(res.body, /name="lang" value="en"/);
  assert.match(res.body, /noindex,nofollow/);
  const bad = await call({ body: { email: 'nope' }, headers: { accept: 'text/html' } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.body, /role="alert"/);
});

test('the thank-you page offers recovery only while it is on', async () => {
  const hint = recoverHint('fr');
  assert.match(hint, /href="\/recover\?lang=fr"/);
  assert.ok(hint.includes('M’envoyer un nouveau lien'));
  await withEnv({ RECOVERY_ENABLED: undefined }, () => assert.equal(recoverHint('fr'), '', 'not while switched off, mail key or not'));
});

test('the thank-you page is never cached: it carries the buyer\'s address and fresh signed links', async () => {
  // vercel.json gives every other path "public, max-age=0, must-revalidate" and a function's own header overrides it,
  // so the page has to say no-store itself. Both branches below answer before any call to Stripe.
  const { default: success } = await import('../api/success.js');
  for (const [key, status] of [[undefined, 503], ['sk_test_not_a_real_key', 400]]) {
    await withEnv({ STRIPE_SECRET_KEY: key }, async () => {
      const res = makeRes();
      await success({ method: 'GET', query: {}, headers: {} }, res);
      assert.equal(res.statusCode, status);
      assert.equal(res.headers['cache-control'], 'no-store');
    });
  }
});

test('both outcomes take at least the response floor', async () => {
  await withEnv({ RECOVER_MIN_RESPONSE_MS: '150' }, async () => {
    const known = freshEmail('floorknown'); await buy(known);
    for (const email of [known, freshEmail('floorunknown')]) {
      const t0 = Date.now();
      const res = await ask(email);
      assert.equal(res.statusCode, 202);
      assert.ok(Date.now() - t0 >= 140, `answered in ${Date.now() - t0} ms`);
    }
  });
});

test('/recover is routed to the function, and other methods are refused', async () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vercel.rewrites.some((r) => r.source === '/recover' && r.destination === '/api/recover'));
  const res = await call({ method: 'PUT' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST');
});

test('the emailed link points at the deployment that sent it, never at the live site from a test deployment', async () => {
  await withEnv({ PUBLIC_BASE_URL: undefined, VERCEL_ENV: undefined }, () => assert.equal(publicBaseUrl(), 'https://www.colleagueai.ai'));
  await withEnv({ PUBLIC_BASE_URL: undefined, VERCEL_ENV: 'production', VERCEL_BRANCH_URL: 'x.vercel.app' }, () => assert.equal(publicBaseUrl(), 'https://www.colleagueai.ai'));
  await withEnv({ PUBLIC_BASE_URL: undefined, VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'branch-x.vercel.app' }, () => assert.equal(publicBaseUrl(), 'https://branch-x.vercel.app'));
  await withEnv({ PUBLIC_BASE_URL: 'https://override.test/', VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'branch-x.vercel.app' }, () => assert.equal(publicBaseUrl(), 'https://override.test'));
});
