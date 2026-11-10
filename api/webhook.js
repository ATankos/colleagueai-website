/**
 * api/webhook.js - Stripe webhook handler
 *
 * Fulfilment:
 *   - Card / Apple/Google Pay / Link (instant): checkout.session.completed arrives with
 *     payment_status = 'paid'  -> grant access now.
 *   - Bank transfer (delayed): checkout.session.completed arrives 'unpaid' (buyer got wire
 *     instructions) -> wait. Access is granted on checkout.session.async_payment_succeeded.
 *   - Refund / dispute -> reverse commission and revoke entitlement.
 *   - Dispute won -> restore commission and entitlement, unless the same purchase was refunded.
 *   - Live money for a release not approved for sale -> withheld and recorded (sale-withheld:<session>)
 *     for a manual refund. Nothing is granted, and nothing is refunded automatically.
 *
 * Access = an entitlement record in KV keyed by the buyer's email; the file itself is
 * released by api/download.js (R2) once the buyer opens the /api/success page.
 */

import Stripe from 'stripe';
import {
  grantEntitlement,
  restoreEntitlement,
  recordWithheldSale,
  recordCommission,
  reverseCommission,
  restoreCommission,
  revokeEntitlement,
  claimEvent,
  claimSession,
  sessionAlreadyFulfilled,
  releaseClaims,
  getPartnerStats,
  issueCertification,
  renewCertification,
  markCertificationPastDue,
  lapseCertification,
  getCertificationBySubscription,
  bindAcceptance,
} from '../lib/db.js';
import { liveFulfilmentWithheld, liveRestoreRefused } from '../lib/products.js';
import { stripeOptions } from '../lib/stripe.js';
import { invoiceSubscriptionId, invoiceSubscriptionPeriodEnd, subscriptionPeriodEnd } from '../lib/stripeCompat.js';

const COMMISSION_RATE = parseFloat(process.env.PARTNER_COMMISSION_RATE ?? '0.10');

export const config = { api: { bodyParser: false } };

/**
 * Resolve the Checkout Session behind a charge event.
 *
 * A live `charge.refunded` / `charge.dispute.*` event has no
 * checkout_session_id in its metadata (the session id does not exist yet when
 * checkout.js sets payment_intent_data.metadata), and event payloads carry
 * payment_intent as a bare id string. Without this lookup every refund and
 * dispute short-circuited to "no-session-reference": commissions were never
 * reversed and entitlements never revoked. Metadata paths are kept first so a
 * manually-tagged charge still resolves without an API call.
 */
