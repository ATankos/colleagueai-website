#!/usr/bin/env node
// Reconcile one Stripe payout to ColleagueAI orders (lib/reconciliation.js). Read-only: it lists the payout's balance
// transactions and reads order records; it changes nothing in Stripe or KV.
//
//   STRIPE_SECRET_KEY=sk_test_... [KV_REST_API_URL=... KV_REST_API_TOKEN=...] \
//   node scripts/commerce/reconcile-payout.mjs --payout po_123 [--csv out.csv]
//
// Without KV credentials the rows still carry the order id from Stripe metadata, but no invoice or credit-note number.
// Exit code 0 = the rows add up to the payout; 1 = they do not, or some rows match no order (listed); 2 = usage error.
import { writeFileSync } from 'node:fs';
import Stripe from 'stripe';
import { stripeOptions } from '../../lib/stripe.js';
import { reconcilePayout, toCsv } from '../../lib/reconciliation.js';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const payoutId = opt('--payout');
if (!process.env.STRIPE_SECRET_KEY || !/^po_/.test(String(payoutId))) {
  console.error('Usage: STRIPE_SECRET_KEY=... node scripts/commerce/reconcile-payout.mjs --payout po_... [--csv file]');
  process.exit(2);
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, stripeOptions());
const payout = await stripe.payouts.retrieve(payoutId);
const balanceTransactions = [];
for await (const bt of stripe.balanceTransactions.list({ payout: payoutId, limit: 100, expand: ['data.source', 'data.source.charge'] })) {
  balanceTransactions.push(bt);
}
const orders = new Map();
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  const { getOrder } = await import('../../lib/orders.js');
  const { orderIdForBalanceTransaction } = await import('../../lib/reconciliation.js');
  for (const bt of balanceTransactions) {
    const id = orderIdForBalanceTransaction(bt);
    if (id && !orders.has(id)) orders.set(id, await getOrder(id));
  }
}
const result = reconcilePayout({ payout, balanceTransactions, orders });
const csv = toCsv(result);
if (opt('--csv')) writeFileSync(opt('--csv'), csv); else process.stdout.write(csv);
console.error(`Payout ${payout.id}: ${payout.amount} ${payout.currency}; rows net ${result.net}; ${result.matchesPayout ? 'MATCHES' : 'DOES NOT MATCH'}; unmatched rows: ${result.unmatched.length}`);
process.exit(result.matchesPayout && result.unmatched.length === 0 ? 0 : 1);
