/**
 * api/sandbox-inspect.js - TEMPORARY, branch `sandbox` only, for the sandbox acceptance test of 11 Nov 2026.
 * NEVER MERGE. Deleted with the branch after the test.
 *
 * Read-only view of the records one sandbox order wrote, so the test can check the stored data rather than the pages:
 * the order (with its applied-once event list), its acceptance record, the buyer's licence (entitlement, with the
 * Stripe sessions it was granted for) and any withheld-sale record.
 *
 * Answers only on a Vercel Preview deployment of the `sandbox` branch. On Preview every database key carries the
 * "preview:" prefix (lib/db.js kvNamespace), so this cannot read a Production record; the deployment itself is behind
 * Vercel Authentication. It writes nothing.
 *
 *   GET /api/sandbox-inspect?order=ord_YYYYMMDD_<hex>
 */
import { getOrder, isOrderId } from '../lib/orders.js';
import { getAcceptance, getEntitlement, getJson, kvNamespace } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'sandbox') {
    return res.status(404).json({ error: 'Not found' });
  }
  const id = String(req.query?.order || '');
  if (!isOrderId(id)) return res.status(400).json({ error: 'order=ord_YYYYMMDD_<hex> is required' });

  const order = await getOrder(id);
  if (!order) return res.status(404).json({ error: 'order not found', namespace: kvNamespace() });

  const sessionId = order.stripe?.sessionId || null;
  const email = order.facts?.purchaseEmail || order.buyer?.contact?.email || null;
  const [acceptance, entitlement, withheld] = await Promise.all([
    order.acceptance?.id ? getAcceptance(order.acceptance.id) : null,
    email ? getEntitlement(email) : null,
    sessionId ? getJson(`sale-withheld:${sessionId}`) : null,
  ]);

  return res.status(200).json({
    namespace: kvNamespace(),
    readAt: new Date().toISOString(),
    order,
    acceptance,
    entitlement,
    withheld,
  });
}
