/**
 * lib/stripe.js - Stripe client options shared by the handlers that read or verify Stripe data.
 *
 * STRIPE_API_HOST is a test-only hook: the local test suites point it at an in-process fake
 * so no call leaves the machine. It is never set in production.
 */
export function stripeOptions() {
  const opts = { apiVersion: '2024-04-10' };
  if (process.env.STRIPE_API_HOST) {
    const u = new URL(process.env.STRIPE_API_HOST);
    opts.host = u.hostname;
    if (u.port) opts.port = Number(u.port);
    opts.protocol = u.protocol.replace(':', '');
  }
  return opts;
}
