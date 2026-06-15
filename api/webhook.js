/**
 * api/webhook.js - Stripe webhook handler
 *
 * Listens for checkout.session.completed events.
 * On success: writes an entitlement record keyed by customer email.
 */

import Stripe from 'stripe';
import {
  grantEntitlement,
  recordCommission,
  claimEvent,
  claimSession,
  releaseClaims,
  getPartnerStats,
} from '../lib/db.js';

const COMMISSION_RATE = parseFloat(process.env.PARTNER_COMMISSION_RATE ?? '0.20');

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const missing = missingStripeConfig();

  if (missing.length > 0) {
    console.error('[webhook] Missing Stripe configuration:', missing.join(', '));
    return res.status(500).json({
      error: 'Webhook configuration error',
      missing,
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-04-10',
  });

  let rawBody;

  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('[webhook] Failed to read raw body:', err);
    return res.status(400).json({ error: 'Could not read webhook body' });
  }

  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).json({
      error: 'Webhook signature error: missing stripe-signature header',
    });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).json({
      error: `Webhook signature error: ${err.message}`,
    });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      if (!await claimEvent(event.id)) {
        return res.status(200).json({ received: true, duplicate: 'event' });
      }

      if (!await claimSession(session.id)) {
        return res.status(200).json({ received: true, duplicate: 'session' });
      }
    } catch (err) {
      console.error('[webhook] Idempotency check failed:', err);
      return res.status(500).json({ error: 'KV unavailable' });
    }

    const email = session.customer_details?.email ?? session.metadata?.email;

    if (!email) {
      console.warn('[webhook] No email on session:', session.id);
      return res.status(200).json({ received: true, warning: 'No email found' });
    }

    const slugs = session.metadata?.agent_slug
      ? [session.metadata.agent_slug]
      : ['*'];

    try {
      const entitlement = await grantEntitlement(email, slugs, session.id);
      console.log('[webhook] Entitlement granted:', entitlement);
    } catch (err) {
      console.error('[webhook] Failed to write entitlement:', err);
      await releaseClaims(event.id, session.id);
      return res.status(500).json({ error: 'Entitlement write failed' });
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
        return res.status(200).json({
          received: true,
          commission: 'withheld-unregistered',
        });
      }

      const amountGross = session.amount_total ?? 0;

      try {
        const commission = await recordCommission({
          code: partnerCode,
          amountGross,
          commissionRate: COMMISSION_RATE,
          stripeSessionId: session.id,
        });

        console.log('[webhook] Partner commission recorded:', commission);
      } catch (err) {
        console.error('[webhook] Failed to record partner commission:', err);
        await releaseClaims(event.id, session.id);
        return res.status(500).json({ error: 'Commission write failed' });
      }
    }
  }

  return res.status(200).json({ received: true });
}
