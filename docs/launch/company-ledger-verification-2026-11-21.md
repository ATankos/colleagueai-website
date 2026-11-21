# Company-ledger invoice route — verification record (21 November 2026)

**Status:** the route is built and verified in TEST. It is not switched on: the tax policy is `unapproved` and its
`invoiceRoute` is `null` until the accountant answers T13 (`docs/launch/accountant-answer-intake.md`).

## What was run

1. **Code path:** `lib/invoicing.js` (`company_ledger`) and `lib/invoicePdf.js`, with an in-memory KV, TEST-mode orders and
   no network. PDFs are kept in the release evidence library and are not in this public repository.
2. **Suites:** `tests/invoicing.test.mjs` (real series, refusals, claims, credit notes), `tests/purchase-journey.test.mjs`
   (Czech company → card checkout → webhook → TEST invoice → PDF → refund → credit note → PDF, all through the real
   handlers against fake Stripe/KV/Blob), `tests/e2e/purchase-flow.spec.mjs` (browser, 6/6).
3. **Preview (Stripe TEST, 21 Nov 2026):** the restricted checkout reached Stripe's card-only hosted page for a valid Czech
   company; tampered requests were refused (PR #559 comment). The live-key invoice route itself is not exercised.

## Results

| Property | Result |
|---|---|
| Numbering | TEST-CAI-INV-2026-00001, -00002, -00003 in order; the real series counter (`seq:invoice:company_ledger:2026`) untouched by test orders |
| One number per sale | a replayed event returns the same number; two concurrent calls for one order give one `issued` and one `pending` (no second number) |
| Credit note | TEST-CAI-CN-2026-00001, links invoice -00001 and refund `re_test_1`; replay returns the same number |
| Ledger record | number, kind, provider, test, issuedAt, orderId, seller, buyer, product, currency, subtotal, tax, total, taxTreatment, paidAt, fulfilledAt, payment |
| PDF contents | supplier from the register (no DIČ: no VAT registration recorded), buyer with IČO and country, invoice and supply dates, payment received and licence delivered dates, order and Stripe payment references, product/SKU/release, USD amounts, tax statement only from the policy, CZK line only under T8, TEST banner |
| Accounting evidence | `evidence:<orderId>` records invoice and credit-note numbers and PDF hashes; `lib/reconciliation.js` matches payout lines to the invoice and credit-note numbers (provider-agnostic) |
| Sample PDF SHA-256 | invoice `f469699626d70d3d…`, credit note `7ca13636373e4fef…` |

## For the accountant (T7)

The invoice prints "Date of taxable supply" and a tax-point basis citing § 21(3) / § 20a(2) ZDPH. For a seller that is not
VAT-registered, the accountant decides whether those lines stay, and what the tax statement (`invoiceNote`) says.
Changing them is a wording change in `lib/invoicePdf.js` / the policy, not a new route.
