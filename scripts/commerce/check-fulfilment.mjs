#!/usr/bin/env node
// Check that every completed Checkout Session in a period has the order state and licence its payment calls for
// (lib/fulfilmentCheck.js). Read-only: it lists Checkout Sessions in Stripe and reads order, entitlement and
// withheld-sale records; it changes nothing in Stripe or KV. Run it daily, or after any webhook outage.
//
//   STRIPE_SECRET_KEY=sk_test_... KV_REST_API_URL=... KV_REST_API_TOKEN=... [VERCEL_ENV=preview] \
//   node scripts/commerce/check-fulfilment.mjs [--days 7 | --since 2026-11-01] [--csv out.csv]
//
// VERCEL_ENV=preview reads the Preview records (the "preview:" key prefix, lib/db.js); leave it unset for Production.
// Exit code 0 = no problems (bank transfers still awaited are listed but are not problems); 1 = problems listed;
// 2 = usage error.
import { writeFileSync } from 'node:fs';
import Stripe from 'stripe';
import { stripeOptions } from '../../lib/stripe.js';
import { checkFulfilment, fulfilmentCsv } from '../../lib/fulfilmentCheck.js';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const days = Number(opt('--days') || 7);
const since = opt('--since') ? Math.floor(Date.parse(opt('--since')) / 1000) : Math.floor(Date.now() / 1000) - days * 86400;
if (!process.env.STRIPE_SECRET_KEY || !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN || !Number.isFinite(since)) {
  console.error('Usage: STRIPE_SECRET_KEY=... KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/commerce/check-fulfilment.mjs [--days N | --since YYYY-MM-DD] [--csv file]');
  process.exit(2);
}
const { getOrder } = await import('../../lib/orders.js');
const { getEntitlement, getJson } = await import('../../lib/db.js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, stripeOptions());
const sessions = [];
for await (const s of stripe.checkout.sessions.list({ created: { gte: since }, status: 'complete', limit: 100 })) sessions.push(s);

const orders = new Map();
const entitlements = new Map();
const withheld = new Map();
for (const s of sessions) {
  const id = s.metadata?.order_id;
  if (id && !orders.has(id)) orders.set(id, await getOrder(id));
  const email = (s.customer_details?.email || s.metadata?.email || '').toLowerCase();
  if (email && !entitlements.has(email)) entitlements.set(email, await getEntitlement(email));
  withheld.set(s.id, await getJson(`sale-withheld:${s.id}`));
}
const result = checkFulfilment({ sessions, orders, entitlements, withheld });
const csv = fulfilmentCsv(result);
if (opt('--csv')) writeFileSync(opt('--csv'), csv); else process.stdout.write(csv);
console.error(`${result.checked} completed sessions since ${new Date(since * 1000).toISOString().slice(0, 10)}; problems: ${result.problems}`);
process.exit(result.problems ? 1 : 0);
