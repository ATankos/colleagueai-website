/**
 * api/recover.js - a buyer who closed the thank-you page gets a fresh download link by email (release gate A8).
 *
 *   GET  /recover               the request form (rewritten to /api/recover in vercel.json)
 *   POST /api/recover           { email, lang } -> 202, always the same answer
 *   GET  /recover?t=<token>     the link in the email: the downloads for that address, each with a fresh 15-minute link
 *
 * Rules this endpoint holds, each with a test in tests/recover.test.mjs:
 *   - It fails closed. Unless the owner has set RECOVERY_ENABLED=1 and both DOWNLOAD_TOKEN_SECRET and a mail transport
 *     are present, it refuses (503), emailed links stop opening, and the thank-you page does not advertise it. It
 *     never says a link was sent when it could not have been.
 *   - It does not reveal who has bought. An address with an order and one without get the same status and body, and the
 *     same response time to within the floor below. The link goes only to the address that holds the entitlement.
 *   - It cannot flood a mailbox: 3 requests per address and 5 per client address per hour, counted before the lookup,
 *     so the count tells a caller nothing either. If the counter cannot be read it refuses (503) rather than send.
 *   - A refunded or charged-back purchase has nothing left in the entitlement, so it gets no email, and an old link
 *     opens to "not found" because the entitlement is read again on every open.
 *   - No address in the logs, and none in a URL: the link carries a sealed token (lib/recoveryToken.js).
 */

import { getEntitlement, getCertificationForHolder, rateLimit } from '../lib/db.js';
import { productFor } from '../lib/products.js';
import { releaseToDeliver } from '../lib/releaseAccess.js';
import { openRecovery, RECOVERY_TTL_SECONDS } from '../lib/recoveryToken.js';
import { emailKey, normaliseEmail, recoverableSlugs, recoveryAvailable, recoveryEnabled, sendRecoveryEmail, SUPPORT_EMAIL } from '../lib/recovery.js';
import { ot, pickOrderLang } from '../lib/orderI18n.js';
import { deliveryHtml, page } from './success.js';

