/**
 * lib/orderDocuments.js - everything a paid order should end up with, produced once and recorded on the order:
 *
 *   order.documents = {
 *     agreement:   { status, file, key, sha256, bytes, reference, issuedAt | reason, detail, at }
 *     invoice:     { status, file, key, sha256, bytes, number, provider, issuedAt | reason ... }
 *     creditNotes: { <refundId>: { status, file, key, sha256, number ... } }
 *     checkedAt, summary: { complete, missing: [...] }
 *   }
 *   evidence:<orderId>  (KV)  the company's evidence package: acceptance references, invoice and credit-note
 *                             identifiers, payment facts, document hashes, delivery events, release version.
 *
 * Trigger: the legally relevant event is the confirmed payment (the fulfilment path in api/webhook.js, and the invoice
 * events that follow for the Stripe route). Every step is idempotent: a document that is issued is never produced
 * again, a stored object that exists is matched by hash, and an evidence record is merged, not replaced.
 *
 * Failure: a document that cannot be produced is recorded as failed with its reason and the order's summary says what
 * is missing. Nothing throws out of ensureOrderDocuments for an expected failure, because a document problem must
 * never undo a licence that was rightly granted; the webhook logs an [ALERT] and the fulfilment check
 * (lib/fulfilmentCheck.js, scripts/commerce/check-fulfilment.mjs) lists the order until a person or a retry completes
 * it. An order is reported complete only when the agreement confirmation and the invoice (or, while invoicing is
 * switched off, the recorded reason) are both there.
 */
import { getAcceptance, getJson, updateJson } from './db.js';
import { getOrder, updateOrder } from './orders.js';
import { buildAgreementPdf, AGREEMENT_FILE } from './agreementPdf.js';
import { invoiceModel, creditNoteModel, renderInvoicePdf, invoiceFileName, creditNoteFileName } from './invoicePdf.js';
import { documentStoreConfigured, putOrderDocument, headOrderDocument, getOrderDocument, sha256Hex } from './documentStore.js';
import { productFor, releaseOfVersion, canonicalSlug } from './products.js';

const PDF_MAGIC = '%PDF-';

