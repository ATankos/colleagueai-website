# Founder-assisted acceptance tests for the release candidate

Release candidate: PRs #590 → #591 → #592 → #593 (code head on the Preview: see #593). Prepared 27 Nov 2026 (final assurance).
These are the tests that cannot run without the founder: a person must enter test cards, hold the Microsoft tenant and read a mailbox.
Each one closes a named gate in `config/release-gates.json` or a blocker in `docs/audit/round-3-assurance-report.md`.
**Sandbox only. Never a live key, a real card or customer data.** Record every result in the table at the end, with the reference it names.

Already verified without the founder (27 Nov, deployed Preview of #593, read-only): reconciliation endpoint 503 `cron_not_configured`,
webhook GET 405, download without token 403 `missing-token`, success page without session 400, `x-robots-tag: noindex` on the Preview.

## A. Stripe sandbox journey on the Preview (closes C-E2E-PREVIEW again, C-DECLINE-3DS, C-REFUND-PREVIEW)

C-E2E-PREVIEW passed on 21 Nov, but the stack has since changed fulfilment, commission and certificate code, so it must be repeated.

Before you start: founder configuration checklist (**Preview environment and Stripe sandbox only**; production settings are not touched):

- [ ] Stripe **test** keys on the Preview (never a live key).
- [ ] The Preview's webhook endpoint is registered in the Stripe sandbox, its signing secret is set on the Preview, and the endpoint subscribes to **all** of these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`, **`charge.dispute.updated`** (new: an inquiry that escalates to a chargeback arrives as this event), `charge.dispute.closed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` (same list as `docs/stripe-e2e-runbook.md`).
- [ ] `CHECKOUT_ENABLED` on the Preview as documented in `docs/stripe-e2e-runbook.md`.
- [ ] For the notification check in A8b: `OPS_ALERT_EMAIL` (an inbox you read) and `RESEND_API_KEY` set on the **Preview**. Without them the notification still appears in the runtime log, and A8b checks the log instead.
- [ ] For the commission checks in A7–A8e: one partner code approved in the **Preview** store.

| # | Step | Expected | Evidence to keep |
|---|---|---|---|
| A0 | `BASE_URL=<preview> node scripts/verify-stripe-e2e.mjs` | all checks pass | output |
| A1 | Buy Contract Intelligence & Register (licence only), card `4242 4242 4242 4242` | thank-you page; order page shows licence confirmation and invoice; buyer email received | order id, payment intent id |
| A2 | Download from the order page; `sha256sum` the ZIP | `37a047c183bb3ff5ae33a5fefc59a6488ad84656720f5aaf19c14572473e051d` | hash |
| A3 | Resend the `checkout.session.completed` event from the Stripe dashboard | `{duplicate:'event'}`; still one entitlement, one order | webhook log |
| A4 | Card `4000 0000 0000 0002` (decline) | Checkout shows the decline; no order paid, no licence | screenshot |
| A5 | Card `4000 0025 0000 3155` (3-D Secure): complete, then repeat and fail the challenge | completed: as A1; failed: no licence | screenshots |
| A6 | Refund A1 fully in the dashboard | licence revoked; a fresh download link answers 403; credit note on the order | webhook response, credit note |
| A7 | With a test partner code (approved in the Preview store): buy again | commission = 10% of the licence **before tax** (no subscription line in this run) | `preview:commission:<session>` |
| A8a | Buy again with the A7 partner code, card `4000 0000 0000 1976` (the charge succeeds, then the issuer opens an **inquiry**: Stripe status `warning_needs_response`) | Webhook answers `dispute: 'inquiry'`, `licence: 'unchanged'`, `commission: 'unchanged'`. A fresh download link from the order page **still works**; `preview:commission:<session>` is still `pending`, not reversed; the order record (`preview:order:<id>`) holds the dispute with `inquiry: true`. **Nothing is revoked or suspended** (founder decision 27 Nov). If you also run A9–A11: an inquiry on a licence + certification purchase leaves the certificate **Active** (webhook `certification: 'unchanged-inquiry'`) | webhook delivery response; order page; commission record |
| A8b | Operator notification for A8a | Runtime log (Vercel → Preview → Logs) shows `[webhook] payment inquiry received; no automatic action, investigate` with the dispute id. If `OPS_ALERT_EMAIL` is set: **one** email, subject "Payment inquiry … needs a response", containing the dispute id and order id, and **not** the buyer's email address. Webhook answer `operator: 'notified'` (email) or `'logged'` (log only). If you submit evidence on the inquiry (status becomes `warning_under_review`), that update sends **no** second email | log line; email (or its absence noted) |
| A8c | Close the A8a inquiry in the dashboard without a chargeback (`warning_closed`) | Licence, commission and order unchanged (nothing to restore); download link still works | webhook response |
| A8d | Escalation: a new A8a-style purchase whose inquiry **escalates** to a formal chargeback, if the Stripe sandbox offers a way to escalate an inquiry (see Stripe's testing documentation for disputes) | On `charge.dispute.updated` with status `needs_response`: licence **suspended** (fresh download link 403), commission reversed, order shows the chargeback. If the sandbox cannot escalate an inquiry, record A8d as **NOT TESTED (sandbox limitation)**. The escalation path is covered by automated test X3b in `tests/certification-dispute.test.mjs` | webhook responses, or the note |
| A8e | Formal chargeback on a licence-only purchase: buy with the partner code, card `4000 0000 0000 0259` (charge succeeds, then disputed as fraudulent); then resolve it as **won** (submit Stripe's winning test evidence) | Open: licence suspended (download 403) and commission reversed. Won: licence **restored** (download works again) and commission back to `pending` | webhook responses; commission record |

Only if you choose to test Continuous Certification on the Preview (`CERTIFICATION_SALES_ENABLED=1` on the Preview only):

| # | Step | Expected |
|---|---|---|
| A9 | Buy licence + certification, card `4242…` | certificate issued; verification page "Active" only if the release is certified; commission on the licence line only |
| A10 | Card `4000 0000 0000 0259` (charge succeeds, then disputed as fraudulent) on a licence + certification purchase | certificate shows "Payment dispute open — not currently active"; decision unchanged |
| A11 | Resolve A10 as won, and separately as lost (Stripe sandbox: submit the winning or losing test evidence described on Stripe's testing page) | won: hold released; lost: certification ended, subscription cancelled |
| A12 | `node scripts/certification-reconcile.mjs --status` against the **Preview** store namespace | `ok: true`, `pendingIssuances: 0`, `evidenceRepairs: 0` |

## B. Microsoft clean tenant (closes P-WORKFLOW-CLEAN; first-sale blocker FS-2)

The blocker is known: the clean environment CAI-A6-CLEAN has **no Copilot Studio capacity** (runs fail with "insufficient Copilot Credits"). A billing plan or prepaid credits for that environment is a Microsoft cost, so it is your decision; the factsheet's estimate is USD 0.22–0.40 per 15-page extraction at pay-as-you-go prices.

| # | Step (follow INSTALL.md of bundle r3 exactly, as a customer administrator would) | Expected |
|---|---|---|
| B1 | Attach capacity to CAI-A6-CLEAN; set a cost alert first | capacity visible in PPAC |
| B2 | Import the managed solution from the downloaded r3 bundle (hash checked in A2) | import succeeds; no undocumented step |
| B3 | Bind three connections, set five values, turn on seven flows, create the owner team | readiness checklist green |
| B4 | Upload one synthetic contract (SYN-N09) | extraction with excerpt and location, labelled unverified |
| B5 | Review in Teams: approve one term, correct one | only approved terms feed effective terms and deadlines; the correction is kept beside the original |
| B6 | Ask the agent about the deadline | answer from the approved register, matching `truth.json` (2027-06-30) |
| B7 | Second user in another team | sees nothing of the first team's contracts |
| B8 | Upload an unreadable file; turn a flow off and on | failure recorded, no partial register entry; flow resumes |
| B9 | Record time taken and every deviation from INSTALL.md | the factsheet's 60–90 minutes holds, or is corrected |

## C. Email (closes FS-4)

| # | Step | Expected |
|---|---|---|
| C1 | Resend: sending domain verified (DNS) | status verified |
| C2 | A1 sends the order email to a test inbox you control | arrives, not in spam; links open the order page |
| C3 | `/recover` with the A1 email | recovery email arrives; the link opens the order's downloads and stops working after 30 minutes (`RECOVERY_TTL_SECONDS`) |
| C4 | Demo request on the site | the notification reaches the configured inbox with the requester as reply-to (the requester gets the on-screen confirmation only; no email is sent to them) |
| C5 (optional) | Set `OPS_ALERT_EMAIL` and run the reconciliation with a queued test item on the Preview | one alert email, counts only |

## D. Production configuration check (closes FS-3 / O-PROD-CONFIG; read in the Vercel dashboard, no change)

Confirm the **live** Stripe webhook endpoint (`https://www.colleagueai.ai/api/webhook`, see `docs/launch/production-activation.md` §C) will subscribe to `charge.dispute.updated` together with `charge.dispute.created` and `charge.dispute.closed`. Without it an escalated chargeback suspends nothing. Before Continuous Certification opens, the live list also needs `invoice.paid` and `invoice.payment_failed`. Optional for operations: `OPS_ALERT_EMAIL` in Production, so inquiries and reconciliation alerts reach an inbox and not only the log.

Confirm present in **Production**: `DOWNLOAD_TOKEN_SECRET` (required), `ACCEPTANCE_SALT` and `INTEREST_DEDUPE_SALT` (optional; without them the fingerprint and interest dedupe are switched off, correctly), Resend key, Blob token. Confirm `CHECKOUT_ENABLED` and `CERTIFICATION_SALES_ENABLED` are **off** until the launch decision. Do not set `CRON_SECRET` until Continuous Certification opens.

## Results

| Test | Date | Result (PASS / FAIL / BLOCKED) | Reference (order, event, screenshot, log) | By |
|---|---|---|---|---|
| A0–A7 | | | | |
| A8a–A8e (disputes) | | | | |
| A9–A12 (optional) | | | | |
| B1–B9 | | | | |
| C1–C5 | | | | |
| D | | | | |
