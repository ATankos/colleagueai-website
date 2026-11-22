/**
 * lib/taxPolicy.js - the tax and invoicing policy, and the rule that it cannot be used before it is approved.
 *
 * config/tax-policy.json holds the accountant's decisions (T1-T14 of the Accountant Decision Pack), the treatment
 * for each buyer category, and the checkout settings that follow from them. Nothing here contains a tax rule of its
 * own: no rate, no reverse-charge assumption, no wording. The code only
 *   - classifies the buyer into a category from facts (country, VAT ID present, its verification status),
 *   - looks the category up in the policy, and
 *   - refuses to act on a policy that is not approved.
 *
 * While the policy is 'unapproved' (as committed today):
 *   - live checkout is refused (liveTaxBlocked), in addition to saleApproved;
 *   - test checkout runs as before, without Stripe Tax and without invoices, and the order records that no tax
 *     treatment was applied.
 * config/tax-policy.sandbox.json is a clearly labelled fixture that lets the invoice, credit-note and reconciliation
 * code run in the Stripe sandbox. It is used only with a TEST key and only when TAX_POLICY_SANDBOX=1.
 *
 * Buyer categories:
 *   cz_business                 established in CZ (with or without a CZ VAT ID; the treatment decides)
 *   eu_business_vat_verified    another EU state, VAT ID verified by Stripe (VIES)
 *   eu_business_vat_pending     another EU state, VAT ID given, verification not finished (or not known yet)
 *   eu_business_vat_unverified  another EU state, VAT ID given, VIES did not confirm it (unverified / unavailable)
 *   eu_business_no_vat_id       another EU state, no VAT ID - still a business (the buyer declared so), not a consumer
 *   non_eu_business             established outside the EU
 */
import POLICY from '../config/tax-policy.json' with { type: 'json' };
import SANDBOX from '../config/tax-policy.sandbox.json' with { type: 'json' };
import GUARDS from '../config/tax-wording-guards.json' with { type: 'json' };
import { isEuCountry } from './countries.js';
import { isLiveKey } from './products.js';

export const CATEGORIES = ['cz_business', 'eu_business_vat_verified', 'eu_business_vat_pending', 'eu_business_vat_unverified', 'eu_business_no_vat_id', 'non_eu_business'];
export const BLOCKING_DECISIONS = ['T1_vatStatus', 'T2_euBusinessWithVatId', 'T5_businessStatusAndNoVatId', 'T6_licenceClassification', 'T7_taxDocumentRequirements', 'T13_invoiceRoute'];
const ACTIONS = ['sell', 'hold', 'block'];
const INVOICE_ROUTES = ['stripe', 'company_ledger', 'czech_tool'];
const SANDBOX_ROUTES = ['stripe', 'sandbox_ledger', 'company_ledger'];
const VAT_STATUSES = ['vat_payer', 'identified_person', 'not_registered'];
// T8: how a non-CZK sale is converted for the Czech records. null = not decided (nothing is printed).
const CZK_CONVERSIONS = ['cnb_daily_rate_on_tax_point'];

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// Wording that would present a seller that is not a VAT payer as one, or a domestic supply as reverse-charged
// (patterns in config/tax-wording-guards.json; guards only, never printed).
const PAYER_WORDING = new RegExp(GUARDS.payerWording, 'i');
const RECIPIENT_ACCOUNTS_WORDING = new RegExp(GUARDS.recipientAccountsWording, 'i');

/**
 * The seller's VAT status on a given day, from seller.vatStatusHistory. Only entries marked verified (an official
 * record is on file: registration decision or the tax administration's register) with an effectiveFrom date count;
 * a planned or reported status never applies by itself, and nothing changes automatically on a calendar date.
 * Returns the entry, or null when no verified entry applies yet.
 */
