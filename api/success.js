/**
 * api/success.js - Post-payment "thank you" + download page.
 *
 * success_url points here: GET /api/success?session_id=cs_...
 * - Retrieves the Checkout Session from Stripe.
 * - If paid: grants the entitlement itself (idempotent) so the flow works even without the
 *   webhook, then shows a Download button. The webhook (when configured) does the same job
 *   for buyers who close the tab, and for delayed bank transfers.
 * - If a bank transfer is still pending: shows a "come back once it clears" message.
 *
 * Needs STRIPE_SECRET_KEY (+ KV for entitlements). DOWNLOAD_TOKEN_SECRET is optional:
 * if set, the download link is signed; if not, it is a plain entitlement-gated link.
 */

import Stripe from 'stripe';
import { grantEntitlement, recordWithheldSale } from '../lib/db.js';
import { signDownload } from '../lib/downloadToken.js';
import { productFor, packageFile, packageDeliverable, canonicalSlug, liveFulfilmentWithheld } from '../lib/products.js';
import { stripeOptions } from '../lib/stripe.js';
import { SLUG_TIER, titleFromSlug } from './checkout.js';
import { ORDER_LOCALES, AGENTS_PATH, PRIVACY_PATH, TIER_NAMES, pickOrderLang, ot } from '../lib/orderI18n.js';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const SUPPORT = 'hello@colleagueai.ai';
const mailLink = () => `<a href="mailto:${SUPPORT}">${SUPPORT}</a>`;
const fileCode = (f) => `<code>${esc(f)}</code>`;
const strong = (s) => `<b>${esc(s)}</b>`;

