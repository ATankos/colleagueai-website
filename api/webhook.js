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
 *
 * Orders (lib/orders.js): every session names its order (metadata.order_id). Before anything is granted the session
 * is checked against the order - product, SKU, release, currency and amount before tax (lib/fulfilment.js) - and a
 * session that fails is withheld for a manual decision. Each event's facts (paid, refunded, disputed, expired, failed,
 * VAT ID verified ...) are recorded on the order once, whatever order the events arrive in. The invoice follows the
 * tax policy recorded on the order at checkout (lib/invoicing.js): a failure to create it is retried by Stripe (the
 * event claim is released; the session stays fulfilled once), and a refund of an invoiced order gets a credit note.
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
  recordPendingIssuance,
  retryPendingIssuances,
  retryEvidenceRepairs,
  markCertificationPastDue,
  lapseCertification,
  holdCertificationForDispute,
  resolveCertificationDispute,
  getCertificationBySubscription,
  bindAcceptance,
  releaseEventClaim,
} from '../lib/db.js';
import { getOrder, updateOrder, recordOrderEvent, orderIdOf } from '../lib/orders.js';
import { withheldReason, paidFacts, stripeIds, billingCountryDiffers } from '../lib/fulfilment.js';
import { ensureInvoice, ensureCreditNote, stripeInvoiceSection } from '../lib/invoicing.js';
import { classifyBuyer, policyFor } from '../lib/taxPolicy.js';
import { taxPointOf } from '../lib/invoicePdf.js';
import { cnbConversion } from '../lib/cnbRate.js';
import { liveRestoreRefused, productFor, canonicalSlug } from '../lib/products.js';
import { releaseVersionForSession } from '../lib/releaseAccess.js';
import { stripeOptions } from '../lib/stripe.js';
import { invoiceSubscriptionId, invoiceSubscriptionPeriodEnd, subscriptionPeriodEnd } from '../lib/stripeCompat.js';
import { ensureOrderDocuments } from '../lib/orderDocuments.js';
import { notifyBuyer } from '../lib/orderMail.js';
import { publicBaseUrl } from '../lib/recovery.js';
import { mailConfigured, sendMail } from '../lib/mail.js';

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
    let session = list?.data?.[0] ?? null;
    /* A subscription-mode Checkout Session (licence + Continuous Certification) has no payment_intent of its
     * own: its first charge is paid through the subscription's first invoice. Resolve it the way the pinned
     * API version models that link: payment intent -> invoice payment -> invoice -> subscription -> session.
     * Without this, refunding such a purchase reversed nothing and left the subscription billing. */
    if (!session) session = await sessionForInvoiceCharge(stripe, pi);
    if (!session) console.warn('[webhook] No checkout session found for payment_intent:', pi);
    return { sessionId: session?.id ?? null, session };
  } catch (err) {
    console.error('[webhook] Session lookup by payment_intent failed:', err?.message ?? err);
    return { sessionId: null, session: null, lookupFailed: true };
  }
}

async function sessionForInvoiceCharge(stripe, pi) {
  const payments = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: pi }, limit: 1 });
  const invoiceRef = payments?.data?.[0]?.invoice;
  const invoiceId = typeof invoiceRef === 'string' ? invoiceRef : invoiceRef?.id;
  if (!invoiceId) return null;
  const invoice = typeof invoiceRef === 'object' && invoiceRef?.parent ? invoiceRef : await stripe.invoices.retrieve(invoiceId);
  // Only the subscription's FIRST invoice is the purchase; a refunded renewal is a certification matter only.
  if (invoice?.billing_reason && invoice.billing_reason !== 'subscription_create') return null;
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return null;
  const sessions = await stripe.checkout.sessions.list({ subscription: subId, limit: 1 });
  return sessions?.data?.[0] ?? null;
}

/** Cancel the subscription now (no proration, no further invoices) and lapse its certificate. Idempotent. */
async function endCertificationForRefund(stripe, subId, sessionId) {
  try {
    await stripe.subscriptions.cancel(subId, { invoice_now: false, prorate: false });
  } catch (err) {
    // Already cancelled is fine; anything else must surface so Stripe retries the event.
    if (!/canceled|No such subscription|resource_missing/i.test(String(err?.message ?? err) + String(err?.code ?? ''))) throw err;
  }
  const cert = await lapseCertification(subId, 'refunded');
  console.log('[webhook] Certification ended after refund of %s (subscription %s)', sessionId, subId);
  return cert ? 'lapsed' : 'subscription-cancelled';
}

