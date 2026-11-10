/**
 * lib/acceptance.js - the order-confirmation step between the storefront and Stripe Checkout.
 *
 * Why it exists: until this change /api/checkout treated `terms=accepted` in the URL as proof that
 * the buyer had accepted the agreements. A query parameter is typed by whoever builds the link; it
 * says nothing about who accepted what, or which version. This module replaces it with a server-
 * rendered confirmation page and a stored acceptance record:
 *
 *   GET  /api/checkout?agent=...            -> renderAcceptancePage(): the agreements (versioned, linked),
 *                                              the order summary, and a form with UNTICKED boxes.
 *   POST /api/checkout  (urlencoded)        -> validateAcceptance(): every box ticked, a buyer company
 *                                              named, an individual declaring authority to bind it;
 *                                              then the handler stores the record (lib/db.js
 *                                              recordAcceptance) and creates the Stripe session with
 *                                              the record id and the document versions in its metadata.
 *
 * The record is the evidence: acceptance id, UTC timestamp, document set + versions (config/legal.json),
 * product + version, buyer company, declaring name, the consents given, a salted hash of the client IP,
 * user agent and storefront language. The Stripe session id and the buyer email are added when the
 * session exists / the webhook fulfils, so the order, the payment and the acceptance point at each other.
 * No card data, no plain IP.
 */

import { createHash } from 'node:crypto';
import LEGAL from '../config/legal.json' with { type: 'json' };

export const LEGAL_SET = LEGAL.set;
export const LEGAL_DOCS = LEGAL.documents;
export const CERT_TERMS = LEGAL.certification;

/**
 * Continuous Certification sales gate. OFF unless CERTIFICATION_SALES_ENABLED is exactly "1".
 * While it is off, checkout sells the perpetual licence only and refuses any request that asks for
 * certification (api/checkout.js). Switching it on is a founder decision that needs the certification
 * terms reviewed by counsel and the subscription lifecycle validated in sandbox first.
 */
export function certificationSalesEnabled() {
  return process.env.CERTIFICATION_SALES_ENABLED === '1';
}

/** "terms=2026-06-13;licence=2026-06-13;..." - short enough for Stripe metadata (500 chars). */
export function legalVersionString() {
  return Object.entries(LEGAL_DOCS).map(([k, d]) => `${k}=${d.version}`).join(';');
}

