# Invoicing route assessment: Stripe invoices or a Czech invoicing adapter (20 November 2026)

**Status: engineering assessment for the accountant's decision T13. It is not tax advice and decides nothing.** Every requirement below is phrased as a question the accountant answers; the two routes are compared on what each can and cannot produce. The requirements that make a document a Czech tax document (*daňový doklad*) are the accountant's (T7); this note only maps them onto the two implementations.

## What ColleagueAI is, for this purpose

- Colleague AI s.r.o. sells a perpetual software licence (an electronically supplied service) to businesses only. Three buyer groups matter for the first sales: a Czech business, an EU business with a VAT ID, a non-EU business.
- The seller's VAT status is the accountant's T1 answer. The brief's working assumption is **identified person** (*identifikovaná osoba*) "while that remains the confirmed status". An identified person does not charge Czech VAT on domestic supplies, files a VAT return only for the months with cross-border transactions, and reports reverse-charge services to EU businesses in the EC Sales List (*souhrnné hlášení*), in CZK. The accountant confirms or corrects this; the code assumes none of it (`lib/taxPolicy.js`).

## Requirements, and what each route delivers

| Requirement (accountant to confirm, T7) | Stripe post-payment invoice | Own document (`lib/invoicePdf.js`) + Czech tool route |
|---|---|---|
| Unique sequential number, one series | Stripe numbers invoices per account with a prefix and a sequence (e.g. `CAI-0007`); gaps can occur when a draft is voided. **Q1:** is Stripe's series acceptable as our only invoice series? | Czech tool keeps its own unbroken series; our PDF prints the number the tool or ledger assigned. |
| Seller identification (name, address, IČO, DIČ when registered, register) | Footer text we set from `config/tax-policy.json` (`invoiceFooter`). Shown. | Printed from the same policy record. |
| Buyer identification (name, address, VAT ID) | From the Stripe Customer: name and billing address collected by Checkout; the VAT ID as collected and verified by Stripe. Registration number only as a custom field ("Buyer reg. no."). | Printed from the order record: name, registration number, country, VAT ID as declared. Billing address only if we add it to the order (Stripe holds it today). |
| Invoice date and **date of taxable supply** (DUZP) | Stripe shows the invoice date and the payment; it has no separate DUZP field. **Q2:** is the payment date, shown on the invoice, sufficient as DUZP, or must a labelled DUZP line appear? | Our PDF prints a labelled DUZP line (= payment date). |
| Amount, currency, tax base and tax | USD, tax calculated by Stripe Tax only if the policy switches it on; otherwise tax 0 with the policy's wording. | Same amounts; tax per the policy's treatment. |
| **Tax wording** per buyer category (reverse charge, outside scope, not a VAT payer) | Footer text per category from the policy (`treatments[category].invoiceNote`). | The same text, printed in a *Tax statement* section with the category. |
| **CZK conversion** of the base (and tax) for VAT records and the EC Sales List (T8) | Not available on the Stripe document. Stripe reports settlement in the balance currency; conversion is the accountant's step from the payout reconciliation (`scripts/commerce/reconcile-payout.mjs`). **Q3:** must the CZK amount appear on the invoice itself (it must for a Czech tax document when tax is charged in a foreign currency; for a 0-tax reverse-charge or out-of-scope invoice the accountant decides)? | Printed when the ledger entry carries the approved rate (`conversion` field: rate, source, date, CZK amount); until T8 is answered the PDF says the conversion is not yet recorded. |
| Language | English only. **Q4:** acceptable for Czech tax records (a translation on request is usually enough; accountant confirms). | English, with a Czech bilingual template possible if required. |
| Payment reference | Stripe payment intent id and invoice id on the invoice; the order id as a custom field. | Order id, payment intent, session id printed. |
| Credit notes | Stripe credit note linked to the refund (built and tested). | Our credit-note PDF; a Czech tool would issue the *opravný daňový doklad* with its own number. |
| Bank transfer / proforma before payment (T12) | Stripe's invoice exists only after payment; a proforma would be a separate Stripe Invoicing object. | A proforma is easy to add to our renderer; the Czech tool issues proformas natively. |
| Archive and evidence | Our copy of Stripe's PDF is stored privately with its hash (`lib/orderDocuments.js`). | Our PDF stored the same way. |
| Cost and operations | Stripe prices post-payment invoices per document; no extra system to operate. | A Czech tool subscription and an API integration to build (`czech_tool` adapter is a placeholder that fails closed). |

## Assessment

- For an **identified person** selling to **EU businesses with a verified VAT ID** (reverse charge, 0 CZK tax) and to **non-EU businesses** (outside the scope of Czech VAT), the Stripe post-payment invoice carries every item in the table except a labelled DUZP line and a CZK amount. If the accountant answers Q1–Q4 "yes / payment date / not required on a 0-tax document / yes", the **Stripe route satisfies the first sale** and nothing else needs to be built. This is the simplest and cheapest route, and it is fully tested (`tests/purchase-journey.test.mjs`, "refund with a credit note (Stripe invoice route)").
- For a **Czech business buyer** the identified person issues an invoice without VAT (not a VAT payer for domestic supplies). The same Stripe document works, with the category wording the accountant gives.
- If the accountant requires a Czech number series, a labelled DUZP, CZK amounts on the document, a proforma before payment, or a bilingual document, the **Czech tool route** is necessary: our renderer already prints DUZP, CZK (when recorded) and the order references, so the missing piece is the adapter to the chosen tool (numbering and the accounting-side record). Estimated effort once the tool and credentials exist: 1–2 days plus the sandbox test.
- Either way, the CZK conversion for the VAT return / EC Sales List is an accounting step from the payout reconciliation unless T8 says it must be on the document.

## What the accountant is asked (adds Q1–Q4 to T7/T8/T13 in the intake form)

1. **Q1** Stripe's number series as the invoice series: acceptable?
2. **Q2** Payment date shown on the invoice as the date of taxable supply: sufficient, or a labelled line required?
3. **Q3** CZK amount on the document: required for 0-tax reverse-charge / out-of-scope invoices, or only in the VAT records?
4. **Q4** English-only document: acceptable?
5. **T13** Therefore: `checkout.invoiceRoute = "stripe"` or `"czech_tool"` (and which tool).

Until the written answer: `invoiceRoute` stays unset, no invoice is created, the order says `not_configured`, and a live sale is refused.