/* Founder decision (27 Nov 2026) on payment disputes:
 *   - an INQUIRY (Stripe status warning_*) is a preliminary question from the card issuer, no money is withdrawn: it takes
 *     no automatic action on the perpetual licence, the certificate claim or the partner commission. It is recorded on the
 *     order and the operator is notified to investigate;
 *   - a FORMAL CHARGEBACK (any other open status, from charge.dispute.created or an inquiry escalated through
 *     charge.dispute.updated) suspends the affected commercial entitlements, subject to the contractual terms;
 *   - a dispute WON (or an inquiry closed, or a prevented dispute) restores what was suspended;
 *   - a dispute LOST on a subscription charge ends that certification and cancels future billing;
 *   - a dispute on a subscription RENEWAL charge never touches the separately paid perpetual licence (a renewal charge has
 *     no Checkout Session, so the licence path below is never reached for it). */
const isInquiry = (status) => typeof status === 'string' && status.startsWith('warning_');
const OPEN_CHARGEBACK = new Set(['needs_response', 'under_review']);
function disputePhase(eventType, status) {
  if (eventType === 'charge.dispute.closed') return 'closed';
  if (isInquiry(status)) return eventType === 'charge.dispute.created' ? 'inquiry' : 'ignore'; // notify once, on creation
  if (eventType === 'charge.dispute.created') return 'chargeback';
  if (eventType === 'charge.dispute.updated' && OPEN_CHARGEBACK.has(status)) return 'chargeback'; // an escalated inquiry
  return 'ignore'; // other updates: the closed event carries the outcome
}

/** Tell the operator about an inquiry. Log always; email only when OPS_ALERT_EMAIL and the transport are configured.
 *  Ids only, never the buyer's address. Never fails the event. */
async function notifyOperatorOfInquiry({ disputeId, orderId, subscriptionId, reason, amount, currency }) {
  const facts = { disputeId: disputeId ?? null, orderId: orderId ?? null, subscriptionId: subscriptionId ?? null, reason: reason ?? null, amount: amount ?? null, currency: currency ?? null };
  console.warn('[webhook] payment inquiry received; no automatic action, investigate: %s', JSON.stringify(facts));
  const to = process.env.OPS_ALERT_EMAIL;
  if (!to || !mailConfigured()) return 'logged';
  try {
    const sent = await sendMail({ to, subject: `[ColleagueAI] Payment inquiry ${facts.disputeId ?? ''} needs a response`,
      text: ['A card issuer opened a payment inquiry (no chargeback yet). Nothing was revoked or suspended.', '',
        ...Object.entries(facts).map(([k, v]) => `${k}: ${v ?? '-'}`), '',
        'Respond in the Stripe dashboard before the inquiry deadline. An unanswered inquiry can escalate to a chargeback.'].join('\n') });
    return sent?.sent === false ? 'logged' : 'notified';
  } catch (err) {
    console.error('[webhook] inquiry notification failed:', err?.message ?? err);
    return 'logged';
  }
}

/* Dispute outcomes that leave the money with us: a won dispute, a closed inquiry (no chargeback) and a prevented one. */
const DISPUTE_RESOLVED_FOR_US = new Set(['won', 'warning_closed', 'prevented']);

/** The Continuous Certification subscription a disputed charge belongs to, or null (a one-time purchase). The purchase
 *  charge resolves through its Checkout Session; a renewal charge (no session) through its invoice. */
async function subscriptionForDispute(stripe, obj, session, sessionId) {
  const ref = session?.subscription;
  const fromSession = typeof ref === 'string' ? ref : ref?.id;
  if (fromSession) return { subId: fromSession };
  // A resolved purchase without a subscription is a one-time licence: nothing to suspend, and no extra API call.
  if (session || sessionId) return { subId: null };
  const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
  if (!pi) return { subId: null };
  try {
    const payments = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: pi }, limit: 1 });
    const invoiceRef = payments?.data?.[0]?.invoice;
    const invoiceId = typeof invoiceRef === 'string' ? invoiceRef : invoiceRef?.id;
    if (!invoiceId) return { subId: null };
    const invoice = typeof invoiceRef === 'object' && invoiceRef?.parent ? invoiceRef : await stripe.invoices.retrieve(invoiceId);
    return { subId: invoiceSubscriptionId(invoice) ?? null };
  } catch (err) {
    console.error('[webhook] Subscription lookup for dispute failed:', err?.message ?? err);
    return { subId: null, lookupFailed: true };
  }
}

