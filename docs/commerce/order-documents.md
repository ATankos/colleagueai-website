# Order documents: what a paid order produces, where it lives, who can reach it

Implemented 20 Nov 2026 (`lib/orderDocuments.js`, `lib/agreementPdf.js`, `lib/invoicePdf.js`, `lib/documentStore.js`, `lib/orderMail.js`, `api/order-document.js`). Live sales stay closed; everything below runs for Stripe TEST orders today and for live orders unchanged once the founder's GO sequence is executed.

## The chain, in order

1. **Acceptance (before payment)** - unchanged: the confirmation page records who accepted which document set, with per-document version, SHA-256 and archived copy (`lib/acceptance.js`, `lib/legalArchive.js`). New: an optional *Microsoft tenant to be licensed* field (default domain or tenant ID), stored on `buyer.tenant` and named on the agreement confirmation. There is no second acceptance after payment.
2. **Payment confirmed** (`checkout.session.completed` paid, or `async_payment_succeeded`) - the webhook grants the licence, records the facts, creates or records the invoice by the route the tax policy chose (unchanged), then runs the **documentation step**.
3. **Documentation step** (`ensureOrderDocuments`), idempotent per document:
   - **Licence agreement confirmation PDF** (`licence-agreement-confirmation.pdf`, reference `AGR-<order>`): licensor, licensee, order and payment references, product/SKU/release/package hash, licence scope, licensed tenant, duration, price and tax, inclusions and exclusions (the catalogue's published facts, `config/order-documents.json`, tested equal to `public/agents.html`), support and security-update entitlement, the four accepted documents with version/SHA-256/archive path, and the acceptance evidence (method, time, person, declarations, salted client fingerprint, browser). It states on its face that it records an electronic agreement and carries no signature.
   - **Invoice PDF**: Stripe route - a copy of Stripe's own invoice PDF is stored; sandbox ledger - our renderer produces it, marked *TEST DOCUMENT - NOT A TAX DOCUMENT* on every page; Czech route - fails closed until the adapter exists.
   - **Credit-note PDFs**, one per refund, the same way (`charge.refunded` → credit note → PDF).
   - Each PDF is stored **privately** under `orders/<orderId>/<file>` in the Blob store, write-once, and recorded on the order with its SHA-256 and size. A store outage is recorded as `failed` with the reason; the licence is never undone.
   - **Evidence record** `evidence:<orderId>` (KV): acceptance references and document set, buyer identification, payment facts and Stripe ids, tax treatment, invoice and credit-note identifiers, document hashes, release version and package hash, delivery events (grant, notification).
4. **Buyer notification** (`notifyBuyer`), once per order, through the existing Resend transport: order number, product, release and package hash, which documents exist, the order page link (the same thank-you URL Stripe redirected to) and the recovery page. No attachment; no secret. Without a transport the order records `not_configured` and the check below shows it.
5. **Order page** (`/api/success`): unchanged delivery and invoice blocks, plus *Your documents*: sealed links to the agreement PDF, invoice copy and credit notes; the licence entitlement as recorded; the accepted agreements with versions; where the installation guide is; support and security contacts.
6. **Document access** (`/api/order-document?t=…`): the token seals the buyer e-mail + order id + file (AES-GCM, 15 minutes); the handler checks the e-mail is the order's buyer, the file is issued, then redirects to a presigned private URL (minutes). Another buyer's token, a tampered or expired token, a download token, or a document not yet issued → 403/404; nothing about the order is revealed.

## Operations

- `order.documents.summary` says `complete` or lists what is missing. `scripts/commerce/check-fulfilment.mjs` (daily) now reports `documents_incomplete` for any paid order whose package is not complete, with the reasons. Re-delivering the paid event from Stripe, or the daily run, completes it without a second licence, invoice or mail.
- A live order with invoicing switched off counts as incomplete (`invoice:not_configured`); a test order under the unapproved policy does not, and says so in `notes`.
- Retention and GDPR: order records and documents hold business identification, the order e-mail and names of the contact and signatory (no card data, no plain IP). They are kept as commercial and accounting records for the statutory retention period the accountant confirms (T7); deletion requests go through hello@ and are answered against that period. Nothing is reachable by a public URL.

## Not done here (needs a decision first)

- Stripe vs Czech invoicing route: `docs/commerce/invoicing-route-assessment.md`.
- CZK accounting conversion on our own invoice PDF appears only when the ledger entry carries the approved rate (T8); until then the PDF says the conversion is not yet recorded.
- The security contact named on the documents is hello@ until security@ exists and the disclosure page is published.
