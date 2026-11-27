/**
 * scripts/verify-stripe-e2e.mjs — automated PREFLIGHT for the paid journey.
 *
 * Run against a PREVIEW deployment before the manual Stripe test purchase:
 *
 *     BASE_URL=https://<preview>.vercel.app node scripts/verify-stripe-e2e.mjs
 *
 * Optionally, to also exercise the sealed download-token checks (same secret as the preview):
 *
 *     DOWNLOAD_TOKEN_SECRET=<the preview's secret> BASE_URL=... node scripts/verify-stripe-e2e.mjs
 *
 * What it checks WITHOUT any purchase (no money moves, test mode or not):
 *   1. /api/checkout input hardening: bad slug 400, unknown agent 404,
 *      missing terms 400, method not allowed 405.
 *   2. /api/checkout with a complete synthetic buyer (every field the order form
 *      marks required, read from the form itself so a new field is caught): a 303
 *      into checkout.stripe.com with a TEST session (cs_test_) is the only result
 *      that counts as Stripe connectivity. A 503 checkout_disabled is reported as
 *      DISABLED, not as a pass: it proves the switch is off, not that Stripe works.
 *      Set EXPECT_DISABLED=1 when the target is meant to be closed (Production
 *      during the commercial freeze); then 503 passes and a redirect fails.
 *      A live session (cs_live_) on a preview always fails.
 *   3. /api/webhook: unsigned POST 400 (signature enforced), GET 405.
 *   4. /api/download: fails closed — no token 403 (or 503 when the signing
 *      secret is unset); a legacy email/sig link 403. With the secret set: a
 *      tampered token 403, an expired token 403, a token for a file outside the
 *      allowlist 400, and a valid token for a buyer with no entitlement 403.
 *   5. /api/success without a session: 400; with a fake session id: 404.
 *
 * The manual part (real test cards, webhook idempotency replays, refund) is
 * docs/stripe-e2e-runbook.md — this script is its gate 0.
 *
 * Secrets: this script never embeds any. It reads DOWNLOAD_TOKEN_SECRET from the
 * environment only if YOU export it, to seal test tokens with lib/downloadToken.js.
 */
import { signDownload } from '../lib/downloadToken.js';
import { readFileSync } from 'node:fs';

const BASE = (process.env.BASE_URL || '').replace(/\/+$/, '');
if (!BASE) {
  console.error('Set BASE_URL to the deployment to test, e.g. BASE_URL=https://<preview>.vercel.app');
  process.exit(2);
}

const SLUG = 'contract-intelligence-and-register'; // any catalogue slug works
let pass = 0, fail = 0;

const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const get = (path, opts = {}) => fetch(BASE + path, { redirect: 'manual', ...opts });

console.log(`Preflight against ${BASE}\n`);

// ── 1. checkout input hardening ───────────────────────────────────────────────
{
  let r = await get(`/api/checkout?agent=NOT_A_SLUG!!`);
  ok('checkout rejects malformed slug (400)', r.status === 400, `got ${r.status}`);

  r = await get(`/api/checkout?agent=totally-unknown-agent`);
  ok('checkout rejects unknown agent (404) or is disabled (503)', r.status === 404 || r.status === 503, `got ${r.status}`);

  r = await get(`/api/checkout?agent=${SLUG}&method=card`);
  ok('checkout GET shows the confirmation page, never a Stripe redirect (200) or is disabled (503)', r.status === 200 || r.status === 503, `got ${r.status}`);

  r = await fetch(BASE + `/api/checkout`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `agent=${SLUG}&method=card` });
  ok('checkout POST without the confirmations is refused (400) or disabled (503)', r.status === 400 || r.status === 503, `got ${r.status}`);
}

