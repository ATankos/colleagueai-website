# Final launch document package — CAI-L4-CI-001 release 1.0.3.6 (20 November 2026)

Seller status (corrected 21 Nov 2026): **Colleague AI s.r.o., IČO 29540852; VAT status not verified** (checked 21 Nov 2026: ARES has no VAT-register entry for IČO 29540852, VIES answers INVALID; no registration decision on file). The accountant establishes it from the official record (A1 below). The Commercial Register shows Marek Těšitel as sole managing director and sole shareholder; no registered 50/50 ownership is assumed.

## 1. Customer-facing documents (what a buyer receives)

| Document | Source of truth | Status |
|---|---|---|
| Terms of Service 2026-06-13, Software & Agent Licence 2026-06-13, Refund Policy 1.0 (2026-07-09), Privacy Policy 2026-06-13 | `config/legal.json`, live pages, archived copies `legal/archive/` (SHA-256 per version) | **Published and accepted today as document set 2026-07-09.** Counsel's amendments (PR #532 sentences, support period, privacy proposal) ship as new versions; earlier buyers keep their versions. |
| Licence agreement confirmation PDF `AGR-<order>` | generated per order, `lib/agreementPdf.js`; sample `scripts/commerce/order-documents-sample.mjs` | **Live** (merged #539) |
| Invoice (Stripe post-payment invoice, our copy stored) / TEST invoice from the sandbox ledger | `lib/invoicing.js`, `lib/invoicePdf.js` | **Live for test orders**; a real invoice needs the approved tax policy (A1–A3) |
| Credit note per refund | same | Live for test orders |
| Package `CAI-L4-CI-001_1.0.3.6-r3.zip` (SHA-256 37a047c1…e051d, 371,721 B), START-HERE, INSTALL, dossier, readiness check | private Blob store; `config/products.json` | **Revision 3 built (commercial release status, Licence §5 support periods); upload to Blob pending.** Revisions 1 (`…1.0.3.6.zip`, 69b30676…) and 2 (`…-r2.zip`, 66639e7f…) stay unchanged in Blob and under `previousBundles` |
| Order page with documents, entitlement, accepted agreements, support and security contacts | `api/success.js` | Live |
| Order notification e-mail | `lib/orderMail.js` | Live, **not configured** in Production (RESEND_API_KEY) |

## 2. Company-internal documents (never sent to a customer)

| Document | File | Status |
|---|---|---|
| **IP: exclusive licence from each author to the company** | `docs/legal/ip-licence-agreement-DRAFT.md` + `docs/legal/ip-rights-review.md` | **UNSIGNED DRAFT — counsel review pending.** No signed instrument exists; until signed, the company's right to license the software is undocumented (gate G2). Kept entirely separate from the customer Licence. |
| Tax policy — identified-person draft | `docs/launch/tax-policy-draft-identified-person.json` | **Draft from the founder's status; not the accountant's answer**; `config/tax-policy.json` stays `unapproved`. Approval needs the accountant's name/role/date/reference and the registration date. |
| Invoicing route assessment (Stripe vs Czech tool) | `docs/commerce/invoicing-route-assessment.md` | For the accountant (Q1–Q4) |
| Privacy policy proposal + GDPR roles (no customer DPA) | `docs/legal/privacy-policy-proposal-2026-11-20.md` | For counsel |
| CRA: procedure + operational set-up | `docs/security/vulnerability-handling-procedure.md`, `cra-operational-setup.md` | For counsel (C1–C6) and founder (security@) |
| Third-party licences | `docs/legal/third-party-licences.md` | Current (61 packages + DejaVu fonts) |
| Evidence | Release evidence library (`release-evidence-2026-11-20-r3.zip`, 60360f20…15e5), Implementation Report §14 | Current |
| Remaining approvals | `docs/launch/remaining-approvals.md` | Current |

## 3. Tax point and CZK conversion — review against the configuration

What the code does today, against the identified-person draft (the accountant confirms each line):

| Rule | Draft (T7/T8) | Implementation | Verdict |
|---|---|---|---|
| Tax point (DUZP) | day the service is supplied = day of payment for a licence delivered on payment (§ 21 ZDPH) | Our invoice/credit-note PDF prints *Date of taxable supply* = `facts.paidAt` (the Stripe payment confirmation); Stripe's own invoice shows invoice date and payment date, no DUZP label | Consistent for our document; Stripe document relies on Q2 |
| Invoice date | date of issue | `issuedAt` of the ledger entry / Stripe finalisation | Consistent |
| Currency | USD invoice acceptable; CZK base in the VAT records | USD only on both routes | Consistent; CZK amount on the document only if the accountant requires it (then the Czech route) |
| CZK conversion | ČNB rate on the DUZP (§ 4(8) ZDPH) | Not computed by the code. Our PDF prints a conversion only when the ledger entry carries `conversion {rate, source, date, amountCzk}`; otherwise it states the rule is not yet recorded. `scripts/commerce/reconcile-payout.mjs` gives the accountant the per-order amounts in the balance currency | Consistent with "accounting step"; if T8 requires the CZK amount on the invoice, the Czech route is needed (gap, known) |
| Reverse-charge wording | per category `invoiceNote` | Printed from the policy on both routes (Stripe footer / our Tax statement) | Consistent once approved |
| Domestic invoice note: the accountant's wording for the status established under T1 | T3 | same mechanism | Consistent once approved |
| Received services (T11) | self-assessed in the VAT return by the 25th | out of the code's scope (accounting) | 25 Nov deadline — accountant |

No defect found in the tax-point handling. The one structural limit stays as documented: a CZK amount on the invoice itself needs the Czech route.

## 4. Flags

- **Unsigned**: IP licence agreements (Instrument A Alexandr Tankos → company; Instrument B Marek Těšitel → company only if he lists works; the company signs through its sole jednatel). Not represented as signed anywhere.
- **Unapproved**: tax policy (draft only), counsel texts, counsel licence text for a later bundle revision (revision 2 corrects only the release number).
- **Not configured in Production**: RESEND_API_KEY / MAIL_FROM / DEMO_NOTIFY_EMAIL (notifications), RECOVERY_ENABLED, security@ mailbox, Vercel plan.
