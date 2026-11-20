/**
 * lib/agreementPdf.js - the Licence Agreement Confirmation for one paid order.
 *
 * What it is: a document that RECORDS the agreement the buyer concluded electronically at the order-confirmation
 * step (lib/acceptance.js) and completed by paying. It is generated after the payment is confirmed, from the order
 * record (lib/orders.js) and the acceptance record (lib/db.js), and it names the exact agreement texts accepted:
 * document set, version, SHA-256 fingerprint and archived copy per document (lib/legalArchive.js). A later version
 * of any agreement changes nothing here, because the order carries the versions it was accepted under.
 *
 * What it is not: a new acceptance event, and not a signature. It says so on its face. No handwritten or qualified
 * electronic signature is drawn, claimed or implied; the acceptance evidence section states what was recorded and how.
 *
 * agreementModel() is pure: it turns records into the words of the document and is unit-tested on its own.
 * renderAgreementPdf() draws that model (lib/pdfDoc.js) and returns the PDF bytes.
 */
import DOCS from '../config/order-documents.json' with { type: 'json' };
import TAX_POLICY from '../config/tax-policy.json' with { type: 'json' };
import { PdfDoc, fmtMoney, fmtDate } from './pdfDoc.js';
import { productFor, releaseOfVersion, canonicalSlug } from './products.js';
import { countryName } from './countries.js';

export const AGREEMENT_FILE = 'licence-agreement-confirmation.pdf';

const DOC_TITLES = { terms: 'Terms of Service', licence: 'Software & Agent Licence', refund: 'Refund Policy', privacy: 'Privacy Policy' };

/** Seller block from the tax policy: the VAT ID appears only when the seller is registered (the accountant's T1). */
export function sellerLines(seller = TAX_POLICY.seller) {
  const lines = [seller.legalName, seller.address, seller.registrationNumber ? `Company ID (IČO) ${seller.registrationNumber}` : null,
    seller.register ? `Registered: ${seller.register}` : null];
  if (['vat_payer', 'identified_person'].includes(seller.vatStatus) && seller.vatId) lines.push(`Tax ID (DIČ) ${seller.vatId}`);
  return lines.filter(Boolean);
}

/**
 * The document's content, from the order and acceptance records. Missing facts are stated as missing, never filled in.
 * @param {object} args.order       the order record (status fulfilled or later)
 * @param {object} [args.acceptance] the acceptance record the order names (adds consents, fingerprint, user agent)
 * @param {Date}   [args.now]
 */
