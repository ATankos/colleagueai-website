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
import { grantEntitlement } from '../lib/db.js';
import { signDownload } from '../lib/downloadToken.js';
import { productFor, packageFile, packageDeliverable, canonicalSlug } from '../lib/products.js';
import { SLUG_TIER, titleFromSlug } from './checkout.js';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const TIER_NAMES = { L2: 'Draft', L3: 'Operate', L4: 'Decide (supervised)', L5: 'Autonomous' };

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
 * opts: { title, status: 'ok'|'pending'|'warn', eyebrow, heading (HTML), lede (HTML), chips[], body (HTML) }
 */
function page(titleOrOpts, legacyBody) {
  const o = typeof titleOrOpts === 'string'
    ? { title: titleOrOpts, status: 'warn', body: `<div class="o-card o-solo">${legacyBody}</div>` }
    : titleOrOpts;
  const statusIcon = o.status === 'ok' ? ICON.tick : o.status === 'pending' ? ICON.clock : ICON.alert;
  const hero = o.heading
    ? `<section class="o-hero"><p class="o-eyebrow o-status ${esc(o.status || '')}"><span class="o-tick">${statusIcon}</span>${esc(o.eyebrow || '')}</p>` +
      `<h1>${o.heading}</h1>` + (o.lede ? `<p class="o-lede">${o.lede}</p>` : '') +
      (o.chips && o.chips.length ? `<div class="o-chips">${o.chips.map((c) => `<span class="o-chip">${c}</span>`).join('')}</div>` : '') +
      `</section>`
    : '<section class="o-hero"></section>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">` +
    `<title>${esc(o.title)} | ColleagueAI</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
    `<link rel="stylesheet" href="/order.css"><script src="/order.js" defer></script></head><body>` +
    `<header class="o-nav"><div class="o-wrap"><a class="o-logo" href="/" aria-label="ColleagueAI home">` +
    `<span class="o-logo-text">Colleague<span class="ai">AI</span></span><span class="o-dots" aria-hidden="true"><i></i><i></i><i></i></span></a>` +
    `<span class="o-secure">${ICON.lock}<span>Secure order</span></span></div></header>` +
    `<main class="o-wrap">${hero}${o.body || ''}` +
    `<section class="o-help"><p><b>Questions about your order or installation?</b> Write to ` +
    `<a href="mailto:hello@colleagueai.ai">hello@colleagueai.ai</a> and quote your order email.</p>` +
    `<a class="o-btn o-btn-s" href="/agents">&larr; Back to agents</a></section></main>` +
    `<footer class="o-foot"><div class="o-wrap"><span>&copy; ${new Date().getFullYear()} ColleagueAI &middot; Governed AI agents for enterprise operations</span>` +
    `<span><a href="/license">Licence</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/contact">Contact</a></span></div></footer>` +
    `</body></html>`;
}

function downloadLink(email, slug, file = 'dossier.pdf') {
  if (process.env.DOWNLOAD_TOKEN_SECRET) {
    return signDownload({ email, slug, file, ttlSeconds: 900 }).path;
  }
  const qs = new URLSearchParams({ email, slug, file });
  return `/api/download?${qs.toString()}`;
}

function codeBlock(label, value) {
  return `<div class="o-code"><code><span class="lbl">${esc(label)}</span>${esc(value)}</code>` +
    `<button type="button" class="o-copy" data-copy="${esc(value)}">Copy</button></div>`;
}