export function sellerStatusOn(policy, date = new Date()) {
  const day = (date instanceof Date ? date.toISOString() : String(date)).slice(0, 10);
  const hist = Array.isArray(policy?.seller?.vatStatusHistory) ? policy.seller.vatStatusHistory : [];
  return hist.filter((e) => e?.verified === true && ISO_DAY.test(String(e.effectiveFrom || '')) && e.effectiveFrom <= day)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1)).pop() || null;
}

/**
 * How a seller block is presented on a document. A VAT payer shows its DIČ and charges VAT. An identified person is
 * not a VAT payer: it charges no VAT; its DIČ is shown on documents for foreign buyers, and on domestic documents only
 * when the approved policy says so (seller.showVatIdOnDomesticInvoices === true, accountant decision T7). An
 * unregistered seller shows no DIČ.
 */
export function sellerPresentation(seller, { domestic = true } = {}) {
  const st = seller?.vatStatus ?? null;
  const hasId = Boolean(seller?.vatId);
  if (st === 'vat_payer') return { status: st, chargesVat: true, showVatId: hasId, supplyDateLabel: 'Date of taxable supply' };
  if (st === 'identified_person') {
    return { status: st, chargesVat: false, showVatId: hasId && (!domestic || seller?.showVatIdOnDomesticInvoices === true), supplyDateLabel: 'Date of supply' };
  }
  if (st === 'not_registered') return { status: st, chargesVat: false, showVatId: false, supplyDateLabel: 'Date of supply' };
  // Status not decided (unapproved policy, sandbox fixture): nothing is asserted either way.
  return { status: st, chargesVat: null, showVatId: false, supplyDateLabel: 'Date of taxable supply' };
}