async function sessionForCharge(stripe, obj) {
  const direct =
    obj.metadata?.checkout_session_id ||
    obj.payment_intent?.metadata?.checkout_session_id ||
    obj.metadata?.session_id ||
    null;
  if (direct) return { sessionId: direct, session: null };

  const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
  if (!pi) return { sessionId: null, session: null };

  try {
    const list = await stripe.checkout.sessions.list({ payment_intent: pi, limit: 1 });
    const session = list?.data?.[0] ?? null;
    if (!session) console.warn('[webhook] No checkout session found for payment_intent:', pi);
    return { sessionId: session?.id ?? null, session };
  } catch (err) {
    console.error('[webhook] Session lookup by payment_intent failed:', err?.message ?? err);
    return { sessionId: null, session: null, lookupFailed: true };
  }
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function missingStripeConfig() {
  const missing = [];
  if (!process.env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
  if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET');
  return missing;
}

/**
 * Grant entitlement (+ partner commission) for a PAID session.
 * Idempotent: claimSession ensures a given session is only fulfilled once, even if both
 * checkout.session.completed and async_payment_succeeded arrive.
 * Throws on a KV write failure so the caller can return 500 and let Stripe retry.
 */
async function fulfillSession(session, eventId) {
  // Live money unlocks only a release approved for sale (liveFulfilmentWithheld). The check runs
  // before claimSession, so a withheld session leaves no fulfilment claim behind. The owner refunds
  // it by hand, from the record written here. A session that already fulfilled (a re-delivery, or a
  // purchase completed before the rule) is not a new sale, so it is not withheld.
  const withheld = liveFulfilmentWithheld(session);
  const buyer = session.customer_details?.email ?? session.metadata?.email;
  if (withheld && !(await sessionAlreadyFulfilled(buyer, session.id, session.metadata?.agent_slug))) {
    try {
      await recordWithheldSale({
        sessionId: session.id, slug: session.metadata?.agent_slug ?? null, reason: withheld,
        amountTotal: session.amount_total ?? null, currency: session.currency ?? null,
        source: 'webhook', eventId,
      });
    } catch (err) {
      await releaseClaims(eventId, session.id);
      throw new Error('Withheld-sale record write failed');
    }
    return { withheld };
  }

  if (!(await claimSession(session.id))) return { duplicate: 'session' };

  const email = session.customer_details?.email ?? session.metadata?.email;
  if (!email) {
    console.warn('[webhook] No email on session:', session.id);
    return { warning: 'no-email' };
  }

  const slug = session.metadata?.agent_slug;
  if (!slug) {
    console.warn('[webhook] No agent_slug on session - entitlement withheld:', session.id);
    return { warning: 'agent_slug-missing' };
  }

  try {
    const entitlement = await grantEntitlement(email, [slug], session.id);
    /* Ids only: the stored record holds the buyer's email, and runtime logs are not the place for it. The
     * session id finds the order in the Stripe dashboard (as in recordWithheldSale). grantEntitlement
     * refuses a session that was already refunded or disputed and returns the old record with `refused`
     * set, so say so instead of claiming a grant that did not happen. */
    if (entitlement?.refused) {
      console.warn('[webhook] Entitlement not granted (%s): session %s, %s, event %s', entitlement.refused, session.id, slug, eventId);
    } else {
      console.log('[webhook] Entitlement granted: session %s, %s, event %s', session.id, slug, eventId);
    }
  } catch (err) {
    console.error('[webhook] Failed to write entitlement:', err);
    await releaseClaims(eventId, session.id);
    throw new Error('Entitlement write failed');
  }

  /* Close the evidence loop: the acceptance record written at the confirmation step now learns which
   * buyer email the paid session belongs to and when it was fulfilled. Best effort: the session metadata
   * already names the acceptance id, so a missed bind loses a convenience, not the evidence. */
  const acceptanceId = session.metadata?.acceptance_id;
  if (acceptanceId) {
    try {
      const bound = await bindAcceptance(acceptanceId, { stripeSessionId: session.id, buyerEmail: email, fulfilledAt: new Date().toISOString() });
      if (!bound) console.warn('[webhook] acceptance %s referenced by session %s not found', acceptanceId, session.id);
    } catch (err) {
      console.warn('[webhook] acceptance bind skipped:', err?.message ?? err);
    }
  } else {
    console.warn('[webhook] session %s carries no acceptance_id (pre-confirmation-step link?)', session.id);
  }

  /* Continuous Certification, when the session was a subscription. The licence
   * above is perpetual; this only records that the purchased version is currently
   * a Colleague AI Certified Release. A failure here must NOT fail the whole
   * fulfilment - the customer has paid for and received their agent either way. */
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;
  if (subscriptionId) {
    try {
      const cert = await issueCertification({
        email, slug, tier: session.metadata?.tier,
        subscriptionId,
        currentPeriodEnd: subscriptionPeriodEnd(session.subscription),
      });
      console.log('[webhook] Certification issued:', cert?.certificateId);
    } catch (err) {
      console.error('[webhook] Certification issue failed (licence unaffected):', err?.message ?? err);
    }
  }

  const rawCode = session.metadata?.partner ?? '';
  const partnerCode = /^[A-Za-z0-9_-]{1,64}$/.test(rawCode) ? rawCode : null;
  if (rawCode && !partnerCode) {
    console.warn('[webhook] Dropped malformed partner ref on session', session.id);
  }

  if (partnerCode) {
    const partner = await getPartnerStats(partnerCode).catch(() => null);
    if (!partner) {
      console.warn('[webhook] Unregistered partner code, commission withheld:', partnerCode, session.id);
      return { commission: 'withheld-unregistered' };
    }

    const amountGross = session.amount_total ?? 0;
    try {
      const commission = await recordCommission({
        code: partnerCode,
        amountGross,
        commissionRate: COMMISSION_RATE,
        stripeSessionId: session.id,
        currency: (session.currency || 'eur').toUpperCase(),
      });
      if (commission && commission.withheld) {
        console.warn('[webhook] Commission withheld:', commission.withheld, partnerCode, session.id);
        return { commission: commission.withheld };
      }
      console.log('[webhook] Partner commission recorded:', commission);
    } catch (err) {
      console.error('[webhook] Failed to record partner commission:', err);
      await releaseClaims(eventId, session.id);
      throw new Error('Commission write failed');
    }
  }

  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const missing = missingStripeConfig();
  if (missing.length > 0) {
    console.error('[webhook] Missing Stripe configuration:', missing.join(', '));
    return res.status(503).json({ error: 'Webhook is not enabled' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, stripeOptions());

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('[webhook] Failed to read raw body:', err);
    return res.status(400).json({ error: 'Could not read webhook body' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Webhook signature error: missing stripe-signature header' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  // ---- Fulfilment: instant (card) now, or when a delayed transfer clears ----
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object;

    try {
      if (!(await claimEvent(event.id))) {
        return res.status(200).json({ received: true, duplicate: 'event' });
      }
    } catch (err) {
      console.error('[webhook] Idempotency check failed:', err);
      return res.status(500).json({ error: 'KV unavailable' });
    }

    // On completed, only a PAID session fulfils now. Unpaid = pending bank transfer -> wait.
    if (event.type === 'checkout.session.completed' && session.payment_status === 'unpaid') {
      console.log('[webhook] Pending payment (delayed method), awaiting clearance:', session.id, session.payment_status);
      return res.status(200).json({ received: true, status: 'pending' });
    }

    try {
      const result = await fulfillSession(session, event.id);
      return res.status(200).json({ received: true, ...result });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Fulfilment failed' });
    }
  }

  /* ---- Continuous Certification lifecycle ----
   * The agent licence is perpetual and is never touched here: these events only
   * move the certificate between active / past_due / lapsed. Every branch answers
   * 200 even when no certificate exists, because a subscription created outside
   * this flow (or an invoice for something else) is not an error we can retry away. */
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const inv = event.data.object || {};
    const subId = invoiceSubscriptionId(inv);
    if (!subId) return res.status(200).json({ received: true, certification: 'no-subscription' });

    try {
      if (event.type === 'invoice.paid') {
        const cert = await renewCertification(subId, invoiceSubscriptionPeriodEnd(inv));
        return res.status(200).json({ received: true, certification: cert ? 'renewed' : 'no-certificate' });
      }
      // A failed payment is not yet a lapse - Stripe keeps retrying, and the
      // customer keeps their certified status until the subscription actually ends.
      const cert = await markCertificationPastDue(subId);
      return res.status(200).json({ received: true, certification: cert ? 'past_due' : 'no-certificate' });
    } catch (err) {
      console.error('[webhook] Certification update failed:', err?.message ?? err);
      return res.status(500).json({ error: 'Certification write failed' });
    }
  }

  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object || {};
    const dead = event.type === 'customer.subscription.deleted' ||
      ['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status);

    try {
      if (dead) {
        const cert = await lapseCertification(sub.id, sub.status || 'cancelled');
        if (cert) console.log('[webhook] Certification lapsed (licence unaffected):', cert.certificateId);
        return res.status(200).json({ received: true, certification: cert ? 'lapsed' : 'no-certificate' });
      }
      if (sub.status === 'active') {
        const cert = await renewCertification(sub.id, subscriptionPeriodEnd(sub));
        return res.status(200).json({ received: true, certification: cert ? 'active' : 'no-certificate' });
      }
      const existing = await getCertificationBySubscription(sub.id);
      return res.status(200).json({ received: true, certification: existing?.status ?? 'no-certificate' });
    } catch (err) {
      console.error('[webhook] Certification lifecycle write failed:', err?.message ?? err);
      return res.status(500).json({ error: 'Certification write failed' });
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object;
    console.warn('[webhook] Bank transfer failed for session:', session.id);
    return res.status(200).json({ received: true, status: 'payment_failed' });
  }

  /* Money going back out. Stripe can send several of these for one charge and
   * the ledger helpers are idempotent, so duplicates are safe. A partial refund
   * reverses only that share of the commission; a dispute won in our favour
   * restores what dispute.created took away. */
  if (
    event.type === 'charge.refunded' ||
    event.type === 'charge.dispute.created' ||
    event.type === 'charge.dispute.closed'
  ) {
    const obj = event.data.object || {};
    const { sessionId, session, lookupFailed } = await sessionForCharge(stripe, obj);

    if (!sessionId) {
      if (lookupFailed) {
        // Transient Stripe API failure: 500 so Stripe retries the event rather
        // than the reversal being dropped forever.
        return res.status(500).json({ error: 'Session lookup failed' });
      }
      console.warn('[webhook] %s without a session reference; ledger untouched', event.type);
      return res.status(200).json({ received: true, commission: 'no-session-reference' });
    }

    // Who bought what: the charge's own copy first, then the resolved session. Charge metadata
    // inherits from the PaymentIntent (agent_slug, tier); the session fallback means access is never
    // skipped just because a processor omitted the copy.
    const email = obj.billing_details?.email || obj.metadata?.email ||
      session?.customer_details?.email || session?.metadata?.email || null;
    const slug = obj.metadata?.agent_slug || session?.metadata?.agent_slug || null;

    try {
      if (event.type === 'charge.dispute.closed') {
        if (obj.status === 'won') {
          const restored = await restoreCommission(sessionId, 'dispute-won');
          // The buyer gets the agent back too, unless the same purchase was refunded or it was a live
          // sale of a release with a record that is not approved (liveRestoreRefused). restoreEntitlement
          // applies the refund rule itself.
          let access = 'no-purchase-identifiers';
          if (email && slug && liveRestoreRefused(slug, obj.livemode === true)) {
            access = 'not-approved-for-sale';
          } else if (email && slug) {
            const r = await restoreEntitlement(email, [slug], sessionId);
            access = r.restored ? 'restored' : r.reason;
          }
          return res.status(200).json({ received: true, commission: restored.state ?? 'restored', access });
        }
        return res.status(200).json({ received: true, commission: 'dispute-lost-already-reversed' });
      }

      const refunded = event.type === 'charge.refunded' ? (obj.amount_refunded ?? null) : null;
      const result = await reverseCommission(sessionId, event.type, refunded);

      const fullyRefunded = event.type !== 'charge.refunded' || obj.refunded === true ||
        (obj.amount_refunded != null && obj.amount != null && obj.amount_refunded >= obj.amount);
      if (fullyRefunded && email && slug) {
        await revokeEntitlement(email, [slug], sessionId, { refunded: event.type === 'charge.refunded' });
        console.log('[webhook] Entitlement revoked after %s for %s', event.type, sessionId);
      }

      return res.status(200).json({ received: true, commission: result.state ?? result.reason });
    } catch (err) {
      console.error('[webhook] Reversal handling failed:', err);
      return res.status(500).json({ error: 'Reversal write failed' });
    }
  }

  return res.status(200).json({ received: true });
}
