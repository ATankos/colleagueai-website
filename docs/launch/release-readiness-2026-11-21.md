# Release readiness — CAI-L4-CI-001 Contract Intelligence & Register 1.0.3.6 (21 Nov 2026)

*One summary for the founder's GO/NO-GO. Every line names its evidence. A technical PASS does not open sales:
`saleApproved` stays false, the tax policy stays unapproved, production checkout stays off until the founder decides.*

Reproduce the automated part: `node scripts/release/certify-release.mjs --bundle <downloaded bundle> --audit`
(manual gates: `config/release-gates.json`).

## 1. Release candidate

| | Bundle revision 1 (delivered, superseded) | Bundle revision 2 (current release bundle) |
|---|---|---|
| File | `CAI-L4-CI-001_1.0.3.6.zip` | `CAI-L4-CI-001_1.0.3.6-r2.zip` |
| Bytes / SHA-256 | 368,718 / `69b3067694fdb27952f66addae17b45836dddfd3965bae6f5e6fe2bdd25dbd50` | 370,005 / `66639e7ffe1c41d9f403081f07655ff6587007726c8e965a9640601ae0fd9ac8` |
| Managed solution | `cca6f657831a09d35e680a6cdc5be4eba329072ae918d76c1c2c8fa9dedad0f8` (122,951 B) | same file |
| LICENSE.txt | says "release 1.0.3.2" (**defect**) | "release 1.0.3.6, bundle revision 2" |
| Certifier, automated gates | 17 PASS, **1 FAIL (PKG-LICENSE)** | **18/18 PASS** (incl. npm audit 0 advisories) |
| Where | private Blob, kept unchanged (re-hashed 21 Nov 20:38 CET) | private Blob, published by `config/products.json` on main (#552); buyer download verified by hash 21 Nov 20:38 CET |

Revision 2 changes documents only (LICENSE release number; INSTALL §9 capacity symptom and first-upload miss from the
20 Nov clean install, i.e. PR #533; revision labels and file names; a readiness-script usage example). Revision 1 is
kept unchanged in Blob and under `previousBundles`; historical order evidence is untouched.

## 2. Automated certification (revision 2, branch of PR #552)

| Gate | Result | Evidence |
|---|---|---|
| PKG-SHA, PKG-STRUCTURE, PKG-SUMS, PKG-MANIFEST, PKG-LICENSE, PKG-RECORD, PKG-SOLUTION (C1–C9) | PASS | certifier output; 10/10 inner checksums; 9/9 package checks |
| C-CHECKOUT, C-WEBHOOK (55), C-ENTITLEMENT (63), C-ORDER (52), C-DOCUMENTS (18), C-RECOVERY (25), C-RELEASE | PASS | `node --test` suites, Stripe/storage mocked |
| S-EXPOSURE, S-ABUSE (rate limits, KV namespace isolation), S-DEPS (npm audit: 0) | PASS | same run |
| L-EVIDENCE (legal archive, claims truth, tax-policy guards, VAT turnover) | PASS | same run |
| CI on PR #552 | PASS | test, e2e, Lighthouse, CodeQL, Vercel |

Found and fixed while certifying: `tests/order-documents.test.mjs` hard-coded the revision-1 hash and was **not in CI
at all**; it now follows `config/products.json` and runs as its own CI step (PR #552).

## 3. Live end-to-end on real services (Preview, Stripe TEST, 21 Nov 2026)

Order `ord_20261121_2087d88bdb2b`, payment `pi_3UeIVsDaZedkqPlZ2x5fu8bq` (USD 14,900, sandbox `acct_1U4nZbDaZedkqPlZ`),
deployment `2502168a`: **12/12 PASS**. Since the first report the KV gap is closed by direct inspection (Vercel →
Storage → upstash-kv-yellow-cushion → Browser, read only):

- `preview:order:ord_20261121_2087d88bdb2b`: status `fulfilled`, mode `test`, events created → payment.confirmed →
  licence.granted → buyer.notified (each once), tax `cz_business` sandbox, documents with the hashes of the stored PDFs
  (agreement `2514e7f5…`, invoice `16f5d55a…`), notification sent.
- `preview:entitlement:hello@colleagueai.ai`: one record; sessions `cs_test_a0nfuE…` (20 Nov) and `cs_test_a09yJA…`
  (21 Nov) each listed once, each pinned to release 1.0.3.6. The duplicate-event resend changed nothing.

## 4. Product installation (Microsoft tenant)

| Gate | Result | Evidence |
|---|---|---|
| Clean install of the delivered managed solution | PASS (20 Nov) | CAI-A6-CLEAN, tenant-log-1036.md |
| Upgrade 1.0.3.5 → 1.0.3.6 keeps data and flows | PASS (19 Nov) | CAI-TEST: 42 contracts, 602 evidence, 49 reviews, 9 job runs |
| Workflow upload → extraction → review → approval → evidence → agent → recompute | PASS (19 Nov, CAI-TEST) | SYN-N09/N10, truth.json match |
| Same workflow on the clean environment | **BLOCKED** | no Copilot Studio capacity on CAI-A6-CLEAN |
| Isolation / least privilege / unauthorized requests | PASS (9–10 Nov; role C5 21 Nov) | INSTALL §10 |

Not repeated today: revision 2 ships the identical managed solution, so the tenant results stand for it.

## 5. Remaining launch blockers

| # | Blocker | Severity | Owner | Action | Founder approval |
|---|---|---|---|---|---|
| 1 | ~~Revision 2 not in private Blob~~ **resolved 21 Nov 20:3x CET**: uploaded by the founder; between the #552 merge and the upload a delivering deployment refused the package with 503 package_missing (fail-safe, alert logged); buyer download now verified by hash | — | — | — | — |
| 2 | Tax policy unapproved; invoice route is the sandbox ledger | Critical for a paid sale | Accountant → founder | T1/T3/T7/T8/T13 confirmations, registration evidence, Microsoft G195024562 decision | Yes |
| 3 | Legal texts (Licence/Terms/Refund/Privacy new versions; #532) unpublished | Critical for a paid sale | Founder, counsel | D1, D1a, D2–D5; counsel review; versioned publication | Yes |
| 4 | IP instrument unsigned | Critical for a paid sale | Both founders | sign; general-meeting resolution | Yes |
| 5 | DPAs, security@ / security.txt / disclosure page | High | Founder | file DPAs; create mailbox; publish page | Yes |
| 6 | Production configuration and GO switch | High | Founder | production variables; GO PR (`saleApproved`, tax policy approved) | Yes |
| 7 | Clean-environment workflow blocked by Copilot capacity | Medium | Founder (Microsoft billing) | billing plan on CAI-A6-CLEAN, then one SYN contract through the full workflow | No (technical) |
| 8 | Declined card / 3-D Secure not exercised on the Preview | Medium | Founder (card entry) | two test cards on the Preview | No |
| 9 | Refund on the Preview not exercised end to end | Medium | Founder | authorise a sandbox refund of ord_20261121_2087d88bdb2b | Yes |
| 10 | `CAI-L4-CI-001_1.0.3.2.zip` listed in products.json but absent from Blob | Low (no 1.0.3.2 customers; pages offer 1.0.3.6) | Founder | upload the recorded file (48981310…) or decide to drop the record | Yes |
| 11 | Second reviewer for the required-review rule | Medium (governance) | Founder | add a reviewer account or document the bypass-with-log decision | Yes |

## 6. Recommendation

**CONDITIONAL GO — NAMED BLOCKERS.** The product package (revision 2) and the purchase-to-delivery infrastructure pass
every automated gate and the live Stripe TEST journey with direct database evidence; installation and upgrade are
evidenced in Microsoft tenants. Commercial activation stays closed until blockers 1–6 are resolved and the founder
gives explicit GO; 7–11 should be closed before or immediately after the first sale.

## 7. Update 21 Nov 2026, 20:40 CET (after #552, #553, #554 merged; revision 2 uploaded)

- Main `8035a157`: CI green, including the order-documents step that the #552/#553 conflict resolution had dropped (restored by #554).
- Certifier on main against the bundle as the buyer downloaded it: **18/18 automated gates PASS**; manual gates: 1 FAIL
  (C-1032-FILE, low), 2 BLOCKED, 7 REQUIRES FOUNDER APPROVAL (`config/release-gates.json`).
- Production: runs main, checkout answers `checkout_disabled`; `saleApproved` false; tax policy unapproved.
- Recommendation unchanged: **CONDITIONAL GO — NAMED BLOCKERS** (blockers 2–6 above; 7–11 before or right after the first sale).

## 8. Update 26 Nov 2026: consolidated commercial blockers for 1.0.3.6 (single list)

This section consolidates every open item that keeps 1.0.3.6 from a paid sale. It supersedes the open rows of section 5; resolved rows stay there as history.

**State at production commit `0355c524` (#580):**
- All 36 agents show "Coming soon".
- Checkout answers `checkout_disabled`.
- Interest collection is off (Gate B).
- No `sale.goDecision` is recorded.
- The run-time gate (`releaseEvidenceErrors`) refuses 1.0.3.6 for exactly these four reasons:
  - 4 open release blockers;
  - certification `internal-review`;
  - 9 gates not PASS;
  - IP instrument not executed.
- The release record matches the bundle (revision 3) and the launch scope.

| # | Blocker | Gate / record | Owner | Founder approval |
|---|---|---|---|---|
| B1 | Tax policy unapproved; invoice route still the sandbox ledger | T-TAX-POLICY; `config/tax-policy.json` | Accountant → founder | Yes |
| B2 | Legal texts (Licence, Terms, Refund, Privacy) new versions unpublished; Privacy now also carries rows (a2) and (a3) | L-LEGAL-TEXTS | Founder, counsel | Yes |
| B3 | IP instrument unsigned; `ip.status` not executed | L-IP; `config/agents/…json` ip | Both founders | Yes |
| B4 | DPAs (Vercel, Upstash, Resend, Stripe); security@, security.txt, disclosure page | O-DPA-SECURITY | Founder | Yes |
| B5 | Production configuration (live keys, Blob, Resend, recovery, card-only) | O-PROD-CONFIG | Founder | Yes |
| B6 | Second reviewer for the required-review rule. #577, #578 and #580 were merged with **0 approving reviews** (owner bypass) | O-REVIEW-CONTROL | Founder | Yes |
| B7 | Clean-environment workflow blocked by Copilot capacity | P-WORKFLOW-CLEAN | Founder (Microsoft billing) | No (technical); costs money, needs founder yes |
| B8 | Declined card / 3-D Secure not exercised on the Preview | C-DECLINE-3DS | Founder | No |
| B9 | Sandbox refund on the Preview not exercised end to end | C-REFUND-PREVIEW | Founder | Yes |
| B10 | Certification still `internal-review` in `config/availability.json` (set to `internally-certified` only when B1–B9 are closed and the certifier passes on the final bundle) | availability record | Engineering → founder | Yes |
| B11 | `releaseBlockers` in `config/availability.json` list four open items (approvals, tax policy, clean-tenant test, founder GO); emptied only as each closes | availability record | Engineering | — |
| B12 | `CAI-L4-CI-001_1.0.3.2.zip` listed but absent from Blob | C-1032-FILE (not in the mandatory set) | Founder | Yes |
| B13 | Founder commercial GO not recorded | `sale.goDecision` {approvedBy, date, reference, release: "1.0.3.6"}; `saleApproved: true`; `release.status: released`; lifecycle `commercially-approved`; publicStatus `available` | Founder | Yes |

**Recommendation: CONDITIONAL GO, NAMED BLOCKERS.**
- B1–B6 and B13 are required for the first paid sale.
- B7–B12 must be closed before the GO is recorded, because the run-time gate refuses while any of them is open.
