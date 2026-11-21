# The first Czech B2B sale: what the law requires, what we chose to require, what is still missing

*21 November 2026. Implements section F of the legal & tax review of 21 November 2026. Replaces the "A/B/C" lists in
`remaining-approvals.md` as the single checklist for the first paid order; that file keeps the GO sequence.*

The scope of the first sale is one order from one Czech legal entity for Contract Intelligence & Register (CAI-L4-CI-001,
release 1.0.3.6, USD 14,900), paid by card through Stripe (`config/launch-scope.json`). The seller's VAT status is not
verified (checked 21 Nov 2026: ARES has no VAT-register entry for IČO 29540852, VIES answers INVALID; no registration decision on file); the accountant establishes it (T1). EU, non-EU and consumer purchases stay on hold in
`config/tax-policy.json` (the earlier `tax-policy-draft-identified-person.json` is superseded).

## 1. Three kinds of requirement

- **A — required by law.** Without it the sale, the invoice or the data processing is unlawful or the document is wrong.
- **B — our own release gate.** A company decision; the founders may replace a professional sign-off with a documented
  internal risk acceptance once the evidence exists. Not doing so is not a legal breach.
- **C — recommended professional review.** Reduces risk; not a statutory prerequisite for selling ordinary B2B software
  in the Czech Republic.

## 2. Status by item

| # | Item | Kind | Status 21 Nov | Exactly what is missing | Owner |
|---|---|---|---|---|---|
| 1 | Seller VAT status: identified person, DIČ CZ29540852, effective date | A (tax) | founder-confirmed; not evidenced | registration certificate or official confirmation with the effective date → `seller.vatEffectiveFrom` | founder (records) |
| 2 | Tax treatment of the first order: domestic B2B supply under the seller's official VAT status (to be established, T1), invoice note per T3 | A (tax) | drafted (T1–T14 v2) | accountant's written confirmation of T1, T3, T7, T8, T13 with a reference; then `config/tax-policy.json` approval block and `status: approved` in a PR | accountant → founder |
| 3 | Invoice document meets the T7 list (seller, buyer, supply, date of issue, tax point with its basis and the separate payment and delivery dates, number, note, archived copy) | A (tax) | code ready for both routes (`lib/invoicePdf.js` `taxPointOf`: delivery is the supply, payment before delivery is an advance under § 20a(2) ZDPH); no real sample yet | one Stripe-generated invoice PDF from the new Preview purchase, checked line by line (T13); if it fails, `invoiceRoute: czech` | me (check) → accountant (decision) |
| 4 | CZK conversion method for VAT records and accounting (T8) | A (tax/accounting) | rule drafted (ČNB rate on the date of supply) | accountant's written choice of the accounting rate method | accountant |
| 5 | Microsoft supplier invoice G195024562 (Oct 2026): treatment and whether a return is due by 25 Nov 2026 | A (tax) | open; decision tree written (tax draft T11) | the ORIGINAL invoice, read for: supplier entity and VAT number; the customer block (is DIČ CZ29540852 printed?); the VAT line (rate, amount, whose VAT; EUR 45.89 on EUR 218.52 is 21 % = Czech rate, i.e. VAT was probably charged because no VAT ID was on the account); any reverse-charge legend; issue date and service period / tax point; service description; net amount, currency and CZK rule; payment date. Foreign supplier + no VAT + reverse-charge legend → self-assess 21 % in the October return (due 25 Nov 2026), no deduction. Foreign supplier + VAT charged → accountant decides whether § 108(3) still applies; update the Microsoft account with the DIČ. Czech supplier → domestic, nothing to self-assess. Nothing is reverse-charged automatically. | founder (document) → accountant |
| 6 | Turnover monitoring against the CZK 2,000,000 / 2,536,500 thresholds | A (tax, ongoing) | implemented (`lib/vatTurnover.js`, `scripts/commerce/vat-turnover.mjs`): counts only supplies with place of supply in the Czech Republic as recorded on the order, lists unresolved orders instead of counting them, never reports `ok` over them, detects a crossing at the date of supply before later refunds, year chosen at run time | accountant confirms the § 4a rule as implemented; run monthly | founder |
| 7 | Customer agreements that are true: Licence §3 (no hosted layer), §4 (rights), §5 (functional support / corrective releases / CRA security updates, each with its period), §7 (warranty/liability); Terms §2 (B2B by declaration and identification, no automatic consumer detection); Refund; Privacy (providers, order processing, retention) | A for truthfulness and GDPR Art. 13; B for the specific wording | proposed texts in `docs/legal/proposed/` | founder decisions D1, D1a, D2–D5; counsel's approval (C); publication through the versioning process as new versions; translations re-done | founder, counsel |
| 8 | Company's right to sublicense the software it sells | A (copyright) | unsigned draft; execution checklist added (`ip-licence-agreement-DRAFT.md` Part A/B) | A1–A7 filled; general-meeting resolution; signatures of both authors (or one tri-partite instrument); accountant's note on consideration | both founders, accountant, counsel |
| 9 | Package licence text and release status inside the bundle (today: 1.0.3.2, "not for production use") | A (truthfulness) | ready text `docs/legal/proposed/package-LICENSE-1.0.3.6.txt` | counsel's OK on the text; bundle revision 2 built and published (#533 closed by it) | counsel → me → founder |
| 10 | GDPR: privacy policy accurate; provider DPAs on file (Vercel, Upstash, Stripe, Resend, Sentry, Plausible); transfer basis stated | A | drafted; DPAs not filed | the six DPAs downloaded and filed; regions confirmed in the Privacy §4 table | founder |
| 11 | CRA: security contact and reporting process operable | A (Art. 14 reporting duties apply since 11 Sep 2026) | procedure drafted and amended; operability checks O1–O7 listed | `security@` mailbox, `security.txt`, disclosure page, register, reporting-platform access | founder (+ counsel C2/C3/C6) |
| 12 | End-to-end purchase proof on real services (Stripe TEST, Preview, KV, Blob, Resend) | B | blocked on Preview configuration (env + webhook host); new purchase pending | founder's Preview settings → redeploy → one new test purchase → my verification | founder → me |
| 13 | Production configuration: Vercel Pro, `BLOB_STORE_ID`, `RESEND_API_KEY`/`MAIL_FROM`, `RECOVERY_ENABLED=1`, `CAI_PAYMENT_METHODS=card`, live Stripe keys last | B | not set | the variables, entered by the founder | founder |
| 14 | Review control (second reviewer account; no admin bypass as the default) | B | ruleset requires 1 review; only one account exists | a write-access reviewer account, or a documented decision to keep bypass-with-log until one exists | founder |
| 15 | GO switch: `saleApproved: true`, tax policy `approved`, checkout enabled | B | locked | founder's own PR after 1–13 | founder |
| 16 | Written counsel opinion on the final operative texts | C | not obtained | counsel's approval note, or a documented founder risk acceptance after 7–9 are done | founder |
| 17 | Accountant sign-off certificate as such | C | — | not a statutory prerequisite; the written confirmations in 2, 4, 5 are what matters | — |

