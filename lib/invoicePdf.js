/**
 * lib/invoicePdf.js - the PDF of an invoice or credit note that OUR system numbered (lib/invoicing.js): today the
 * sandbox ledger (TEST-INV-…, TEST-CN-…), later the Czech route once the accountant chooses it and approves the
 * document contents. The Stripe route never comes here: Stripe renders its own invoice PDF and the order keeps a copy
 * of it (lib/orderDocuments.js).
 *
 * The content follows the accountant's blocking decisions as recorded on the order (lib/taxPolicy.js): the seller
 * block, the buyer's identification, the tax wording for the buyer's category (invoiceNote), the payment
 * reference and the tax point derived from the order's separate payment and delivery timestamps (taxPointOf). What the accountant has not decided is stated as undecided, never filled in: a document from the
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
 * Tax point (datum uskutečnění zdanitelného plnění) of a licence order from the two timestamps the order keeps.
 *
 * The licence is a service (provision of a right, § 14(1)(b) ZDPH) supplied when it is delivered - when the download
 * becomes available, order.facts.fulfilledAt (§ 21(3) ZDPH: the day of provision, or of issue of the document if
 * earlier). Payment is a separate fact, order.facts.paidAt. In the standard flow the card payment is confirmed seconds
 * BEFORE delivery, so the consideration is received before the supply and § 20a(2) ZDPH fixes the tax point at the
 * day the payment was received; the delivery date is printed beside it. When delivery and payment fall on the same
 * day the two rules give the same date. When the licence has not been delivered yet (withheld or refused sale, bank
 * transfer pending fulfilment) the document is for an advance payment and says so. Neither date is ever assumed from
 * the other or from the issue date; a missing fact is printed as missing. Historical orders are not rewritten: the
 * dates come from the order record as it is.
 * @returns {{date: string, basis: string}}
 */
export function taxPointOf(facts = {}) {
  const paid = day(facts.paidAt);
  const delivered = day(facts.fulfilledAt);
  if (!paid && !delivered) return { date: 'not established', basis: 'neither payment nor delivery recorded on the order' };
  if (!delivered) return { date: paid, basis: 'advance payment received before delivery (§ 20a(2) ZDPH); licence not yet delivered' };
  if (!paid) return { date: delivered, basis: 'licence delivered (§ 21(3) ZDPH); payment not recorded' };
  if (paid < delivered) return { date: paid, basis: 'payment received before delivery (§ 20a(2) ZDPH); licence delivered later, see below' };
  if (paid === delivered) return { date: delivered, basis: 'licence delivered on the day of payment (§ 21(3) and § 20a(2) ZDPH give the same day)' };
  return { date: delivered, basis: 'licence delivered before payment (§ 21(3) ZDPH)' };
}

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
  const taxPoint = taxPointOf(facts);
  return {
    test,
    kind: 'invoice',
    title: test ? 'TEST INVOICE' : 'Faktura / Invoice',
    banner: test ? `TEST DOCUMENT - NOT A TAX DOCUMENT. Issued by the ${doc.provider === 'company_ledger' ? 'company ledger in its separate TEST series' : 'sandbox ledger'} with a Stripe test key; no payment was made and no tax liability arises.` : null,
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
      ['Date of taxable supply', taxPoint.date],
      ['Tax point basis', taxPoint.basis],
      ['Payment received', facts.paidAt ? day(facts.paidAt) : 'not received'],
      ['Licence delivered', facts.fulfilledAt ? day(facts.fulfilledAt) : 'not yet delivered'],
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
  const realTitle = 'Dobropis / Credit note'; // neutral title: whether it is a tax document depends on the seller's VAT status (T1/T7)
  const base = invoiceModel({ doc: invoiceDoc || { number: entry.invoiceNumber, issuedAt: entry.issuedAt, buyer: order?.buyer, seller: order?.tax?.seller, product: order?.product, currency, subtotal: 0, tax: 0, total: 0 }, order, now });
  return {
    ...base,
    kind: 'credit_note',
    title: test ? 'TEST CREDIT NOTE' : realTitle,
    banner: test ? `TEST DOCUMENT - NOT A TAX DOCUMENT. Issued by the ${entry.provider === 'company_ledger' ? 'company ledger in its separate TEST series' : 'sandbox ledger'} with a Stripe test key; no money moved.` : null,
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
