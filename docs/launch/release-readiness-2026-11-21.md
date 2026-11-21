# Release readiness — CAI-L4-CI-001 Contract Intelligence & Register 1.0.3.6 (21 Nov 2026)

*One summary for the founder's GO/NO-GO. Every line names its evidence. A technical PASS does not open sales:
`saleApproved` stays false, the tax policy stays unapproved, production checkout stays off until the founder decides.*

Reproduce the automated part: `node scripts/release/certify-release.mjs --bundle <downloaded bundle> --audit`
(manual gates: `config/release-gates.json`).

## 1. Release candidate

| | Bundle revision 1 (delivered) | Bundle revision 2 (candidate, PR #552) |
|---|---|---|
| File | `CAI-L4-CI-001_1.0.3.6.zip` | `CAI-L4-CI-001_1.0.3.6-r2.zip` |
| Bytes / SHA-256 | 368,718 / `69b3067694fdb27952f66addae17b45836dddfd3965bae6f5e6fe2bdd25dbd50` | 370,005 / `66639e7ffe1c41d9f403081f07655ff6587007726c8e965a9640601ae0fd9ac8` |
| Managed solution | `cca6f657831a09d35e680a6cdc5be4eba329072ae918d76c1c2c8fa9dedad0f8` (122,951 B) | same file |
| LICENSE.txt | says "release 1.0.3.2" (**defect**) | "release 1.0.3.6, bundle revision 2" |
| Certifier, automated gates | 17 PASS, **1 FAIL (PKG-LICENSE)** | **18/18 PASS** (incl. npm audit 0 advisories) |
| Where | private Blob, `config/products.json` today | built, reproducible; in the founder's Downloads; **not yet in Blob** |

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
| 1 | Revision 2 not yet in private Blob; #552 must not merge before | High (download would 404 after merge) | Founder | Upload `CAI-L4-CI-001_1.0.3.6-r2.zip` to `agents/contract-intelligence-and-register/` (store cai-release-packages), then review/merge #552 | Yes |
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
