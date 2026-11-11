/**
 * lib/fulfilmentCheck.js - does every paid Checkout Session have the order state and the licence it should?
 *
 * The webhook grants the licence and the thank-you page grants it again (idempotently), so a buyer who pays is served
 * even when one of them fails. Both can still miss: Stripe stops retrying a webhook after about three days, and a
 * buyer may never reopen the thank-you link. This check closes that gap after the fact. It compares each completed
 * Checkout Session with the order record and the buyer's entitlement and lists every session whose state does not
 * match what the payment says, for a person to act on. It changes nothing.
 *
 * Problem codes (one row per session, worst first):
 *   withheld_for_review     paid, held by the purchase checks; a person must decide (lib/fulfilment.js)
 *   paid_not_licensed       paid, not refunded or disputed, but the buyer holds no licence for the product
 *   order_missing           the session names an order id that has no record
 *   order_not_updated       the licence is there but the order never learned of the payment (no paidAt)
 *   revoked_still_licensed  the order is refunded or under dispute, yet the licence is still held for this session
 *   awaiting_payment        bank transfer not yet received (informational, not a problem)
 * A session in the expected state produces no row.
 */
import { orderStatus } from './orders.js';
import { canonicalSlug } from './products.js';

const REVOKED = new Set(['refunded', 'disputed', 'dispute_lost']);
const SEVERITY = ['withheld_for_review', 'paid_not_licensed', 'order_missing', 'revoked_still_licensed', 'order_not_updated', 'awaiting_payment'];

const emailOf = (s) => (s?.customer_details?.email || s?.metadata?.email || '').toLowerCase() || null;

/** True when this entitlement record currently licenses `slug` through `sessionId` (or, for records written before
 * per-purchase tracking, holds the slug at all). */
function licensedBy(ent, slug, sessionId) {
  if (!ent || !Array.isArray(ent.slugs) || !ent.slugs.map(canonicalSlug).includes(slug)) return false;
  if ((ent.revokedSessionIds ?? []).includes(sessionId)) return false;
  const bySession = ent.sessionSlugs;
  if (bySession && typeof bySession === 'object' && Object.keys(bySession).length) {
    return Array.isArray(bySession[sessionId]) && bySession[sessionId].map(canonicalSlug).includes(slug);
  }
  return true;
}

/**
 * @param sessions      completed Checkout Sessions (status 'complete'), as Stripe returns them
 * @param orders        Map or object: orderId -> order record (or null when missing)
 * @param entitlements  Map or object: lower-case email -> entitlement record (or null)
 * @param withheld      Map or object: sessionId -> withheld-sale record (or null)
 * @returns { checked, rows: [{ session, orderId, email, slug, status, problem, detail }], problems }
 */
export function checkFulfilment({ sessions, orders = {}, entitlements = {}, withheld = {} }) {
  const get = (m, k) => (k == null ? null : (m instanceof Map ? m.get(k) : m?.[k]) ?? null);
  const rows = [];
  let checked = 0;
  for (const s of sessions) {
    if (s?.status !== 'complete') continue;
    checked += 1;
    const orderId = s.metadata?.order_id || null;
    const email = emailOf(s);
    const slug = canonicalSlug(s.metadata?.agent_slug || '') || null;
    const order = get(orders, orderId);
    const status = order ? orderStatus(order) : null;
    const ent = get(entitlements, email);
    const held = get(withheld, s.id);
    const licensed = slug ? licensedBy(ent, slug, s.id) : false;
    const row = (problem, detail) => rows.push({ session: s.id, orderId, email, slug, status, problem, detail });

    if (s.payment_status === 'unpaid') {
      // Delayed method (bank transfer) not yet received: nothing may be granted.
      if (licensed) row('revoked_still_licensed', 'a licence is held although the transfer has not arrived');
      else row('awaiting_payment', 'bank transfer not yet received');
      continue;
    }
    if (held || status === 'withheld') { row('withheld_for_review', held?.reason || order?.facts?.withheld || 'withheld'); continue; }
    if (orderId && !order) { row('order_missing', `no record for ${orderId}`); continue; }
    if (status && REVOKED.has(status)) {
      if (licensed) row('revoked_still_licensed', `order is ${status}`);
      continue;
    }
    if (!licensed) { row('paid_not_licensed', ent ? 'licence record does not cover this purchase' : 'no licence record for this email'); continue; }
    if (order && !order.facts?.paidAt) row('order_not_updated', 'licence granted, payment not recorded on the order');
  }
  rows.sort((a, b) => SEVERITY.indexOf(a.problem) - SEVERITY.indexOf(b.problem));
  return { checked, rows, problems: rows.filter((r) => r.problem !== 'awaiting_payment').length };
}

/** CSV of the rows, for the accountant or the operator. */
export function fulfilmentCsv({ rows }) {
  const head = ['problem', 'session', 'order_id', 'order_status', 'email', 'product', 'detail'];
  const q = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [head.join(','), ...rows.map((r) => [r.problem, r.session, r.orderId, r.status, r.email, r.slug, r.detail].map(q).join(','))].join('\n') + '\n';
}