export function agreementModel({ order, acceptance = null, now = new Date(), baseUrl = 'https://www.colleagueai.ai' }) {
  if (!order?.id) throw new Error('agreementModel: order required');
  const slug = canonicalSlug(order.product?.slug || '');
  const product = productFor(slug);
  const release = releaseOfVersion(slug, order.product?.release) || product?.release || null;
  const facts = order.facts || {};
  const buyer = order.buyer || {};
  const sellerPolicy = order.tax?.seller || TAX_POLICY.seller;
  const words = DOCS.products[slug] || {};
  const docs = order.acceptance?.documents || {};
  const consents = acceptance?.consents || order.acceptance?.consents || null;
  const paidAt = facts.paidAt || null;
  const tenant = buyer.tenant || null;
  const verification = facts.taxIdVerification?.status || null;

  const reference = `AGR-${order.id.replace(/^ord_/, '').toUpperCase()}`;

  return {
    reference,
    title: 'Licence Agreement Confirmation',
    subtitle: `Order ${order.id} · ${order.product?.name || product?.name || slug}`,
    generatedAt: now.toISOString(),
    statement: 'This document confirms an agreement that the Licensee concluded electronically with Colleague AI s.r.o. ' +
      'by accepting the agreements listed in section 6 on the order-confirmation page and completing payment. It records ' +
      'that agreement; it is not a new acceptance and it is not a signed instrument. No handwritten or qualified electronic ' +
      'signature has been applied to it by either party.',
    licensor: sellerLines(sellerPolicy),
    licensee: [
      buyer.company || '(company not recorded)',
      buyer.registrationNumber ? `Business registration number ${buyer.registrationNumber}` : 'Business registration number: not provided',
      buyer.country ? `Country of establishment: ${countryName(buyer.country)} (${buyer.country})` : 'Country of establishment: not recorded',
      buyer.taxId?.value ? `VAT / tax ID ${buyer.taxId.value}${verification ? ` (verification: ${verification})` : ' (verification pending)'}` : 'VAT / tax ID: none provided',
      buyer.contact?.email ? `Purchasing contact: ${buyer.contact.name ? buyer.contact.name + ', ' : ''}${buyer.contact.email}` : 'Purchasing contact: not recorded',
      facts.billingName && facts.billingName !== buyer.company ? `Billing name given at payment: ${facts.billingName}` : null,
      facts.billingCountry && facts.billingCountry !== buyer.country ? `Billing country given at payment: ${facts.billingCountry}` : null,
    ].filter(Boolean),
    references: [
      ['Agreement reference', reference],
      ['Order number', order.id],
      ['Acceptance record', order.acceptance?.id || '(none)'],
      ['Order created', fmtDate(order.createdAt)],
      ['Payment confirmed', paidAt ? fmtDate(paidAt) : 'not yet confirmed'],
      ['Payment reference', [order.stripe?.paymentIntentId, order.stripe?.sessionId].filter(Boolean).join(' / ') || '(none)'],
      ['Mode', order.mode === 'live' ? 'live' : 'TEST MODE - no real payment'],
    ],
    product: [
      ['Product', order.product?.name || product?.name || slug],
      ['SKU', order.product?.sku || product?.sku || '(none)'],
      ['Purchased release', order.product?.release || '(none)'],
      ['Package', release?.package ? `${release.package}${release.bytes ? ` (${release.bytes.toLocaleString('en-US')} bytes)` : ''}` : '(no release package)'],
      ['Package SHA-256', release?.sha256 || '(none)'],
      ['Release status at order', release?.status || '(unknown)'],
      ['Delivery', words.delivery || 'Download from the order page after payment.'],
    ],
    licence: [
      ['Licence scope', 'Non-exclusive, non-transferable, single-tenant licence to deploy and use the purchased release in the Licensee\'s own Microsoft environment (Software & Agent Licence, section 1). No redistribution, resale, sublicensing or cross-tenant sharing (section 2).'],
      ['Licensed Microsoft tenant', tenant ? `${tenant} (as stated by the Licensee at order)` : 'One Microsoft tenant of the Licensee, being the tenant into which the package is first installed. No tenant identifier was given at order; the Licensee may register it by e-mail to hello@colleagueai.ai with the order number.'],
      ['Licence duration', 'Perpetual for the licensed tenant and the purchased release (Software & Agent Licence, section 6). Support, update and certification rights apply only for their applicable term. The licence may be terminated for material breach in accordance with the Terms of Service.'],
      ['Price', `${fmtMoney(order.price?.unitAmount, order.price?.currency)} (one-time), quantity ${order.price?.quantity ?? 1}`],
      ['Tax', facts.amountTax != null ? fmtMoney(facts.amountTax, facts.currency || order.price?.currency) : 'as shown on the invoice'],
      ['Total paid', facts.amountTotal != null ? fmtMoney(facts.amountTotal, facts.currency || order.price?.currency) : 'see invoice'],
      ['Tax treatment', order.tax?.applied ? `${order.tax.category}${order.tax.invoiceNote ? ` - ${order.tax.invoiceNote}` : ''}` : `${order.tax?.category || 'category not recorded'} - tax policy not applied at order (status ${order.tax?.policyStatus || 'unknown'})`],
      ['Invoice', order.invoice?.status === 'issued' ? `${order.invoice.number || order.invoice.id} (${order.invoice.provider})` : order.invoice?.status ? `invoice ${order.invoice.status}` : 'no invoice recorded'],
    ],
    included: words.includes || 'As stated on the catalogue page at the time of order.',
    excluded: words.excludes || 'As stated on the catalogue page at the time of order.',
    support: [
      DOCS.licensor.support,
      'Corrective releases for defects in the purchased release, including security defects, are provided at no further licence fee, as published in the product facts at the time of order. New feature releases are not included and are not a security entitlement.',
      DOCS.licensor.securityReporting,
    ],
    documents: Object.entries(docs).map(([key, d]) => [
      DOC_TITLES[key] || key, d.version || '', d.sha256 || '(no fingerprint)', d.archive || '', `${baseUrl}/${key === 'licence' ? 'license' : key}`,
    ]),
    legalSet: order.acceptance?.legalSet || null,
    evidence: [
      ['Method of acceptance', 'Electronic acceptance (click-through) on the order-confirmation page served by Colleague AI s.r.o., followed by payment through Stripe Checkout. Recorded by the Licensor\'s order system; no signature was collected.'],
      ['Accepted on', fmtDate(order.acceptance?.acceptedAt || acceptance?.acceptedAt)],
      ['Accepted by', buyer.signatory?.name ? `${buyer.signatory.name}, ${buyer.signatory.role || '(role not recorded)'}` : (acceptance?.declaredBy || '(not recorded)')],
      ['Declared authority', consents?.authority ? 'Confirmed: authorised to enter into this agreement on behalf of the buyer company; purchase made in the course of its business.' : 'NOT RECORDED'],
      ['Agreements accepted', consents?.terms ? `Confirmed: the buyer company accepts the agreements of document set ${order.acceptance?.legalSet || ''} in the versions listed in section 6.` : 'NOT RECORDED'],
      ['Immediate delivery', consents?.delivery ? 'Confirmed: delivery requested immediately after payment; any right of withdrawal lapses once delivery begins.' : 'NOT RECORDED'],
      ['Client fingerprint', acceptance?.clientHash ? `${acceptance.clientHash} (salted hash of the network address; the address itself is not stored)` : 'not available'],
      ['Browser', acceptance?.userAgent || 'not available'],
      ['Storefront language', acceptance?.lang || order.lang || 'en'],
      ['Payment completed', paidAt ? `${fmtDate(paidAt)} (${order.payment?.lane === 'bank' ? 'bank transfer' : 'card or wallet'} via Stripe)` : 'not yet'],
      ['Licence granted', facts.fulfilledAt ? fmtDate(facts.fulfilledAt) : 'not yet'],
    ],
    footer: `${reference} · generated ${fmtDate(now.toISOString())}`,
  };
}

