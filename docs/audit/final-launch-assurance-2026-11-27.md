# ColleagueAI — final independent launch assurance (27 Nov 2026)

Release candidate: PRs #590 → #591 → #592 → #593 (all draft, stacked; #593 carries this round). Production today: `29410808` (#589).
Author: engineering assistant (Claude Opus 5.5). Engineering assessment: **not** legal, tax or accounting advice, and **not** a third-party audit.
Nothing was merged, no sale was activated, no money was spent, no evidence was created that was not observed.

## Decisions

| Area | Decision | Why, in one line |
|---|---|---|
| **1. Website and technical release readiness** | **GO** for independent review and merge of the stack, with sales kept off | Every engineering finding is fixed and tested, and the candidate passes a clean rerun, its live Preview, the production CSP and the 207-URL sweep; the only open items need access I don't have, not code |
| **2. Flagship first sale (Contract Intelligence & Register 1.0.3.6)** | **NO-GO today** | The Stripe journey has not been run on *this* code; the workflow on a clean tenant is blocked by Copilot capacity; 7 founder/legal/tax/operations gates have no approval record |
| **3. Continuous Certification** | **NO-GO** | No registered deciders, reconciliation inactive, retention not approved by counsel, translations not native-reviewed, no sandbox subscription run |
| **4. Founder, legal, accounting and operational actions** | 14 actions (§5) | All are owner, counsel or accountant steps. None needs new development |

What turns NO-GO into GO for area 2: tests A, B, C, D in `docs/launch/founder-acceptance-e2e.md` recorded as PASS, plus the six approvals in §5.1. No further engineering round is needed for the first sale.

## 1. What this round challenged, and the result

