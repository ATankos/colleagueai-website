/**
 * lib/purchaseVat.js - foreign-supplier purchase invoices: capture, completeness and flags for the accountant.
 *
 * Background (verified against the VAT Act summaries cited in docs/commerce/foreign-supplier-purchases.md): an
 * identified person self-assesses Czech VAT on services received from a person not established in the Czech Republic
 * where the place of supply is in the Czech Republic (§ 108(3)(a)(1) ZDPH), files a VAT return only for the periods in
 * which it has to declare tax, files no control statement, and has no input deduction. Whether a particular invoice
 * creates that duty depends on its facts: the supplier entity and where it is established, the service, whether VAT
 * was charged and by which country, the tax point and the identifier the supplier recorded for us.
 *
 * So this module NEVER decides. It
 *   - checks that a record carries every fact the accountant needs, and lists what is missing;
 *   - raises flags (supplier charged VAT, Czech supplier, possible exemption, our identifier missing on the invoice);
 *   - lists the candidate months (invoice date, end of service period, payment date) without choosing one;
 *   - reports a treatment only when a complete accountant decision is recorded on the record itself.
 * Records hold accounting data and live outside this public repository (scripts/commerce/foreign-purchases.mjs reads
 * them from a private path).
 */

export const SERVICE_CLASSES = ['cloud_hosting', 'saas_subscription', 'software_licence', 'ai_api_usage', 'payment_processing',
  'domain_registration', 'email_delivery', 'advertising', 'marketplace_fee', 'professional_service', 'other'];
export const DECISION_TREATMENTS = ['self_assess', 'outside_scope', 'exempt', 'supplier_vat_correct_no_self_assessment', 'other'];
const REQUIRED = [
  ['supplier.name'], ['supplier.country'], ['supplier.taxId'], ['service.description'], ['service.class'],
  ['invoice.number'], ['invoice.date'], ['invoice.currency'], ['invoice.netAmount'], ['invoice.vatAmount'],
  ['invoice.reverseChargeLegend'], ['invoice.customerTaxIdShown'], ['payment.date'], ['evidence.sha256'], ['evidence.storageRef'],
];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const present = (v) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

/** Assess one purchase record. Returns { status, missing, flags, candidateMonths, decision }. */
export function assessPurchase(rec) {
  const missing = REQUIRED.map(([p]) => p).filter((p) => !present(get(rec, p)));
  if (present(rec?.service?.class) && !SERVICE_CLASSES.includes(rec.service.class)) missing.push('service.class (unknown value)');
  for (const p of ['invoice.date', 'payment.date']) if (present(get(rec, p)) && !ISO_DAY.test(get(rec, p))) missing.push(`${p} (YYYY-MM-DD)`);
  if (present(rec?.evidence?.sha256) && !/^[0-9a-f]{64}$/.test(rec.evidence.sha256)) missing.push('evidence.sha256 (64 hex)');

  const flags = [];
  const country = String(rec?.supplier?.country || '').toUpperCase();
  if (country === 'CZ') flags.push('czech_supplier: domestic supply; no self-assessment as a recipient, check the supplier invoice instead');
  if (Number(rec?.invoice?.vatAmount) > 0) flags.push(`supplier_charged_vat: ${rec.invoice.vatCountry || 'country not recorded'}; charged VAT does not by itself settle whether a self-assessment duty exists`);
  if (rec?.invoice?.customerTaxIdShown === false) flags.push('our_tax_id_missing_on_invoice: the supplier may have treated us as a non-business customer; ask for a corrected invoice and update the supplier account');
  if (rec?.service?.class === 'payment_processing') flags.push('possible_exemption: payment/financial services may be exempt; accountant to classify each fee type');
  if (rec?.invoice?.reverseChargeLegend === true && Number(rec?.invoice?.vatAmount) > 0) flags.push('inconsistent_invoice: reverse-charge legend and VAT charged on the same invoice');
  if (!present(rec?.service?.periodEnd)) flags.push('service_period_not_recorded');

  const candidateMonths = [...new Set([rec?.invoice?.date, rec?.service?.periodEnd, rec?.payment?.date]
    .filter((d) => ISO_DAY.test(String(d || ''))).map((d) => d.slice(0, 7)))].sort();

  const d = rec?.accountantDecision;
  const decisionComplete = d && DECISION_TREATMENTS.includes(d.treatment) && present(d.decidedBy) && ISO_DAY.test(String(d.decidedAt || '')) && present(d.reference)
    && (d.treatment !== 'self_assess' || (/^\d{4}-\d{2}$/.test(String(d.period || '')) && ISO_DAY.test(String(d.taxPoint || '')) && Number(d.czkRate) > 0));
  let status;
  if (missing.length) status = 'incomplete';
  else if (decisionComplete) status = 'decided';
  else status = 'needs_accountant';
  return { status, missing, flags, candidateMonths, decision: decisionComplete ? d : null };
}

/** A register of purchases: one assessment per record and the open items, newest first. Never totals tax. */
export function assessRegister(records = []) {
  const rows = records.map((r) => ({ id: r?.id || r?.invoice?.number || '(no id)', supplier: r?.supplier?.name || '(unknown)', ...assessPurchase(r) }));
  return {
    rows,
    open: rows.filter((r) => r.status !== 'decided').length,
    decided: rows.filter((r) => r.status === 'decided').length,
  };
}
