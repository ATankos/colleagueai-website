# Accountant answer → configuration intake (first sale, one approved buyer category)

Purpose: when the accountant's written answers arrive, every line below is copied **verbatim** into `config/tax-policy.json`; nothing is interpreted by the engineer. `tests/tax-policy.test.mjs` refuses an `approved` policy with any required field empty. Keep the e-mail or letter: its date and subject go into `approval.reference`.

## A. Who approved (all four required)
| Field | Fill from the answer |
|---|---|
| `approval.approvedBy` | accountant's full name |
| `approval.role` | e.g. "daňový poradce (ev. č. KDP …)" / "účetní" |
| `approval.approvedAt` | date of the written answer (YYYY-MM-DD) |
| `approval.reference` | where it is filed (e-mail subject + date, or document id) |

## B. Seller status — T1 (blocking)
| Field | Allowed values | From |
|---|---|---|
| `seller.vatStatus` | `vat_payer` · `identified_person` · `not_registered` | T1 |
| `seller.vatId` | `CZ` + 8–10 digits, required if vat_payer or identified_person | T1 |
| `seller.vatEffectiveFrom` | YYYY-MM-DD, required if registered | T1 |
| `decisions.T1_vatStatus` | the accountant's sentence | T1 |
| `decisions.T11_servicesFromAbroad` | the accountant's sentence on the Microsoft invoice / identified-person duty and any filing date (not blocking for the sale, time-critical) | T11 |

## C. Blocking decisions (text, verbatim)
| Field | Question |
|---|---|
| `decisions.T2_euBusinessWithVatId` | EU business buyer with a VAT ID: treatment |
| `decisions.T5_businessStatusAndNoVatId` | buyer says "business" but gives no VAT ID: treatment |
| `decisions.T6_licenceClassification` | the perpetual software licence: supply of service / electronic service / other, place of supply |
| `decisions.T7_taxDocumentRequirements` | what the tax document must contain (daňový doklad / faktura), language, currency, CZK conversion rate rule |
| `decisions.T13_invoiceRoute` | who issues the document: Stripe invoice or the Czech invoicing tool |
| Optional now, needed later: `T3_domesticBusiness`, `T4_nonEuBusiness`, `T8_currencyConversion`, `T9_revenueRecognition`, `T10_partnerCommissions`, `T12_bankTransferProforma`, `T14_microsoftConsumption` | fill if answered; `null` is allowed for non-blocking ones |

## D. Treatment per buyer category (all six must be decided; `hold` is a valid first-sale answer)
For each of `cz_business`, `eu_business_vat_verified`, `eu_business_vat_pending`, `eu_business_vat_unverified`, `eu_business_no_vat_id`, `non_eu_business`:
```json
"cz_business": { "action": "sell | hold | block", "invoiceNote": "exact wording to print on the invoice, or \"\" for none", "basis": "accountant's reason, optional" }
```
First-sale rule (founder decision 4): the one approved category = `sell`; every other category = `hold` (buyer sees the hold notice, no payment is taken) unless the accountant explicitly approves more.

## E. Checkout settings (from T7/T13)
| Field | Values | From |
|---|---|---|
| `checkout.invoiceRoute` | `stripe` or `czech_tool` | T13 |
| `checkout.stripeTax` | `true` / `false` (Stripe Tax calculation on) | T6/T7 |
| `checkout.requireTaxIdIfSupported` | `true` / `false` | T2/T5 |
| `checkout.onCountryMismatch` | `hold` (keep) | — |
| `status` | `approved` | — |
| `version` | `YYYY-MM-DD-approved` | — |

## F. Then (engineer, ~1 hour)
1. Commit `config/tax-policy.json` on a branch; run `node --test tests/tax-policy.test.mjs tests/purchase-journey.test.mjs tests/webhook.test.mjs`.
2. Preview with TEST keys: one checkout per `sell` category → invoice footer shows the `invoiceNote`; one `hold` category → hold notice, no session. Record both in the evidence library.
3. PR for the founder's review; merge only with the founder's GO sequence (saleApproved stays false until then).
