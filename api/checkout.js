/**
 * api/checkout.js - Creates a Stripe Checkout Session and redirects the buyer to it.
 *
 * GET  /api/checkout?agent=<slug>&ref=<ref>&partner=<code>&currency=usd|eur&method=bank|card
 *      -> the order-confirmation page (lib/acceptance.js): agreements with their versions, order summary,
 *         buyer company, declaring name and three UNTICKED confirmations.
 * POST /api/checkout  (the confirmation form)
 *      -> validates the confirmations, stores an acceptance record (lib/db.js recordAcceptance), then
 *         creates the Stripe Checkout Session with the acceptance id and document versions in its metadata.
 *
 * Buyer identification and the order id (lib/orders.js): the POST validates the business details (legal name,
 * registration number, country, VAT / tax ID, purchasing contact and email, the person accepting and their role),
 * creates the order id, stores the acceptance record and the order record, creates a Stripe Customer for the buyer
 * company (name, email, and the VAT ID as a tax ID so Stripe verifies it against VIES / HMRC), and then the
 * Checkout Session for that Customer. The order id travels in the metadata of the Customer, the session, the
 * PaymentIntent (so every charge, refund and dispute) and client_reference_id; the storefront's own `ref` moves to
 * metadata.ref. A VAT ID Stripe refuses as malformed returns the form with that field marked, and no session.
 *
 * `terms=accepted` in a GET is no longer evidence of anything and is ignored: acceptance is what the buyer
 * submits on the confirmation page, and the stored record is what proves it.
 *
 * USD is the default/primary lane; EUR is the optional European lane.
 *
 * method=bank  -> bank transfer only (US wire for USD, SEPA for EUR)   [our "recommended" button]
 * method=card  -> card + Apple/Google Pay + Link
 * (omitted)    -> all of the above (Stripe controls the on-page order for hosted Checkout)
 *
 * NOTE: Stripe hosted Checkout does not let you control the payment-method order, so we make
 * bank transfer "preferred" from our own pay box by sending method=bank on the primary button.
 *
 * Bank transfer needs a Customer on the session and "Bank transfers" enabled in the Dashboard.
 * It is a DELAYED (async) method - fulfilment happens on checkout.session.async_payment_succeeded
 * (Milestone B). Adaptive Pricing is disabled so the USD/EUR selector is authoritative.
 *
 * Continuous Certification is OPT-IN and GATED (finding LR-23):
 *   - The gate is CERTIFICATION_SALES_ENABLED=1 (lib/acceptance.js). It is off by default: checkout then sells
 *     the perpetual licence only, and any request that asks for certification - certification=on in the
 *     form, or cert=month|year|1 in a link or a direct API call - is refused with 409 certification_not_available.
 *   - With the gate on, the confirmation page offers certification as an UNTICKED box with the recurring price,
 *     frequency (monthly or annual = 10 months' price), automatic renewal and cancellation terms. Only a ticked
 *     box (certification=on, cert_interval=month|year) creates a subscription; no tick = licence only.
 *   - With certification the session is mode:'subscription' and the one-time licence rides on the first invoice.
 *     Bank transfer cannot do that (no customer_balance in subscription mode): certification + method=bank is
 *     refused (409 certification_needs_card), never silently dropped.
 *   - cert=0 / cert=false / cert=no remain accepted as "licence only" for old links.
 *
 * Prices (minor units) come from config/pricing.json, overridable per env:
 *   USD: AGENT_PRICE_L2_CENTS / L3 / L4 / L5
 *   EUR: AGENT_PRICE_EUR_L2_CENTS / ...          (NO default - EUR lane is off until these are set)
 *   Certification: CERT_PRICE_L4_MONTHLY_CENTS / CERT_PRICE_L4_YEARLY_CENTS / EUR variants
 *   AGENT_EU_BANK_COUNTRY  - IBAN country for the SEPA virtual account (default 'DE')
 */