const first = (v) => (Array.isArray(v) ? v[0] : v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mailLink = () => `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`;
const MINUTES = String(RECOVERY_TTL_SECONDS / 60);
const SENT_MESSAGE = 'If that address has an order, a link is on its way.';

const PER_ADDRESS = { max: 3, windowSeconds: 3600 };
const PER_CLIENT = { max: 5, windowSeconds: 3600 };

/** Both outcomes of a request for an address answer after at least this long, so timing does not tell them apart. */
function minResponseMs() {
  const raw = process.env.RECOVER_MIN_RESPONSE_MS;
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 700;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clientIp(req) {
  const fwd = first(req.headers?.['x-forwarded-for']);
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return first(req.headers?.['x-real-ip']) || req.socket?.remoteAddress || 'unknown';
}

/** Browsers submitting the form ask for HTML; anything that asks for JSON, or nothing, gets JSON. */
function wantsHtml(req) {
  const accept = String(first(req.headers?.accept) || '');
  return accept.includes('text/html') && !accept.includes('application/json');
}

function readBody(req) {
  const body = req.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  if (typeof body === 'string' && body) {
    try { return JSON.parse(body); } catch { return Object.fromEntries(new URLSearchParams(body)); }
  }
  return {};
}

/** Copy with placeholders: the template is escaped, the values (already-safe HTML) go in afterwards. */
function fill(lang, key, vars = {}) {
  const marks = Object.fromEntries(Object.keys(vars).map((k) => [k, `@@${k}@@`]));
  let out = esc(ot(lang, key, marks));
  for (const [k, v] of Object.entries(vars)) out = out.split(`@@${k}@@`).join(v);
  return out;
}

const again = (lang) => `<a href="/recover?lang=${lang}">${esc(ot(lang, 'rec_again'))}</a>`;

function formPage(lang, error = '') {
  const t = (k) => ot(lang, k);
  const body = `<section class="o-grid o-single"><article class="o-card"><form class="o-form" method="post" action="/api/recover">` +
    `<input type="hidden" name="lang" value="${esc(lang)}">` +
    `<label for="rec-email">${esc(t('rec_label'))}</label>` +
    `<input id="rec-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required` +
    `${error ? ' aria-invalid="true" aria-describedby="rec-err"' : ''}>` +
    (error ? `<p class="o-err" id="rec-err" role="alert">${esc(error)}</p>` : '') +
    `<button class="o-btn o-btn-p" type="submit">${esc(t('rec_btn'))}</button></form></article></section>`;
  return page({ lang, title: t('rec_t'), status: 'pending', eyebrow: t('rec_t'), heading: t('rec_h'), lede: esc(t('rec_lede')), body });
}

const offPage = (lang) => page({
  lang, title: ot(lang, 't_unavailable'), status: 'warn', eyebrow: ot(lang, 't_unavailable'),
  heading: esc(ot(lang, 'rec_off_h')), lede: fill(lang, 'rec_off_p', { email: mailLink() }),
});
const downPage = (lang) => page({
  lang, title: ot(lang, 't_unavailable'), status: 'warn', eyebrow: ot(lang, 't_unavailable'),
  heading: esc(ot(lang, 't_unavailable')), lede: fill(lang, 'rec_down', { email: mailLink() }),
});
const limitPage = (lang) => page({
  lang, title: ot(lang, 't_unavailable'), status: 'warn', eyebrow: ot(lang, 't_unavailable'),
  heading: esc(ot(lang, 't_unavailable')), lede: fill(lang, 'rec_limit', { email: mailLink() }),
});
const sentPage = (lang) => page({
  lang, title: ot(lang, 'rec_sent_t'), status: 'ok', eyebrow: ot(lang, 'rec_sent_t'),
  heading: ot(lang, 'rec_sent_h'), lede: fill(lang, 'rec_sent_p', { minutes: MINUTES, email: mailLink() }),
});
const expiredPage = (lang) => page({
  lang, title: ot(lang, 'rec_exp_h'), status: 'warn', eyebrow: ot(lang, 'rec_exp_h'),
  heading: esc(ot(lang, 'rec_exp_h')), lede: fill(lang, 'rec_exp_p', { minutes: MINUTES, again: again(lang) }),
});
const nonePage = (lang) => page({
  lang, title: ot(lang, 't_notfound'), status: 'warn', eyebrow: ot(lang, 't_notfound'),
  heading: esc(ot(lang, 'nf_h')), lede: fill(lang, 'rec_none_p', { email: mailLink() }),
});

function html(res, status, markup) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(status).send(markup);
}

async function handleGet(req, res, lang) {
  const token = first((req.query || {}).t);

  // Off means off: links mailed earlier stop opening too. (Opening one needs no mail transport, only the switch.)
  if (!recoveryEnabled()) return html(res, 503, offPage(lang));

  if (!token) {
    return recoveryAvailable() ? html(res, 200, formPage(lang)) : html(res, 503, offPage(lang));
  }

  const opened = openRecovery(token);
  if (!opened.ok) {
    return opened.reason === 'server-misconfigured' ? html(res, 503, offPage(lang)) : html(res, 403, expiredPage(lang));
  }

  let entitlement;
  try {
    entitlement = await getEntitlement(opened.email);
  } catch (err) {
    console.error('[recover] entitlement lookup failed:', err?.message ?? err);
    return html(res, 503, downPage(lang));
  }
  const slugs = recoverableSlugs(entitlement);
  if (!slugs.length) return html(res, 404, nonePage(lang));

  // Each product links the newest release this buyer may have: the one bought, or a later one their certification
  // covers (lib/releaseAccess.js). A certificate that cannot be read only narrows the answer to the release bought.
  const now = Date.now();
  const blocks = [];
  for (const slug of slugs) {
    const product = productFor(slug);
    if (!product?.release) { blocks.push(deliveryHtml(opened.email, slug, lang)); continue; }
    let certification = null;
    try { certification = await getCertificationForHolder(opened.email, slug); } catch (err) {
      console.error('[recover] certification lookup failed:', err?.message ?? err);
    }
    blocks.push(deliveryHtml(opened.email, slug, lang, releaseToDeliver({ product, entitlement, slug, certification, now })));
  }

  const t = (k) => ot(lang, k);
  return html(res, 200, page({
    lang, title: t('rec_ok_t'), status: 'ok', eyebrow: t('rec_ok_t'), heading: t('rec_ok_h'), lede: esc(t('rec_ok_lede')),
    chips: [`${esc(t('chip_email'))} <b>${esc(opened.email)}</b>`],
    body: blocks.join(''),
  }));
}

async function handlePost(req, res, lang) {
  const started = Date.now();
  const browser = wantsHtml(req);
  const body = readBody(req);
  const refuse = (status, error, code, markup) => (browser ? html(res, status, markup) : res.status(status).json({ error, code }));

  if (!recoveryAvailable()) {
    return refuse(503, 'Recovery is not available', 'recovery_not_configured', offPage(lang));
  }

  const email = normaliseEmail(first(body.email));
  if (!email) {
    const message = ot(lang, 'rec_bad_email');
    return refuse(400, 'Enter a valid email address', 'invalid_email', formPage(lang, message));
  }

  // Count first, look up second: the count is the same whether or not the address has an order.
  try {
    const clientOk = await rateLimit(`recover:ip:${clientIp(req)}`, PER_CLIENT.max, PER_CLIENT.windowSeconds);
    const addressOk = await rateLimit(`recover:email:${emailKey(email)}`, PER_ADDRESS.max, PER_ADDRESS.windowSeconds);
    if (!clientOk || !addressOk) return refuse(429, 'Too many requests', 'rate_limited', limitPage(lang));
  } catch (err) {
    console.error('[recover] rate limiter unavailable:', err?.message ?? err);
    return refuse(503, 'Please try again shortly', 'store_unavailable', downPage(lang));
  }

  let entitlement;
  try {
    entitlement = await getEntitlement(email);
  } catch (err) {
    console.error('[recover] entitlement lookup failed:', err?.message ?? err);
    return refuse(503, 'Please try again shortly', 'store_unavailable', downPage(lang));
  }

  if (recoverableSlugs(entitlement).length) {
    try {
      await sendRecoveryEmail(email, lang);
    } catch (err) {
      // Same answer to the caller either way. The log line is the alert: the buyer is waiting for a mail that did not go.
      console.error('[recover] ALERT recovery email not sent:', err?.message ?? err);
    }
  }

  await sleep(Math.max(0, minResponseMs() - (Date.now() - started)));
  return browser ? html(res, 202, sentPage(lang)) : res.status(202).json({ ok: true, message: SENT_MESSAGE });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const lang = pickOrderLang(first(readBody(req).lang) ?? first((req.query || {}).lang), req.headers?.['accept-language']);
  res.setHeader('Content-Language', lang);

  if (req.method === 'GET') return handleGet(req, res, lang);
  if (req.method === 'POST') return handlePost(req, res, lang);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
