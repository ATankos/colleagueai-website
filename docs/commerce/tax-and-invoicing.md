# Tax and invoicing framework

**Status: built, not active.** `config/tax-policy.json` is `unapproved`, so live checkout is refused, no Stripe Tax is calculated, no invoice is created and no tax wording is printed. Nothing in the code decides a tax treatment; every decision is a field in the policy, filled from the accountant's written answers (Accountant Decision Pack, questions T1 to T14).

## What runs today

| Piece | Where | With the unapproved policy |
| --- | --- | --- |
| Buyer identification: company, registration number, country, VAT / tax ID, contact, signatory | `lib/acceptance.js`, `api/checkout.js` | On: collected and stored on the order |
| VAT ID format check against the declared country | `lib/taxIds.js` | On |
| VAT ID saved to the buyer's Stripe Customer, so Stripe verifies it (VIES for EU, HMRC for UK) | `api/checkout.js` | On (test mode) |
| Stripe business tax ID collection on the Checkout page | `checkoutTaxParams` | On, optional for the buyer |
| Buyer category from facts | `lib/taxPolicy.js classifyBuyer` | Recorded on the order, not acted on |
| Live checkout | `liveTaxBlocked` | **Refused** (in addition to `saleApproved: false`) |
| Required tax ID, Stripe Tax, post-payment invoice | `checkoutTaxParams` | Off |
| Invoice and credit-note adapters | `lib/invoicing.js` | Off (`not_configured`) |
| Payout reconciliation | `lib/reconciliation.js`, `scripts/commerce/reconcile-payout.mjs` | Available (read-only) |

## Buyer categories

| Category | Facts |
| --- | --- |
| `cz_business` | Established in CZ, with or without a CZ VAT ID |
| `eu_business_vat_verified` | Another EU state; VAT ID verified by Stripe |
| `eu_business_vat_pending` | Another EU state; VAT ID given, verification not finished (always the case before payment) |
| `eu_business_vat_unverified` | Another EU state; VIES did not confirm the VAT ID, or was unavailable |
| `eu_business_no_vat_id` | Another EU state; no VAT ID. Still a business: every buyer declares it buys in the course of its business |
| `non_eu_business` | Established outside the EU (UK, Switzerland, US and others) |

There is no consumer category: sales are B2B only. No category implies a treatment. For each one the policy sets `action` (`sell`, `hold` for manual handling, or `block`) and the exact invoice wording.

Stripe verifies a VAT ID asynchronously. Before payment an EU VAT ID is always `pending`, so the accountant's answer for `eu_business_vat_pending` decides whether such an order can be paid online. After payment the webhook records the verification result (`customer.tax_id.updated`). An order whose VAT ID turns out unverified is flagged for the accountant; it is never re-taxed automatically.

## Stripe invoices or a Czech invoicing system (T13)

The code supports both routes. The choice is the accountant's. What each one gives, as far as Stripe's documentation states it:

**Stripe post-payment invoice** (`invoice_creation` on a Checkout payment):
- Stripe creates and finalises a paid invoice after a successful payment, with its own number, a PDF and a hosted page. The buyer's billing address and tax ID appear on it.
- We add the order id, the buyer's registration number, a description with the SKU and release, and a footer with the seller's details and the accountant's wording.
- Refunds get a Stripe credit note linked to the refund.
- Stripe prices post-payment invoices separately from Invoicing.

**Questions only the accountant can answer before choosing it:**
- Do Stripe's number series and the invoice layout meet the tax-document requirements (T7)?
- Must the VAT amount also appear in CZK, at which ČNB rate and date (T8)? Stripe's invoice is in the sale currency (USD); a CZK line would have to come from a custom field computed by us.
- Is English acceptable, or is a bilingual document needed?
- Do the bank-transfer lane's timing and a proforma before payment (T12) fit Stripe's invoice, which exists only after payment?

**Czech invoicing system route** (for example Fakturoid or iDoklad): the webhook would create the tax document and credit note in the Czech system, which keeps a Czech number series and VAT in CZK. The adapter is a placeholder that fails closed (`adapter_not_configured`). It is built once the accountant chooses a tool and we have its API credentials.

## Approving the policy

1. Copy the accountant's written answers into `decisions` (T1 to T14), `seller`, `treatments` and `checkout`.
2. Fill `approval` (who, role, date, where the written answer is filed) and set `status` to `approved`.
3. `tests/tax-policy.test.mjs` refuses the change if any blocking decision (T1, T2, T5, T6, T7, T13), treatment or approval field is empty.
4. Run the sandbox tests in the next section with the approved policy before any live payment.

Approval alone opens no sales. Live checkout also needs `saleApproved: true`, the live Stripe keys and the founder's GO.

## Sandbox testing

With a Stripe **test** key, `TAX_POLICY_SANDBOX=1` loads `config/tax-policy.sandbox.json`. It is a fixture whose wording is all marked TEST and which is not advice. `TAX_SANDBOX_INVOICE_ROUTE=stripe` switches the fixture to Stripe's post-payment invoice; the default is the `sandbox_ledger` test adapter, which numbers documents `TEST-INV-YYYY-NNNN` and `TEST-CN-YYYY-NNNN`. A live key never loads the fixture.

## Reconciliation

`scripts/commerce/reconcile-payout.mjs --payout po_...` lists a payout's balance transactions: charges, refunds, dispute withdrawals and fees. It matches each one to its order, invoice number and credit-note number, and checks that the rows add up to the payout. Rows with no order are listed, never dropped. Amounts stay in Stripe's minor units and the balance currency; conversion to CZK (T8) is the accountant's step.

## Stripe documentation used

- [Collect customer tax IDs with Checkout](https://docs.stripe.com/tax/checkout/tax-ids): `tax_id_collection`, `customer_update`, and verification by `customer.tax_id.updated` once the ID is saved to a Customer.
- [Receipts and paid invoices](https://docs.stripe.com/payments/checkout/receipts): `invoice_creation` and `invoice_data`.
- [Changelog: collected_information.tax_id rename (2026-07-29)](https://docs.stripe.com/changelog/dahlia/2026-07-29/checkout-session-collected-information-tax-ids-rename). `lib/taxIds.js sessionTaxIds` reads both shapes.
