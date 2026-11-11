/**
 * lib/reconciliation.js - one row per Stripe balance transaction in a payout, matched to its order.
 *
 * The accountant reconciles each Stripe payout to the bank statement. This turns the payout's balance transactions
 * (charges, refunds, dispute withdrawals and reinstatements, fees) into rows that name the order, the invoice or
 * credit-note number and the amounts, and checks that the rows add up to the payout. A row whose order cannot be
 * found is listed as unmatched rather than dropped. Amounts stay in Stripe's minor units and in the balance
 * currency; conversion to CZK (T8) is the accountant's step and is not done here.
 */

const sourceOf = (bt) => (typeof bt.source === 'object' && bt.source ? bt.source : null);

/** The order id a balance transaction's source names: a charge's metadata, a refund's charge, a dispute's charge. */
export function orderIdForBalanceTransaction(bt) {
  const src = sourceOf(bt);
  if (!src) return null;
  const meta = (o) => (o && typeof o === 'object' ? o.metadata?.order_id || null : null);
  return meta(src) || meta(src.charge) || meta(src.payment_intent) || meta(src.charge?.payment_intent) || null;
}

/**
 * @param payout               the Stripe payout ({ id, amount, currency, arrival_date })
 * @param balanceTransactions  its balance transactions, with `source` expanded
 * @param orders               a Map or object of orderId -> order record (lib/orders.js)
 */
export function reconcilePayout({ payout, balanceTransactions, orders }) {
  const get = (id) => (orders instanceof Map ? orders.get(id) : orders?.[id]) ?? null;
  const rows = [];
  const unmatched = [];
  let net = 0;
  for (const bt of balanceTransactions) {
    if (bt.type === 'payout') continue; // the payout itself is the total being checked
    const orderId = orderIdForBalanceTransaction(bt);
    const order = orderId ? get(orderId) : null;
    const src = sourceOf(bt);
    const refundId = src?.object === 'refund' ? src.id : null;
    const creditNote = refundId ? (order?.creditNotes ?? []).find((c) => c.refundId === refundId) : null;
    const row = {
      balanceTransaction: bt.id, type: bt.type, created: bt.created, currency: bt.currency,
      gross: bt.amount, fee: bt.fee, net: bt.net,
      source: src?.id ?? (typeof bt.source === 'string' ? bt.source : null),
      orderId, buyer: order?.buyer?.company ?? null, buyerCountry: order?.buyer?.country ?? null,
      buyerVatId: order?.buyer?.taxId?.value ?? null,
      invoiceNumber: order?.invoice?.number ?? null, creditNoteNumber: creditNote?.number ?? null,
      taxCategory: order?.tax?.category ?? null,
    };
    rows.push(row);
    net += bt.net;
    if (!order && ['charge', 'payment', 'refund', 'payment_refund', 'adjustment'].includes(bt.type)) unmatched.push(row);
  }
  return {
    payout: payout?.id ?? null, currency: payout?.currency ?? null, payoutAmount: payout?.amount ?? null,
    rows, unmatched, net, matchesPayout: payout ? net === payout.amount : null,
  };
}

const CSV_COLUMNS = ['balanceTransaction', 'type', 'created', 'currency', 'gross', 'fee', 'net', 'source', 'orderId', 'buyer', 'buyerCountry', 'buyerVatId', 'invoiceNumber', 'creditNoteNumber', 'taxCategory'];

export function toCsv(result) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLUMNS.join(','), ...result.rows.map((r) => CSV_COLUMNS.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