/** Payment axis only (founder decision, Round 3): an open dispute suspends the subscription benefit and the active claim;
 *  a dispute resolved for us lifts that suspension; a lost dispute ends the certification and stops further billing.
 *  Never touches the technical decision (axis 3). */
async function certificationForDispute(stripe, eventType, obj, subId) {
  if (eventType === 'charge.dispute.created') {
    const r = await holdCertificationForDispute(subId, { disputeId: obj.id ?? null });
    return r.held ? 'on-hold' : (r.reason ?? 'hold-recorded');
  }
  if (DISPUTE_RESOLVED_FOR_US.has(obj.status)) return (await resolveCertificationDispute(subId, { disputeId: obj.id ?? null, outcome: 'won' })).state;
  if (obj.status === 'lost') {
    try {
      await stripe.subscriptions.cancel(subId, { invoice_now: false, prorate: false });
    } catch (err) {
      if (!/canceled|No such subscription|resource_missing/i.test(String(err?.message ?? err) + String(err?.code ?? ''))) throw err;
    }
    return (await resolveCertificationDispute(subId, { disputeId: obj.id ?? null, outcome: 'lost' })).state;
  }
  return 'unchanged';
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

class InvoiceFailure extends Error {}

/**
 * The documentation package and the buyer's notification (lib/orderDocuments.js, lib/orderMail.js), after the licence
 * and the invoice. Never fails the event: a licence rightly granted is not undone by a PDF problem. Whatever is
 * missing is recorded on the order, logged as an alert, and listed by the fulfilment check until it is complete.
 */
async function documentationStep(orderId, { notify = true } = {}) {
  if (!orderId) return null;
  try {
    const baseUrl = publicBaseUrl();
    let order = await ensureOrderDocuments({ orderId, baseUrl });
    if (notify) order = (await notifyBuyer({ orderId, baseUrl })) || order;
    const summary = order?.documents?.summary ?? null;
    if (summary && !summary.complete) console.error('[ALERT] order %s documentation incomplete: %s', orderId, summary.missing.join(', '));
    return summary;
  } catch (err) {
    console.error('[ALERT] documentation step failed for order %s: %s', orderId, err?.message ?? err);
    return { complete: false, missing: ['documentation_step_error'] };
  }
}

/**
 * The CZK conversion for a company-ledger invoice, when the approved policy decides it (T8). null when undecided, for
 * a CZK sale, or when ČNB cannot be read: the invoice is then issued without a conversion line and says so, never with
 * a guessed rate.
 */
async function czkConversionFor(order, route) {
  if (route !== 'company_ledger') return null;
  const policy = policyFor(process.env.STRIPE_SECRET_KEY);
  if (policy?.checkout?.czkConversion !== 'cnb_daily_rate_on_tax_point') return null;
  const currency = order.facts?.currency ?? order.price?.currency;
  if (!currency || String(currency).toLowerCase() === 'czk') return null;
  const date = taxPointOf(order.facts).date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  try {
    return await cnbConversion({ amountMinor: order.facts?.amountTotal ?? order.price?.unitAmount, currency, date });
  } catch (err) {
    console.error('[ALERT] CZK conversion not available for order %s: %s', order.id, err?.message ?? err);
    return null;
  }
}

/** Create or record the order's invoice, once, by the route the order was sold under. */
async function ensureOrderInvoice(orderId, session, stripe) {
  const order = await getOrder(orderId);
  if (!order) return null;
  const route = order.tax?.invoiceRoute ?? null;
  if (order.invoice?.status === 'issued') return order.invoice;
  const section = await ensureInvoice({ route, order, session, stripe, conversion: await czkConversionFor(order, route) });
  await updateOrder(orderId, (o) => (o.invoice?.status === 'issued' ? null : { ...o, invoice: section }));
  if (section.status === 'failed') {
    console.error('[ALERT] invoice not created for order %s (%s, %s); Stripe will retry the event', orderId, section.provider, section.reason);
  }
  return section;
}

/**
 * Grant entitlement (+ partner commission) for a PAID session.
 * Idempotent: claimSession ensures a given session is only fulfilled once, even if both
 * checkout.session.completed and async_payment_succeeded arrive. The order facts and the invoice are brought up to
 * date on every delivery, so a retry after a failed invoice completes it without granting twice.
 * Throws on a KV write failure so the caller can return 500 and let Stripe retry.
 */
async function fulfillSession(session, eventId, stripe) {
  const orderId = orderIdOf(session);
  const order = orderId ? await getOrder(orderId) : null;

  // Live money unlocks only a release approved for sale, and any session must match the order it names (product,
  // SKU, release, currency, amount before tax). The check runs before claimSession, so a withheld session leaves no
  // fulfilment claim behind. The owner decides it by hand, from the record written here. A session that already
  // fulfilled (a re-delivery, or a purchase completed before the rule) is not a new sale, so it is not withheld.
  const withheld = withheldReason(session, order);
  const buyer = session.customer_details?.email ?? session.metadata?.email;
  if (withheld && !(await sessionAlreadyFulfilled(buyer, session.id, session.metadata?.agent_slug))) {
    try {
      await recordWithheldSale({
        sessionId: session.id, orderId, slug: session.metadata?.agent_slug ?? null, reason: withheld,
        amountTotal: session.amount_total ?? null, currency: session.currency ?? null,
        source: 'webhook', eventId, livemode: session.livemode === true,
      });
      if (order) {
        await recordOrderEvent(orderId, { sourceId: `withheld:${session.id}`, type: 'fulfilment.withheld',
          facts: { ...paidFacts(session), withheld: { reason: withheld, at: new Date().toISOString() } }, set: { stripe: stripeIds(session) } });
      }
    } catch (err) {
      await releaseClaims(eventId, session.id);
      throw new Error('Withheld-sale record write failed');
    }
    return { withheld };
  }

  const result = await grantForSession(session, eventId, stripe);

  if (order) {
    try {
      await recordOrderEvent(orderId, { sourceId: `paid:${session.id}`, type: 'payment.confirmed',
        facts: { ...paidFacts(session), countryMismatch: billingCountryDiffers(order, session) }, set: { stripe: stripeIds(session) } });
      if (result.granted) {
        await recordOrderEvent(orderId, { sourceId: `fulfilled:${session.id}`, type: 'licence.granted', facts: { fulfilledAt: new Date().toISOString() } });
      } else if (result.refused) {
        await recordOrderEvent(orderId, { sourceId: `refused:${session.id}`, type: 'licence.refused', facts: { grantRefused: result.refused } });
      }
    } catch (err) {
      console.error('[webhook] order record update failed:', err?.message ?? err);
      await releaseEventClaim(eventId);
      throw new Error('Order record write failed');
    }
    let invoice;
    try {
      invoice = await ensureOrderInvoice(orderId, session, stripe);
    } catch (err) {
      console.error('[webhook] invoice step failed:', err?.message ?? err);
      invoice = { status: 'failed' };
    }
    if (invoice?.status === 'failed') {
      await releaseEventClaim(eventId);
      throw new InvoiceFailure('Invoice creation failed');
    }
    const documents = await documentationStep(orderId);
    return { ...result.response, order: orderId, invoice: invoice?.status ?? null, documents };
  }
  return result.response;
}

/** The entitlement, acceptance, certification and commission steps, once per session. */
/** Eligible net perpetual-licence revenue of a session, in minor units: the one-time (non-recurring) lines, after
 *  discounts and before tax. A payment-mode session holds only the licence; a subscription-mode one also holds the first
 *  Continuous Certification period, which earns no commission. Throws when the lines cannot be read (the event retries). */
export async function licenceNetRevenue(stripe, session) {
  if (session.mode !== 'subscription') {
    return Math.max(0, (session.amount_total ?? 0) - (session.total_details?.amount_tax ?? 0));
  }
  const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  return (lines?.data ?? [])
    .filter((l) => !l.price?.recurring)
    .reduce((sum, l) => sum + Math.max(0, (l.amount_total ?? 0) - (l.amount_tax ?? 0)), 0);
}

async function grantForSession(session, eventId, stripe) {
  if (!(await claimSession(session.id))) return { response: { duplicate: 'session' } };

  const email = session.customer_details?.email ?? session.metadata?.email;
  if (!email) {
    console.warn('[webhook] No email on session:', session.id);
    return { response: { warning: 'no-email' } };
  }

  const slug = session.metadata?.agent_slug;
  if (!slug) {
    console.warn('[webhook] No agent_slug on session - entitlement withheld:', session.id);
    return { response: { warning: 'agent_slug-missing' } };
  }

  let refused = null;
  try {
    const entitlement = await grantEntitlement(email, [slug], session.id, { release: releaseVersionForSession(session, productFor(canonicalSlug(slug))) });
    /* Ids only: the stored record holds the buyer's email, and runtime logs are not the place for it. The
     * session id finds the order in the Stripe dashboard (as in recordWithheldSale). grantEntitlement
     * refuses a session that was already refunded or disputed and returns the old record with `refused`
     * set, so say so instead of claiming a grant that did not happen. */
    if (entitlement?.refused) {
      refused = entitlement.refused;
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
  if (subscriptionId && refused) {
    // A purchase that was already refunded or charged back must not mint a certificate: a late or repeated checkout event
    // arriving after the refund used to issue an "active" certificate for a subscription that had ended.
    console.warn('[webhook] Certification not issued (%s): session %s', refused, session.id);
  } else if (subscriptionId) {
    const issuance = {
      email, slug, tier: session.metadata?.tier,
      subscriptionId,
      currentPeriodEnd: subscriptionPeriodEnd(session.subscription),
      // The release this purchase bought is the one the certificate names (it used to default to "1.0").
      certifiedVersion: releaseVersionForSession(session, productFor(canonicalSlug(slug))),
    };
    try {
      const cert = await issueCertification(issuance);
      console.log('[webhook] Certification issued:', cert?.certificateId ?? cert?.reason);
    } catch (err) {
      // The licence is already granted, so the fulfilment stands; but the issuance must not be forgotten. It is stored with
      // everything needed to repeat it and retried (retryPendingIssuances, scripts/certification-reconcile.mjs). If it cannot
      // even be stored the store is down: fail the event so Stripe delivers it again.
      console.error('[webhook] Certification issue failed, queued for retry (licence unaffected):', err?.message ?? err);
      try {
        await recordPendingIssuance(issuance, err);
      } catch (queueErr) {
        console.error('[webhook] Certification issue could not be queued:', queueErr?.message ?? queueErr);
        await releaseClaims(eventId, session.id);
        throw new Error('Certification issue failed and could not be queued');
      }
    }
  }

  const granted = !refused;
  const rawCode = session.metadata?.partner ?? '';
  const partnerCode = /^[A-Za-z0-9_-]{1,64}$/.test(rawCode) ? rawCode : null;
  if (rawCode && !partnerCode) {
    console.warn('[webhook] Dropped malformed partner ref on session', session.id);
  }

  if (partnerCode) {
    const partner = await getPartnerStats(partnerCode).catch(() => null);
    if (!partner) {
      console.warn('[webhook] Unregistered partner code, commission withheld:', partnerCode, session.id);
      return { granted, refused, response: { commission: 'withheld-unregistered' } };
    }

    const amountGross = session.amount_total ?? 0;
    try {
      // Founder decision (Round 3): the standard 10% applies to eligible NET perpetual licence revenue only: tax and any
      // Continuous Certification charge in the same checkout are excluded. amountGross stays the charge total, because a
      // partial refund reverses the share refunded / charge total.
      const commissionBase = await licenceNetRevenue(stripe, session);
      const commission = await recordCommission({
        code: partnerCode,
        amountGross,
        commissionBase,
        commissionRate: COMMISSION_RATE,
        stripeSessionId: session.id,
        currency: (session.currency || 'eur').toUpperCase(),
      });
      if (commission && commission.withheld) {
        console.warn('[webhook] Commission withheld:', commission.withheld, partnerCode, session.id);
        return { granted, refused, response: { commission: commission.withheld } };
      }
      console.log('[webhook] Partner commission recorded:', commission);
    } catch (err) {
      console.error('[webhook] Failed to record partner commission:', err);
      await releaseClaims(eventId, session.id);
      throw new Error('Commission write failed');
    }
  }

  return { granted, refused, response: { ok: true } };
}

/** The order a Checkout Session names, when an event only gave us the session id. */
async function orderIdForSessionId(stripe, sessionId) {
  if (!sessionId) return null;
  try {
    return orderIdOf(await stripe.checkout.sessions.retrieve(sessionId));
  } catch {
    return null;
  }
}

/** One credit note per succeeded refund of this charge, for an order whose invoice was issued. */
async function creditNotesForCharge(stripe, orderId, charge) {
  const order = await getOrder(orderId);
  const route = order?.tax?.invoiceRoute ?? null;
  if (!order || order.invoice?.status !== 'issued' || !route) return { issued: 0, skipped: true };
  const refunds = [];
  for await (const r of stripe.refunds.list({ charge: charge.id, limit: 100 })) {
    if (r.status === 'succeeded') refunds.push({ id: r.id, amount: r.amount });
  }
  let issued = 0;
  let failed = false;
  for (const refund of refunds) {
    const current = await getOrder(orderId);
    const entry = await ensureCreditNote({ route, order: current, refund, stripe });
    if (entry.skipped) continue;
    if (entry.status === 'failed') {
      failed = true;
      console.error('[ALERT] credit note not created for order %s, refund %s: %s %s', orderId, refund.id, entry.reason, entry.detail ?? '');
      continue;
    }
    await updateOrder(orderId, (o) => ((o.creditNotes ?? []).some((c) => c.refundId === refund.id && c.status === 'issued')
      ? null : { ...o, creditNotes: [...(o.creditNotes ?? []).filter((c) => c.refundId !== refund.id), entry] }));
    issued += 1;
  }
  return { issued, failed };
}

/** Record a fact from an event on its order (no order id: nothing to do). A KV failure throws, so the caller answers 500 and Stripe retries. */
async function noteOnOrder(orderId, update) {
  if (!orderId) return null;
  try {
    return await recordOrderEvent(orderId, update);
  } catch (err) {
    console.error('[webhook] order fact not recorded (%s): %s', update.type, err?.message ?? err);
    throw err;
  }
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

  // A subscription event is a natural moment to finish certificate work that failed earlier (a queued issuance, an
  // evidence entry that did not land). Best effort and bounded: it never fails the event it rides on.
  if (event.type.startsWith('invoice.') || event.type.startsWith('customer.subscription.')) {
    try {
      const issuing = await retryPendingIssuances({ limit: 3 });
      const repairs = await retryEvidenceRepairs({ limit: 3 });
      if (issuing.attempted || repairs.attempted) console.log('[webhook] certificate recovery', JSON.stringify({ issuing, repairs }));
    } catch (err) {
      console.warn('[webhook] certificate recovery skipped:', err?.message ?? err);
    }
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
      try {
        await noteOnOrder(orderIdOf(session), { sourceId: event.id, type: event.type, facts: { paymentPendingAt: new Date().toISOString() }, set: { stripe: stripeIds(session) } });
      } catch {
        await releaseEventClaim(event.id);
        return res.status(500).json({ error: 'Order record write failed' });
      }
      return res.status(200).json({ received: true, status: 'pending' });
    }

    try {
      const result = await fulfillSession(session, event.id, stripe);
      return res.status(200).json({ received: true, ...result });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Fulfilment failed', ...(err instanceof InvoiceFailure ? { retry: 'invoice' } : {}) });
    }
  }

  // ---- Orders that end without payment ----
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object || {};
    try {
      await noteOnOrder(orderIdOf(session), { sourceId: event.id, type: event.type, facts: { expiredAt: new Date().toISOString() } });
    } catch { return res.status(500).json({ error: 'Order record write failed' }); }
    return res.status(200).json({ received: true, status: 'expired' });
  }

  // ---- The buyer's VAT ID verification finished (Stripe checks EU VAT against VIES, UK VAT against HMRC) ----
  if (event.type === 'customer.tax_id.updated' || event.type === 'customer.tax_id.created') {
    const taxId = event.data.object || {};
    const customerId = typeof taxId.customer === 'string' ? taxId.customer : taxId.owner?.customer ?? null;
    if (!customerId) return res.status(200).json({ received: true, tax_id: 'no-customer' });
    let customer;
    try {
      customer = await stripe.customers.retrieve(customerId);
    } catch (err) {
      console.error('[webhook] customer lookup for tax ID failed:', err?.message ?? err);
      return res.status(500).json({ error: 'Customer lookup failed' });
    }
    const orderId = orderIdOf(customer);
    if (!orderId) return res.status(200).json({ received: true, tax_id: 'no-order' });
    const status = taxId.verification?.status ?? null;
    try {
      const order = await noteOnOrder(orderId, {
        sourceId: event.id, type: event.type,
        facts: { taxIdVerification: { type: taxId.type ?? null, value: taxId.value ?? null, status, at: new Date().toISOString() } },
      });
      if (order) {
        const verifiedCategory = classifyBuyer({ country: order.buyer?.country, taxId: order.buyer?.taxId, verification: status });
        const review = order.facts?.paidAt && ['unverified', 'unavailable'].includes(status) ? 'vat_id_not_confirmed_after_payment' : null;
        await recordOrderEvent(orderId, { sourceId: `${event.id}:category`, type: 'tax.category', set: { tax: { verifiedCategory } }, facts: review ? { taxReview: review } : {} });
      }
    } catch { return res.status(500).json({ error: 'Order record write failed' }); }
    return res.status(200).json({ received: true, tax_id: status ?? 'recorded' });
  }

  /* ---- Continuous Certification lifecycle ----
   * The agent licence is perpetual and is never touched here: these events only
   * move the certificate between active / past_due / lapsed. Every branch answers
   * 200 even when no certificate exists, because a subscription created outside
   * this flow (or an invoice for something else) is not an error we can retry away. */
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed' || event.type === 'invoice.finalized') {
    const inv = event.data.object || {};
    const subId = invoiceSubscriptionId(inv);
    if (!subId) {
      // A one-off invoice: the post-payment invoice of a Checkout payment names its order in metadata.
      const orderId = orderIdOf(inv);
      if (orderId && event.type !== 'invoice.payment_failed') {
        try {
          await noteOnOrder(orderId, { sourceId: event.id, type: event.type, set: { invoice: stripeInvoiceSection(inv) } });
        } catch { return res.status(500).json({ error: 'Order record write failed' }); }
        // The Stripe invoice PDF exists now: store the order's copy of it (the buyer was notified at fulfilment).
        const documents = event.type === 'invoice.paid' ? await documentationStep(orderId, { notify: false }) : null;
        return res.status(200).json({ received: true, invoice: 'recorded', order: orderId, ...(documents ? { documents } : {}) });
      }
      return res.status(200).json({ received: true, certification: 'no-subscription' });
    }
    if (event.type === 'invoice.finalized') return res.status(200).json({ received: true });

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
    try {
      await noteOnOrder(orderIdOf(session), { sourceId: event.id, type: event.type, facts: { paymentFailedAt: new Date().toISOString() } });
    } catch { return res.status(500).json({ error: 'Order record write failed' }); }
    return res.status(200).json({ received: true, status: 'payment_failed' });
  }

  /* Money going back out. Stripe can send several of these for one charge and
   * the ledger helpers are idempotent, so duplicates are safe. A partial refund
   * reverses only that share of the commission; a dispute won in our favour
   * restores what dispute.created took away. */
  if (
    event.type === 'charge.refunded' ||
    event.type === 'charge.dispute.created' ||
    event.type === 'charge.dispute.updated' ||
    event.type === 'charge.dispute.closed'
  ) {
    const obj = event.data.object || {};
    const isDispute = event.type !== 'charge.refunded';
    const phase = isDispute ? disputePhase(event.type, obj.status) : null;
    if (phase === 'ignore') return res.status(200).json({ received: true, dispute: 'update-recorded-by-stripe', status: obj.status ?? null });
    const { sessionId, session, lookupFailed } = await sessionForCharge(stripe, obj);

    // Disputes also suspend (or restore) Continuous Certification, including disputes of RENEWAL charges, which have no
    // Checkout Session and used to change nothing. Done first and idempotently; a lookup failure makes Stripe retry.
    let certificationDispute;
    if (isDispute && !lookupFailed) {
      const { subId, lookupFailed: subLookupFailed } = await subscriptionForDispute(stripe, obj, session, sessionId);
      if (subLookupFailed) return res.status(500).json({ error: 'Subscription lookup failed' });
      if (subId) {
        try { certificationDispute = phase === 'inquiry' ? 'unchanged-inquiry' : await certificationForDispute(stripe, phase === 'chargeback' ? 'charge.dispute.created' : event.type, obj, subId); }
        catch (err) {
          console.error('[webhook] Certification dispute handling failed:', err?.message ?? err);
          return res.status(500).json({ error: 'Certification dispute handling failed' });
        }
      }
    }

    if (phase === 'inquiry') {
      if (lookupFailed) return res.status(500).json({ error: 'Session lookup failed' });
      const orderId = sessionId ? (orderIdOf(obj) || orderIdOf(session) || await orderIdForSessionId(stripe, sessionId)) : orderIdOf(obj);
      if (orderId) {
        try {
          await noteOnOrder(orderId, { sourceId: event.id, type: event.type,
            facts: { dispute: { id: obj.id ?? null, status: obj.status ?? null, reason: obj.reason ?? null, amount: obj.amount ?? null, inquiry: true, at: new Date().toISOString() } } });
        } catch { return res.status(500).json({ error: 'Order record write failed' }); }
      }
      const subRef = session?.subscription;
      const operator = await notifyOperatorOfInquiry({ disputeId: obj.id, orderId, subscriptionId: typeof subRef === 'string' ? subRef : subRef?.id,
        reason: obj.reason, amount: obj.amount, currency: obj.currency });
      return res.status(200).json({ received: true, dispute: 'inquiry', licence: 'unchanged', commission: 'unchanged', certification: certificationDispute ?? 'unchanged', operator });
    }

    if (!sessionId) {
      if (lookupFailed) {
        // Transient Stripe API failure: 500 so Stripe retries the event rather
        // than the reversal being dropped forever.
        return res.status(500).json({ error: 'Session lookup failed' });
      }
      console.warn('[webhook] %s without a session reference; ledger untouched', event.type);
      return res.status(200).json({ received: true, commission: 'no-session-reference', ...(certificationDispute ? { certification: certificationDispute } : {}) });
    }

    // Who bought what: the charge's own copy first, then the resolved session. Charge metadata
    // inherits from the PaymentIntent (agent_slug, tier); the session fallback means access is never
    // skipped just because a processor omitted the copy.
    const email = obj.billing_details?.email || obj.metadata?.email ||
      session?.customer_details?.email || session?.metadata?.email || null;
    const slug = obj.metadata?.agent_slug || session?.metadata?.agent_slug || null;

    const orderId = orderIdOf(obj) || orderIdOf(session) || await orderIdForSessionId(stripe, sessionId);
    try {
      if (isDispute) {
        await noteOnOrder(orderId, { sourceId: event.id, type: event.type,
          facts: { dispute: { id: obj.id ?? null, status: obj.status ?? (event.type === 'charge.dispute.created' ? 'needs_response' : null), reason: obj.reason ?? null, amount: obj.amount ?? null, at: new Date().toISOString() } } });
      }
      if (event.type === 'charge.dispute.closed') {
        // A closed inquiry or a prevented dispute withdrew no money: treat it like a won dispute (it used to leave the
        // licence revoked for good after an inquiry, because only 'won' restored it).
        if (DISPUTE_RESOLVED_FOR_US.has(obj.status)) {
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
          return res.status(200).json({ received: true, commission: restored.state ?? 'restored', access, ...(certificationDispute ? { certification: certificationDispute } : {}) });
        }
        return res.status(200).json({ received: true, commission: 'dispute-lost-already-reversed', ...(certificationDispute ? { certification: certificationDispute } : {}) });
      }

      const refunded = event.type === 'charge.refunded' ? (obj.amount_refunded ?? null) : null;
      const result = await reverseCommission(sessionId, event.type, refunded);

      const fullyRefunded = event.type !== 'charge.refunded' || obj.refunded === true ||
        (obj.amount_refunded != null && obj.amount != null && obj.amount_refunded >= obj.amount);
      if (fullyRefunded && email && slug) {
        await revokeEntitlement(email, [slug], sessionId, { refunded: event.type === 'charge.refunded' });
        console.log('[webhook] Entitlement revoked after %s for %s', event.type, sessionId);
      }

      /* LR-19: a fully refunded purchase that came with Continuous Certification ends the certification too.
       * Otherwise the buyer is refunded the licence and keeps being billed for certifying a package they no
       * longer hold. Disputes are not final, so only a refund cancels. */
      let certification;
      if (event.type === 'charge.refunded' && fullyRefunded) {
        const subRef = session?.subscription;
        const subId = typeof subRef === 'string' ? subRef : subRef?.id;
        if (subId) certification = await endCertificationForRefund(stripe, subId, sessionId);
      }

      // The order learns the refund, and an invoiced order gets one credit note per Stripe refund.
      let creditNotes;
      if (event.type === 'charge.refunded' && orderId) {
        await noteOnOrder(orderId, { sourceId: event.id, type: event.type,
          facts: { refunded: { amount: obj.amount_refunded ?? null, full: fullyRefunded, at: new Date().toISOString() } } });
        creditNotes = await creditNotesForCharge(stripe, orderId, obj);
        if (creditNotes.failed) return res.status(500).json({ error: 'Credit note creation failed', retry: 'credit_note' });
        if (creditNotes.issued > 0) await documentationStep(orderId, { notify: false }); // the credit-note PDF joins the order's documents
      }

      return res.status(200).json({ received: true, commission: result.state ?? result.reason, ...(certification ? { certification } : {}), ...(certificationDispute ? { certification: certificationDispute } : {}), ...(creditNotes ? { creditNotes: creditNotes.issued } : {}), ...(orderId ? { order: orderId } : {}) });
    } catch (err) {
      console.error('[webhook] Reversal handling failed:', err);
      return res.status(500).json({ error: 'Reversal write failed' });
    }
  }

  return res.status(200).json({ received: true });
}
