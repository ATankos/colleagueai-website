/**
 * lib/taxIds.js - the VAT / tax ID a buyer company types on the order-confirmation page.
 *
 * This module only checks the FORMAT of what was typed and decides whether Stripe can hold and verify it. It decides
 * no tax treatment: lib/taxPolicy.js does that, and only once the accountant's decisions are recorded.
 *
 *   EU member state  -> Stripe type eu_vat. The number must carry the state's prefix (EL for Greece); a number typed
 *                       without it gets the declared country's prefix. Stripe checks EU VAT numbers against VIES
 *                       asynchronously once the number is saved to a Customer (customer.tax_id.updated).
 *   United Kingdom   -> Stripe type gb_vat (GB + 9 or 12 digits, or GBGD / GBHA + 3 digits), verified the same way.
 *   anywhere else    -> kept as the buyer declared it (type null). Stripe Checkout may still collect a structured ID
 *                       for countries it supports; the webhook records what it collected.
 *
 * An empty field is allowed: a business without a VAT ID is still a business (it declares so on the form), and what
 * that means for tax is the accountant's decision, not this module's.
 */
import { isEuCountry, euVatPrefix } from './countries.js';

/** Upper-case, without spaces, dots or dashes. */
export function normaliseTaxId(raw) {
  return String(raw ?? '').toUpperCase().replace(/[\s.\-]/g, '');
}

const EU_VAT_BODY = /^[0-9A-Z+*]{2,13}$/;
const CZ_VAT = /^CZ\d{8,10}$/;
const GB_VAT = /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/;
const OTHER_TAX_ID = /^[0-9A-Z/]{3,24}$/;

/**
 * Parse what the buyer typed for its declared country.
 * Returns { ok: true, value: null } for an empty field, { ok: true, value, type } for a usable ID (type is the Stripe
 * tax ID type, or null when Stripe should not hold it), or { ok: false, reason } when the format cannot be right.
 */
export function parseBuyerTaxId(raw, country) {
  const c = String(country || '').toUpperCase();
  let v = normaliseTaxId(raw);
  if (!v) return { ok: true, value: null, type: null };
  if (isEuCountry(c)) {
    const prefix = euVatPrefix(c);
    if (!v.startsWith(prefix)) {
      // Typed without the prefix (e.g. "12345678" for CZ). A different EU prefix means the wrong country was chosen.
      if (/^[A-Z]{2}/.test(v) && isEuCountry(v.slice(0, 2) === 'EL' ? 'GR' : v.slice(0, 2))) {
        return { ok: false, reason: 'vat_country_mismatch' };
      }
      v = prefix + v;
    }
    const body = v.slice(prefix.length);
    if (!EU_VAT_BODY.test(body)) return { ok: false, reason: 'vat_format' };
    if (c === 'CZ' && !CZ_VAT.test(v)) return { ok: false, reason: 'vat_format' };
    return { ok: true, value: v, type: 'eu_vat' };
  }
  if (c === 'GB') {
    if (!v.startsWith('GB')) v = 'GB' + v;
    return GB_VAT.test(v) ? { ok: true, value: v, type: 'gb_vat' } : { ok: false, reason: 'vat_format' };
  }
  return OTHER_TAX_ID.test(v) ? { ok: true, value: v, type: null } : { ok: false, reason: 'vat_format' };
}

/**
 * The tax IDs Stripe collected or holds for a session, in one shape: [{ type, value, verification }].
 * Hosted Checkout reports them under customer_details.tax_ids (an array); Checkout sessions on API versions from
 * 2026-07-29 report the elements-mode copy under collected_information.tax_id (a single object). Both are read.
 */
export function sessionTaxIds(session) {
  const out = [];
  const push = (t) => {
    if (!t || typeof t !== 'object' || !t.value) return;
    if (out.some((x) => x.type === t.type && x.value === t.value)) return;
    out.push({ type: t.type ?? null, value: String(t.value), verification: t.verification?.status ?? null });
  };
  for (const t of session?.customer_details?.tax_ids ?? []) push(t);
  push(session?.collected_information?.tax_id);
  for (const t of session?.collected_information?.tax_ids ?? []) push(t);
  return out;
}