/** Every reason this policy may not be acted on. An empty list means it is complete. */
export function policyErrors(policy, { now = new Date() } = {}) {
  const errors = [];
  if (!policy || typeof policy !== 'object') return ['no policy'];
  if (policy.sandboxOnly) {
    if (policy.status !== 'sandbox') errors.push('a sandbox fixture must have status "sandbox"');
    for (const c of CATEGORIES) {
      if (!ACTIONS.includes(policy.treatments?.[c]?.action)) errors.push(`sandbox treatment ${c} has no valid action`);
    }
    if (!SANDBOX_ROUTES.includes(policy.checkout?.invoiceRoute)) errors.push('sandbox invoiceRoute must be stripe, sandbox_ledger or company_ledger');
    return errors;
  }
  if (policy.status !== 'approved') errors.push(`status is "${policy.status}", not "approved"`);
  for (const k of ['approvedBy', 'role', 'approvedAt', 'reference']) {
    if (!filled(policy.approval?.[k])) errors.push(`approval.${k} is empty`);
  }
  for (const d of BLOCKING_DECISIONS) {
    if (!filled(policy.decisions?.[d])) errors.push(`blocking decision ${d} is not recorded`);
  }
  if (!VAT_STATUSES.includes(policy.seller?.vatStatus)) errors.push('seller.vatStatus is not one of ' + VAT_STATUSES.join(', '));
  if (['vat_payer', 'identified_person'].includes(policy.seller?.vatStatus)) {
    if (!/^CZ\d{8,10}$/.test(String(policy.seller?.vatId || ''))) errors.push('seller.vatId must be a CZ VAT number when the seller is registered');
    if (!filled(policy.seller?.vatEffectiveFrom)) errors.push('seller.vatEffectiveFrom is empty');
    // A reported status (founder, e-mail summary) is not an official record: approval needs the record itself.
    if (!filled(policy.seller?.vatStatusEvidence?.officialRecord)) errors.push('seller.vatStatusEvidence.officialRecord is empty (registration decision or tax-register record)');
    const eff = sellerStatusOn(policy, now);
    if (!eff || eff.status !== policy.seller.vatStatus) errors.push(`no verified seller.vatStatusHistory entry makes "${policy.seller.vatStatus}" effective today`);
  }
  // A verified change of status (for example to vat_payer in 2027) needs a re-approved policy before it takes effect:
  // treatments, wording and checkout settings were approved for the earlier status.
  const effNow = sellerStatusOn(policy, now);
  if (effNow && policy.seller?.vatStatus && effNow.status !== policy.seller.vatStatus) errors.push(`verified VAT status "${effNow.status}" is effective but the policy was approved for "${policy.seller.vatStatus}": re-approve the policy`);
  for (const [i, e] of (policy.seller?.vatStatusHistory || []).entries()) {
    if (!VAT_STATUSES.includes(e?.status)) errors.push(`seller.vatStatusHistory[${i}].status is not one of ${VAT_STATUSES.join(', ')}`);
    if (e?.verified === true && (!ISO_DAY.test(String(e.effectiveFrom || '')) || !filled(e.evidenceReference))) errors.push(`seller.vatStatusHistory[${i}] is verified without effectiveFrom and evidenceReference`);
  }
  if (policy.seller?.vatStatus !== 'vat_payer') {
    if (policy.checkout?.stripeTax === true) errors.push('a seller that is not a VAT payer charges no VAT: checkout.stripeTax must be false');
    for (const c of CATEGORIES) {
      const note = policy.treatments?.[c]?.invoiceNote;
      if (typeof note === 'string' && PAYER_WORDING.test(note)) errors.push(`treatment ${c} wording presents the seller as a VAT payer or the document as a tax document`);
    }
  }
  const czNote = policy.treatments?.cz_business?.invoiceNote;
  if (typeof czNote === 'string' && RECIPIENT_ACCOUNTS_WORDING.test(czNote)) errors.push('cz_business wording must not say the customer accounts for the tax (domestic supply; guard recipientAccountsWording)');
  for (const c of CATEGORIES) {
    const t = policy.treatments?.[c];
    if (!t) { errors.push(`treatment ${c} is not decided`); continue; }
    if (!ACTIONS.includes(t.action)) errors.push(`treatment ${c} action must be sell, hold or block`);
    if (t.action === 'sell' && !filled(t.invoiceNote) && t.invoiceNote !== '') errors.push(`treatment ${c} must state its invoice wording ("" for none)`);
  }
  if (!INVOICE_ROUTES.includes(policy.checkout?.invoiceRoute)) errors.push('checkout.invoiceRoute must be stripe, company_ledger or czech_tool (T13)');
  if (policy.checkout?.czkConversion != null && !CZK_CONVERSIONS.includes(policy.checkout.czkConversion)) errors.push('checkout.czkConversion must be null or one of ' + CZK_CONVERSIONS.join(', ') + ' (T8)');
  if (typeof policy.checkout?.stripeTax !== 'boolean') errors.push('checkout.stripeTax must be true or false');
  return errors;
}

/**
 * The policy that applies to a Stripe key. A live key always gets config/tax-policy.json. A test key gets the sandbox
 * fixture only when TAX_POLICY_SANDBOX=1, optionally with its invoice route switched by TAX_SANDBOX_INVOICE_ROUTE.
 */
export function policyFor(stripeKey, { main = POLICY, sandbox = SANDBOX, env = process.env } = {}) {
  if (isLiveKey(stripeKey)) return main;
  if (env.TAX_POLICY_SANDBOX === '1') {
    const route = env.TAX_SANDBOX_INVOICE_ROUTE;
    return SANDBOX_ROUTES.includes(route) ? { ...sandbox, checkout: { ...sandbox.checkout, invoiceRoute: route } } : sandbox;
  }
  return main;
}

/** True when the policy may be acted on with this key: an approved, complete policy, or the sandbox fixture with a test key. */
export function policyActive(policy, stripeKey) {
  if (policy?.sandboxOnly && isLiveKey(stripeKey)) return false;
  return policyErrors(policy).length === 0;
}

/** Live sales stay closed until the tax policy is approved and complete. */
export function liveTaxBlocked(stripeKey, policy = policyFor(stripeKey)) {
  return isLiveKey(stripeKey) && !policyActive(policy, stripeKey);
}