const ICON = {
  tick: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.8V8l2.2 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  alert: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 4.5v4.2M8 11.2v.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.6" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" stroke="currentColor" stroke-width="1.5"/></svg>',
  download: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  doc: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 2.8h5.2L15 6.6v10.6H6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M11 3v4h4M8.4 10.5h4.4M8.4 13.4h4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

/**
 * Page shell in the site's brand. Styles and scripts are files (/order.css, /order.js)
 * because the site CSP blocks inline style and script tags.
 * o: { lang, title, status: 'ok'|'pending'|'warn', eyebrow, heading (HTML), lede (HTML), chips[], body (HTML) }
 */
function page(o) {
  const lang = ORDER_LOCALES.includes(o.lang) ? o.lang : 'en';
  const t = (k, v) => ot(lang, k, v);
  const statusIcon = o.status === 'ok' ? ICON.tick : o.status === 'pending' ? ICON.clock : ICON.alert;
  const hero = `<section class="o-hero"><p class="o-eyebrow o-status ${esc(o.status || '')}"><span class="o-tick">${statusIcon}</span>${esc(o.eyebrow || '')}</p>` +
    `<h1>${o.heading}</h1>` + (o.lede ? `<p class="o-lede">${o.lede}</p>` : '') +
    (o.chips && o.chips.length ? `<div class="o-chips">${o.chips.map((c) => `<span class="o-chip">${c}</span>`).join('')}</div>` : '') +
    `</section>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">` +
    `<title>${esc(o.title)} | ColleagueAI</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
    `<link rel="stylesheet" href="/order.css"><script src="/order.js" defer></script></head><body>` +
    `<header class="o-nav"><div class="o-wrap"><a class="o-logo" href="${lang === 'en' ? '/' : '/' + lang}" aria-label="ColleagueAI">` +
    `<span class="o-logo-text">Colleague<span class="ai">AI</span></span><span class="o-dots" aria-hidden="true"><i></i><i></i><i></i></span></a>` +
    `<span class="o-secure">${ICON.lock}<span>${esc(t('secure'))}</span></span></div></header>` +
    `<main class="o-wrap">${hero}${o.body || ''}` +
    `<section class="o-help"><p>${t('help', { email: mailLink() })}</p>` +
    `<a class="o-btn o-btn-s" href="${AGENTS_PATH[lang]}">&larr; ${esc(t('back'))}</a></section></main>` +
    `<footer class="o-foot"><div class="o-wrap"><span>&copy; ${new Date().getFullYear()} ColleagueAI &middot; ${esc(t('tagline'))}</span>` +
    `<span><a href="/license">${esc(t('licence'))}</a> &middot; <a href="${PRIVACY_PATH[lang]}">${esc(t('privacy'))}</a> &middot; ` +
    `<a href="/contact">${esc(t('contact'))}</a></span></div></footer></body></html>`;
}

/** A simple error/notice page: heading + paragraph inside a card. */
function noticePage(lang, titleKey, hKey, pKey, vars) {
  const t = (k, v) => ot(lang, k, v);
  return page({ lang, title: t(titleKey), status: 'warn', eyebrow: t(titleKey), heading: esc(t(hKey)), lede: t(pKey, vars) });
}

function downloadLink(email, slug, file = 'dossier.pdf') {
  if (process.env.DOWNLOAD_TOKEN_SECRET) {
    return signDownload({ email, slug, file, ttlSeconds: 900 }).path;
  }
  const qs = new URLSearchParams({ email, slug, file });
  return `/api/download?${qs.toString()}`;
}

function codeBlock(label, value, lang) {
  return `<div class="o-code"><code><span class="lbl">${esc(label)}</span>${esc(value)}</code>` +
    `<button type="button" class="o-copy" data-copy="${esc(value)}" data-copied="${esc(ot(lang, 'copied'))}">${esc(ot(lang, 'copy'))}</button></div>`;
}

/** Display names for a slug: product record first, else the catalogue title. */
export function productNames(slug) {
  const product = productFor(slug);
  const short = product?.name ? product.name.replace(/^ColleagueAI\s+/, '') : (slug ? titleFromSlug(slug) : '');
  return { product, short, name: product?.name || (short ? `ColleagueAI ${short}` : '') };
}

/** Download block for a paid order: the released package when the product has one, else the dossier. */
export function deliveryHtml(email, slug, lang = 'en') {
  if (!ORDER_LOCALES.includes(lang)) lang = 'en';
  const t = (k, v) => ot(lang, k, v);
  const { product, short, name } = productNames(slug);
  const pkg = packageFile(slug);
  const tierCode = product?.tier || SLUG_TIER[slug];
  const tierName = tierCode && TIER_NAMES[lang][tierCode];
  const tier = tierCode ? `<span class="o-tier">CAI ${esc(tierCode)}${tierName ? ' &middot; ' + esc(tierName) : ''}</span>` : '';
  const title = esc(short || t('your_agent'));
  const note = `<p class="o-note">${ICON.clock}${esc(t('note_links'))}</p>`;
  const dossierBtn = (label) => `<a class="o-btn o-btn-s" href="${esc(downloadLink(email, slug, 'dossier.pdf'))}">${ICON.doc}${esc(label)}</a>`;

  if (!pkg) {
    return `<section class="o-grid o-single"><article class="o-card">${tier}<h2>${title}</h2>` +
      `<div class="o-actions"><a class="o-btn o-btn-p" href="${esc(downloadLink(email, slug))}">${ICON.download}${esc(t('btn_doc'))}</a></div>` +
      `${note}</article></section>`;
  }
  const rel = product.release || {};
  if (!packageDeliverable(slug)) {
    return `<section class="o-grid o-single"><article class="o-card">${tier}<h2>${title}</h2>` +
      `<p class="o-text">${t('nd', { version: esc(rel.version || ''), product: esc(name), email: mailLink() })}</p>` +
      `<div class="o-actions">${dossierBtn(t('btn_dossier_pdf'))}</div></article></section>`;
  }

  const facts = [];
  if (product.sku) facts.push([t('f_sku'), product.sku]);
  facts.push([t('f_version'), rel.version || ''], [t('f_package'), pkg]);
  const factsHtml = `<dl class="o-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

  const sha = rel.sha256 && /^[a-f0-9]{64}$/i.test(rel.sha256) ? rel.sha256.toLowerCase() : null;
  const verify = sha
    ? `<aside class="o-card o-dark"><p class="o-eyebrow">${esc(t('v_eyebrow'))}</p><h3>${esc(t('v_h'))}</h3><p>${esc(t('v_p'))}</p>` +
      codeBlock('SHA-256', sha, lang) + codeBlock(t('v_win'), `certutil -hashfile ${pkg} SHA256`, lang) +
      `<p class="o-small">${esc(t('v_mac'))} shasum -a 256 ${esc(pkg)}</p></aside>`
    : `<aside class="o-card o-dark"><p class="o-eyebrow">${esc(t('alt_eyebrow'))}</p><h3>${esc(t('alt_h'))}</h3><p>${esc(t('alt_p'))}</p></aside>`;
  const docsNote = t('docs_en') ? `<p class="o-note">${esc(t('docs_en'))}</p>` : '';

  return `<section class="o-grid"><article class="o-card">${tier}<h2>${title}</h2>${factsHtml}` +
    `<div class="o-actions"><a class="o-btn o-btn-p" href="${esc(downloadLink(email, slug, pkg))}">${ICON.download}${esc(t('btn_pkg'))}</a>` +
    dossierBtn(t('btn_dossier')) + `</div>${note}</article>${verify}</section>` +
    `<section class="o-section"><p class="o-eyebrow">${esc(t('steps_eyebrow'))}</p><h2>${esc(t('steps_h'))}</h2><ol class="o-steps">` +
    `<li><h3>${esc(t('s1_h'))}</h3><p>${t('s1_p', { f: fileCode('START-HERE.pdf') })}</p></li>` +
    `<li><h3>${esc(t('s2_h'))}</h3><p>${t('s2_p', { f: fileCode('INSTALL.md') })}</p></li>` +
    `<li><h3>${esc(t('s3_h'))}</h3><p>${t('s3_p', { f: fileCode('INSTALL.md') })}</p></li>` +
    `</ol>${docsNote}</section>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const q = req.query || {};
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const lang = pickOrderLang(one(q.lang), req.headers?.['accept-language']);
  res.setHeader('Content-Language', lang);
  const t = (k, v) => ot(lang, k, v);
  const sessionId = one(q.session_id);

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).send(noticePage(lang, 't_unavailable', 'off_h', 'off_p',
      { agents: `<a href="${AGENTS_PATH[lang]}">${esc(t('off_link'))}</a>` }));
  }
  if (!sessionId) {
    return res.status(400).send(noticePage(lang, 't_missing', 'missing_h', 'missing_p'));
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, stripeOptions());

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error('[success] retrieve failed:', err && err.message ? err.message : err);
    return res.status(404).send(noticePage(lang, 't_notfound', 'nf_h', 'nf_p', { email: mailLink() }));
  }

  const email = session.customer_details?.email || session.metadata?.email || '';
  // Sessions created before a product rename carry the retired slug; serve them under the current one.
  const slug = canonicalSlug(session.metadata?.agent_slug || '');
  const paid = session.payment_status === 'paid';
  const label = productNames(slug).name || t('your_agent');
  const emailChip = email ? [`${esc(t('chip_email'))} <b>${esc(email)}</b>`] : [];

  if (!paid) {
    return res.status(200).send(page({
      lang, title: t('t_pending'), status: 'pending', eyebrow: t('pend_eyebrow'), heading: t('pend_h'),
      lede: t('pend_lede', { product: strong(label) }), chips: [...emailChip, esc(t('chip_keep'))],
    }));
  }

  if (!email || !slug) {
    return res.status(200).send(page({
      lang, title: t('t_received'), status: 'warn', eyebrow: t('recv_eyebrow'), heading: t('noemail_h'),
      lede: t('noemail_lede', { email: mailLink() }),
    }));
  }

  // Live money for a release not approved for sale is not fulfilled here either, or the redirect
  // would grant what the webhook withholds. Same rule, same record, same notice to the buyer.
  const withheld = liveFulfilmentWithheld(session);
  if (withheld) {
    try {
      await recordWithheldSale({
        sessionId: session.id, slug, reason: withheld,
        amountTotal: session.amount_total ?? null, currency: session.currency ?? null, source: 'success',
      });
    } catch (err) {
      console.error('[success] withheld-sale record failed:', err && err.message ? err.message : err);
    }
    return res.status(200).send(page({
      lang, title: t('t_received'), status: 'warn', eyebrow: t('recv_eyebrow'), heading: t('grant_h'),
      lede: t('grant_lede', { product: strong(label), email: mailLink() }), chips: emailChip,
    }));
  }

  // Self-fulfil: grant the entitlement now (idempotent). Works even if no webhook is set.
  // A refunded or charged-back order is refused here, even though Stripe still reports 'paid'.
  let granted;
  try {
    granted = await grantEntitlement(email, [slug], session.id);
  } catch (err) {
    console.error('[success] grantEntitlement failed:', err && err.message ? err.message : err);
    return res.status(200).send(page({
      lang, title: t('t_received'), status: 'warn', eyebrow: t('recv_eyebrow'), heading: t('grant_h'),
      lede: t('grant_lede', { product: strong(label), email: mailLink() }), chips: emailChip,
    }));
  }

  if (granted?.refused) {
    return res.status(200).send(page({
      lang, title: t('t_refunded'), status: 'warn', eyebrow: t('refunded_eyebrow'), heading: t('refunded_h'),
      lede: t('refunded_lede', { product: strong(label), email: mailLink() }), chips: emailChip,
    }));
  }

  return res.status(200).send(page({
    lang, title: t('t_thanks'), status: 'ok', eyebrow: t('paid_eyebrow'), heading: t('paid_h'),
    lede: t(packageFile(slug) ? 'paid_lede_pkg' : 'paid_lede_doc', { product: strong(label) }),
    chips: emailChip, body: deliveryHtml(email, slug, lang),
  }));
}