// ── 2. checkout with a complete synthetic buyer (no purchase: we stop at the redirect) ─
{
  const expectDisabled = process.env.EXPECT_DISABLED === '1';
  const legalSet = JSON.parse(readFileSync(new URL('../config/legal.json', import.meta.url), 'utf8')).set;
  // Synthetic buyer only. Every value is fictitious; no real company, person or address.
  const synthetic = {
    company: 'Preflight Test Company s.r.o.', reg_number: '00000019', tax_id: '', tenant: '',
    contact_name: 'Preflight Contact', email: 'preflight@example.com', name: 'Preflight Tester', role: 'Engineering test',
    authority: 'on', terms: 'on', delivery: 'on',
  };
  const page = await get(`/api/checkout?agent=${SLUG}&method=card`);
  const html = page.status === 200 ? await page.text() : '';
  // The order form's own fields: hidden values are taken as served; required fields must be covered by `synthetic`.
  const fields = {};
  const required = [];
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attrs = m[2];
    const name = (attrs.match(/\bname="([^"]+)"/) || [])[1];
    if (!name) continue;
    if (/\btype="hidden"/.test(attrs)) fields[name] = (attrs.match(/\bvalue="([^"]*)"/) || [])[1] ?? '';
    if (/\brequired\b/.test(attrs)) required.push(name);
  }
  // Country: the first real option the form offers (the launch scope decides which countries those are).
  const countrySelect = (html.match(/<select\b[^>]*name="country"[^>]*>([\s\S]*?)<\/select>/i) || [])[1] || '';
  const country = ([...countrySelect.matchAll(/<option\b[^>]*value="([A-Z]{2})"/g)][0] || [])[1] || 'CZ';
  const body = { agent: SLUG, method: 'card', cert: '0', legal_set: legalSet, ...fields, ...synthetic, country };
  if (html) {
    const missing = required.filter((n) => body[n] === undefined || body[n] === '');
    ok('preflight supplies every field the order form requires', missing.length === 0, `missing: ${missing.join(', ')}`);
  }
  const r = await fetch(BASE + '/api/checkout', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  const loc = r.headers.get('location') || '';
  if (r.status === 303 || r.status === 302) {
    const toStripe = /^https:\/\/checkout\.stripe\.com\//.test(loc);
    const live = /cs_live_/.test(loc);
    if (expectDisabled) ok('checkout is disabled as expected (EXPECT_DISABLED=1)', false, `redirected to ${loc.slice(0, 40)}...`);
    else {
      ok('checkout redirects into Stripe hosted checkout', toStripe, loc.slice(0, 60));
      ok('the Stripe session is a TEST session (cs_test_), never live on a preview', toStripe && !live && /cs_test_/.test(loc), live ? 'LIVE session' : loc.slice(0, 60));
      if (toStripe && !live) console.log('        CONNECTED: Stripe test mode reached. The manual runbook applies.');
    }
  } else if (r.status === 503) {
    const code = (await r.text()).match(/checkout_disabled|stripe_not_configured|[a-z_]+_not_configured/)?.[0] || 'unavailable';
    if (expectDisabled) ok(`checkout disabled as expected (503 ${code})`, true);
    else {
      ok(`checkout reaches Stripe (got 503 ${code}: DISABLED, Stripe connectivity NOT verified)`, false, 'set the preview flags and redeploy, or run with EXPECT_DISABLED=1 against a closed target');
    }
  } else {
    const text = await r.text();
    const reasons = [...new Set(text.match(/Check the [^<.]+|Enter [^<.]+|Choose [^<.]+|tick all three confirmations/g) || [])].slice(0, 4).join(' | ');
    ok('checkout accepts a complete synthetic order (303 to Stripe)', false, `got ${r.status}${reasons ? ': ' + reasons : ''}`);
  }
}

// ── 3. webhook signature enforcement ─────────────────────────────────────────
{
  let r = await fetch(BASE + '/api/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'evt_fake', type: 'checkout.session.completed', data: { object: {} } }),
  });
  ok('webhook refuses unsigned POST (400) or is unconfigured (503)', r.status === 400 || r.status === 503, `got ${r.status}`);

  r = await get('/api/webhook');
  ok('webhook rejects GET (405)', r.status === 405, `got ${r.status}`);
}

// ── 4. download fails closed ─────────────────────────────────────────────────
{
  const email = 'preflight@example.com';
  // A link is /api/download?t=<sealed token> (lib/downloadToken.js): the token carries the email,
  // slug, file and expiry, so the URL never shows the buyer's address.
  let r = await get('/api/download');
  ok('download without token refused (403) or downloads unconfigured (503)', r.status === 403 || r.status === 503, `got ${r.status}`);

  // The old query-string form (email, slug, file, exp, sig) is no longer honoured at all.
  r = await get(`/api/download?email=${encodeURIComponent(email)}&slug=${SLUG}&file=dossier.pdf&exp=9999999999&sig=deadbeef`);
  ok('legacy email/sig link refused (403/503)', r.status === 403 || r.status === 503, `got ${r.status}`);

  r = await get(`/api/download?t=${'A'.repeat(120)}`);
  ok('forged token refused (403/503)', r.status === 403 || r.status === 503, `got ${r.status}`);

  const secret = process.env.DOWNLOAD_TOKEN_SECRET || '';
  if (secret) {
    // Each refusal is checked for its status AND its reason, so a check cannot pass for the wrong reason.
    const expectRefusal = async (name, token, status, reason) => {
      const res = await get(`/api/download?t=${encodeURIComponent(token)}`);
      const txt = await res.text();
      ok(name, res.status === status && txt.includes(reason), `got ${res.status} ${txt.slice(0, 120)}`);
    };
    const seal = (opts) => signDownload({ email, slug: SLUG, file: 'dossier.pdf', ttlSeconds: 300, ...opts }).t;

    const good = seal({});
    // Flip one character inside the sealed bytes (past the 12-byte IV and 16-byte tag): GCM must reject it.
    const tampered = good.slice(0, 40) + (good[40] === 'A' ? 'B' : 'A') + good.slice(41);
    await expectRefusal('tampered token refused (403, bad-token)', tampered, 403, 'bad-token');
    await expectRefusal('EXPIRED but correctly sealed token refused (403, expired)', seal({ ttlSeconds: -60 }), 403, 'expired');
    await expectRefusal('sealed token for a non-allowlisted file refused (400)', seal({ file: '../../secret' }), 400, 'Invalid file requested');
    await expectRefusal('valid token WITHOUT entitlement refused (403, Not entitled)', good, 403, 'Not entitled');
  } else {
    console.log('  SKIP  tampered / expired / non-allowlisted / no-entitlement checks (export DOWNLOAD_TOKEN_SECRET to run them)');
  }
}

// ── 5. success page ──────────────────────────────────────────────────────────
{
  let r = await get('/api/success');
  ok('success without session id → 400 (or 503 unconfigured)', r.status === 400 || r.status === 503, `got ${r.status}`);

  r = await get('/api/success?session_id=cs_test_preflight_does_not_exist');
  ok('success with unknown session → 404 (or 503 unconfigured)', r.status === 404 || r.status === 503, `got ${r.status}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
