/**
 * scripts/verify-stripe-e2e.mjs — automated PREFLIGHT for the paid journey.
 *
 * Run against a PREVIEW deployment before the manual Stripe test purchase:
 *
 *     BASE_URL=https://<preview>.vercel.app node scripts/verify-stripe-e2e.mjs
 *
 * Optionally, to also exercise the signed-download token locally:
 *
 *     DOWNLOAD_TOKEN_SECRET=<the preview's secret> BASE_URL=... node scripts/verify-stripe-e2e.mjs
 *
 * What it checks WITHOUT any purchase (no money moves, test mode or not):
 *   1. /api/checkout input hardening: bad slug 400, unknown agent 404,
 *      missing terms 400, method not allowed 405.
 *   2. /api/checkout with a valid request: 303 redirect into stripe.com when
 *      Stripe is configured, or a clean 503 when it is not.
 *   3. /api/webhook: unsigned POST 400 (signature enforced), GET 405.
 *   4. /api/download: fails closed — no token 403 (or 503 when the signing
 *      secret is unset), tampered signature 403, expired token 403.
 *   5. /api/success without a session: 400; with a fake session id: 404.
 *
 * The manual part (real test cards, webhook idempotency replays, refund) is
 * docs/stripe-e2e-runbook.md — this script is its gate 0.
 *
 * Secrets: this script never embeds any. It reads DOWNLOAD_TOKEN_SECRET from the
 * environment only if YOU export it, to craft a valid-then-expired token pair.
 */
import { createHmac } from 'node:crypto';

const BASE = (process.env.BASE_URL || '').replace(/\/+$/, '');
if (!BASE) {
  console.error('Set BASE_URL to the deployment to test, e.g. BASE_URL=https://<preview>.vercel.app');
  process.exit(2);
}

const SLUG = 'contract-summarisation-agent'; // any catalogue slug works
let pass = 0, fail = 0;

const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const get = (path, opts = {}) => fetch(BASE + path, { redirect: 'manual', ...opts });

console.log(`Preflight against ${BASE}\n`);

// ── 1. checkout input hardening ───────────────────────────────────────────────
{
  let r = await get(`/api/checkout?agent=NOT_A_SLUG!!&terms=accepted`);
  ok('checkout rejects malformed slug (400)', r.status === 400, `got ${r.status}`);

  r = await get(`/api/checkout?agent=totally-unknown-agent&terms=accepted`);
  ok('checkout rejects unknown agent (404) or is disabled (503)', r.status === 404 || r.status === 503, `got ${r.status}`);

  r = await get(`/api/checkout?agent=${SLUG}`);
  ok('checkout without accepted terms is refused (400) or disabled (503)', r.status === 400 || r.status === 503, `got ${r.status}`);

  r = await fetch(BASE + `/api/checkout?agent=${SLUG}&terms=accepted`, { method: 'POST', redirect: 'manual' });
  ok('checkout rejects POST (405)', r.status === 405, `got ${r.status}`);
}

// ── 2. checkout happy path (no purchase: we stop at the redirect) ────────────
{
  const r = await get(`/api/checkout?agent=${SLUG}&terms=accepted&method=card`);
  if (r.status === 303 || r.status === 302) {
    const loc = r.headers.get('location') || '';
    ok('checkout redirects into Stripe hosted checkout', /^https:\/\/checkout\.stripe\.com\//.test(loc), loc.slice(0, 80));
    console.log('        (Stripe IS configured on this deployment — the manual runbook applies)');
  } else if (r.status === 503) {
    ok('checkout disabled cleanly (503 checkout_disabled)', true);
    console.log('        (Stripe NOT configured here — set the env vars and redeploy before the manual test)');
  } else {
    ok('checkout responds 303 (configured) or 503 (disabled)', false, `got ${r.status}`);
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
  let r = await get(`/api/download?email=${encodeURIComponent(email)}&slug=${SLUG}&file=dossier.pdf`);
  ok('download without token refused (403) or downloads unconfigured (503)', r.status === 403 || r.status === 503, `got ${r.status}`);

  r = await get(`/api/download?email=${encodeURIComponent(email)}&slug=${SLUG}&file=dossier.pdf&exp=9999999999&sig=deadbeef`);
  ok('download with forged signature refused (403/503)', r.status === 403 || r.status === 503, `got ${r.status}`);

  r = await get(`/api/download?email=${encodeURIComponent(email)}&slug=${SLUG}&file=..%2F..%2Fsecret`);
  ok('download rejects non-allowlisted file (400)', r.status === 400, `got ${r.status}`);

  const secret = process.env.DOWNLOAD_TOKEN_SECRET || '';
  if (secret) {
    const sign = (exp) => createHmac('sha256', secret)
      .update(`${email.toLowerCase()}:${SLUG}:dossier.pdf:${exp}`).digest('hex');
    const past = Math.floor(Date.now() / 1000) - 60;
    r = await get(`/api/download?email=${encodeURIComponent(email)}&slug=${SLUG}&file=dossier.pdf&exp=${past}&sig=${sign(past)}`);
    ok('download with EXPIRED but correctly signed token refused (403)', r.status === 403, `got ${r.status}`);

    const future = Math.floor(Date.now() / 1000) + 300;
    r = await get(`/api/download?email=${encodeURIComponent(email)}&slug=${SLUG}&file=dossier.pdf&exp=${future}&sig=${sign(future)}`);
    ok('valid token WITHOUT entitlement still refused (403 Not entitled)', r.status === 403, `got ${r.status}`);
  } else {
    console.log('  SKIP  expired-token + no-entitlement checks (export DOWNLOAD_TOKEN_SECRET to run them)');
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
