/**
 * lib/invoicePdf.js - the PDF of an invoice or credit note that OUR system numbered (lib/invoicing.js): today the
 * sandbox ledger (TEST-INV-…, TEST-CN-…), later the Czech route once the accountant chooses it and approves the
 * document contents. The Stripe route never comes here: Stripe renders its own invoice PDF and the order keeps a copy
 * of it (lib/orderDocuments.js).
 *
 * The content follows the accountant's blocking decisions as recorded on the order (lib/taxPolicy.js): the seller
 * block, the buyer's identification, the tax wording for the buyer's category (invoiceNote) and the payment
 * reference. What the accountant has not decided is stated as undecided, never filled in: a document from the
 * sandbox ledger carries "TEST DOCUMENT - NOT A TAX DOCUMENT" on every page, and a CZK accounting conversion
 * appears only when the ledger entry carries the approved rate (T8), with its source and date.
 */
import { PdfDoc, fmtMoney, fmtDate } from './pdfDoc.js';
import { sellerLines } from './agreementPdf.js';
import { countryName } from './countries.js';

export const invoiceFileName = (number) => `invoice-${String(number).replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
export const creditNoteFileName = (number) => `credit-note-${String(number).replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;

/** Day part of an ISO timestamp (the invoice date is a date, not a time). */
const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

/**
 * The document model for an invoice from our own numbering.
 * @param {object} args.doc    the ledger document (number, issuedAt, seller, buyer, product, currency, subtotal, tax,
 *                             total, taxTreatment, test?, conversion?)
 * @param {object} args.order  the order record (payment reference, dates, buyer facts)
 */
export function invoiceModel({ doc, order, now = new Date() }) {
  const test = doc.test === true || doc.provider === 'sandbox_ledger';
  const buyer = doc.buyer || order?.buyer || {};
  const seller = doc.seller || order?.tax?.seller || null;
  const treatment = doc.taxTreatment || order?.tax || {};
  const facts = order?.facts || {};
  const currency = doc.currency || order?.price?.currency;
  const conversion = doc.conversion || null;
  return {
    test,
    kind: 'invoice',
    title: test ? 'TEST INVOICE' : 'Invoice',
    banner: test ? 'TEST DOCUMENT - NOT A TAX DOCUMENT. Issued by the sandbox ledger with a Stripe test key; no payment was made and no tax liability arises.' : null,
    number: doc.number,
    seller: seller ? sellerLines(seller) : ['(seller block not recorded on this order)'],
    buyer: [
      buyer.company || '(company not recorded)',
      buyer.registrationNumber ? `Registration number ${buyer.registrationNumber}` : null,
      buyer.country ? `${countryName(buyer.country)} (${buyer.country})` : null,
      buyer.taxId?.value ? `VAT / tax ID ${buyer.taxId.value}` : 'No VAT / tax ID provided',
      buyer.contact?.email || null,
    ].filter(Boolean),
    header: [
      ['Invoice number', doc.number],
      ['Invoice date', day(doc.issuedAt)],
      ['Date of taxable supply', day(facts.paidAt || doc.issuedAt)],
      ['Due date', facts.paidAt ? `paid ${day(facts.paidAt)}` : 'on receipt'],
      ['Order number', order?.id || doc.orderId || ''],
      ['Payment reference', [order?.stripe?.paymentIntentId, order?.stripe?.sessionId].filter(Boolean).join(' / ') || '(none)'],
      ['Payment method', order?.payment?.lane === 'bank' ? 'bank transfer (Stripe)' : 'card or wallet (Stripe)'],
    ],
    lines: [[
      `${doc.product?.name || order?.product?.name || ''}${doc.product?.sku ? ` (SKU ${doc.product.sku})` : ''}, release ${doc.product?.release || order?.product?.release || ''} - perpetual licence for one Microsoft tenant`,
      '1', fmtMoney(doc.subtotal, currency), fmtMoney(doc.subtotal, currency),
    ]],
    totals: [
      ['Subtotal (excl. tax)', fmtMoney(doc.subtotal, currency)],
      ['Tax', fmtMoney(doc.tax ?? 0, currency)],
      ['Total', fmtMoney(doc.total, currency)],
    ],
    taxWording: treatment?.invoiceNote || (treatment?.applied === false ? 'Tax policy not applied: no tax wording approved for this order.' : 'No tax wording recorded.'),
    category: treatment?.category || null,
    conversion: conversion
      ? [`Accounting conversion to CZK: ${fmtMoney(conversion.amountCzk, 'czk')} at ${conversion.rate} ${String(currency).toUpperCase()}/CZK (${conversion.source}, ${conversion.date})`]
      : [`Accounting conversion to CZK: not shown. The conversion rule for ${String(currency || '').toUpperCase()} sales (accountant decision T8) is not yet recorded; the accountant converts at the approved rate for the date of taxable supply.`],
    footer: `${test ? 'TEST ' : ''}${doc.number} · generated ${fmtDate(now.toISOString())}`,
  };
}

/** The document model for a credit note from our own numbering. */
export function creditNoteModel({ entry, invoiceDoc = null, order, now = new Date() }) {
  const test = entry.test === true || entry.provider === 'sandbox_ledger';
  const currency = invoiceDoc?.currency || order?.price?.currency;
  const base = invoiceModel({ doc: invoiceDoc || { number: entry.invoiceNumber, issuedAt: entry.issuedAt, buyer: order?.buyer, seller: order?.tax?.seller, product: order?.product, currency, subtotal: 0, tax: 0, total: 0 }, order, now });
  return {
    ...base,
    kind: 'credit_note',
    title: test ? 'TEST CREDIT NOTE' : 'Credit note',
    banner: test ? 'TEST DOCUMENT - NOT A TAX DOCUMENT. Issued by the sandbox ledger with a Stripe test key; no money moved.' : null,
    number: entry.number,
    header: [
      ['Credit note number', entry.number],
      ['Credit note date', day(entry.issuedAt)],
      ['Corrects invoice', entry.invoiceNumber || invoiceDoc?.number || ''],
      ['Order number', order?.id || ''],
      ['Refund reference', entry.refundId || ''],
      ['Reason', entry.reason || `Refund of ${fmtMoney(entry.amount, currency)} for order ${order?.id || ''}`],
    ],
    lines: [[`Refund against invoice ${entry.invoiceNumber || ''}`, '1', `-${fmtMoney(entry.amount, currency)}`, `-${fmtMoney(entry.amount, currency)}`]],
    totals: [['Credited (incl. tax as on the invoice)', `-${fmtMoney(entry.amount, currency)}`]],
    footer: `${test ? 'TEST ' : ''}${entry.number} · generated ${fmtDate(now.toISOString())}`,
  };
}

export async function renderInvoicePdf(model) {
  const doc = await PdfDoc.create({ title: `${model.title} ${model.number}`, subject: `Order ${model.header.find((h) => h[0] === 'Order number')?.[1] || ''}`, footer: model.footer });
  doc.title(`${model.title} ${model.number}`);
  if (model.banner) doc.paragraph(model.banner, { size: 9.5 });
  doc.heading('Supplier');
  doc.paragraph(model.seller.join('\n'));
  doc.heading('Customer');
  doc.paragraph(model.buyer.join('\n'));
  doc.heading('Document');
  for (const [k, v] of model.header) doc.row(k, v);
  doc.heading('Items');
  doc.table(['Description', 'Qty', 'Unit price', 'Amount'], model.lines, [5, 0.7, 1.6, 1.6]);
  for (const [k, v] of model.totals) doc.row(k, v, { labelWidth: 300 });
  doc.heading('Tax statement');
  doc.paragraph(`${model.category ? `Buyer category: ${model.category}. ` : ''}${model.taxWording}`);
  for (const line of model.conversion) doc.paragraph(line, { size: 9, muted: true });
  if (model.test) {
    doc.space(6);
    doc.paragraph('This test document exists to exercise the invoicing, credit-note and reconciliation code before the accountant\'s answers. It must not be sent to a customer or entered in any accounting system.', { size: 9, muted: true });
  }
  return doc.bytes();
}
