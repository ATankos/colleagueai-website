# VAT status transitions (identified person now; VAT payer only when officially effective)

**The rule:** the seller's VAT status on any day is the latest **verified** entry of `seller.vatStatusHistory`
(`config/tax-policy.json`) whose `effectiveFrom` is on or before that day (`lib/taxPolicy.js` `sellerStatusOn`).

## What each part does

| Part | Behaviour | Test |
|---|---|---|
| Reported status (founder, accountant e-mail summary) | recorded in `vatStatusEvidence.founderReported`; history entry `verified: false`; **no effect** | `tests/vat-identified-person.test.mjs` |
| Verified entry | needs `effectiveFrom` and `evidenceReference` (registration decision / tax-register record); approval also needs `vatStatusEvidence.officialRecord`, `vatId`, `vatEffectiveFrom` | same |
| A date passing (e.g. 1 Jan 2027) | changes nothing by itself: an unverified planned entry never applies | same |
| A verified change (identified person → VAT payer) | from its `effectiveFrom` the approved policy stops being active ("re-approve the policy") and live checkout closes, until treatments, wording and checkout settings are re-approved for the new status | same |
| Issued invoices and credit notes | written once with the seller block recorded on the order (`order.tax.seller`); the PDF reads that block, never today's policy | same: "historical invoices are immutable" |
| Identified person on documents | no VAT charged (a taxed order fails closed before numbering); "Date of supply"; DIČ on documents for foreign buyers, on domestic documents only if the approved policy sets `showVatIdOnDomesticInvoices: true` | same |
| VAT payer on documents | DIČ shown; "Date of taxable supply"; VAT per the re-approved policy | `tests/tax-policy.test.mjs` |

## Steps at a real registration change

1. Official decision received. Store it privately, record its SHA-256 in the evidence manifest
   (`docs/legal/evidence/README.md`).
2. Add the verified history entry (status, effectiveFrom from the decision, evidenceReference).
3. Re-approve the policy with the accountant: treatments, wording, `stripeTax`, invoice route, CZK rule, and the
   turnover-threshold reasoning that triggered the change (`config/vat-thresholds.json`).
4. Run the tax, invoicing and order-document suites, then open a PR. The founder merges.

Orders paid before the effective date keep their documents. Whether an order straddling the date (paid before,
delivered after) needs a correcting document is the accountant's decision.