## 3. The minimum to accept the first Czech B2B payment

In order, with nothing optional left in:

1. Item 1 and 2: registration evidence, accountant's written T1/T3/T7/T8/T13 confirmation → tax policy approved (CZ B2B
   `sell`, everything else `hold`/`block`).
2. Item 12 and 3: one new Stripe TEST purchase on the configured Preview passes all twelve checks; the invoice sample
   passes the T7 list (or the Czech route is switched on).
3. Item 7 and 9: Licence, Terms, Refund, Privacy published as new versions (English controlling) and the package
   licence text in bundle revision 2; translations marked out of sync until redone.
4. Item 8: signed rights instrument(s) filed — before the Licence's warranty of title is published.
5. Item 10 and 11: DPAs filed; `security@` live with the disclosure page and `security.txt`.
6. Item 13: production configuration; item 15: the GO PR, reviewed under item 14.

Items 5 and 6 run in parallel and do not block the order itself, but item 5 may carry a filing date (25 Nov 2026).

## 4. What this document does not do

It does not invent any approval. No line above says "approved" that is not evidenced by a document a person signed or
a file a person can open. Corrected 21 Nov 2026: neither a VAT registration nor a registered 50/50 ownership is
assumed. The Commercial Register shows Marek Těšitel as sole managing director and sole shareholder; the VAT status is
not verified (checked 21 Nov 2026: ARES has no VAT-register entry for IČO 29540852, VIES answers INVALID; no registration decision on file).
