/**
 * lib/orderMail.js - the one e-mail a buyer gets after a confirmed payment: the order number, what was bought, where
 * the documents and the download are, and how to get back to them later.
 *
 * Sent once per order (order.notifications.buyer), after the licence is granted and the documents were attempted, so
 * the mail describes what exists. It carries no attachment and no personal data beyond the buyer's own address: the
 * documents are fetched from the order page, which is reached through the link Stripe gave the buyer (the thank-you
 * URL with the Checkout Session id) and, when recovery is switched on, through /recover with the order e-mail.
 *
 * Without a mail transport (lib/mail.js) nothing is sent and the order records 'not_configured', which the documents
 * summary reports as missing: the owner sees it in the fulfilment check instead of assuming a mail went out.
 */
import { mailConfigured, sendMail } from './mail.js';
import { getOrder, updateOrder } from './orders.js';
import { productFor, releaseOfVersion, canonicalSlug } from './products.js';
import { documentsSummary, writeEvidence } from './orderDocuments.js';

const SUPPORT = 'hello@colleagueai.ai';

/** The text of the notification. Pure, so the wording is tested without a transport. */
export function buyerNotification(order, { baseUrl }) {
  const slug = canonicalSlug(order.product?.slug || '');
  const product = productFor(slug);
  const release = releaseOfVersion(slug, order.product?.release) || product?.release || null;
  const d = order.documents || {};
  const inv = order.invoice || {};
  const orderPage = order.stripe?.sessionId ? `${baseUrl}/api/success?session_id=${encodeURIComponent(order.stripe.sessionId)}&lang=${encodeURIComponent(order.lang || 'en')}` : null;
  const lines = [
    `Thank you for your order with ColleagueAI.`,
    ``,
    `Order number: ${order.id}`,
    `Product: ${order.product?.name || product?.name || slug}${order.product?.sku ? ` (SKU ${order.product.sku})` : ''}`,
    `Release: ${order.product?.release || ''}${release?.package ? ` - package ${release.package}` : ''}`,
    release?.sha256 ? `Package SHA-256: ${release.sha256}` : null,
    `Licence: perpetual, single-tenant, for one Microsoft tenant of ${order.buyer?.company || 'your company'}.`,
    ``,
    `Your documents${orderPage ? ' (on your order page)' : ''}:`,
    `- Licence agreement confirmation${d.agreement?.status === 'issued' ? ` (${d.agreement.reference || 'PDF'})` : ': being prepared; it will appear on your order page'}`,
    inv.status === 'issued' ? `- Invoice ${inv.number || inv.id}${inv.provider === 'sandbox_ledger' ? ' (TEST document - not a tax document)' : ''}` : inv.status === 'not_configured' ? `- Invoice: issued separately by e-mail from ${SUPPORT}` : `- Invoice: follows by e-mail`,
    `- The agreements you accepted, in the versions you accepted (document set ${order.acceptance?.legalSet || ''})`,
    `- Installation guide and readiness checklist (inside the package: START-HERE.pdf and INSTALL.pdf)`,
    `- Security and support: ${SUPPORT} with your order number`,
    ``,
    orderPage ? `Order page and download: ${orderPage}` : `Order page: the link Stripe showed after payment.`,
    `Download links on that page are refreshed each time you open it. If you lose the link, ask for a new one at ${baseUrl}/recover with this e-mail address.`,
    ``,
    `Verify the download: the SHA-256 shown above must match the file you downloaded (INSTALL section 1).`,
    ``,
    `Colleague AI s.r.o., Praha - ${SUPPORT}`,
  ].filter((l) => l !== null);
  return { subject: `ColleagueAI order ${order.id}: licence, documents and download`, text: lines.join('\n') };
}

/**
 * Send the buyer notification once. Returns the order as stored afterwards. Expected failures are recorded
 * (status 'failed' | 'not_configured'), never thrown.
 */
export async function notifyBuyer({ orderId, baseUrl = 'https://www.colleagueai.ai', now = new Date() }) {
  const order = await getOrder(orderId);
  if (!order || !order.facts?.fulfilledAt) return order;
  if (order.notifications?.buyer?.status === 'sent') return order;
  const to = order.buyer?.contact?.email || order.facts?.purchaseEmail || null;
  let record;
  if (!to) {
    record = { status: 'failed', reason: 'no_recipient', at: now.toISOString() };
  } else if (!mailConfigured()) {
    record = { status: 'not_configured', reason: 'mail_not_configured', at: now.toISOString() };
  } else {
    const { subject, text } = buyerNotification(order, { baseUrl });
    try {
      const r = await sendMail({ to, subject, text, replyTo: SUPPORT });
      record = r.sent ? { status: 'sent', at: now.toISOString(), subject } : { status: 'failed', reason: r.reason || 'not_sent', at: now.toISOString() };
    } catch (err) {
      record = { status: 'failed', reason: 'send_failed', detail: String(err?.message || err).slice(0, 120), at: now.toISOString() };
    }
  }
  const stored = await updateOrder(orderId, (o) => {
    if (o.notifications?.buyer?.status === 'sent') return null;
    const next = { ...o, notifications: { ...(o.notifications || {}), buyer: record } };
    if (next.documents) next.documents = { ...next.documents, summary: documentsSummary(next) };
    if (record.status === 'sent') next.events = [...(o.events || []), { id: `notify:${o.id}`, type: 'buyer.notified', at: now.toISOString() }];
    return next;
  });
  // The evidence package records the delivery event (or the fact that no mail went out).
  if (stored) await writeEvidence(stored, now).catch((err) => console.error('[documents] evidence record not written for %s: %s', orderId, err?.message ?? err));
  return stored;
}
