/**
 * api/order-document.js - a buyer fetches one of their order's documents (lib/orderDocuments.js).
 *
 * GET /api/order-document?t=<token>
 *
 * The token (lib/downloadToken.js signOrderDocument) seals the buyer's e-mail, the order id and the file name, so the
 * URL names nobody. Order of checks, each failing closed:
 *   1. DOWNLOAD_TOKEN_SECRET set; token opens, untampered, unexpired.
 *   2. The order exists and the e-mail in the token is the order's buyer (the order e-mail, or the e-mail Stripe
 *      collected at payment). Another buyer's token for this order is refused (403), and the answer does not say
 *      whether the order exists.
 *   3. The file is one the order record lists as issued (agreement, invoice, a credit note). A document that is not
 *      issued yet answers 404 with the recorded reason, never a stand-in.
 * Then: redirect to a presigned private-storage URL that lives for a few minutes (lib/documentStore.js).
 */
import { openOrderDocument } from '../lib/downloadToken.js';
import { getOrder } from '../lib/orders.js';
import { signedOrderDocumentUrl, documentStoreConfigured } from '../lib/documentStore.js';

const first = (v) => (Array.isArray(v) ? v[0] : v);

/** The issued documents of an order, by file name. */
export function issuedDocuments(order) {
  const d = order?.documents || {};
  const out = {};
  if (d.agreement?.status === 'issued') out[d.agreement.file] = { kind: 'agreement', ...d.agreement };
  if (d.invoice?.status === 'issued') out[d.invoice.file] = { kind: 'invoice', ...d.invoice };
  for (const [refundId, c] of Object.entries(d.creditNotes || {})) if (c?.status === 'issued') out[c.file] = { kind: 'credit_note', refundId, ...c };
  return out;
}

export function buyerOwnsOrder(order, email) {
  const e = String(email || '').toLowerCase();
  if (!e || !order) return false;
  return [order.buyer?.contact?.email, order.facts?.purchaseEmail].filter(Boolean).map((x) => String(x).toLowerCase()).includes(e);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.DOWNLOAD_TOKEN_SECRET) {
    console.error('[order-document] DOWNLOAD_TOKEN_SECRET not set - refusing');
    return res.status(503).json({ error: 'Documents are not available right now' });
  }
  const claims = openOrderDocument(first(req.query?.t));
  if (!claims.ok) return res.status(403).json({ error: 'Invalid document link', reason: claims.reason });

  let order;
  try {
    order = await getOrder(claims.orderId);
  } catch (err) {
    console.error('[order-document] order read failed:', err?.message ?? err);
    return res.status(500).json({ error: 'Could not read the order' });
  }
  if (!buyerOwnsOrder(order, claims.email)) return res.status(403).json({ error: 'This link does not belong to this order', reason: 'not-owner' });

  const doc = issuedDocuments(order)[claims.file];
  if (!doc) {
    const pending = order.documents?.[claims.file === order.documents?.invoice?.file ? 'invoice' : 'agreement'];
    return res.status(404).json({ error: 'This document is not available yet', reason: pending?.reason || pending?.status || 'not-issued' });
  }
  if (!documentStoreConfigured()) return res.status(503).json({ error: 'Document storage is not configured', code: 'document_storage_not_configured' });
  try {
    const url = await signedOrderDocumentUrl(claims.orderId, claims.file);
    return res.redirect(302, url);
  } catch (err) {
    console.error('[order-document] signed URL failed:', err?.message ?? err);
    return res.status(500).json({ error: 'Could not generate the document link' });
  }
}
