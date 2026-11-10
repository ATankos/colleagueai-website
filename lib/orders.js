/**
 * lib/orders.js - one order record per purchase attempt, keyed by an order id that every other record carries.
 *
 *   order:<orderId>  -> JSON (below)
 *
 * The order id is created on the order-confirmation POST, before anything else exists, and is written into:
 * the acceptance record, the Stripe Customer (metadata), the Checkout Session (metadata and client_reference_id), the
 * PaymentIntent and therefore every Charge, refund and dispute (payment_intent_data.metadata), and the invoice
 * (invoice_creation.invoice_data.metadata, when invoicing is switched on). The entitlement records the session id, and
 * the session names the order. So checkout, Stripe, invoice, entitlement and download records all point at one id,
 * and a refund or dispute event finds its order without a search.
 *
 * Stripe events can arrive twice and in any order (a dispute before the payment confirmation, a refund before the
 * webhook that fulfils). The record therefore stores FACTS (paid at, refunded amount, dispute status, ...) rather
 * than a state machine, and the status shown is derived from the facts (orderStatus). Each event is applied once:
 * its id is remembered on the record, so a redelivery changes nothing. Every write is a compare-and-set
 * (lib/db.js updateJson), so two events landing at the same moment cannot overwrite each other.
 *
 * The record holds business identification (company, registration number, country, VAT ID, a contact, the person
 * who accepted the terms). No card data and no plain IP address; Stripe holds the payment details.
 */
import { randomBytes } from 'node:crypto';
import { getJson, setJson, updateJson } from './db.js';

const ORDER_RE = /^ord_\d{8}_[0-9a-f]{12}$/;
const MAX_EVENTS = 60;

export function newOrderId(now = new Date()) {
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `ord_${d}_${randomBytes(6).toString('hex')}`;
}

export function isOrderId(id) {
  return ORDER_RE.test(String(id || ''));
}

const keyOf = (id) => `order:${id}`;

/** Store a new order. Refuses to overwrite an existing id (returns false). */
export async function createOrder(order) {
  if (!isOrderId(order?.id)) throw new Error('createOrder: invalid order id');
  const record = { createdAt: new Date().toISOString(), facts: {}, events: [], ...order };
  record.status = orderStatus(record);
  const stored = await setJson(keyOf(order.id), record, { onlyIfAbsent: true });
  return stored ? record : null;
}

export async function getOrder(id) {
  if (!isOrderId(id)) return null;
  return getJson(keyOf(id));
}

/**
 * Change an order with a pure function of the stored record: change(order) returns the next record, or null/undefined
 * for "nothing to write". Returns the record as stored afterwards (null when the order does not exist).
 */
export async function updateOrder(id, change) {
  if (!isOrderId(id)) return null;
  return updateJson(keyOf(id), (existing) => {
    if (!existing) return { result: null };
    const next = change(existing);
    if (!next || next === existing) return { result: existing };
    next.status = orderStatus(next);
    next.updatedAt = new Date().toISOString();
    return { next, result: next };
  });
}

/**
 * Apply one Stripe event (or another dated source of facts) to an order, once. `facts` are merged into order.facts;
 * `set` replaces top-level sections (stripe, invoice, tax ...) by shallow merge. A source id that was already applied
 * changes nothing, so redeliveries and the thank-you page repeating the webhook's work are harmless.
 */
export function applyOnce(order, { sourceId, type, facts = {}, set = {} }) {
  if (sourceId && (order.events ?? []).some((e) => e.id === sourceId)) return null;
  const next = { ...order, facts: { ...(order.facts ?? {}), ...facts } };
  for (const [k, v] of Object.entries(set)) {
    next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(order[k] ?? {}), ...v } : v;
  }
  if (sourceId) {
    next.events = [...(order.events ?? []), { id: sourceId, type: type ?? null, at: new Date().toISOString() }].slice(-MAX_EVENTS);
  }
  return next;
}

/** Record a fact from a Stripe event on the order it names. A missing order is reported, not created. */
export async function recordOrderEvent(orderId, update) {
  return updateOrder(orderId, (order) => applyOnce(order, update));
}

/**
 * The status shown for an order, from its facts. Order of precedence: a withheld sale and money returned outrank
 * everything; an open dispute outranks fulfilment; then fulfilment, payment, and the states before payment.
 */
export function orderStatus(order) {
  const f = order?.facts ?? {};
  if (f.withheld) return 'withheld';
  if (f.refunded?.full) return 'refunded';
  if (f.dispute?.status === 'lost') return 'dispute_lost';
  if (f.dispute && f.dispute.status !== 'won') return 'disputed';
  if (f.refunded?.amount > 0) return 'partially_refunded';
  if (f.fulfilledAt) return 'fulfilled';
  if (f.paidAt) return 'paid';
  if (f.paymentFailedAt) return 'payment_failed';
  if (f.expiredAt) return 'expired';
  if (f.paymentPendingAt) return 'awaiting_payment';
  if (f.checkoutFailedAt) return 'checkout_failed';
  if (f.checkoutOpenedAt) return 'checkout_open';
  return 'created';
}

/** The order id a Stripe object names: metadata first, then the Checkout Session's client_reference_id. */
export function orderIdOf(obj) {
  const candidates = [
    obj?.metadata?.order_id,
    obj?.payment_intent?.metadata?.order_id,
    obj?.subscription_details?.metadata?.order_id,
    obj?.parent?.subscription_details?.metadata?.order_id,
    obj?.object === 'checkout.session' ? obj?.client_reference_id : null,
  ];
  return candidates.find((c) => isOrderId(c)) ?? null;
}
