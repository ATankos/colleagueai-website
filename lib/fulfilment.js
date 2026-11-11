/**
 * lib/fulfilment.js - the checks a paid Checkout Session must pass before anything is granted, shared by the webhook
 * (api/webhook.js) and the thank-you page (api/success.js) so neither can grant what the other would refuse.
 *
 * A session is checked against the order record written at the confirmation step (lib/orders.js):
 *   - the order exists (a live session must name one; a test session created before order ids is still accepted),
 *   - it is the same session, in the same mode (live or test), for the same product,
 *   - the SKU is the product's SKU and the release is one of its releases,
 *   - the currency and the amount before tax (amount_subtotal) are the price the order recorded. Tax and discounts
 *     cannot hide a wrong price: tax is added on top of amount_subtotal, and promotion codes are switched off.
 * A session that fails is withheld (no licence, no download) and recorded for a manual decision; nothing is refunded
 * automatically.
 *
 * paidFacts() turns the session into the facts stored on the order: amounts, billing country, the business name and
 * tax IDs Stripe collected, the PaymentIntent.
 */
import { canonicalSlug, productFor, productReleases, liveFulfilmentWithheld } from './products.js';
import { policyFor, policyActive, liveTaxBlocked } from './taxPolicy.js';
import { sessionTaxIds } from './taxIds.js';
import { isOrderId } from './orders.js';

const idOf = (ref) => (typeof ref === 'string' ? ref : ref?.id) || null;

/**
 * { ok: true, legacy } or { ok: false, reason }. `order` is the record the session names (null when it names none
 * or the record is missing).
 */
export function verifyPurchase(session, order) {
  const orderId = session?.metadata?.order_id;
  const live = session?.livemode === true;
  if (!orderId) {
    // Sessions created before order ids existed were test-mode only (live sales have never been open).
    return live ? { ok: false, reason: 'no-order-record' } : { ok: true, legacy: true };
  }
  if (!isOrderId(orderId)) return { ok: false, reason: 'bad-order-id' };
  if (!order) return { ok: false, reason: 'order-not-found' };
  if (order.id !== orderId) return { ok: false, reason: 'order-mismatch' };
  if ((order.mode === 'live') !== live) return { ok: false, reason: 'mode-mismatch' };
  if (order.stripe?.sessionId && order.stripe.sessionId !== session.id) return { ok: false, reason: 'session-mismatch' };

  const slug = canonicalSlug(session.metadata?.agent_slug || '');
  if (slug !== order.product?.slug) return { ok: false, reason: 'product-mismatch' };
  const product = productFor(slug);
  if (!product) return { ok: false, reason: 'product-unknown' };
  if ((session.metadata?.sku ?? null) !== (product.sku ?? null) || order.product.sku !== (product.sku ?? null)) {
    return { ok: false, reason: 'sku-mismatch' };
  }
  const release = session.metadata?.release ?? null;
  if (release !== order.product.release || !productReleases(product).some((r) => r.version === release)) {
    return { ok: false, reason: 'release-mismatch' };
  }
  if (String(session.currency || '').toLowerCase() !== order.price?.currency) return { ok: false, reason: 'currency-mismatch' };
  const expected = (order.price?.unitAmount ?? 0) * (order.price?.quantity ?? 1);
  // Subscription mode (certification, off today) bills the licence plus the first period: its subtotal is larger.
  const certPart = order.certification?.unitAmount ?? 0;
  if (typeof session.amount_subtotal !== 'number') return { ok: false, reason: 'amount-unknown' };
  if (session.amount_subtotal !== expected + certPart) return { ok: false, reason: 'amount-mismatch' };
  return { ok: true, legacy: false };
}

/** Facts about the payment, for the order record. */
export function paidFacts(session, now = new Date()) {
  const d = session?.customer_details || {};
  return {
    paidAt: now.toISOString(),
    currency: session?.currency ?? null,
    amountSubtotal: session?.amount_subtotal ?? null,
    amountTax: session?.total_details?.amount_tax ?? null,
    amountTotal: session?.amount_total ?? null,
    billingCountry: d.address?.country ?? null,
    billingName: d.business_name || d.name || null,
    purchaseEmail: d.email ?? null,
    taxIds: sessionTaxIds(session),
  };
}

/** Stripe ids to keep on the order. */
export function stripeIds(session) {
  return {
    sessionId: session?.id ?? null,
    paymentIntentId: idOf(session?.payment_intent),
    customerId: idOf(session?.customer),
    invoiceId: idOf(session?.invoice),
  };
}

/** True when the billing country Stripe collected differs from the country the buyer declared. */
export function billingCountryDiffers(order, session) {
  const billing = session?.customer_details?.address?.country;
  return Boolean(billing && order?.buyer?.country && billing.toUpperCase() !== order.buyer.country.toUpperCase());
}

/**
 * Why this paid session must not be fulfilled, or null when it may. One rule for the webhook and the thank-you page:
 * the purchase checks above, the live sale and tax gates, and - when the approved tax policy says so - a billing
 * country that differs from the country the buyer declared (held for a manual check).
 */
export function withheldReason(session, order, stripeKey = process.env.STRIPE_SECRET_KEY) {
  const live = liveFulfilmentWithheld(session);
  if (live) return live;
  const check = verifyPurchase(session, order);
  if (!check.ok) return check.reason;
  if (session?.livemode === true && liveTaxBlocked(stripeKey)) return 'tax-policy-not-approved';
  if (order && billingCountryDiffers(order, session)) {
    const policy = policyFor(stripeKey);
    if (policyActive(policy, stripeKey) && policy.checkout?.onCountryMismatch === 'hold') return 'billing-country-mismatch';
  }
  return null;
}
