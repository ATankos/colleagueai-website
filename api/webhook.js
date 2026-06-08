/**
 * api/webhook.js — Stripe webhook handler
 *
 * Listens for checkout.session.completed events.
 * On success: writes an entitlement record keyed by customer email.
 *
 * Required env vars (set in Vercel project settings, never in code):
 *   STRIPE_SECRET_KEY       — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET   — whsec_... (from Stripe Dashboard → Webhooks)
 *
 * Stripe Dashboard setup:
 *   1. Dashboard → Developers → Webhooks → Add endpoint
 *   2. Endpoint URL: https://www.colleagueai.ai/api/webhook
 *   3. Events to listen for: checkout.session.completed
 *   4. Copy the signing secret → paste into STRIPE_WEBHOOK_SECRET env var
 */

import Stripe from 'stripe';
import { grantEntitlement } from '../lib/db.js';

export const config = { api: { bodyParser: false } };  // Stripe needs raw body

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email ?? session.metadata?.email;

    if (!email) {
      console.warn('[webhook] No email on session:', session.id);
      return res.status(200).json({ received: true, warning: 'No email found' });
    }

    // Derive slug from metadata set on the Stripe Payment Link or Checkout Session.
    // In your Stripe Payment Link settings → Metadata, add: agent_slug = "all" (or a specific slug)
    const slugs = session.metadata?.agent_slug
      ? [session.metadata.agent_slug]
      : ['*']; // '*' = access to all agents

    try {
      const entitlement = await grantEntitlement(email, slugs, session.id);
      console.log('[webhook] Entitlement granted:', entitlement);
    } catch (err) {
      console.error('[webhook] Failed to write entitlement:', err);
      // Still return 200 — Stripe will retry on non-2xx. Log and investigate.
      return res.status(200).json({ received: true, warning: 'Entitlement write failed — check logs' });
    }
  }

  res.status(200).json({ received: true });
}
