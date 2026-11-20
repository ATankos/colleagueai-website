/**
 * lib/documentStore.js - where an order's documents live: the private Blob store that already holds the release
 * packages (lib/storage.js), under
 *
 *   orders/<orderId>/<file>      e.g. orders/ord_20261120_ab12cd34ef56/licence-agreement-confirmation.pdf
 *
 * Private means: no public URL exists. A buyer reaches a document only through api/order-document.js, which opens a
 * sealed token naming the buyer's email and the order, checks that the email belongs to that order, and redirects to
 * a presigned GET link that lives for a few minutes. Nothing about the buyer is in the object key, and the key is
 * never shown.
 *
 * Writes never overwrite: a document is stored once under its name (allowOverwrite false). A second attempt for the
 * same file (a webhook retry after the first write succeeded but the order record did not) is answered by the
 * existing object, which lib/orderDocuments.js then verifies by hash. Without a Blob store nothing is stored and the
 * caller records that (status 'failed', reason 'storage_not_configured'): a sale is never silently "documented".
 */
import { createHash } from 'node:crypto';
import { blobConfigured, blobSdkInUse, signedBlobUrl } from './storage.js';
import { isOrderId } from './orders.js';

const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.pdf$/;

export function documentStoreConfigured() {
  return blobConfigured();
}

export function orderDocumentKey(orderId, file) {
  if (!isOrderId(orderId)) throw new Error('orderDocumentKey: invalid order id');
  if (!FILE_RE.test(String(file))) throw new Error('orderDocumentKey: invalid file name');
  return `orders/${orderId}/${file}`;
}

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Store a PDF for an order. Returns { stored: true, key, sha256, bytes } or, when the object already exists,
 * { stored: false, exists: true, key }. Throws when the store is not configured or the write fails.
 */
export async function putOrderDocument(orderId, file, bytes, { contentType = 'application/pdf' } = {}) {
  if (!documentStoreConfigured()) throw Object.assign(new Error('document store not configured'), { code: 'storage_not_configured' });
  const key = orderDocumentKey(orderId, file);
  const sdk = await blobSdkInUse();
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  try {
    await sdk.put(key, body, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 0 });
    return { stored: true, key, sha256: sha256Hex(body), bytes: body.length };
  } catch (err) {
    const exists = /already exists|allowOverwrite/i.test(String(err?.message || err)) || err?.name === 'BlobError' && /exists/i.test(String(err?.message));
    if (exists) return { stored: false, exists: true, key };
    throw err;
  }
}

/** { size, uploadedAt } of a stored document, or null when it is not there. Other errors propagate. */
export async function headOrderDocument(orderId, file) {
  if (!documentStoreConfigured()) return null;
  const key = orderDocumentKey(orderId, file);
  const sdk = await blobSdkInUse();
  try {
    const h = await sdk.head(key);
    return h ? { size: h.size ?? null, uploadedAt: h.uploadedAt ?? null } : null;
  } catch (err) {
    const notFound = err?.name === 'BlobNotFoundError' || (typeof sdk.BlobNotFoundError === 'function' && err instanceof sdk.BlobNotFoundError);
    if (notFound) return null;
    throw err;
  }
}

/** The stored bytes of a document (Buffer), or null when it is not there. */
export async function getOrderDocument(orderId, file) {
  if (!documentStoreConfigured()) return null;
  const key = orderDocumentKey(orderId, file);
  const sdk = await blobSdkInUse();
  const got = await sdk.get(key, { access: 'private', useCache: false });
  if (!got) return null;
  if (got.stream) {
    const chunks = [];
    for await (const c of got.stream) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  }
  if (got.blob) return Buffer.from(await got.blob.arrayBuffer());
  return null;
}

/** A short-lived presigned GET URL for a stored document, or null when no store is configured. */
export async function signedOrderDocumentUrl(orderId, file) {
  if (!documentStoreConfigured()) return null;
  return signedBlobUrl(orderDocumentKey(orderId, file));
}