/** Fetch a PDF by URL (a Stripe-hosted invoice or credit-note PDF). Swappable for tests. */
let fetchPdf = async (url) => {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`pdf fetch answered ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 5).toString('latin1') !== PDF_MAGIC) throw new Error('fetched file is not a PDF');
  return buf;
};
export function __setPdfFetchForTests(fn) { fetchPdf = fn || fetchPdf; }

const failed = (reason, err, now, extra = {}) => ({
  status: 'failed', reason, detail: err ? String(err?.message || err).slice(0, 200) : undefined, at: now.toISOString(), ...extra,
});

/** Store bytes under `file` for the order, or accept the identical object already there. */
async function storeOnce(orderId, file, bytes, now) {
  if (!documentStoreConfigured()) return failed('storage_not_configured', null, now);
  const existing = await headOrderDocument(orderId, file);
  if (existing) {
    // Produced on an earlier attempt whose record write was lost (or by a parallel retry). The stored object is the
    // document: the record describes it, hashed as stored, never as regenerated now.
    const storedBytes = await getOrderDocument(orderId, file);
    if (!storedBytes) return failed('stored_object_unreadable', null, now, { file });
    return { status: 'issued', file, key: `orders/${orderId}/${file}`, sha256: sha256Hex(storedBytes), bytes: storedBytes.length, issuedAt: existing.uploadedAt || now.toISOString(), reused: true };
  }
  const put = await putOrderDocument(orderId, file, bytes);
  if (put.exists) return storeOnce(orderId, file, bytes, now); // lost the race to our own retry: read it back
  return { status: 'issued', file, key: put.key, sha256: put.sha256, bytes: put.bytes, issuedAt: now.toISOString() };
}

async function agreementDocument(order, acceptance, now, baseUrl) {
  if (order.documents?.agreement?.status === 'issued') return order.documents.agreement;
  try {
    const { model, bytes } = await buildAgreementPdf({ order, acceptance, now, baseUrl });
    const stored = await storeOnce(order.id, AGREEMENT_FILE, Buffer.from(bytes), now);
    return stored.status === 'issued' ? { ...stored, reference: model.reference, legalSet: model.legalSet } : stored;
  } catch (err) {
    return failed(err?.code === 'storage_not_configured' ? 'storage_not_configured' : 'agreement_generation_failed', err, now);
  }
}

async function invoiceDocument(order, now) {
  const cur = order.documents?.invoice;
  if (cur?.status === 'issued') return cur;
  const inv = order.invoice || {};
  if (inv.status !== 'issued') {
    // Not an error of this step: the invoice itself is pending, failed or switched off, and the order says which.
    return { status: 'waiting', reason: `invoice_${inv.status || 'missing'}`, at: now.toISOString() };
  }
  const file = invoiceFileName(inv.number || inv.id);
  try {
    if (inv.provider === 'sandbox_ledger') {
      const doc = await getJson(`invoice:sandbox_ledger:${inv.number}`);
      if (!doc) return failed('ledger_document_missing', null, now, { number: inv.number });
      const bytes = await renderInvoicePdf(invoiceModel({ doc, order, now }));
      const stored = await storeOnce(order.id, file, Buffer.from(bytes), now);
      return stored.status === 'issued' ? { ...stored, number: inv.number, provider: inv.provider, test: true } : stored;
    }
    if (inv.provider === 'stripe') {
      if (!inv.pdfUrl) return { status: 'waiting', reason: 'stripe_pdf_not_yet_available', at: now.toISOString() };
      const bytes = await fetchPdf(inv.pdfUrl);
      const stored = await storeOnce(order.id, file, bytes, now);
      return stored.status === 'issued' ? { ...stored, number: inv.number, provider: 'stripe', source: 'stripe_invoice_pdf' } : stored;
    }
    return failed('invoice_provider_unsupported', null, now, { provider: inv.provider });
  } catch (err) {
    return failed(err?.code === 'storage_not_configured' ? 'storage_not_configured' : 'invoice_document_failed', err, now, { number: inv.number, provider: inv.provider });
  }
}

async function creditNoteDocuments(order, now) {
  const out = { ...(order.documents?.creditNotes || {}) };
  for (const entry of order.creditNotes || []) {
    if (entry.status !== 'issued' || out[entry.refundId]?.status === 'issued') continue;
    const file = creditNoteFileName(entry.number || entry.id);
    try {
      let bytes;
      if (entry.provider === 'sandbox_ledger') {
        const invoiceDoc = order.invoice?.number ? await getJson(`invoice:sandbox_ledger:${order.invoice.number}`) : null;
        bytes = Buffer.from(await renderInvoicePdf(creditNoteModel({ entry, invoiceDoc, order, now })));
      } else if (entry.provider === 'stripe' && entry.pdfUrl) {
        bytes = await fetchPdf(entry.pdfUrl);
      } else {
        out[entry.refundId] = { status: 'waiting', reason: 'credit_note_pdf_not_available', at: now.toISOString(), number: entry.number };
        continue;
      }
      const stored = await storeOnce(order.id, file, bytes, now);
      out[entry.refundId] = stored.status === 'issued' ? { ...stored, number: entry.number, provider: entry.provider, refundId: entry.refundId } : stored;
    } catch (err) {
      out[entry.refundId] = failed('credit_note_document_failed', err, now, { number: entry.number, refundId: entry.refundId });
    }
  }
  return out;
}

/** What is still missing for the order to count as fully documented. */
export function documentsSummary(order) {
  const d = order?.documents || {};
  const missing = [];
  if (d.agreement?.status !== 'issued') missing.push(`agreement:${d.agreement?.reason || d.agreement?.status || 'not_produced'}`);
  const inv = order?.invoice || {};
  if (inv.status === 'issued') {
    if (d.invoice?.status !== 'issued') missing.push(`invoice_document:${d.invoice?.reason || d.invoice?.status || 'not_produced'}`);
  } else if (inv.status === 'not_configured') {
    // Invoicing switched off (tax policy not approved). A LIVE sale without an invoice is not fully documented; a
    // test order under the unapproved policy is documented as far as the configuration allows, and says so in notes.
    if (order?.mode === 'live') missing.push('invoice:not_configured');
  } else {
    missing.push(`invoice:${inv.status || 'missing'}`);
  }
  for (const c of order?.creditNotes || []) {
    if (c.status === 'issued' && d.creditNotes?.[c.refundId]?.status !== 'issued') missing.push(`credit_note_document:${c.refundId}`);
  }
  if (order?.notifications?.buyer && order.notifications.buyer.status !== 'sent') missing.push(`notification:${order.notifications.buyer.reason || order.notifications.buyer.status}`);
  const notes = inv.status === 'not_configured' && order?.mode !== 'live' ? ['invoice:not_configured (test order, invoicing switched off)'] : [];
  return { complete: missing.length === 0, missing, ...(notes.length ? { notes } : {}) };
}

/**
 * Produce and record every document the order can have now. Returns the order as stored afterwards, or null when the
 * order does not exist or has not been paid. Never throws for an expected failure (see the header).
 */
export async function ensureOrderDocuments({ orderId, now = new Date(), baseUrl = 'https://www.colleagueai.ai' }) {
  const order = await getOrder(orderId);
  if (!order || !order.facts?.paidAt) return null;
  let acceptance = null;
  if (order.acceptance?.id) {
    try { acceptance = await getAcceptance(order.acceptance.id); } catch { acceptance = null; }
  }
  const agreement = await agreementDocument(order, acceptance, now, baseUrl);
  const invoice = await invoiceDocument({ ...order, documents: { ...(order.documents || {}), agreement } }, now);
  const creditNotes = await creditNoteDocuments(order, now);
  const stored = await updateOrder(orderId, (o) => {
    const documents = { ...(o.documents || {}), agreement: o.documents?.agreement?.status === 'issued' ? o.documents.agreement : agreement,
      invoice: o.documents?.invoice?.status === 'issued' ? o.documents.invoice : invoice,
      creditNotes: { ...(o.documents?.creditNotes || {}), ...creditNotes }, checkedAt: now.toISOString() };
    const next = { ...o, documents };
    next.documents.summary = documentsSummary(next);
    return next;
  });
  if (stored) await writeEvidence(stored, now).catch((err) => console.error('[documents] evidence record not written for %s: %s', orderId, err?.message ?? err));
  return stored;
}

/** The company's evidence package for an order, merged into evidence:<orderId>. Pure of the order record. */
export function evidenceRecord(order, now = new Date()) {
  const slug = canonicalSlug(order.product?.slug || '');
  const release = releaseOfVersion(slug, order.product?.release) || productFor(slug)?.release || null;
  const d = order.documents || {};
  const pick = (x) => (x?.status === 'issued' ? { file: x.file, key: x.key, sha256: x.sha256, bytes: x.bytes, issuedAt: x.issuedAt, number: x.number ?? undefined, reference: x.reference ?? undefined } : (x ? { status: x.status, reason: x.reason } : null));
  return {
    orderId: order.id, mode: order.mode, status: order.status, updatedAt: now.toISOString(),
    acceptance: order.acceptance ? { id: order.acceptance.id, legalSet: order.acceptance.legalSet, acceptedAt: order.acceptance.acceptedAt, documents: order.acceptance.documents } : null,
    buyer: order.buyer ? { company: order.buyer.company, registrationNumber: order.buyer.registrationNumber, country: order.buyer.country, taxId: order.buyer.taxId?.value ?? null, email: order.buyer.contact?.email ?? null } : null,
    payment: { provider: 'stripe', sessionId: order.stripe?.sessionId ?? null, paymentIntentId: order.stripe?.paymentIntentId ?? null, customerId: order.stripe?.customerId ?? null,
      paidAt: order.facts?.paidAt ?? null, currency: order.facts?.currency ?? order.price?.currency ?? null, amountSubtotal: order.facts?.amountSubtotal ?? null, amountTax: order.facts?.amountTax ?? null, amountTotal: order.facts?.amountTotal ?? null,
      refunded: order.facts?.refunded ?? null, dispute: order.facts?.dispute ?? null },
    tax: order.tax ? { policyVersion: order.tax.policyVersion, policyStatus: order.tax.policyStatus, category: order.tax.category, verifiedCategory: order.tax.verifiedCategory ?? null, invoiceRoute: order.tax.invoiceRoute, invoiceNote: order.tax.invoiceNote ?? null } : null,
    invoice: order.invoice ? { status: order.invoice.status, provider: order.invoice.provider, id: order.invoice.id ?? null, number: order.invoice.number ?? null } : null,
    creditNotes: (order.creditNotes || []).map((c) => ({ status: c.status, provider: c.provider, refundId: c.refundId, number: c.number ?? c.id ?? null, amount: c.amount ?? null })),
    documents: { agreement: pick(d.agreement), invoice: pick(d.invoice), creditNotes: Object.fromEntries(Object.entries(d.creditNotes || {}).map(([k, v]) => [k, pick(v)])), summary: d.summary ?? null },
    release: release ? { version: release.version, package: release.package, sha256: release.sha256, bytes: release.bytes ?? null } : { version: order.product?.release ?? null },
    delivery: { fulfilledAt: order.facts?.fulfilledAt ?? null, notification: order.notifications?.buyer ?? null, events: (order.events || []).filter((e) => /^(paid|fulfilled|refused|withheld):|^notify:|^documents:/.test(String(e.id))).map((e) => ({ id: e.id, type: e.type, at: e.at })) },
  };
}

export async function writeEvidence(order, now = new Date()) {
  const record = evidenceRecord(order, now);
  return updateJson(`evidence:${order.id}`, (existing) => {
    const next = { ...(existing || {}), ...record, createdAt: existing?.createdAt || now.toISOString() };
    return { next, result: next };
  });
}

export async function getEvidence(orderId) {
  return getJson(`evidence:${orderId}`);
}
