/**
 * lib/launchScope.js - what may be sold during the first-sale phase (config/launch-scope.json), and the checks that
 * keep every route inside it: the confirmation page and form (api/checkout.js), a direct API request with tampered
 * parameters, and the paid Checkout Session itself (lib/fulfilment.js withheldReason), where the billing address and
 * any tax ID typed on Stripe's page are checked again because the buyer can change them after our form.
 *
 * The scope only narrows. It never makes a sale possible that saleApproved or the tax policy would refuse.
 *
 * Applies to live and test keys alike, so the Preview exercises the same restricted checkout. A test-mode suite that
 * needs another buyer category may pass LAUNCH_SCOPE_TEST_BYPASS=1; that switch is ignored for a live key.
 */
import SCOPE from '../config/launch-scope.json' with { type: 'json' };
import { isLiveKey } from './products.js';

export { SCOPE as LAUNCH_SCOPE };

/** True when the scope applies to requests made with this key. */
export function scopeEnforced(stripeKey, env = process.env) {
  if (isLiveKey(stripeKey)) return true;
  return env.LAUNCH_SCOPE_TEST_BYPASS !== '1';
}

/**
 * Czech company identification number (IČO): eight digits whose last is a mod-11 check digit over the first seven
 * with weights 8..2 (remainder 0 -> 1, remainder 1 -> 0, otherwise 11 - remainder).
 */
export function isValidIco(value) {
  const s = String(value ?? '').replace(/\s+/g, '');
  if (!/^\d{8}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(s[i]) * (8 - i);
  const r = sum % 11;
  const check = r === 0 ? 1 : r === 1 ? 0 : 11 - r;
  return check === Number(s[7]);
}

const own = (o, k) => Boolean(o) && Object.hasOwn(o, k);

/**
 * The request parameters (before any buyer data): product, release, currency, payment method, certification.
 * Returns null when inside the scope, otherwise { code, message }.
 */
export function requestScopeError({ slug, product, currency, method, certification = false }, scope = SCOPE) {
  const allowed = own(scope.products, slug) ? scope.products[slug] : null;
  if (!allowed) return { code: 'not_in_launch_scope', message: 'This product is not offered during the first-sale phase.' };
  if (!product || product.sku !== allowed.sku || product.release?.version !== allowed.release
    || Number(product.release?.bundleRevision ?? 1) !== Number(allowed.bundleRevision ?? 1)) {
    return { code: 'release_not_in_launch_scope', message: 'The release on sale does not match the approved first-sale release.' };
  }
  if (!scope.currencies.includes(String(currency || '').toLowerCase())) {
    return { code: 'currency_not_in_launch_scope', message: `Checkout is offered in ${scope.currencies.map((c) => c.toUpperCase()).join(', ')} only.` };
  }
  if (method && method !== 'card' && !scope.paymentMethods.includes(method)) {
    return { code: 'payment_method_not_in_launch_scope', message: 'Only card payment is offered during the first-sale phase.' };
  }
  if (certification && !scope.certification) {
    return { code: 'certification_not_in_launch_scope', message: 'Only the perpetual licence is offered during the first-sale phase.' };
  }
  return null;
}

/** Stripe payment method types the scope allows (card only today: no bank transfer, no Link wallet). */
export function scopePaymentMethodTypes(scope = SCOPE) {
  return scope.paymentMethods.includes('bank') ? ['card', 'customer_balance'] : ['card'];
}

/**
 * The buyer from the validated confirmation form (lib/acceptance.js validateAcceptance). Returns null or
 * { field, code, message }. The checks are facts only; what a category means for tax is lib/taxPolicy.js.
 */
export function buyerScopeError(buyer, scope = SCOPE) {
  const b = scope.buyer;
  const country = String(buyer?.country || '').toUpperCase();
  if (!b.countries.includes(country)) {
    return { field: 'country', code: 'buyer_country_not_in_launch_scope', message: 'During the first-sale phase we sell only to companies established in the Czech Republic. Write to hello@colleagueai.ai and we will tell you when your country opens.' };
  }
  const reg = String(buyer?.registrationNumber || '').replace(/\s+/g, '');
  if (b.requireRegistrationNumber && !reg) {
    return { field: 'reg_number', code: 'registration_number_required', message: 'Enter the company identification number (IČO). We sell to businesses only.' };
  }
  if (b.registrationNumberFormat === 'cz_ico' && !isValidIco(reg)) {
    return { field: 'reg_number', code: 'registration_number_invalid', message: 'This is not a valid IČO (eight digits with a check digit).' };
  }
  const vat = buyer?.taxId?.value ? String(buyer.taxId.value).toUpperCase() : null;
  if (vat && b.vatIdMustMatchRegistrationNumber && vat !== `CZ${reg}`) {
    return { field: 'tax_id', code: 'vat_id_mismatch', message: 'The VAT ID does not belong to this IČO. Correct it, leave it empty, or write to hello@colleagueai.ai if your company is part of a VAT group.' };
  }
  return null;
}

/**
 * The paid session against the order, after Stripe: billing country and tax IDs collected on Stripe's page.
 * Returns null or a withheld reason. `taxIds` are lib/taxIds.js sessionTaxIds() entries.
 */
export function sessionScopeError({ order, billingCountry, taxIds = [] }, scope = SCOPE) {
  const countries = scope.buyer.countries;
  if (order?.buyer?.country && !countries.includes(String(order.buyer.country).toUpperCase())) return 'buyer-out-of-launch-scope';
  if (billingCountry && !countries.includes(String(billingCountry).toUpperCase())) return 'billing-country-out-of-launch-scope';
  if (!billingCountry) return 'billing-country-missing';
  const reg = String(order?.buyer?.registrationNumber || '').replace(/\s+/g, '');
  for (const t of taxIds) {
    const v = String(t?.value || '').toUpperCase();
    if (!v) continue;
    if (!v.startsWith('CZ') || (scope.buyer.vatIdMustMatchRegistrationNumber && reg && v !== `CZ${reg}`)) return 'tax-id-out-of-launch-scope';
  }
  return null;
}
