# Exact remaining approvals before the first paid launch (20 November 2026, 20:00 UTC)

> **21 November 2026:** the single current checklist, with each item classified as required by law / our own gate / recommended review, is `first-czech-b2b-sale-requirements.md`. The tax draft is now v2 (`tax-policy-draft-identified-person.json`, CZ B2B only), the proposed agreement texts are in `../legal/proposed/`, and the IP draft carries an execution checklist. Section C below (the GO sequence) still applies.

Everything in the sales, contract, invoice and delivery chain is built and tested in the Stripe sandbox (PR #539). Nothing below is a development task; each line is a written decision or an action only its owner can take. Order matters: A before B before C.

## A. Written adviser decisions (critical path; the VAT filing deadline of 25 Nov makes T1/T11 urgent)

| # | Approval | Owner | Evidence that closes it | Where it lands |
|---|---|---|---|---|
| A1 | Seller VAT status and ID (T1), services-from-abroad duty (T11) | Accountant | written answer, dated | `config/tax-policy.json` seller block (intake form §B) |
| A2 | Treatment per buyer category for the first sale: one category `sell`, the rest `hold` (T2, T5, T6) | Accountant | written answer | `treatments` (intake §D) |
| A3 | Tax-document requirements T7 incl. Q1–Q4 of the route assessment, CZK rule T8, invoice route T13 | Accountant | written answer | `decisions`, `checkout.invoiceRoute` (intake §C/§E); `docs/commerce/invoicing-route-assessment.md` |
| A4 | Approval block (name, role, date, reference) → `status: approved` | Accountant → founder commits | the PR with the approved file; `tests/tax-policy.test.mjs` green | tax-policy PR |
| A5 | Customer documents: Terms, Licence (§3, §5/§6 support period and security-maintenance wording), Refund, Privacy (proposal of 20 Nov) | Counsel | approved texts with approval date | new legal versions via archive script (counsel intake §A); PR #532 closed by them |
| A6 | IP: exclusive licence agreements from each author to the company (draft revised 21 Nov: Instrument A Alexandr Tankos → company; Instrument B only for works Marek Těšitel lists) | Counsel; then the licensor(s) and the company through its sole jednatel Marek Těšitel sign | signed PDF filed in the Release evidence library | Implementation Report G2 |
| A7 | Bundle revision 2 licence text and release-status wording | Counsel | approved `LICENSE.txt` | bundle revision 2 (staged offline), PR #533 absorbed |
| A8 | CRA: C1 applicability/dates, C2 safe harbour, C3 promisable times, C4 support period, C5 SBOM, C6 reporting path | Counsel (+ founder for C6 account) | written answers | `/security/disclosure`, `security.txt`, register |
| A9 | GDPR: role statement (no customer DPA), transfers wording, provider DPAs on file | Counsel + founder | counsel's note; the six provider DPAs filed | privacy version; Trust Center |

## B. Founder configuration decisions (no adviser needed)

| # | Decision | Action |
|---|---|---|
| B1 | Hosting plan: Vercel Hobby is personal/non-commercial by Vercel's terms | Upgrade to Pro before the first payment (also restores log retention and spend alerts) |
| B2 | `security@colleagueai.ai` shared mailbox (D10) | Create; both founders members; auto-acknowledgement rule (`cra-operational-setup.md` §1) |
| B3 | Mail transport for order and demo notifications | Set `RESEND_API_KEY`, `DEMO_NOTIFY_EMAIL`, `MAIL_FROM` in Vercel Production; verify the sending domain in Resend; then the agent re-runs the demo-lead and order-notification tests |
| B4 | Document store | Confirm `BLOB_STORE_ID` (private store) is set in Production — the same store that holds the packages; order documents go to `orders/<id>/` |
| B5 | Download recovery | `RECOVERY_ENABLED=1` once B3 is done (buyers can re-request links) |
| B6 | Review control G6 | Name the reviewer and the non-admin agent identity; apply the ruleset |
| B7 | Payment methods for the first sale | `CAI_PAYMENT_METHODS=card` until the accountant's T12 opens bank transfer |
| B8 | Provider DPAs | Download Vercel, Upstash, Stripe, Resend, Sentry, Plausible DPAs; file them |

## C. The GO sequence (only after A and B; executed by the founder, never by an agent)

1. Merge the tax-policy PR (A4) and the legal-version PRs (A5); publish bundle revision 2 (A7) if counsel's text arrived.
2. Enter **live** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel Production (founder types them; `CAI_ENABLE_CHECKOUT` stays unset).
3. Kill-switch rehearsal: `/api/checkout` → 503; confirm the one-commit rollback.
4. Founder's own PR: `saleApproved: true` for `contract-intelligence-and-register` only; required review per G6; merge.
5. Set `CAI_ENABLE_CHECKOUT=1`; smoke: catalogue shows the product, `/api/checkout` returns a live session URL (no purchase).
6. First live order; verify webhook → licence → agreement PDF → invoice → documents → notification → download hash; support mailbox watched; `scripts/commerce/check-fulfilment.mjs` the next morning.

## Safeguards in force today

`saleApproved=false`; live checkout disabled (503 `checkout_disabled`); no live Stripe keys; tax policy `unapproved` (live sale refused independently of saleApproved); no legal text published since 13 Jun / 9 Jul 2026 versions; no external filing or signing; no additional Azure spending; no IP right approved automatically.