import Stripe from 'stripe';
import PRICING from '../config/pricing.json' with { type: 'json' };
import { ORDER_LOCALES, AGENTS_PATH } from '../lib/orderI18n.js';
import { productFor, liveSaleBlocked, canonicalSlug, isLiveKey } from '../lib/products.js';
import { stripeOptions } from '../lib/stripe.js';
import { recordAcceptance, bindAcceptance } from '../lib/db.js';
import { validateAcceptance, renderAcceptancePage, readForm, clientFingerprint, legalVersionString, LEGAL_SET, CERT_TERMS, certificationSalesEnabled } from '../lib/acceptance.js';
import { newOrderId, createOrder, recordOrderEvent } from '../lib/orders.js';

// slug -> CAI tier. The agents page derives the identical slug when it builds the CTA.
export const SLUG_TIER = {"acceptance-test-script-generator":"L2","campaign-and-project-management-agent":"L2","compliance-and-audit-action-tracker":"L4","content-and-comms-agent":"L2","contract-obligations-review-agent":"L4","contract-intelligence-and-register":"L4","cyber-security-reporting-agent":"L3","development-and-career-agent":"L2","due-diligence-data-search-agent":"L3","escalation-triage-agent":"L3","four-eyes-control-assistant":"L4","infrastructure-wiki-agent":"L2","leadership-reporting-agent":"L3","maintenance-event-agent":"L2","monthly-reporting-automation-agent":"L2","onboarding-agent":"L2","operations-procedures-assistant":"L2","people-ops-query-agent":"L2","performance-management-agent":"L3","pipeline-reporting-agent":"L2","power-query-code-generator":"L2","reconciliation-root-cause-agent":"L3","risk-control-oversight-agent":"L4","risk-event-capture-agent":"L3","sales-end-to-end-assistant":"L3","sales-opportunity-agent":"L2","sales-qualification-agent":"L2","security-defect-triage-agent":"L4","service-delivery-manager-copilot":"L3","service-desk-backlog-triage-agent":"L3","service-desk-support-agent":"L3","service-request-automation-agent":"L3","service-review-pack-builder":"L2","signing-summary-agent":"L3","sop-generation-agent":"L2","supplier-meeting-minutes-agent":"L2"};

const ALLOWED_CURRENCIES = { usd: 1, eur: 1 };

// config/pricing.json is the single source of truth for every commercial number on
// the site; tests/pricing-consistency.test.mjs fails if the catalogue, pricing page
// or partner page drift from it.
const PRICE_CENTS = {
  usd: Object.fromEntries(Object.entries(PRICING.tiers).map(([t, v]) => [t, v.oneTimeCents])),
  // No default EUR prices. Charging the USD number as euros overcharges EU buyers (no FX),
  // so the EUR lane stays unavailable until real EUR prices are set via AGENT_PRICE_EUR_L*_CENTS.
  eur: { L2: null, L3: null, L4: null, L5: null },
};

// Continuous Certification: the recurring half of the sale. The agent licence is
// perpetual; this subscription only keeps the purchased version listed as a current
// Colleague AI Certified Release. See docs/continuous-certification.md.
const CERT_CENTS = {
  usd: {
    month: Object.fromEntries(Object.entries(PRICING.tiers).map(([t, v]) => [t, v.monthlyCents])),
    year: Object.fromEntries(Object.entries(PRICING.tiers).map(([t, v]) => [t, v.annualCents])),
  },
  eur: { month: {}, year: {} },
};

function certCents(tier, currency, interval) {
  const envKey = `CERT_PRICE_${currency === 'eur' ? 'EUR_' : ''}${tier}_${interval === 'year' ? 'YEARLY' : 'MONTHLY'}_CENTS`;
  const n = parseInt(process.env[envKey] || '', 10);
  if (Number.isFinite(n) && n > 0) return n;
  return CERT_CENTS[currency]?.[interval]?.[tier] ?? null;
}

const SLUG_RE = /^[a-z][a-z0-9-]{2,60}$/;
const PARTNER_RE = /^[A-Za-z0-9_-]{1,64}$/;

function valueOf(v) { return Array.isArray(v) ? v[0] : v; }

function originOf(req) {
  const proto = valueOf(req.headers['x-forwarded-proto']) || 'https';
  const host = valueOf(req.headers['x-forwarded-host']) || valueOf(req.headers.host);
  return `${proto}://${host}`;
}

export function titleFromSlug(slug) {
  return slug.replace(/-/g, ' ').replace(/\band\b/g, '&').replace(/\b\w/g, (c) => c.toUpperCase());
}

