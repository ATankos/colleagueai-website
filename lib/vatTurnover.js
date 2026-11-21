/**
 * lib/vatTurnover.js - how close the company is to the Czech VAT-payer thresholds (config/vat-thresholds.json).
 *
 * An identified person (identifikovaná osoba) stays outside VAT-payer status only while its turnover (obrat, § 4a of
 * Act No. 235/2004 Coll., ZDPH) stays under the thresholds of § 6. Turnover is the consideration for supplies WITH
 * PLACE OF SUPPLY IN THE CZECH REPUBLIC that count under § 4a - not worldwide receipts and not Stripe payouts. This
 * module is pure: it takes order records (lib/orders.js) and returns, for one calendar year, the turnover that counts,
 * the orders it could not classify or convert, and the threshold status. The accountant confirms the rule; nothing
 * here registers anything.
 *
 * Place of supply of an order is read from the tax treatment recorded on the order at checkout (order.tax, written by
 * api/checkout.js from the policy in force), never inferred from the buyer's country alone:
 *   - tax.placeOfSupply, when a later policy records it explicitly ('CZ' | 'outside_cz'), wins;
 *   - otherwise a treatment that was APPLIED (tax.applied === true, an approved policy or the sandbox fixture) with
 *     category 'cz_business' is a domestic supply (§ 9(1) ZDPH: B2B service supplied where the recipient is
 *     established, here the Czech Republic) -> counts;
 *     'eu_business_vat_verified' and 'non_eu_business' are supplied outside the Czech Republic -> do not count;
 *     every other category (VAT ID pending or unverified, no VAT ID) and every order without an applied treatment is
 *     UNRESOLVED: the accountant decides, and the report says so.
 *
 * Amounts: the CZK value is the one the invoice record already carries (invoice.conversion.amountCzk, written at the
 * approved rate), or the gross amount converted at the rate the caller supplies for the date of supply (ČNB rate,
 * § 4(8) ZDPH). An order with neither is UNRESOLVED as well. Unresolved orders are never counted at zero and a report
 * with unresolved orders never concludes 'ok'.
 *
 * Refunds: the thresholds are crossed at the moment of supply. A refund granted later does not undo a crossing that
 * already happened, so the crossing is detected on the running GROSS total in date-of-supply order, and the net total
 * after refunds (credit notes) is reported beside it. Whether a refunded supply reduces turnover for the period is the
 * accountant's call; both figures are there for it.
 */
import THRESHOLDS from '../config/vat-thresholds.json' with { type: 'json' };

const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : null);
const round2 = (n) => Math.round(n * 100) / 100;

/** Place of supply from the recorded tax treatment: 'CZ' | 'outside_cz' | 'unresolved'. Exported for the report. */
export function placeOfSupplyOf(order) {
  const t = order?.tax ?? {};
  if (t.placeOfSupply === 'CZ' || t.placeOfSupply === 'outside_cz') return t.placeOfSupply;
  if (t.applied !== true) return 'unresolved';
  if (t.category === 'cz_business') return 'CZ';
  if (t.category === 'eu_business_vat_verified' || t.category === 'non_eu_business') return 'outside_cz';
  return 'unresolved';
}

/** Gross consideration and refunded amount in major units from an order record. */
function amounts(order) {
  const p = order?.price ?? {};
  const gross = Number(p.unitAmount ?? 0) * Number(p.quantity ?? 1);
  const refunded = Math.min(gross, Number(order?.facts?.refunded?.amount ?? 0));
  return { currency: String(p.currency ?? '').toUpperCase(), gross: gross / 100, refunded: refunded / 100 };
}

/**
 * @param {object}   args
 * @param {object[]} args.orders       order records
 * @param {number}   [args.year]       calendar year; defaults to the current UTC year (never a hard-coded year)
 * @param {function} [args.rateFor]    (currency, dateYYYYMMDD) -> CZK per 1 unit, or null when unknown
 * @param {object}   [args.thresholds] overrides config/vat-thresholds.json (tests)
 * @param {Date}     [args.now]        reference date for the default year (tests)
 */
