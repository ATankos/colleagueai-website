> **State on 22 Nov 2026.** `config/tax-policy.json` is the CZ-B2B candidate, `unapproved`.
> - `seller.vatStatus` is now `identified_person`, on the founder's report of the accountant's confirmation.
> - `vatId`, `vatEffectiveFrom` and `vatStatusEvidence.officialRecord` stay `null`, and the history entry is
>   `verified: false`. Approval is refused until the official record is on file.
> - The first-sale scope (Czech businesses, card, one release) is enforced separately by `config/launch-scope.json`.
> - Every foreign category is `hold`.
> - `tests/tax-policy.test.mjs` "intake readiness" proves that filling exactly the fields below, and nothing else,
>   activates the policy.

## 0. What is known, and how well (22 Nov 2026)

| Class | Fact | Source | Where it goes |
|---|---|---|---|
| Founder-reported | Registered as an identified person; not a full VAT payer in 2026; full registration contemplated for 2027 | founder, reporting the accountant (22 Nov 2026) | `seller.vatStatus`, `vatStatusEvidence.founderReported` (done) |
| Officially verified | none yet. Earlier public checks (21 Nov 2026): no VAT-payer entry in ARES; VIES answered INVALID for CZ29540852. An identified person's number should normally validate in VIES, so the accountant reconciles this against the registration decision. | ARES / VIES | `vatStatusEvidence.officialRecord`, `vatId`, `vatEffectiveFrom`, verified history entry |
| Accountant decisions | none in writing yet (T1–T14) | n/a | `decisions.*`, `approval.*` |
| Unresolved legal questions | DIČ on domestic invoices (T7); October 2026 return for Microsoft invoice G195024562 (T11, due 25 Nov 2026 if it applies); identified-person invoice wording (T3); 2027 effective date | n/a | see B–E |
| Technical status | identified-person presentation, fail-closed guards, effective-dated history, foreign-purchase register: built and tested (`tests/vat-identified-person.test.mjs`, `tests/foreign-purchases.test.mjs`) | repository | n/a |

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
| `seller.vatStatus` | `identified_person` (set from the founder's report; confirm, or correct to `vat_payer` / `not_registered`) | T1 |
| `seller.vatId` | the DIČ exactly as on the registration decision (`CZ` + 8–10 digits) | official record |
| `seller.vatEffectiveFrom` | YYYY-MM-DD from the registration decision | official record |
| `seller.vatStatusEvidence.officialRecord` | reference of the registration decision or tax-register extract (document id/date; the file itself stays private) | official record |
| `seller.vatStatusEvidence.accountantWrittenConfirmation` | reference of the accountant's written answer | T1 |
| `seller.vatStatusHistory` | one entry `{ status, effectiveFrom, verified: true, evidenceReference }` matching the decision; a planned 2027 registration is added only when its decision exists (`docs/commerce/vat-transition.md`) | official record |
| `seller.showVatIdOnDomesticInvoices` | `true` / `false`: whether the identified person's DIČ is printed on invoices to Czech buyers | T7 |
| `decisions.T1_vatStatus` | the accountant's sentence | T1 |
| `decisions.T11_servicesFromAbroad` | the accountant's sentence on the identified-person duty for services from abroad; per-invoice decisions go into the private purchase register (`docs/commerce/foreign-supplier-purchases.md`), starting with G195024562 (`docs/commerce/microsoft-invoice-G195024562.md`): not blocking for the sale, **time-critical (25 Nov 2026)** | T11 |

## C. Blocking decisions (text, verbatim)
| Field | Question |
|---|---|
| `decisions.T2_euBusinessWithVatId` | EU business buyer with a VAT ID: treatment |
| `decisions.T5_businessStatusAndNoVatId` | buyer says "business" but gives no VAT ID: treatment |
| `decisions.T6_licenceClassification` | the perpetual software licence: supply of service / electronic service / other, place of supply |
| `decisions.T7_taxDocumentRequirements` | what the tax document must contain (daňový doklad / faktura), language, currency, CZK conversion rate rule |
| `decisions.T13_invoiceRoute` | who issues the document: the company's own series (`company_ledger`, built and tested), a Stripe invoice, or a Czech invoicing tool (not built) |
| Optional now, needed later: `T3_domesticBusiness`, `T4_nonEuBusiness`, `T8_currencyConversion`, `T9_revenueRecognition`, `T10_partnerCommissions`, `T12_bankTransferProforma`, `T14_microsoftConsumption` | fill if answered; `null` is allowed for non-blocking ones |

## D. Treatment per buyer category (all six must be decided; `hold` is a valid first-sale answer)
For each of `cz_business`, `eu_business_vat_verified`, `eu_business_vat_pending`, `eu_business_vat_unverified`, `eu_business_no_vat_id`, `non_eu_business`:
```json
"cz_business": { "action": "sell | hold | block", "invoiceNote": "exact wording to print on the invoice, or \"\" for none", "basis": "accountant's reason, optional" }
```
First-sale rule (founder decision 3, 21 Nov 2026): `cz_business` = `sell` with the accountant's `invoiceNote`. For an identified person this is the accountant's wording that no VAT is charged, never written by the engineer. The code refuses wording that calls the document a tax document (*daňový doklad*) or says the customer accounts for the tax (`config/tax-wording-guards.json`). Every other category stays `hold`, which the candidate already contains.

## E. Checkout settings (from T7/T13)
| Field | Values | From |
|---|---|---|
| `checkout.invoiceRoute` | `company_ledger` (recommended build: own yearly series CAI-INV-YYYY-NNNNN, credit notes CAI-CN-YYYY-NNNNN), `stripe`, or `czech_tool` (fails closed until built) | T13 |
| `checkout.czkConversion` | `null` (no CZK line printed) or `cnb_daily_rate_on_tax_point` (ČNB daily rate for the date of supply, printed with its source list) | T8 |
| `checkout.stripeTax` | `true` / `false` (Stripe Tax calculation on) | T6/T7 |
| `checkout.requireTaxIdIfSupported` | `true` / `false` | T2/T5 |
| `checkout.onCountryMismatch` | `hold` (keep) | — |
| `status` | `approved` | — |
| `version` | `YYYY-MM-DD-approved` | — |

## F. Then (engineer, ~1 hour)
1. Commit `config/tax-policy.json` on a branch; run `node --test tests/tax-policy.test.mjs tests/purchase-journey.test.mjs tests/webhook.test.mjs`.
2. Preview with TEST keys: one checkout per `sell` category → invoice footer shows the `invoiceNote`; one `hold` category → hold notice, no session. Record both in the evidence library.
3. PR for the founder's review; merge only with the founder's GO sequence (saleApproved stays false until then).