const COMPANY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'&()\-\/]{1,118}[\p{L}\p{N}.)]$/u;
const NAME_RE = /^[\p{L}][\p{L} .'\-]{1,78}[\p{L}.]$/u;

/**
 * Validate the POSTed confirmation form. Returns { ok: true, value } or { ok: false, errors: [field...] }.
 * The three consents are separate fields on purpose: a single "I agree" box cannot show that the buyer
 * saw the authority declaration or the consumer-delivery notice.
 */
export function validateAcceptance(body) {
  const b = body || {};
  const str = (k) => String(Array.isArray(b[k]) ? b[k][0] : (b[k] ?? '')).trim();
  const on = (k) => ['on', '1', 'true', 'yes'].includes(str(k).toLowerCase());
  const errors = [];
  const company = str('company').replace(/\s+/g, ' ');
  const name = str('name').replace(/\s+/g, ' ');
  if (!COMPANY_RE.test(company)) errors.push('company');
  if (!NAME_RE.test(name)) errors.push('name');
  if (!on('authority')) errors.push('authority');
  if (!on('terms')) errors.push('terms');
  if (!on('delivery')) errors.push('delivery');
  // The buyer confirms the document set they saw; a stale page (versions bumped since it loaded) is refused.
  if (str('legal_set') !== LEGAL_SET) errors.push('legal_set');
  if (errors.length) return { ok: false, errors };
  // Recurring certification is a separate, explicit opt-in: an unticked box means licence only.
  const certification = on('certification') ? { interval: str('cert_interval') === 'year' ? 'year' : 'month' } : null;
  return { ok: true, value: { company, name, consents: { authority: true, terms: true, delivery: true }, certification } };
}

/** Salted, truncated hash of the client address: enough to show two orders came from one place, never the address. */
export function clientFingerprint(req) {
  const ip = String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || '')
    .split(',')[0].trim();
  const salt = process.env.ACCEPTANCE_SALT || 'colleagueai-acceptance';
  return ip ? createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 24) : null;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(cents, currency) {
  const n = (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return (currency === 'eur' ? '€' : '$') + n;
}

/**
 * The confirmation page. `o` carries: productName, tier, slug, version, currency, priceCents,
 * certOffer ({ monthlyCents, annualCents } or null: only when certification sales are on and the lane can
 * subscribe), certClosed (true while the gate is off), method, hidden (the storefront parameters to carry
 * into the POST), errors (field names from validateAcceptance on a resubmit), values (what was typed), lang.
 */
export function renderAcceptancePage(o) {
  const err = new Set(o.errors || []);
  const v = o.values || {};
  const field = (k) => (err.has(k) ? ' aria-invalid="true"' : '');
  const docs = Object.entries(LEGAL_DOCS).map(([k, d]) =>
    `<li><a href="${esc(d.path)}" target="_blank" rel="noopener">${esc(d.title)}</a> <span class="o-small">(version ${esc(d.version)})</span></li>`).join('');
  const hidden = Object.entries(o.hidden || {}).filter(([, val]) => val !== undefined && val !== null && val !== '')
    .map(([k, val]) => `<input type="hidden" name="${esc(k)}" value="${esc(val)}">`).join('');
  const lines = [
    `<tr><td>${esc(o.productName)} (${esc(o.tier)})${o.version ? ` &middot; release ${esc(o.version)}` : ''}</td><td>${money(o.priceCents, o.currency)} one-time, perpetual licence</td></tr>`,
    `<tr><td>Payment</td><td>${o.method === 'bank' ? 'Bank transfer' : 'Card, Apple Pay, Google Pay or Link'}</td></tr>`,
  ].join('');
  /* Continuous Certification. o.certOffer is set only when certification sales are switched on and the
     payment lane can carry a subscription. The box starts unticked: no tick, no subscription. The price,
     the billing frequency, the automatic renewal and how to cancel are stated before the buyer can tick it. */
  const co = o.certOffer;
  const yearIsChecked = co && o.values?.cert_interval === 'year';
  const certBlock = co
    ? `<fieldset class="o-cert"><legend>Optional: Continuous Certification (recurring)</legend>` +
      `<label class="o-consent"><input type="checkbox" name="certification" value="on"${o.values?.certification ? ' checked' : ''}> ` +
      `Add Continuous Certification for this package. It is a separate subscription that renews automatically until cancelled.</label>` +
      `<label class="o-consent o-radio"><input type="radio" name="cert_interval" value="month"${yearIsChecked ? '' : ' checked'}> ` +
      `<span>Monthly: <b>${money(co.monthlyCents, o.currency)} per month</b>, first month charged today with the licence, then every month.</span></label>` +
      `<label class="o-consent o-radio"><input type="radio" name="cert_interval" value="year"${yearIsChecked ? ' checked' : ''}> ` +
      `<span>Annual: <b>${money(co.annualCents, o.currency)} per year</b>, first year charged today with the licence, then every year.</span></label>` +
      `<p class="o-small">Cancel at any time; certification then ends at the end of the period already paid, with no refund for that period except where the ` +
      `<a href="/refund" target="_blank" rel="noopener">Refund Policy</a> says otherwise. Cancelling, or a failed payment, never affects your perpetual licence. ` +
      `It is Colleague AI's own programme, not third-party accreditation, and does not include support. ` +
      `<a href="${esc(CERT_TERMS?.path || '/certified')}" target="_blank" rel="noopener">${esc(CERT_TERMS?.title || 'What it covers')}</a> (version ${esc(CERT_TERMS?.version || '')}).</p></fieldset>`
    : `<p class="o-small">This order is for the perpetual licence only.${o.certClosed ? ' Continuous Certification is not yet open for subscription.' : ''}</p>`;
  const errBox = err.size
    ? `<p class="o-err" role="alert">Please complete every field and tick all three confirmations${err.has('legal_set') ? ' (the agreements were updated while this page was open; please review them again)' : ''}.</p>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">` +
    `<title>Confirm your order | ColleagueAI</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
    `<link rel="stylesheet" href="/order.css"></head><body>` +
    `<header class="o-nav"><div class="o-wrap"><a class="o-logo" href="/" aria-label="ColleagueAI"><span class="o-logo-text">Colleague<span class="ai">AI</span></span></a></div></header>` +
    `<main class="o-wrap o-accept"><section class="o-hero"><p class="o-eyebrow">Step 1 of 2 &middot; Order confirmation</p>` +
    `<h1>Confirm the agreements, then pay with Stripe.</h1>` +
    `<p class="o-lede">ColleagueAI packages are sold to businesses. Before Stripe Checkout opens we record who accepted which agreements, so your order and ours point at the same text.</p></section>` +
    `<section class="o-card"><h2>Your order</h2><table class="o-order">${lines}</table>` +
    `<p class="o-small">Prices exclude any VAT or sales tax that applies to your billing country; the exact total is shown by Stripe before you pay.</p></section>` +
    `<section class="o-card"><h2>Agreements you are accepting (document set ${esc(LEGAL_SET)})</h2><ul class="o-text">${docs}</ul>` +
    `<p class="o-small">The agent licence is single-tenant, non-transferable and perpetual; redistribution, resale and sublicensing are not permitted except under a signed Partner Agreement.</p></section>` +
    `<form class="o-card o-form" method="post" action="/api/checkout" autocomplete="on">${hidden}` +
    `<input type="hidden" name="legal_set" value="${esc(LEGAL_SET)}">${errBox}` +
    `<label class="o-field">Buyer company (legal name)<input name="company" required maxlength="120" value="${esc(v.company || '')}"${field('company')} autocomplete="organization"></label>` +
    `<label class="o-field">Your full name<input name="name" required maxlength="80" value="${esc(v.name || '')}"${field('name')} autocomplete="name"></label>` +
    `<label class="o-consent"><input type="checkbox" name="authority" value="on"${field('authority')}> I am authorised to enter into this agreement on behalf of the buyer company, and this purchase is made in the course of its business.</label>` +
    `<label class="o-consent"><input type="checkbox" name="terms" value="on"${field('terms')}> The buyer company accepts the Terms of Service, the Software &amp; Agent Licence, the Refund Policy and the Privacy Policy listed above, in the versions shown.</label>` +
    `<label class="o-consent"><input type="checkbox" name="delivery" value="on"${field('delivery')}> I request delivery of the digital package immediately after payment and acknowledge that, where a right of withdrawal would otherwise apply, it lapses once delivery begins.</label>` +
    certBlock +
    `<div class="o-actions"><button class="o-btn o-btn-p" type="submit">Continue to secure payment &rarr;</button>` +
    `<a class="o-btn o-btn-s" href="${esc(o.cancelUrl || '/agents')}">Cancel</a></div>` +
    `<p class="o-small">We store: the time, the document versions, the company and name entered, these confirmations (and your certification choice, if offered), a salted hash of your network address and your browser type. We do not see card details; Stripe handles payment.</p>` +
    `</form></main>` +
    `<footer class="o-foot"><div class="o-wrap"><span>&copy; ${new Date().getFullYear()} ColleagueAI &middot; Colleague AI s.r.o., Praha</span></div></footer></body></html>`;
}

/** Parse an application/x-www-form-urlencoded body from a Node request (Vercel gives req.body already parsed when bodyParser is on). */
export async function readForm(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
}