function priceCents(tier, currency) {
  const envKey = 'AGENT_PRICE_' + (currency === 'eur' ? 'EUR_' : '') + tier + '_CENTS';
  const n = parseInt(process.env[envKey] || '', 10);
  if (Number.isFinite(n) && n > 0) return n;
  const map = PRICE_CENTS[currency] || PRICE_CENTS.usd;
  return map[tier] || null;
}

function bankTransferFor(currency) {
  if (currency === 'eur') {
    return { type: 'eu_bank_transfer', eu_bank_transfer: { country: process.env.AGENT_EU_BANK_COUNTRY || 'DE' } };
  }
  return { type: 'us_bank_transfer' };
}

// The payment methods a buyer may use, sent to Stripe as allowed_payment_method_types. Stripe removed
// payment_method_types from Checkout Session create at API version 2026-09-30.endive (a request that still
// sends it gets a 400) and lib/stripe.js pins a newer version. Stripe narrows this list to the methods that
// suit the session (mode, currency, amount, customer) and are enabled in the Dashboard, instead of erroring.
function methodTypes(method) {
  if (method === 'bank') return ['customer_balance'];
  if (method === 'card') return ['card', 'link'];
  return ['customer_balance', 'card', 'link'];
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end('Method not allowed');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[checkout] STRIPE_SECRET_KEY not set');
    return res.status(503).json({ error: 'Checkout is not enabled', code: 'checkout_disabled' });
  }

  // Kill-switch: set CHECKOUT_ENABLED=false in the environment to take paid checkout offline
  // instantly (e.g. before legal/Stripe sign-off) without a redeploy. Defaults to enabled.
  if (process.env.CHECKOUT_ENABLED === 'false') {
    return res.status(503).json({ error: 'Checkout is temporarily unavailable', code: 'checkout_disabled' });
  }

  // GET carries the storefront parameters in the query; the POSTed confirmation form carries the same
  // names as hidden fields, plus the buyer's entries. One parameter map serves both.
  const form = req.method === 'POST' ? await readForm(req) : null;
  const q = req.method === 'POST' ? { ...form } : (req.query || {});

  // A retired slug (old links, bookmarks, partner URLs) resolves to the product's current slug,
  // so the Stripe metadata, entitlement and download all use one identifier.
  const slug = canonicalSlug(String(valueOf(q.agent) || '').trim());
  if (!SLUG_RE.test(slug)) return res.status(400).json({ error: 'Invalid or missing agent' });

  const tier = SLUG_TIER[slug];
  if (!tier) return res.status(404).json({ error: 'Unknown agent' });

  // A product can only be sold with a live key once its record in config/products.json says
  // saleApproved: true. A catalogue agent with no record there is refused too (default-deny).
  // Test-mode keys still work, so a Stripe test purchase can run end to end without any risk
  // of taking real money for an unapproved release.
  // Only an agent with a released package (a record in config/products.json) can be bought, in ANY mode: the
  // other catalogue agents are concepts with a dossier only, and a test purchase of one would deliver nothing.
  if (!productFor(slug)) {
    return res.status(409).json({ error: 'This agent is a concept and is not available for purchase', code: 'not_available' });
  }
  if (liveSaleBlocked(slug, process.env.STRIPE_SECRET_KEY)) {
    console.warn('[checkout] live sale blocked: release not approved for sale', slug);
    return res.status(403).json({ error: 'This product is not yet available for purchase', code: 'not_approved_for_sale' });
  }
  const product = productFor(slug);
  const productName = product?.name || `ColleagueAI - ${titleFromSlug(slug)}`;
  const shortName = product?.name ? product.name.replace(/^ColleagueAI\s+/, '') : titleFromSlug(slug);

  const currencyRaw = String(valueOf(q.currency) || 'usd').toLowerCase();
  const currency = ALLOWED_CURRENCIES[currencyRaw] ? currencyRaw : 'usd';

  const cents = priceCents(tier, currency);
  if (!cents) {
    console.error('[checkout] no price for', tier, currency);
    return res.status(400).json({ error: currency === 'usd' ? 'Price not configured' : 'Checkout in this currency is not available' });
  }

  const method = String(valueOf(q.method) || '').toLowerCase();
  const paymentMethodTypes = methodTypes(method);
  const includesBank = paymentMethodTypes.indexOf('customer_balance') !== -1;

  /* Continuous Certification: opt-in only, and only while the sales gate is on (header comment). */
  const certSales = certificationSalesEnabled();
  const certParam = String(valueOf(q.cert) ?? '').toLowerCase();
  const optIn = ['on', '1', 'true', 'yes'].includes(String(valueOf(q.certification) ?? '').toLowerCase());
  const asksForCert = optIn || ['1', 'true', 'yes', 'on', 'month', 'year'].includes(certParam);
  if (asksForCert && !certSales) {
    return res.status(409).json({ error: 'Continuous Certification is not yet open for subscription. Only the perpetual licence can be bought.', code: 'certification_not_available' });
  }
  if (optIn && includesBank) {
    return res.status(409).json({ error: 'Continuous Certification is billed as a subscription and needs a card. Buy the licence by bank transfer, or choose card payment to add certification.', code: 'certification_needs_card' });
  }
  const certInterval = String(valueOf(q.cert_interval) || valueOf(q.interval) || 'month').toLowerCase() === 'year' ? 'year' : 'month';
  // Offered on the confirmation page only when the gate is on, the lane can subscribe and both prices exist.
  const certOffer = certSales && !includesBank && certCents(tier, currency, 'month') && certCents(tier, currency, 'year')
    ? { monthlyCents: certCents(tier, currency, 'month'), annualCents: certCents(tier, currency, 'year') } : null;
  if (optIn && !certOffer) {
    return res.status(409).json({ error: 'Continuous Certification is not available for this product or currency.', code: 'certification_not_available' });
  }
  // A subscription is created ONLY from a ticked box on the POSTed confirmation form.
  const certUnit = req.method === 'POST' && optIn && certOffer ? certCents(tier, currency, certInterval) : null;
  const withCert = Boolean(certUnit);

  const ref = (String(valueOf(q.ref) || '').slice(0, 200)) || undefined;
  const partnerRaw = String(valueOf(q.partner) || '').trim();
  const partner = PARTNER_RE.test(partnerRaw) ? partnerRaw : '';

  // Buyer's storefront language: Stripe's checkout page and our thank-you page follow it.
  const langRaw = String(valueOf(q.lang) || '').toLowerCase().slice(0, 2);
  const lang = ORDER_LOCALES.includes(langRaw) ? langRaw : 'en';

  const metadata = { agent_slug: slug, tier, lang };
  if (product?.sku) metadata.sku = product.sku;
  if (product?.release?.version) metadata.release = product.release.version;
  if (partner) metadata.partner = partner;

  const origin = originOf(req);
  const cancelUrl = `${origin}${AGENTS_PATH[lang]}?purchase=cancelled&agent=${encodeURIComponent(slug)}`;

  // The storefront parameters that must survive the confirmation step unchanged.
  // (Certification is never carried from a link: it can only be chosen on the page itself.)
  const carried = { agent: slug, currency, method: method || '', ref: ref || '', partner, lang };
  const pageModel = (extra) => renderAcceptancePage({
    productName, tier, slug, version: product?.release?.version, sku: product?.sku, currency, priceCents: cents,
    certOffer, certClosed: !certSales, method: includesBank ? 'bank' : method, hidden: carried, cancelUrl, lang, ...extra,
  });

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).end(pageModel({}));
  }

  const accepted = validateAcceptance(form);
  if (!accepted.ok) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).end(pageModel({ errors: accepted.errors, values: formValues(form, optIn, certInterval) }));
  }
  const buyer = accepted.value.buyer;
  const live = isLiveKey(process.env.STRIPE_SECRET_KEY);
  // One id for this purchase attempt, written into every record and Stripe object that follows (lib/orders.js).
  const orderId = newOrderId();

  // The acceptance record is written BEFORE the session exists: if Stripe fails we still know who accepted
  // what; if KV fails we do not take money without evidence.
  let acceptance;
  try {
    acceptance = await recordAcceptance({
      legalSet: LEGAL_SET, legalVersions: legalVersionString(),
      agentSlug: slug, sku: product?.sku ?? null, release: product?.release?.version ?? null, tier,
      currency, priceCents: cents,
      // The recurring commitment the buyer opted into, with the terms version shown next to the box.
      certification: withCert ? { interval: certInterval, unitCents: certUnit, optIn: true, termsVersion: CERT_TERMS?.version ?? null } : null,
      orderId, buyer,
      buyerCompany: accepted.value.company, declaredBy: accepted.value.name, declaredRole: buyer.signatory.role,
      consents: accepted.value.consents,
      clientHash: clientFingerprint(req), userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
      lang, partner: partner || null, ref: ref || null, stripeSessionId: null,
    });
  } catch (err) {
    console.error('[checkout] acceptance record failed:', err?.message ?? err);
    return res.status(503).json({ error: 'Could not record your acceptance; nothing was charged. Please try again.' });
  }
  try {
    const created = await createOrder({
      id: orderId,
      mode: live ? 'live' : 'test',
      product: { slug, sku: product?.sku ?? null, release: product?.release?.version ?? null, tier, name: productName },
      price: { currency, unitAmount: cents, quantity: 1 },
      certification: withCert ? { interval: certInterval, unitAmount: certUnit } : null,
      buyer,
      acceptance: { id: acceptance.id, legalSet: LEGAL_SET, legalVersions: legalVersionString(), acceptedAt: acceptance.acceptedAt },
      payment: { lane: includesBank ? (paymentMethodTypes.length === 1 ? 'bank' : 'any') : 'card' },
      lang, partner: partner || null, ref: ref || null,
    });
    if (!created) throw new Error('order id collision');
  } catch (err) {
    console.error('[checkout] order record failed:', err?.message ?? err);
    return res.status(503).json({ error: 'Could not record your order; nothing was charged. Please try again.' });
  }
  metadata.order_id = orderId;
  if (ref) metadata.ref = ref.slice(0, 200);
  metadata.acceptance_id = acceptance.id;
  metadata.legal_set = LEGAL_SET;
  metadata.legal_versions = legalVersionString();
  metadata.buyer_company = accepted.value.company.slice(0, 120);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, stripeOptions());

  try {
    const lineItems = [{
      quantity: 1,
      price_data: {
        currency,
        unit_amount: cents,
        product_data: {
          name: `${productName} (${tier})`,
          metadata: { agent_slug: slug, tier, ...(product?.sku ? { sku: product.sku } : {}) },
        },
      },
    }];

    // In subscription mode Stripe bills one-time line items on the FIRST invoice,
    // so a single session collects the perpetual licence plus the first period.
    if (withCert) {
      metadata.certification = certInterval;
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: certUnit,
          recurring: { interval: certInterval },
          product_data: {
            name: `Continuous Certification - ${shortName} (${tier})`,
            metadata: { agent_slug: slug, tier, kind: 'continuous-certification' },
          },
        },
      });
    }

    const params = {
      mode: withCert ? 'subscription' : 'payment',
      adaptive_pricing: { enabled: false }, // never auto-convert to the buyer's local currency
      allowed_payment_method_types: paymentMethodTypes,
      line_items: lineItems,
      metadata,
      // payment_intent_data is payment-mode only; subscriptions carry metadata on the
      // subscription instead, which is what the webhook reads on invoice events.
      ...(withCert ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
      // The order id is the reference Stripe shows on the session; the storefront's ref is kept in metadata.ref.
      client_reference_id: orderId,
      billing_address_collection: 'required',
      // The buyer company is the Customer created below: Checkout may complete its name and billing address, and a
      // VAT ID typed on Stripe's page (when none was given on ours) is saved to it, so Stripe verifies it too.
      customer_update: { name: 'auto', address: 'auto' },
      tax_id_collection: { enabled: true },
      // The hosted page repeats the acceptance in Stripe's own record (needs the Terms URL set in the
      // Stripe Dashboard; STRIPE_TOS_CONSENT=1 says it is, otherwise Stripe would refuse the session).
      ...(process.env.STRIPE_TOS_CONSENT === '1' ? { consent_collection: { terms_of_service: 'required' } } : {}),
      custom_text: { submit: { message: `Order ${orderId} for ${accepted.value.company} under ColleagueAI agreement set ${LEGAL_SET} (acceptance ${acceptance.id}).`.slice(0, 1200) } },
      allow_promotion_codes: false,
      locale: lang, // Stripe Checkout supports all 8 storefront locales
      success_url: `${origin}/api/success?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
      cancel_url: cancelUrl,
    };

    // Every order gets its own Customer: the buyer company as Stripe and the invoice will show it. Bank transfer
    // needs one anyway, and a VAT ID is only verified by Stripe once it is saved to a Customer.
    let customer;
    try {
      customer = await stripe.customers.create(customerParams(buyer, orderId, lang, metadata));
    } catch (err) {
      if (isTaxIdRejection(err)) {
        await recordOrderEvent(orderId, { sourceId: `checkout:${orderId}:tax_id`, type: 'checkout.tax_id_rejected', facts: { checkoutFailedAt: new Date().toISOString(), checkoutFailure: 'tax_id_invalid' } }).catch(() => {});
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(400).end(pageModel({ errors: ['tax_id'], values: formValues(form, optIn, certInterval),
          notice: 'Stripe did not accept this VAT / tax ID. Check it, or leave the field empty if the company has none.' }));
      }
      throw err;
    }
    params.customer = customer.id;
    if (includesBank) {
      params.payment_method_options = {
        customer_balance: { funding_type: 'bank_transfer', bank_transfer: bankTransferFor(currency) },
      };
    }

    const session = await stripe.checkout.sessions.create(params);
    // Best effort: the session carries the acceptance and order ids either way; the back-links save a lookup.
    bindAcceptance(acceptance.id, { stripeSessionId: session.id }).catch((e) => console.warn('[checkout] acceptance bind skipped:', e?.message ?? e));
    await recordOrderEvent(orderId, {
      sourceId: `checkout:${session.id}`, type: 'checkout.session.created',
      facts: { checkoutOpenedAt: new Date().toISOString() },
      set: { stripe: { customerId: customer.id, sessionId: session.id } },
    }).catch((e) => console.warn('[checkout] order bind skipped:', e?.message ?? e));

    res.writeHead(303, { Location: session.url });
    return res.end();
  } catch (err) {
    console.error('[checkout] Stripe error:', err && err.message ? err.message : err);
    await recordOrderEvent(orderId, { sourceId: `checkout:${orderId}:failed`, type: 'checkout.failed', facts: { checkoutFailedAt: new Date().toISOString(), checkoutFailure: String(err?.code || err?.type || 'stripe_error').slice(0, 60) } }).catch(() => {});
    return res.status(502).json({ error: 'Could not start checkout' });
  }
}

/** What the buyer typed, to fill the form again after a refusal. */
function formValues(form, optIn, certInterval) {
  const f = (k) => String(form?.[k] ?? '').slice(0, 254);
  return {
    company: f('company'), reg_number: f('reg_number'), country: f('country').toUpperCase(), tax_id: f('tax_id'),
    contact_name: f('contact_name'), email: f('email'), name: f('name'), role: f('role'),
    certification: optIn, cert_interval: certInterval,
  };
}

/** The Stripe Customer for an order: the buyer company, its order email, and its VAT ID when Stripe can verify it. */
export function customerParams(buyer, orderId, lang, metadata = {}) {
  return {
    name: buyer.company,
    email: buyer.contact.email,
    preferred_locales: [lang],
    metadata: {
      ...metadata,
      order_id: orderId,
      declared_country: buyer.country,
      ...(buyer.registrationNumber ? { registration_number: buyer.registrationNumber } : {}),
      ...(buyer.taxId && !buyer.taxId.type ? { declared_tax_id: buyer.taxId.value } : {}),
      contact_name: buyer.contact.name.slice(0, 120),
      signatory: `${buyer.signatory.name} (${buyer.signatory.role})`.slice(0, 200),
    },
    ...(buyer.taxId?.type ? { tax_id_data: [{ type: buyer.taxId.type, value: buyer.taxId.value }] } : {}),
  };
}

function isTaxIdRejection(err) {
  const code = String(err?.code || err?.raw?.code || '');
  const param = String(err?.param || err?.raw?.param || '');
  return code === 'tax_id_invalid' || param.startsWith('tax_id_data');
}
