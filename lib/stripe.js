/**
 * lib/stripe.js - Stripe client options shared by the handlers that read or verify Stripe data.
 *
 * STRIPE_API_VERSION is the version the installed stripe SDK is built against (its own default,
 * node_modules/stripe/cjs/apiVersion.js). tests/stripe-api-compat.test.mjs fails if the two drift, so an
 * SDK upgrade is a deliberate change. Subscription periods and invoice subscription references changed
 * shape after the old pin (2024-04-10); lib/stripeCompat.js reads both shapes, because a webhook endpoint
 * keeps the API version it was created with, set in the Dashboard.
 *
 * STRIPE_API_HOST is a test-only hook: the local test suites point it at an in-process fake
 * so no call leaves the machine. It is never set in production.
 */
// 2026-11-18.endive (stripe 23.2.0): additive within Endive; all 20 GA changes are non-breaking per the Stripe
// changelog (Connect accounts v1/v2, Accounts v2 payment capabilities, refund attribution, Payment Links capture
// method, portal cancellation messages). None touches Checkout Sessions, subscriptions or invoices as used here.
export const STRIPE_API_VERSION = '2026-11-18.endive';

export function stripeOptions() {
  const opts = { apiVersion: STRIPE_API_VERSION };
  if (process.env.STRIPE_API_HOST) {
    const u = new URL(process.env.STRIPE_API_HOST);
    opts.host = u.hostname;
    if (u.port) opts.port = Number(u.port);
    opts.protocol = u.protocol.replace(':', '');
  }
  return opts;
}