export function vatTurnover({ orders = [], year, rateFor = () => null, thresholds = THRESHOLDS, now = new Date() } = {}) {
  const y = Number(year ?? now.getUTCFullYear());
  if (Number(thresholds.effectiveFrom) > y) throw new Error(`config/vat-thresholds.json applies from ${thresholds.effectiveFrom}; year ${y} needs the thresholds in force then`);
  const rows = [];
  for (const o of orders) {
    if (!o || o.mode !== 'live') continue;
    const f = o.facts ?? {};
    if (!f.paidAt) continue;
    const supplyDate = dateOf(f.fulfilledAt || f.paidAt);
    if (!supplyDate || Number(supplyDate.slice(0, 4)) !== y) continue;
    const place = placeOfSupplyOf(o);
    const { currency, gross, refunded } = amounts(o);
    const row = { orderId: o.id, supplyDate, place, category: o.tax?.category ?? null, currency, gross, refunded, grossCzk: null, netCzk: null, how: null, counts: null };
    if (place === 'outside_cz') {
      row.counts = false; row.how = 'place of supply outside the Czech Republic (§ 9(1) ZDPH): not Czech turnover';
    } else {
      let rate = null;
      const conv = o.invoice?.conversion;
      if (conv && Number.isFinite(Number(conv.rate)) && Number(conv.rate) > 0) {
        rate = Number(conv.rate); row.how = `invoice conversion ${rate} ${currency}/CZK (${conv.source}, ${conv.date})`;
      } else if (currency === 'CZK') {
        rate = 1; row.how = 'CZK order';
      } else {
        const r = rateFor(currency, supplyDate);
        if (Number.isFinite(r) && r > 0) { rate = r; row.how = `rate ${r} ${currency}/CZK for ${supplyDate}`; }
      }
      if (rate !== null) {
        row.grossCzk = round2(conv && Number.isFinite(Number(conv.amountCzk)) ? Number(conv.amountCzk) : gross * rate);
        row.netCzk = round2(row.grossCzk - refunded * rate);
      }
      if (place === 'unresolved') { row.counts = null; row.how = `UNRESOLVED: place of supply not established (${o.tax?.applied === true ? `category ${o.tax.category}` : 'no tax treatment applied at checkout'})${rate === null ? '; no CZK rate' : ''}`; }
      else if (rate === null) { row.counts = null; row.how = 'UNRESOLVED: no CZK conversion on the invoice record and no rate supplied'; }
      else row.counts = true;
    }
    rows.push(row);
  }
  rows.sort((a, b) => a.supplyDate.localeCompare(b.supplyDate) || a.orderId.localeCompare(b.orderId));

  const low = Number(thresholds.payerFromNextYearCzk);
  const high = Number(thresholds.payerImmediatelyCzk);
  const warnAt = low * Number(thresholds.warnAtShare ?? 0.8);
  // Crossings are detected on the running gross total in date-of-supply order: a later refund never undoes them.
  let running = 0;
  let crossedLowAt = null;
  let crossedHighAt = null;
  for (const r of rows) {
    if (r.counts !== true) continue;
    running += r.grossCzk;
    if (!crossedLowAt && running > low) crossedLowAt = r.supplyDate;
    if (!crossedHighAt && running > high) crossedHighAt = r.supplyDate;
  }
  const grossCzk = round2(running);
  const netCzk = round2(rows.filter((r) => r.counts === true).reduce((s, r) => s + r.netCzk, 0));
  const unresolved = rows.filter((r) => r.counts === null).map((r) => r.orderId);
  const status = crossedHighAt ? 'over_immediate_threshold'
    : crossedLowAt ? 'over_next_year_threshold'
    : unresolved.length ? 'unresolved'
    : grossCzk >= warnAt ? 'approaching'
    : 'ok';
  return {
    year: y, status, grossCzk, netCzk, headroomCzk: round2(low - grossCzk), crossedLowAt, crossedHighAt,
    thresholds: { payerFromNextYearCzk: low, payerImmediatelyCzk: high, warnAtCzk: warnAt },
    counted: rows.filter((r) => r.counts === true).length, excluded: rows.filter((r) => r.counts === false).length,
    unresolved, rows,
  };
}

/** One-paragraph reading of the result for a report or a log line. */
export function describeTurnover(r) {
  const fmt = (n) => `CZK ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const base = `${r.year}: Czech turnover ${fmt(r.grossCzk)} gross (${fmt(r.netCzk)} net of refunds) from ${r.counted} domestic order(s); ${r.excluded} order(s) supplied outside the Czech Republic do not count`;
  const gap = r.unresolved.length ? `; ${r.unresolved.length} order(s) UNRESOLVED (${r.unresolved.join(', ')}) - place of supply or CZK value not established, NOT included: the accountant must classify them before any conclusion` : '';
  const verdict = {
    ok: `; ${fmt(r.headroomCzk)} below the ${fmt(r.thresholds.payerFromNextYearCzk)} threshold.`,
    unresolved: `; no conclusion until the unresolved orders are classified.`,
    approaching: `; within ${Math.round((1 - r.thresholds.warnAtCzk / r.thresholds.payerFromNextYearCzk) * 100)}% of the ${fmt(r.thresholds.payerFromNextYearCzk)} threshold: tell the accountant now.`,
    over_next_year_threshold: `; the ${fmt(r.thresholds.payerFromNextYearCzk)} threshold was crossed on ${r.crossedLowAt} (a later refund does not undo it): VAT-payer status from 1 January of next year unless the accountant says otherwise; registration deadline applies.`,
    over_immediate_threshold: `; the ${fmt(r.thresholds.payerImmediatelyCzk)} threshold was crossed on ${r.crossedHighAt}: VAT-payer status from the day after; stop selling under the identified-person configuration and call the accountant today.`,
  }[r.status];
  return base + gap + verdict;
}