/** Download block for a paid order: the released package when the product has one, else the dossier. */
export function deliveryHtml(email, slug) {
  const product = productFor(slug);
  const pkg = packageFile(slug);
  // Agents without a product record still get their catalogue name and CAI tier.
  const short = product?.name ? product.name.replace(/^ColleagueAI\s+/, '') : titleFromSlug(slug || 'agent');
  const name = product?.name || `ColleagueAI ${short}`;
  const tierCode = product?.tier || SLUG_TIER[slug];
  const tier = tierCode ? `<span class="o-tier">CAI ${esc(tierCode)}${TIER_NAMES[tierCode] ? ' &middot; ' + esc(TIER_NAMES[tierCode]) : ''}</span>` : '';
  const dossierBtn = (label) => `<a class="o-btn o-btn-s" href="${esc(downloadLink(email, slug, 'dossier.pdf'))}">${ICON.doc}${label}</a>`;

  if (!pkg) {
    return `<section class="o-grid o-single"><article class="o-card">${tier}<h2>${esc(short)}</h2>` +
      `<div class="o-actions"><a class="o-btn o-btn-p" href="${esc(downloadLink(email, slug))}">${ICON.download}Download agent dossier</a></div>` +
      `<p class="o-note">${ICON.clock}Links are valid for 15 minutes. Reopen this page any time for fresh ones.</p></article></section>`;
  }
  const rel = product.release || {};
  if (!packageDeliverable(slug)) {
    return `<section class="o-grid"><article class="o-card">${tier}<h2>${esc(short)}</h2>` +
      `<p class="o-text">Release ${esc(rel.version || '')} of ${esc(name)} is in controlled testing and is not yet available for download. ` +
      `Your purchase is recorded; we will contact you about delivery, or write to hello@colleagueai.ai.</p>` +
      `<div class="o-actions">${dossierBtn('Product dossier (PDF)')}</div></article></section>`;
  }

  const facts = [];
  if (product.sku) facts.push(['SKU', product.sku]);
  facts.push(['Version', rel.version || ''], ['Package', pkg]);
  const factsHtml = `<dl class="o-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

  const sha = rel.sha256 && /^[a-f0-9]{64}$/i.test(rel.sha256) ? rel.sha256.toLowerCase() : null;
  const verify = sha
    ? `<aside class="o-card o-dark"><p class="o-eyebrow">Verify before you install</p><h3>Check the file fingerprint</h3>` +
      `<p>Run the command on the downloaded file. The result must match this SHA-256 exactly; if it does not, do not install it and contact us.</p>` +
      codeBlock('SHA-256', sha) + codeBlock('Windows (PowerShell or CMD)', `certutil -hashfile ${pkg} SHA256`) +
      `<p class="o-small">macOS / Linux: shasum -a 256 ${esc(pkg)}</p></aside>`
    : `<aside class="o-card o-dark"><p class="o-eyebrow">Inside the package</p><h3>Start with START-HERE</h3>` +
      `<p>It lists the prerequisites and who does what before anything is installed.</p></aside>`;

  return `<section class="o-grid"><article class="o-card">${tier}<h2>${esc(short)}</h2>${factsHtml}` +
    `<div class="o-actions"><a class="o-btn o-btn-p" href="${esc(downloadLink(email, slug, pkg))}">${ICON.download}Download package</a>` +
    dossierBtn('Product dossier') + `</div>` +
    `<p class="o-note">${ICON.clock}Links are valid for 15 minutes. Reopen this page any time for fresh ones.</p></article>${verify}</section>` +
    `<section class="o-section"><p class="o-eyebrow">What happens next</p><h2>Three steps to a governed rollout</h2><ol class="o-steps">` +
    `<li><h3>Read START-HERE</h3><p>Open <code>START-HERE.pdf</code> in the package first. It explains the prerequisites, including Microsoft Copilot Studio capacity, and who does what.</p></li>` +
    `<li><h3>Install with your IT admin</h3><p>Your Power Platform administrator imports the managed solution into your own environment, following <code>INSTALL.md</code>.</p></li>` +
    `<li><h3>Run the post-import checks</h3><p>Complete the checks in <code>INSTALL.md</code> &sect;5, including the mandatory access check, before anyone uses the agent.</p></li>` +
    `</ol></section>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const sessionId = Array.isArray(req.query.session_id) ? req.query.session_id[0] : req.query.session_id;

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).send(page('Not available', '<h2>Checkout is not enabled</h2><p>Online purchase is not currently available. Please request access on the <a href="/agents">agents page</a>.</p>'));
  }
  if (!sessionId) {
    return res.status(400).send(page('Missing order', '<h2>Missing order</h2><p>There is no checkout session in this link. Please use the link from your order confirmation.</p>'));
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error('[success] retrieve failed:', err && err.message ? err.message : err);
    return res.status(404).send(page('Order not found', '<h2>Order not found</h2><p>We could not find this checkout session. If you have paid, write to hello@colleagueai.ai and we will sort it out.</p>'));
  }

  const email = session.customer_details?.email || session.metadata?.email || '';
  // Sessions created before a product rename carry the retired slug; serve them under the current one.
  const slug = canonicalSlug(session.metadata?.agent_slug || '');
  const paid = session.payment_status === 'paid';
  const label = productFor(slug)?.name || (slug ? `ColleagueAI ${titleFromSlug(slug)}` : 'your agent');
  const emailChip = email ? [`Order email <b>${esc(email)}</b>`] : [];

  if (!paid) {
    return res.status(200).send(page({
      title: 'Payment pending', status: 'pending', eyebrow: 'Order received · awaiting transfer',
      heading: 'Almost there. <em>Your transfer is on its way.</em>',
      lede: `Your order for <b>${esc(label)}</b> is recorded. Bank transfers take a few working days to arrive. ` +
        `Once yours clears, reopen this same page and your download will be here.`,
      chips: [...emailChip, 'Keep this link'],
    }));
  }

  if (!email || !slug) {
    return res.status(200).send(page({
      title: 'Payment received', status: 'warn', eyebrow: 'Payment received',
      heading: 'Thank you. <em>We will send your package.</em>',
      lede: 'Your payment went through, but we could not attach a download automatically. Write to hello@colleagueai.ai and we will send it over.',
    }));
  }

  // Self-fulfil: grant the entitlement now (idempotent). Works even if no webhook is set.
  try {
    await grantEntitlement(email, [slug], session.id);
  } catch (err) {
    console.error('[success] grantEntitlement failed:', err && err.message ? err.message : err);
    return res.status(200).send(page({
      title: 'Payment received', status: 'warn', eyebrow: 'Payment received',
      heading: 'Thank you. <em>One more step on our side.</em>',
      lede: `Your payment for <b>${esc(label)}</b> succeeded, but we could not enable your download just now. ` +
        `Write to hello@colleagueai.ai and we will sort it out.`,
      chips: emailChip,
    }));
  }

  return res.status(200).send(page({
    title: 'Thank you', status: 'ok', eyebrow: 'Payment confirmed',
    heading: 'Your agent is <em>ready.</em>',
    lede: `Thank you. Payment for <b>${esc(label)}</b> succeeded. ` +
      (packageFile(slug) ? 'Download your package below and verify it before installing.' : 'Your download is below.'),
    chips: emailChip,
    body: deliveryHtml(email, slug),
  }));
}
