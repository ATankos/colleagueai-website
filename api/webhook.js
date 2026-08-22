/**
 * api/webhook.js - Stripe webhook handler
 *
 * Fulfilment:
 *   - Card / Apple/Google Pay / Link (instant): checkout.session.completed arrives with
 *     payment_status = 'paid'  -> grant access now.
 *   - Bank transfer (delayed): checkout.session.completed arrives 'unpaid' (buyer got wire
 *     instructions) -> wait. Access is granted on checkout.session.async_payment_succeeded.
 *   - Refund / dispute -> reverse commission and revoke entitlement.
 *
 * Access = an entitlement record in KV keyed by the buyer's email; the file itself is
 * released by api/download.js (R2) once the buyer opens the /api/success page.
 */

import Stripe from 'stripe';
import {
  grantEntitlement,
  recordCommission,
  reverseCommission,
  restoreCommission,
  revokeEntitlement,
  claimEvent,
  claimSession,
  releaseClaims,
  getPartnerStats,
} from '../lib/db.js';

const COMMISSION_RATE = parseFloat(process.env.PARTNER_COMMISSION_RATE ?? '0.10');

export const config = { api: { bodyParser: false } };

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
    console.log('[webhook] Entitlement granted:', entitlement);
  } catch (err) {
    console.error('[webhook] Failed to write entitlement:', err);
    await releaseClaims(eventId, session.id);
    throw new Error('Entitlement write failed');
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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

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
    const sessionId =
      obj.metadata?.checkout_session_id ||
      obj.payment_intent?.metadata?.checkout_session_id ||
      obj.metadata?.session_id ||
      null;

    if (!sessionId) {
      console.warn('[webhook] %s without a session reference; ledger untouched', event.type);
      return res.status(200).json({ received: true, commission: 'no-session-reference' });
    }

    try {
      if (event.type === 'charge.dispute.closed') {
        if (obj.status === 'won') {
          const restored = await restoreCommission(sessionId, 'dispute-won');
          return res.status(200).json({ received: true, commission: restored.state ?? 'restored' });
        }
        return res.status(200).json({ received: true, commission: 'dispute-lost-already-reversed' });
      }

      const refunded = event.type === 'charge.refunded' ? (obj.amount_refunded ?? null) : null;
      const result = await reverseCommission(sessionId, event.type, refunded);

      const fullyRefunded = event.type !== 'charge.refunded' || obj.refunded === true ||
        (obj.amount_refunded != null && obj.amount != null && obj.amount_refunded >= obj.amount);
      const email = obj.billing_details?.email || obj.metadata?.email || null;
      const slug = obj.metadata?.agent_slug || null;
      if (fullyRefunded && email && slug) {
        await revokeEntitlement(email, [slug], sessionId);
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
