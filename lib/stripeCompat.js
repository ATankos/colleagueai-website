/**
 * lib/stripeCompat.js - reads the Stripe fields that moved when the API changed shape.
 *
 * Stripe 2025-03-31.basil moved a subscription's billing period onto each subscription item
 * (items.data[].current_period_end) and moved an invoice's subscription reference under
 * parent.subscription_details.subscription. Our own API calls use the version in lib/stripe.js, but a
 * webhook endpoint keeps the API version it was created with, so the same event can arrive in either
 * shape. Every reader here accepts both. Upgrade notes:
 * https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
 * https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects
 */

const idOf = (ref) => {
  if (typeof ref === 'string') return ref || null;
  return typeof ref?.id === 'string' && ref.id ? ref.id : null;
};

/** The subscription's current period end (unix seconds), or null. */
export function subscriptionPeriodEnd(sub) {
  if (!sub || typeof sub !== 'object') return null;
  if (typeof sub.current_period_end === 'number') return sub.current_period_end; // legacy top-level field
  const ends = (sub.items?.data ?? [])
    .map((item) => item?.current_period_end)
    .filter((v) => typeof v === 'number');
  // Items can carry different periods; the earliest is the date the subscription next has to be paid.
  return ends.length ? Math.min(...ends) : null;
}

/** The subscription id an invoice belongs to, or null for a one-off invoice. */
export function invoiceSubscriptionId(inv) {
  if (!inv || typeof inv !== 'object') return null;
  if (inv.subscription) return idOf(inv.subscription); // legacy top-level field
  if (inv.parent?.type === 'subscription_details') return idOf(inv.parent.subscription_details?.subscription);
  return null;
}

/** The period end of the subscription line on an invoice (unix seconds), or null. */
export function invoiceSubscriptionPeriodEnd(inv) {
  const lines = inv?.lines?.data ?? [];
  // Identify the subscription line by what it is, not by position: the first invoice of a checkout
  // also carries the one-time agent price.
  const line = lines.find((l) => l?.type === 'subscription' || l?.parent?.type === 'subscription_item_details')
    ?? lines[0];
  const end = line?.period?.end ?? inv?.period_end;
  return typeof end === 'number' ? end : null;
}
