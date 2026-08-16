/**
 * api/checkout.js - Creates a Stripe Checkout Session and redirects the buyer to it.
 *
 * The agents pages link the "Request access" CTA to:
 *   GET /api/checkout?agent=<slug>&ref=<client_reference_id>&partner=<code>&terms=accepted
 * This endpoint turns that into a hosted Stripe Checkout page and 303-redirects there.
 *
 * PRICING BY CAI TIER: each agent's slug maps to its tier (L2/L3/L4); the amount for that
 * tier is read from env. The agent + tier are stored in metadata so api/webhook.js grants
 * the right entitlement after checkout.session.completed (and can revoke on refund/dispute).
 *
 *   AGENT_PRICE_L2_CENTS   e.g. 1200000 = $12,000.00
 *   AGENT_PRICE_L3_CENTS   e.g. 2500000 = $25,000.00
 *   AGENT_PRICE_L4_CENTS   e.g. 4500000 = $45,000.00
 *   AGENT_PRICE_CURRENCY   optional, defaults to "usd"
 *
 * TEST MODE: set STRIPE_SECRET_KEY to your sk_test_... key in Vercel. The key alone decides
 * test vs live - nothing else here changes.
 */

import Stripe from 'stripe';

// slug -> CAI tier. Generated from the catalogue; the agents page derives the identical slug
// (a.n.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-')...) when it builds the CTA.
const SLUG_TIER = {"acceptance-test-script-generator":"L2","campaign-and-project-management-agent":"L2","compliance-and-audit-action-tracker":"L4","content-and-comms-agent":"L2","contract-obligations-review-agent":"L4","contract-summarisation-agent":"L4","cyber-security-reporting-agent":"L3","development-and-career-agent":"L2","due-diligence-data-search-agent":"L3","escalation-triage-agent":"L3","four-eyes-control-assistant":"L4","infrastructure-wiki-agent":"L2","leadership-reporting-agent":"L3","maintenance-event-agent":"L2","monthly-reporting-automation-agent":"L2","onboarding-agent":"L2","operations-procedures-assistant":"L2","people-ops-query-agent":"L2","performance-management-agent":"L3","pipeline-reporting-agent":"L2","power-query-code-generator":"L2","reconciliation-root-cause-agent":"L3","risk-control-oversight-agent":"L4","risk-event-capture-agent":"L3","sales-end-to-end-assistant":"L3","sales-opportunity-agent":"L2","sales-qualification-agent":"L2","security-defect-triage-agent":"L4","service-delivery-manager-copilot":"L3","service-desk-backlog-triage-agent":"L3","service-desk-support-agent":"L3","service-request-automation-agent":"L3","service-review-pack-builder":"L2","signing-summary-agent":"L3","sop-generation-agent":"L2","supplier-meeting-minutes-agent":"L2"};

const CURRENCY = (process.env.AGENT_PRICE_CURRENCY || 'usd').toLowerCase();
const SLUG_RE = /^[a-z][a-z0-9-]{2,60}$/;
const PARTNER_RE = /^[A-Za-z0-9_-]{1,64}$/;

function valueOf(v) { return Array.isArray(v) ? v[0] : v; }

function originOf(req) {
  const proto = valueOf(req.headers['x-forwarded-proto']) || 'https';
  const host = valueOf(req.headers['x-forwarded-host']) || valueOf(req.headers.host);
  return `${proto}://${host}`;
}

function titleFromSlug(slug) {
  return slug.replace(/-/g, ' ').replace(/\band\b/g, '&').replace(/\b\w/g, (c) => c.toUpperCase());
}

function tierPriceCents(tier) {
  const map = {
    L2: process.env.AGENT_PRICE_L2_CENTS,
    L3: process.env.AGENT_PRICE_L3_CENTS,
    L4: process.env.AGENT_PRICE_L4_CENTS,
  };
  const n = parseInt(map[tier] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method not allowed');
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[checkout] STRIPE_SECRET_KEY not set');
    return res.status(500).json({ error: 'Checkout not configured' });
  }

  const q = req.query || {};

  const slug = String(valueOf(q.agent) || '').trim();
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'Invalid or missing agent' });
  }

  const tier = SLUG_TIER[slug];
  if (!tier) {
    return res.status(404).json({ error: 'Unknown agent' });
  }

  // The agents page only enables checkout once the terms box is ticked; enforce it here too.
  if (String(valueOf(q.terms) || '') !== 'accepted') {
    return res.status(400).json({ error: 'Terms not accepted' });
  }

  const cents = tierPriceCents(tier);
  if (!cents) {
    console.error('[checkout] Missing/invalid price for tier', tier);
    return res.status(500).json({ error: 'Price not configured' });
  }

  const ref = (String(valueOf(q.ref) || '').slice(0, 200)) || undefined;

  const partnerRaw = String(valueOf(q.partner) || '').trim();
  const partner = PARTNER_RE.test(partnerRaw) ? partnerRaw : '';

  const metadata = { agent_slug: slug, tier };
  if (partner) metadata.partner = partner;

  const origin = originOf(req);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: cents,
          product_data: {
            name: `ColleagueAI â€” ${titleFromSlug(slug)} (${tier})`,
            metadata: { agent_slug: slug, tier },
          },
        },
      }],
      metadata,
      payment_intent_data: { metadata }, // carry agent_slug + tier onto the charge for refund/dispute revoke
      ...(ref ? { client_reference_id: ref } : {}),
      billing_address_collection: 'auto',
      allow_promotion_codes: false,
      success_url: `${origin}/agents?purchase=success&agent=${encodeURIComponent(slug)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/agents?purchase=cancelled&agent=${encodeURIComponent(slug)}`,
    });

    res.writeHead(303, { Location: session.url });
    return res.end();
  } catch (err) {
    console.error('[checkout] Stripe error:', err && err.message ? err.message : err);
    return res.status(502).json({ error: 'Could not start checkout' });
  }
}