| Earlier conclusion | Challenge | Result |
|---|---|---|
| Keyboard focus test PASS (Round 3) | It had never been shown able to fail | Red-checked: with focus rings removed by an override that wins the cascade it flags 15/15 stops. The PASS stands. (A first red check that used a stylesheet was itself ineffective: the site's `!important` focus rules beat it. Recorded so nobody repeats it.) |
| Deferring body scripts is safe (Round 3) | A site-wide change of script timing | 207 sitemap URLs: 0 uncaught exceptions, 0 console errors. Catalogue filters still work: 36 / 17 / 13 / 6 by tier, and pillar filters narrow the list, in English and Czech. The live Preview serves 0 synchronous body scripts |
| Browser suites pass | The test server sends **no CSP**, so a change the production CSP blocks would pass the tests | Swept all 207 URLs with the exact production CSP injected: 0 violations. The CSP was verified to be enforced (an inline script was refused and logged) |
| Mobile catalogue 96 / LCP 2.3 s | Measured locally, uncompressed | Still a local figure. Production and Preview serve Brotli, so real numbers should be better, but field data is **NOT TESTED** (Lighthouse cannot reach the Preview from here). CI's Lighthouse job runs once the stack targets `main` |
| Release gate C-E2E-PREVIEW PASS (21 Nov) | The stack changed fulfilment, commission and issuance code since then | **Stale for this candidate**: the evidence is true for its commit, not for this one. Re-run is test A in the founder pack |
| Partner copy consistent (Rounds 2–3) | Swept every visible "10%" sentence in 8 languages | **Defect found and fixed**: the rate badge said "10 % · of every agent sale you refer". It now states the eligible net licence revenue in all 8 languages, guarded by a test |
| Founder test pack (first draft) | Checked its claims against the code | Two corrected before publication: the recovery link is valid 30 minutes (not "once"); a demo request emails ColleagueAI only, not the requester |
| Certificate-holder lookup (open concern) | Is the unkeyed SHA-256 key an oracle? | **No.** It is reached only with an email taken from a sealed, signed token, never from the URL. Someone with store access could already read the email in the certificate record. No change; a keyed HMAC remains an optional hardening |
| Reconciliation (open concern) | Does the report let the operator enforce the 7-day escalation and 90-day limit? | **Gap fixed**: the report now carries `oldestPendingDays` (counts only), and the alert email states it |
| Retention (open concern) | Do the no-TTL keys affect the first sale? | **No.** They exist only once certification is sold (`CERTIFICATION_SALES_ENABLED` is off by default). The periods remain a proposal for counsel; a Continuous Certification blocker, not a first-sale blocker |

## 2. Business model on the candidate

| Element | Verified by |
|---|---|
| Prices unchanged: L4 USD 14,900 one-time, certification USD 249 / month | `config/pricing.json`; `tests/pricing-consistency.test.mjs` |
| Perpetual licence; corrective releases for the version bought | `tests/release-access.test.mjs`, `tests/certified-corrective-wording.test.mjs` |
| Continuous Certification optional and closed | card `CERT_OPEN=false`; `CERTIFICATION_SALES_ENABLED` off; factsheet says "not yet open" |
| Partner commission 10% of eligible net perpetual licence revenue, none on subscriptions | `tests/commission-base.test.mjs`, `tests/partner-terms-consistency.test.mjs` |
| Customer-controlled Microsoft deployment; ColleagueAI never connects to the tenant | factsheet, INSTALL; no tenant credentials anywhere in the code |
| One flagship for sale, 35 agents visible as "Coming soon" | `saleApproved=false` everywhere today; catalogue shows all 36 |

## 3. Release gates (`config/release-gates.json`, release 1.0.3.6, updated 22 Nov)

| Gate | Register | Reconciled with evidence |
|---|---|---|
| P-INSTALL-CLEAN | PASS | **Holds.** Tested solution `cca6f657…` is the one bundle r3 ships (r3 is documents only; `scripts/cai-release/1.0.3.6/README.md`) |
| P-UPGRADE | PASS | Holds (1.0.3.5 → 1.0.3.6, data counts unchanged) |
| P-WORKFLOW | PASS | Holds, on the upgraded environment only |
| P-WORKFLOW-CLEAN | BLOCKED | **Still blocked**: no Copilot capacity on CAI-A6-CLEAN. Founder pack B |
| P-ISOLATION | PASS | Holds (9–10 Nov, team isolation; role 9 privileges) |
| P-UNINSTALL | PASS | Holds for the step tested; register itself says "not re-tested for 1.0.3.6" |
| P-CAPACITY-DOC | PASS | Holds (INSTALL §1, §9) |
| C-DECLINE-3DS | BLOCKED | Still blocked (needs a person to enter test cards). Founder pack A4–A5 |
| C-REFUND-PREVIEW | REQUIRES FOUNDER APPROVAL | Logic tested locally; Preview run is founder pack A6 |
| C-E2E-PREVIEW | ~~PASS~~ → **BLOCKED** (register updated 27 Nov; the 21 Nov evidence is kept as `previousEvidence`) | **Stale for the candidate** (see §1). Founder pack A0–A8 |
| C-BUNDLE-R2-PUBLISHED | PASS | Hash in the register equals `config/products.json` (`37a047c1…e051d`). Its own follow-up, one buyer download after merge, is **not recorded** as done. Founder pack A2 |
| C-1032-FILE | PASS | Holds (hash in register equals `products.json`) |
| C-CI-DOCUMENTS | PASS | Holds: `ci.yml` runs `tests/order-documents.test.mjs` |
| L-LEGAL-TEXTS | REQUIRES FOUNDER APPROVAL | No approval record |
| L-IP | REQUIRES FOUNDER APPROVAL | No approval record |
| T-TAX-POLICY | REQUIRES FOUNDER APPROVAL | No approval record |
| O-DPA-SECURITY | REQUIRES FOUNDER APPROVAL | `security.txt` live and valid (checked 27 Nov); DPAs not evidenced |
| O-PROD-CONFIG | REQUIRES FOUNDER APPROVAL | Environment values unreadable here (403). Founder pack D |
| O-REVIEW-CONTROL | REQUIRES FOUNDER APPROVAL | 61 merges without approving review (#585, R1); needs a second reviewer and no admin bypass |

Of 19 gates: 9 PASS hold for this candidate; 10 are open (3 BLOCKED including the stale C-E2E-PREVIEW, 7 awaiting approval).

## 4. Independent verification (this round)

| Area | Result |
|---|---|
| Security headers, live production | **PASS**: HSTS preload, CSP without inline script, nosniff, frame and referrer policy, permissions policy; `security.txt` valid to 2027-07-09 |
| Deployed candidate (Preview of #593) | **PASS**: reconciliation 503 when not configured, webhook GET 405, download without token 403, success without session 400, `x-robots-tag: noindex`, Brotli |
| Production / Preview isolation | **PASS** (code and tests; the Preview is noindex and namespaced; crons run on Production only) |
| Release integrity | **PASS** for records (bundle and solution hashes consistent across register, `products.json`, `SHA256SUMS`); Blob bytes not re-read here |
| Rollback | **PASS** (capability): previous production deployment (#586) is an instant-rollback candidate. Code rollback past the stack would drop the dispute hold rule; no data migration is needed either way |
| Monitoring | Adequate for a first sale without new infrastructure: Stripe webhook failure emails and retries, Vercel runtime errors (7 days), daily reconciliation once activated. The serverless API has no error tracker; the React demo page uses Sentry when a DSN is set |
| Dependencies | **PASS**: `npm audit` 0 |
| PR stack | **PASS**: all four mergeable; the stack merges cleanly into current `main`, and so does #585, alone or with the stack; CI test and e2e green on every PR head. CodeQL and Lighthouse run once a PR targets `main` |
| Firefox, WebKit, iPhone | **BLOCKED**: download hosts refused by the allowlist (403, retried 27 Nov). `npm run e2e:engines` is ready for CI or a developer machine |
| Stripe sandbox, Microsoft tenant, email | **BLOCKED** here; prepared as `docs/launch/founder-acceptance-e2e.md` |

## 5. Outstanding actions

### 5.1 Before the first sale
1. **Founder:** run founder pack A (Stripe sandbox on the Preview of the final #593 head).
2. **Founder:** pack B on a clean tenant, which needs Copilot capacity on CAI-A6-CLEAN (a Microsoft cost, your decision); then record P-WORKFLOW-CLEAN.
3. **Founder:** pack C (email) and D (production configuration read-out).
4. **Counsel:** L-LEGAL-TEXTS and L-IP (author-to-company IP instrument).
5. **Accountant:** T-TAX-POLICY (tax policy and invoice route).
6. **Founder:** O-DPA-SECURITY (DPAs filed) and O-REVIEW-CONTROL (independent reviewer; then merge #590 → #591 → #592 → #593 in order, each approved, no bypass).

### 5.2 Before Continuous Certification
7. Register the authorized commercial founder (FC) and a contracted, qualified independent reviewer (IR) in `config/certificate-deciders.json`.
8. Set `CRON_SECRET` (and `OPS_ALERT_EMAIL`) in Production; runbook `docs/continuous-certification/reconciliation-runbook.md`.
9. **Counsel:** approve retention periods and the privacy-notice row (`docs/legal/proposed/certification-retention-proposal.md`).
10. Native review of the seven preliminary translations (`docs/continuous-certification/translation-review.md`).
11. Founder pack A9–A12 (subscription, dispute won and lost, reconciliation status).

### 5.3 Dispute policy (founder decision 27 Nov, implemented and tested)
12. A **lost** dispute on a subscription charge ends that certification and cancels future billing.
13. A preliminary **inquiry** takes no automatic action on the licence, the certificate claim or the commission; it is recorded on the order and the operator is notified (`OPS_ALERT_EMAIL`). An inquiry that escalates to a formal chargeback (`charge.dispute.updated`) is handled as a chargeback. **Owner step:** add `charge.dispute.updated` to the webhook endpoint's events in the Stripe dashboard (Preview and, later, live).
    A **formal chargeback** suspends the affected package, as the published refund policy allows; a **won** dispute restores it; a **renewal** dispute never touches the separately paid perpetual licence. Tests: `tests/certification-dispute.test.mjs` X1–X10, X3b, X3c, X5b.
    Note for the Continuous Certification launch: the live webhook event list in `docs/launch/production-activation.md` does not include `invoice.paid` / `invoice.payment_failed`, which renewals need (not a first-sale item).

### 5.4 Optional (commercial value, no new infrastructure)
14. Publish a support response target beside "e-mail support for 24 months"; reconcile the Microsoft cost estimate with a real invoice; consider an email confirmation to demo requesters; key the holder lookup with an HMAC.

## 6. Clean-environment rerun of the final head

Fresh clone of `0f87cf9f`, `npm ci`, `npm run build` (working tree unchanged by the build).

| Suite | Result |
|---|---|
| Node tests | **797/797 PASS** |
| Vitest | **37/37 PASS** |
| ESLint, static QA, global language, localized copy, visible copy, URL locale | **PASS** |
| `npm audit` | 0 vulnerabilities |
| `npm run e2e:site` (11 specs × desktop, mobile, tablet, against `dist/`) | **753/753 PASS** (16.8 min) |
| GitHub CI on the #593 head (`test`, `e2e`) | **PASS** |