/** Render the model to PDF bytes (Uint8Array). */
export async function renderAgreementPdf(model) {
  const doc = await PdfDoc.create({ title: `${model.title} ${model.reference}`, subject: model.subtitle, footer: model.footer, created: new Date(model.generatedAt) });
  doc.title(model.title);
  doc.paragraph(model.subtitle, { size: 11, muted: true });
  doc.paragraph(model.statement, { size: 9.5 });

  doc.heading('1. Parties');
  doc.row('Licensor', model.licensor.join('\n'));
  doc.row('Licensee', model.licensee.join('\n'));

  doc.heading('2. Agreement and order references');
  for (const [k, v] of model.references) doc.row(k, v);

  doc.heading('3. Licensed product');
  for (const [k, v] of model.product) doc.row(k, v);

  doc.heading('4. Licence, price and tax');
  for (const [k, v] of model.licence) doc.row(k, v);

  doc.heading('5. Included services, exclusions, support and security updates');
  doc.row('Included', model.included);
  doc.row('Not included', model.excluded);
  doc.row('Support and security updates', model.support.join('\n'));

  doc.heading(`6. Agreements accepted (document set ${model.legalSet || ''})`);
  doc.paragraph('The Licensee accepted the following documents in exactly these versions. Each fingerprint is the SHA-256 of the agreement text; an archived copy of each version is kept by the Licensor and never edited. A later version of any document does not change this agreement.', { size: 9 });
  doc.table(['Document', 'Version', 'SHA-256 fingerprint', 'Archived copy', 'Published at'], model.documents, [1.3, 1, 2.6, 2, 1.4], { size: 8 });

  doc.heading('7. Contract formation and acceptance evidence');
  for (const [k, v] of model.evidence) doc.row(k, v);

  doc.space(10);
  doc.paragraph('Generated by the Colleague AI s.r.o. order system from the stored order and acceptance records. The Licensor keeps the records this document is made from; questions about them go to hello@colleagueai.ai with the order number.', { size: 8.5, muted: true });
  return doc.bytes();
}

export async function buildAgreementPdf(args) {
  const model = agreementModel(args);
  const bytes = await renderAgreementPdf(model);
  return { model, bytes };
}
