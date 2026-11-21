/**
 * lib/vatTurnover.js - how close the company is to the Czech VAT-payer thresholds (config/vat-thresholds.json).
 *
 * An identified person (identifikovaná osoba) stays outside VAT-payer status only while its calendar-year turnover
 * stays under the thresholds, so the launch configuration (no Czech VAT on domestic B2B sales) is not permanent: it
 * has to be watched. This module is pure. It takes order records (lib/orders.js) and returns the turnover that
 * counts so far in a calendar year, in CZK, with each order's conversion shown, and the threshold status.
 *
 * What counts (accountant decision T1/T8 of the Accountant Decision Pack; the accountant confirms the rule):
 *   - orders in LIVE mode (test orders never count),
 *   - paid, not fully refunded; a partial refund reduces the amount,
 *   - the date of supply is the fulfilment date (licence delivered), falling back to the payment date,
 *   - the CZK value is the amount the invoice record already carries (invoice.conversion.amountCzk, written at the
 *     approved rate), or the amount converted at the rate the caller supplies for that date (ČNB rate for the date
 *     of supply, § 4(8) ZDPH). An order with neither is listed as unconverted and excluded from the total, so the
 *     report never understates silently: the caller sees exactly which orders still need a rate.
 *
 * Nothing here decides registration: the result is for the founder and the accountant to act on.
 */
import THRESHOLDS from '../config/vat-thresholds.json' with { type: 'json' };

const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : null);

/** Money in major units from an order's price record (unitAmount is in minor units, quantity defaults to 1). */
function orderAmount(order) {
  const p = order?.price ?? {};
  const minor = Number(p.unitAmount ?? 0) * Number(p.quantity ?? 1);
  const refunded = Number(order?.facts?.refunded?.amount ?? 0);
  return { currency: String(p.currency ?? '').toUpperCase(), amount: Math.max(0, minor - refunded) / 100 };
}

/**
 * @param {object} args
 * @param {object[]} args.orders            order records
 * @param {number}   [args.year]            calendar year; defaults to the thresholds file's year
 * @param {function} [args.rateFor]         (currency, dateYYYYMMDD) -> CZK per 1 unit, or null when unknown
 * @param {object}   [args.thresholds]      overrides config/vat-thresholds.json (tests)
 */
export function vatTurnover({ orders = [], year = THRESHOLDS.year, rateFor = () => null, thresholds = THRESHOLDS } = {}) {
  const rows = [];
  const unconverted = [];
  let totalCzk = 0;
  for (const o of orders) {
    if (!o || o.mode !== 'live') continue;
    const f = o.facts ?? {};
    if (!f.paidAt || f.refunded?.full) continue;
    const supplyDate = dateOf(f.fulfilledAt || f.paidAt);
    if (!supplyDate || Number(supplyDate.slice(0, 4)) !== Number(year)) continue;
    const { currency, amount } = orderAmount(o);
    let czk = null;
    let how = null;
    const conv = o.invoice?.conversion;
    if (conv && Number.isFinite(Number(conv.amountCzk))) {
      czk = Number(conv.amountCzk) - Number(f.refunded?.amount ?? 0) / 100 * Number(conv.rate ?? 0);
      how = `invoice conversion ${conv.rate} ${currency}/CZK (${conv.source}, ${conv.date})`;
    } else if (currency === 'CZK') {
      czk = amount; how = 'CZK order';
    } else {
      const rate = rateFor(currency, supplyDate);
      if (Number.isFinite(rate) && rate > 0) { czk = amount * rate; how = `rate ${rate} ${currency}/CZK for ${supplyDate}`; }
    }
    const row = { orderId: o.id, supplyDate, currency, amount, czk: czk === null ? null : Math.round(czk * 100) / 100, how };
    rows.push(row);
    if (czk === null) unconverted.push(o.id); else totalCzk += czk;
  }
  totalCzk = Math.round(totalCzk * 100) / 100;
  const low = Number(thresholds.payerFromNextYearCzk);
  const high = Number(thresholds.payerImmediatelyCzk);
  const warnAt = low * Number(thresholds.warnAtShare ?? 0.8);
  const status = totalCzk > high ? 'over_immediate_threshold'
    : totalCzk > low ? 'over_next_year_threshold'
    : totalCzk >= warnAt ? 'approaching'
    : 'ok';
  const headroomCzk = Math.round((low - totalCzk) * 100) / 100;
  return { year: Number(year), totalCzk, status, headroomCzk, thresholds: { payerFromNextYearCzk: low, payerImmediatelyCzk: high, warnAtCzk: warnAt }, rows, unconverted };
}

/** One-paragraph reading of the result for a report or a log line. */
export function describeTurnover(r) {
  const fmt = (n) => `CZK ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const base = `${r.year}: counted turnover ${fmt(r.totalCzk)} from ${r.rows.length - r.unconverted.length} order(s)`;
  const gap = r.unconverted.length ? `; ${r.unconverted.length} order(s) not yet converted to CZK (${r.unconverted.join(', ')}) are NOT included` : '';
  const verdict = {
    ok: `; ${fmt(r.headroomCzk)} below the ${fmt(r.thresholds.payerFromNextYearCzk)} threshold.`,
    approaching: `; within ${Math.round((1 - r.thresholds.warnAtCzk / r.thresholds.payerFromNextYearCzk) * 100)}% of the ${fmt(r.thresholds.payerFromNextYearCzk)} threshold: tell the accountant now.`,
    over_next_year_threshold: `; ABOVE ${fmt(r.thresholds.payerFromNextYearCzk)}: VAT-payer status from 1 January of next year unless the accountant says otherwise; registration deadline applies.`,
    over_immediate_threshold: `; ABOVE ${fmt(r.thresholds.payerImmediatelyCzk)}: VAT-payer status from the day after the threshold was crossed; stop selling under the identified-person configuration and call the accountant today.`,
  }[r.status];
  return base + gap + verdict;
}