/**
 * The buyer category from facts only. `taxId` is { value, type } or null; `verification` is Stripe's tax ID
 * verification status ('pending' | 'verified' | 'unverified' | 'unavailable') or null when not known yet.
 * A buyer with no VAT ID is still a business here: every buyer declares on the order form that it acts in the course
 * of its business.
 */
export function classifyBuyer({ country, taxId = null, verification = null } = {}) {
  const c = String(country || '').toUpperCase();
  if (c === 'CZ') return 'cz_business';
  if (!isEuCountry(c)) return 'non_eu_business';
  if (!taxId?.value) return 'eu_business_no_vat_id';
  if (verification === 'verified') return 'eu_business_vat_verified';
  if (verification === 'unverified' || verification === 'unavailable') return 'eu_business_vat_unverified';
  return 'eu_business_vat_pending';
}

/**
 * What the policy says for this buyer, before payment. Returns
 *   { applied: false, ... }                       the policy is not active (unapproved): nothing is applied
 *   { applied: true, action, invoiceNote, ... }   the accountant's treatment for the buyer's category
 */
export function treatmentFor(policy, stripeKey, buyer, verification = null) {
  const category = classifyBuyer({ country: buyer?.country, taxId: buyer?.taxId, verification });
  const base = { policyVersion: policy?.version ?? null, policyStatus: policy?.status ?? null, category };
  if (!policyActive(policy, stripeKey)) return { ...base, applied: false, action: 'sell', invoiceNote: null };
  const t = policy.treatments[category];
  return { ...base, applied: true, action: t.action, invoiceNote: t.invoiceNote ?? '' };
}

/**
 * The Checkout Session parameters the policy asks for. With an inactive policy only what is approval-independent:
 * Stripe's business tax ID collection (optional for the buyer). Stripe Tax, a required tax ID and invoice creation
 * appear only with an active policy.
 */
export function checkoutTaxParams(policy, stripeKey, { mode = 'payment', orderId, acceptanceId, description, treatment, buyer } = {}) {
  const active = policyActive(policy, stripeKey);
  const params = {
    tax_id_collection: { enabled: true, ...(active && policy.checkout.requireTaxIdIfSupported ? { required: 'if_supported' } : {}) },
  };
  if (!active) return params;
  if (policy.checkout.stripeTax === true) params.automatic_tax = { enabled: true };
  if (mode === 'payment' && policy.checkout.invoiceRoute === 'stripe') {
    const customFields = [{ name: 'Order', value: orderId }];
    if (buyer?.registrationNumber) customFields.push({ name: 'Buyer reg. no.', value: String(buyer.registrationNumber).slice(0, 140) });
    params.invoice_creation = {
      enabled: true,
      invoice_data: {
        description: String(description || '').slice(0, 1500),
        metadata: { order_id: orderId, ...(acceptanceId ? { acceptance_id: acceptanceId } : {}) },
        custom_fields: customFields,
        footer: invoiceFooter(policy, treatment).slice(0, 5000),
        rendering_options: { amount_tax_display: 'exclude_tax' },
      },
    };
  }
  return params;
}

/** Seller identification plus the accountant's wording for this buyer's treatment. */
export function invoiceFooter(policy, treatment) {
  const s = policy.seller || {};
  const shown = sellerPresentation(s, { domestic: !treatment?.category || treatment.category === 'cz_business' });
  const parts = [s.legalName, s.address, s.registrationNumber ? `IČO ${s.registrationNumber}` : null,
    shown.showVatId ? `DIČ ${s.vatId}` : null, s.register].filter(Boolean);
  const note = treatment?.applied && treatment.invoiceNote ? `\n${treatment.invoiceNote}` : '';
  return parts.join(' · ') + note;
}

/** The invoice provider the policy chooses, or null when invoicing is not switched on for this key. */
export function invoiceRoute(policy, stripeKey) {
  return policyActive(policy, stripeKey) ? policy.checkout.invoiceRoute : null;
}

export { POLICY as TAX_POLICY };
