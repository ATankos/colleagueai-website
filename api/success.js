/**
 * api/success.js - Post-payment "thank you" + download page.
 *
 * success_url points here: GET /api/success?session_id=cs_...
 * - Retrieves the Checkout Session from Stripe.
 * - If paid: mints a signed, time-limited download link (via lib/downloadToken.js) and
 *   shows a Download button. api/download.js re-checks the entitlement (KV) + signature (R2).
 * - If a bank transfer is still pending: shows a "come back once it clears" message; the
 *   buyer can reopen this same URL later and the download will appear.
 *
 * Needs STRIPE_SECRET_KEY and DOWNLOAD_TOKEN_SECRET.
 */

import Stripe from 'stripe';
import { signDownload } from '../lib/downloadToken.js';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Arial,sans-serif;background:#FBF8F2;color:#22211F;margin:0;padding:48px 20px;display:flex;justify-content:center}` +
    `.card{max-width:520px;width:100%;background:#fff;border:1px solid #E7E0D5;border-radius:16px;padding:32px}` +
    `h1{font-size:22px;margin:0 0 12px}p{line-height:1.55;color:#4A453E}` +
    `.btn{display:inline-block;margin-top:16px;background:#c65d3a;color:#fff;text-decoration:none;padding:14px 22px;border-radius:100px;font-weight:700}` +
    `.muted{color:#8A8478;font-size:13px;margin-top:18px}a.home{color:#8A8478;font-size:13px}</style></head>` +
    `<body><div class="card">${body}<p class="muted"><a class="home" href="/agents">&larr; Back to agents</a></p></div></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const sessionId = Array.isArray(req.query.session_id) ? req.query.session_id[0] : req.query.session_id;

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).send(page('Not configured', '<h1>Checkout not configured</h1><p>Missing Stripe key.</p>'));
  }
  if (!sessionId) {
    return res.status(400).send(page('Missing order', '<h1>Missing order</h1><p>No checkout session id in the link.</p>'));
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error('[success] retrieve failed:', err && err.message ? err.message : err);
    return res.status(404).send(page('Order not found', '<h1>Order not found</h1><p>We could not find this checkout session.</p>'));
  }

  const email = session.customer_details?.email || session.metadata?.email || '';
  const slug = session.metadata?.agent_slug || '';
  const paid = session.payment_status === 'paid';

  if (!paid) {
    return res.status(200).send(page('Payment pending', `<h1>Order received - awaiting your bank transfer</h1>` +
      `<p>Thanks! Your order for <b>${esc(slug)}</b> is recorded. Bank transfers take a few days to arrive. ` +
      `Once your transfer clears, reopen this same page and your download will be here.</p>` +
      `<p class="muted">Keep this link. Your order email is ${esc(email)}.</p>`));
  }

  if (!email || !slug) {
    return res.status(200).send(page('Payment received', '<h1>Payment received</h1>' +
      '<p>Thanks! We could not attach a download automatically - please email hello@colleagueai.ai and we will send it over.</p>'));
  }

  let link;
  try {
    if (!process.env.DOWNLOAD_TOKEN_SECRET) throw new Error('DOWNLOAD_TOKEN_SECRET not set');
    const t = signDownload({ email, slug, file: 'dossier.pdf', ttlSeconds: 900 });
    link = t.path; // /api/download?email=...&slug=...&exp=...&sig=...
  } catch (err) {
    console.error('[success] signDownload failed:', err && err.message ? err.message : err);
    return res.status(200).send(page('Thank you', `<h1>Thank you!</h1>` +
      `<p>Your payment for <b>${esc(slug)}</b> succeeded, but the download link is not ready. ` +
      `Please email hello@colleagueai.ai and we will send it right over.</p>`));
  }

  return res.status(200).send(page('Thank you', `<h1>Thank you - your agent is ready</h1>` +
    `<p>Payment for <b>${esc(slug)}</b> succeeded. Download your package below ` +
    `(link valid for 15 minutes; you can always reopen this page).</p>` +
    `<a class="btn" href="${esc(link)}">Download agent package</a>` +
    `<p class="muted">Order email: ${esc(email)}.</p>`));
}
