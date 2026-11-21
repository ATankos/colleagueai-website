#!/usr/bin/env node
// Czech VAT-payer threshold watch (lib/vatTurnover.js): sums the calendar year's LIVE, paid orders WITH PLACE OF
// SUPPLY IN THE CZECH REPUBLIC (read from the tax treatment recorded on each order) in CZK and compares them with
// config/vat-thresholds.json. Read-only. Orders whose place of supply is not established, or that have no CZK
// conversion on their invoice record and no rate passed here, are listed as UNRESOLVED and the result is never 'ok'
// while any exist. A crossing is detected at the date of supply; a later refund does not undo it.
//
//   STRIPE_SECRET_KEY=sk_live_... KV_REST_API_URL=... KV_REST_API_TOKEN=... \
//   node scripts/commerce/vat-turnover.mjs [--year 2026] [--rate USD=23.45] [--json out.json]
//
// --rate CUR=X applies one rate to every order in that currency that has no invoice conversion (use the ČNB rate the
// accountant names; for a precise figure give each order its invoice conversion instead). --year defaults to the
// current year. Exit code: 0 ok, 1 unresolved, approaching or over a threshold, 2 usage error.
import { writeFileSync } from 'node:fs';
import Stripe from 'stripe';
import { stripeOptions } from '../../lib/stripe.js';
import { vatTurnover, describeTurnover } from '../../lib/vatTurnover.js';
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const year = Number(opt('--year') || new Date().getUTCFullYear());
const rates = Object.fromEntries(argv.flatMap((a, i) => (a === '--rate' && argv[i + 1]?.includes('=') ? [argv[i + 1].split('=')] : [])).map(([c, v]) => [c.toUpperCase(), Number(v)]));
if (!process.env.STRIPE_SECRET_KEY || !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN || !Number.isFinite(year)) {
  console.error('Usage: STRIPE_SECRET_KEY=... KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/commerce/vat-turnover.mjs [--year YYYY] [--rate USD=23.45] [--json file]');
  process.exit(2);
}
const { getOrder, orderIdOf } = await import('../../lib/orders.js');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, stripeOptions());
const since = Math.floor(Date.UTC(year, 0, 1) / 1000);
const until = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);
const orders = [];
const seen = new Set();
for await (const s of stripe.checkout.sessions.list({ created: { gte: since, lt: until }, status: 'complete', limit: 100 })) {
  const id = orderIdOf(s);
  if (!id || seen.has(id)) continue;
  seen.add(id);
  const o = await getOrder(id);
  if (o) orders.push(o);
}
const result = vatTurnover({ orders, year, rateFor: (cur) => rates[cur] ?? null });
console.log(describeTurnover(result));
for (const r of result.rows) console.log(`  ${r.orderId}  ${r.supplyDate}  ${r.place.padEnd(10)}  ${r.gross} ${r.currency}${r.refunded ? ` (refunded ${r.refunded})` : ''}  ->  ${r.counts === true ? `CZK ${r.grossCzk} gross / ${r.netCzk} net` : r.counts === false ? 'not Czech turnover' : 'UNRESOLVED'}  (${r.how})`);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(result, null, 2));
process.exit(result.status === 'ok' ? 0 : 1);
