# Continuous Certification v1.0: programme specification

**Status:** release candidate for founder approval and counsel review, revised 26 Nov 2026. Accepted in principle as the strategic direction. Nothing here is published, sold or contractually promised.

**Commercial state is unchanged:**
- All 36 agents and all Continuous Certification subscriptions stay "Coming soon".
- `CHECKOUT_ENABLED`, per-product `saleApproved`, `INTEREST_COLLECTION_ENABLED` and the Gate C release evidence keep their current values.
- Prices in `config/pricing.json` are unchanged.

**Offer:** the planned subscriptions are **L2, L3 and L4**. L5 has a price in the configuration but no package; it is **not offered** and is not shown to customers.

**Supersedes and extends:** `docs/continuous-certification.md`. Its §§1–5 still apply, with the correction in §4.4.

**Companion files (all in this folder):**
- `cai-master-control-library-v1.0.json`: the canonical MCL. 18 domains and 86 controls, with the applicability matrix.
- `applicability-matrix-v1.0.md`: the mapping to laws and standards, generated from the JSON.
- `cc-v1.0-approval-decision-pack.md`: the decisions for both founders.
- `website-positioning-v1.0.md`: customer-facing copy, not published.

`tests/cai-mcl.test.mjs` guards the structure.

---

## 1. The core logic

1. **What is certified.** ColleagueAI certifies **its own packaged releases** against **its own standard**, the CAI Master Control Library. It does not certify customers, their deployments or their legal compliance.
2. **Every certified release** passes the same controls, checked by the same central tests, recorded in the same evidence report, and reviewed by someone who did not build it.
3. **The subscription pays for currency work**: change assessment, publication, and updated certified releases when a covered change requires one. **Paying does not make a release current.** A release is current only while it is the latest certified release of its package and its certificate is not suspended or revoked (§2.1).
4. **What is never subscription-only.** Security fixes, statutory remediation and notices to affected licensees are owed to **every** buyer.
5. **Why the margin works.** Delivery is central:
   - one control library;
   - one regression suite;
   - one AI Token Economy benchmark protocol;
   - one report template.
   
   Work scales with packages and qualifying changes, not with customers. There are no per-customer services.

## 2. Four assurance dimensions

| # | Dimension | Question | Who acts | What ColleagueAI states |
|---|---|---|---|---|
| PC | **Product certification** | Does this release, as shipped, meet the MCL? | ColleagueAI, with an independent reviewer | Certified Release record per version. Required before any sale (Gate C) |
| SC | **Subscription coverage** | Is this certified release still current, and is the currency work being delivered? | ColleagueAI | Change assessments; certified updates; certificate state (§2.1) |
| DA | **Customer deployment assurance** | Does the customer's installation match the certified configuration? | **Customer**, with the Deployment Assurance Kit | Nothing about the customer's installation. It may show the version the customer **reports** in use. An optional review of the customer's completed report is quoted separately |
| OC | **Customer operational compliance** | Does the customer meet its own duties (GDPR as controller, AI Act deployer duties, sector rules)? | **Customer** | Never certified. MCL class `C`, guidance only |

**Rules that follow:**
- A certificate never covers DA or OC.
- ColleagueAI gets **no automatic access** to any customer environment. Access is granted only by the customer, for a stated purpose and time, under a separate written agreement.

### 2.1 Certificate state: four separate axes

| Axis | Values | Changed by |
|---|---|---|
| **Subscription** | `active`, `past_due`, `cancelled`, `lapsed` | payment events only |
| **Release currency** | `current` (the latest certified release of the package), `superseded` (a newer certified release exists), `withdrawn` | a certified update or a package withdrawal |
| **Certificate decision** | `valid`, `suspended`, `revoked`, `discontinued` | the D17 procedure (reviewer and founder) |
| **Deployment (customer-reported)** | `not reported`, `version in use: x.y.z` | the customer, through the Deployment Assurance Kit |

**The public label "Colleague AI Certified — Active" requires all three of:**
1. subscription `active` and within its term;
2. release currency `current`;
3. decision `valid`.

The deployment axis is shown only as the customer's report; ColleagueAI never verifies it.

**Every other combination shows its real state**, for example:
- "Subscription active; certified release superseded by 1.0.4.0, available to you";
- "Suspended: open critical vulnerability, mitigation published";
- "Certified at release, not current".

**Verified engineering gap.** Today, `isCertificationCurrent()` in `lib/db.js` and the label in `api/certificate.js` derive "Active" from the **subscription status alone**. Before any subscription is sold, a separate reviewed PR must add the release-currency and decision axes (readiness item T3 in §8.2).

This is not a live defect: subscriptions are disabled and no certificate has been issued. It is fixed under the freeze rules as an approved change.

## 3. Entitlement classes

| Class | Meaning | Who receives it | Examples (MCL ids) |
|---|---|---|---|
| **M**: mandatory provider obligation | Owed for every certified release and every affected licensee | **All buyers**, subscribed or not | CRA reporting and user notification (D08-03, D08-04); statutory remediation (D06-03); GDPR duties for ColleagueAI's own processing (D09); kill switches (D15-04) |
| **L**: perpetual licence entitlement | Part of the version bought, for the life of the licence | All buyers of that version | documentation and release-time evidence summary (D05-01); corrective and security releases in the 24-month support period (D08-05, D07-05); no runtime dependency on ColleagueAI (D15-03); historic certification record (D17-04) |
| **S**: incremental subscription benefit | Only while subscribed | Active subscribers | change assessments (D06-04); certified updates (D06-05, D14-03); certificate state service (D17-03); quarterly assurance report and AI Token Economy benchmark (D18-05, D18-02) |
| **C**: customer responsibility | Guidance only | — | oversight persons (D02-03), retention (D04-03), DLP (D12-05), backup (D15-06), consumption monitoring (D18-04) |

v1.0 counts: M 56, L 14, S 8, C 8.

## 4. Commitments

### 4.1 Contractual in v1.0
The four existing components, worded by counsel:
1. certification status;
2. covered-scope monitoring, including published change assessments;
3. certified updates;
4. certificate verification.

### 4.2 Priority operational deliverables (prepared for contract)
- **Quarterly assurance report** (D18-05).
- **AI Token Economy and consumption benchmark** (D18-01, D18-02).
- **Model-change re-evaluation within 30 days** (D11-03).

Each is produced from the **first month of the dry run**. All three are priority deliverables, not optional extras.

**They become contractual subscription benefits when all of these hold:**
- the dry run delivers **three consecutive cycles on time** for the first package, run monthly during the 12-week dry run;
- FT time is within budget: ≤ 6 h per package per quarterly cycle, ≤ 30 h per certified update;
- the reviewer has sampled one report without a material finding;
- counsel has worded the benefit.

They are then added prospectively at the next renewal (covered-scope limiter 5.4), never mid-term.

**Draft wording for counsel (not published):**
> "While the Subscription is active, ColleagueAI issues for the Licensed Version a quarterly assurance report and an AI Token Economy benchmark produced under the published protocol. Benchmarks are measured on ColleagueAI's reference environment with a synthetic workload; they describe the certified release, not the Subscriber's environment, and are not a commitment to any consumption level."

### 4.3 Not promised, anywhere
- Independent or third-party accreditation, or certification by a notified or conformity-assessment body.
- Blanket regulatory compliance, or compliance of the customer's use.
- Unlimited implementation, migration, customisation or support.
- Automatic access to, or changes in, customer environments.
- Periodic releases on a schedule.
- A guaranteed return or a fixed consumption level.
- Any reference to a standard or law that is not yet **verified** in the applicability matrix.

### 4.4 Correction to `continuous-certification.md` §1 item 3
Updates "for subscribers" cover changes to the **CAI standard** and ColleagueAI's own listing requirements only.

Where a change in law obliges ColleagueAI **as provider** of a shipped version, the remediation is **M** and goes to every affected licensee (D06-03). Counsel to confirm.

## 5. The 18 assurance domains

**Targets:**
- **P0:** 31 Dec 2026.
- **P1:** the dry run, planned 31 Mar 2027.
- **P2:** subscription readiness. This is milestone-driven, with a planning target of 30 Jun 2027 (§8).
- **P3:** preparation for the December 2027 deadlines, **complete by 30 Sep 2027**.

| # | Domain | Measurable acceptance criteria | Evidence | A / R | Target |
|---|---|---|---|---|---|
| D01 | Governance, accountability, CAI tier classification, **risk** | 100% of releases carry: a tier with rationale, an impact and risk assessment (risk method per ISO 31000 and ISO/IEC 23894, indicative), and an Art. 5 / Annex III screening. Counsel note on every "possibly high-risk" result | MCL history; dossier; screening | FT / SGB, EC | P0 (risk assessment P1) |
| D02 | Human oversight | 100% of stop points have a passing case; pause and override tested | regression; test record | FT / SGA | P0–P1 |
| D03 | Transparency | Disclosure and unverified-label cases pass. **Art. 50(2) applicability assessment, counsel-confirmed, before the package is first placed on the market**; marking ships in the first release where it applies | regression; assessment | FC / EC, SGA | P0 |
| D04 | Audit trail | Every schema field written; no ColleagueAI access path | schema; regression; P-ISOLATION | FT / SGA | P0 |
| D05 | Documentation, SoA | 100% of controls marked applicable or not, with evidence | SoA; SHA256SUMS | FT / SGB | P0 |
| D06 | Regulatory monitoring, change assessment, **compliance** | Weekly log, no gap over 10 business days; triage within 10 business days; publication within 30 days; update within 60 days | log; triage; assessments | FT / INT | P1 (publication P2) |
| D07 | Security engineering | 0 unexcepted high/critical findings; 100% of critical OWASP-organised adversarial cases pass | CI; scan; security set | FT / SGA | P0–P1 |
| D08 | AI incident and vulnerability management | Acknowledgement ≤ 2 business days. **CRA, for an actively exploited vulnerability or a severe incident:** early warning ≤ 24 h, notification ≤ 72 h, final report ≤ 14 days after a fix or mitigation (vulnerability) or ≤ 1 month after notification (incident), intermediate reports on request, users informed without undue delay. Every closed incident adds a regression case | register; SRP references; notification log | FC, FT / INT | **P0**: in force since 11 Sep 2026; SRP account before the first sale |
| D09 | **Privacy, GDPR and data protection by design** | Personal-data inventory per package; no provider access to customer data; DPIA input pack; ColleagueAI's own processing covered by the privacy notice, DPAs and the Gate B pack | dossier; DPIA input; privacy pack | FT, FC / SGB | P0–P1 |
| D10 | Data governance, lineage, quality, knowledge integrity | 100% lineage cases pass; per-field accuracy ≥ threshold, ≤ 2 points drop | golden-set report | FT / SGA | P1 |
| D11 | AI model lifecycle and **Microsoft platform compatibility** | Dependency record per release; weekly Copilot Studio and Power Platform change log; re-run within 30 days of a relevant change; safety defects fixed for all licensees | dependency record; re-runs | FT / INT, SGA | P1–P2 |
| D12 | Third-party, connector, supply chain | SBOM per release by P3 (ahead of CRA Annex I); 100% of connectors risk-classed; supplier register with DPA status | SBOM; connector table; register | FT, FC / SGB | P0–P3 |
| D13 | Testing and regression | 17/17 mandatory gates; central suite per release and affected change; 0 failed critical cases | gates; suite report | FT / SGA | P0–P1 |
| D14 | Release integrity and distribution | Hash equality; the customer installs updates itself; release notes give the reason class | release record | FT / SGB | P0 |
| D15 | Resilience, rollback, decommissioning | Rollback tested with data preserved; clean uninstall; kill switches fail closed | test records; CI | FT / SGA | P0–P1 |
| D16 | Responsible AI, fairness, accessibility, human rights | Purpose and prohibited uses; fairness screening 100%; key WCAG 2.1 AA criteria checked (a target, not a claim); FRIA and literacy inputs | dossier; checklists | FT / SGB | P1–P2 |
| D17 | Independent review, conflicts, suspension, revocation, **certificate state** | 100% of certified releases reviewed by a qualified reviewer without a build role; yearly conflict declarations; the four-axis state in §2.1; appeals ≤ 30 days; annual programme review | review records; state tests | FC / IR | **P1**, a prerequisite for any listing |
| D18 | Business value, performance, **AI Token Economy** benchmarking | Baseline per release: Copilot Studio consumption per business transaction, p50/p95 latency, success rate. Flag over +15% consumption or −2 points success. Quarterly report from the dry run | benchmark; assurance report | FT / SGA, INT | P1 (dry run), contractual after §4.2 criteria |

Control detail is in the MCL JSON:
- 60 controls are central and 26 per package;
- 36 already exist in the repository or the 1.0.3.6 evidence.

### 5.1 Core themes and where they sit

| Theme | Domains | Customer-facing statement (verified references only) |
|---|---|---|
| **GDPR, privacy, data protection** | D09, D10, D04, D12 | Data stays in the customer's tenant; no provider access; DPIA input pack; ColleagueAI's own processing under its privacy notice |
| **Risk** | D01, D16, D07 | A risk and impact assessment per release; Annex III and prohibited-practice screening |
| **Compliance** | D06, D03, D08 + OC class | Changes assessed in the open; CRA and AI Act provider duties for all licensees; customer duties listed, never certified |
| **Microsoft compatibility** | D11, D13, covered scope I-4 | Weekly Copilot Studio and Power Platform change watch; re-test after relevant changes; certified update on breaking changes |
| **AI Token Economy** | D18 | Benchmark of consumption per transaction for each certified release, compared release to release. This is a Continuous Certification deliverable, separate from the planned CAI Token Economy Monitor product |

### 5.2 Regulatory and standards applicability

The full matrix is in `applicability-matrix-v1.0.md`. It covers:
- **laws:** EU AI Act, GDPR, CRA;
- **ISO and IEC:** ISO/IEC 42001, 27001, 27002, 27701 and 23894, and ISO 31000;
- **voluntary frameworks:** NIST AI RMF with the Generative AI Profile, and the OWASP Top 10 for LLM Applications 2025 with OWASP Agentic AI guidance.

**Today: 0 verified, 82 indicative, 11 future mappings.**
- The free official texts are verified in P0–P1.
- ISO texts stay internal and indicative unless a licensed copy is bought (optional, item E3).
- No standard is cited publicly until its mapping is verified.

## 6. Operating model

### 6.1 Roles and limits

| Role | Holds | Limit |
|---|---|---|
| Founder, technical (FT) | Programme owner; engineering controls; certified updates | No certification decision on a release he built |
| Founder, commercial (FC) | Approver; customers and authorities; CRA submissions; suspension and revocation with the reviewer | — |
| Student group A (SGA) | Regression suite, golden sets, benchmark harness and runs | Synthetic data and CAI-TEST only; FT reviews every output; **reused only after signed contribution licences** (`docs/legal/restricted-works.md`) |
| Student group B (SGB) | Mappings and their verification for free texts; SoA, dossier and report templates; checklists | Same as SGA |
| Intern (INT) | Monitoring log, triage drafts, registers, report assembly | Drafts only; IP terms in the internship agreement |
| Independent reviewer (IR) | Release evidence review; 20% mapping sample; annual programme review; D17 decisions with FC | Qualification file; yearly conflict declaration; never described as accreditation |
| External counsel (EC) | Contract wording; AI Act, CRA and GDPR applicability questions | Fixed scope per engagement, bundled with the existing legal workstream (§7.2) |

If a student cohort is unavailable, the dry run covers Contract Intelligence & Register only.

### 6.2 Cadence

| Rhythm | Activity | Output |
|---|---|---|
| Weekly | Regulatory, standards and Microsoft change scan (INT 3 h, FT 1 h) | log |
| ≤ 10 business days | Triage: statutory / CAI standard / no effect | triage record |
| ≤ 30 days | Change assessment published | assessment |
| Per release or update | Gates, suite, benchmark, SoA, evidence, IR review, then listing; currency axis updated | Certified Release record |
| Quarterly (from the dry run) | Assurance report and AI Token Economy benchmark per package | report |
| Annually | IR programme review; declarations; supplier register; MCL revision | review summary |
| Event | D08 incident handling and CRA reporting; D17 decisions | register; decisions |

### 6.3 Systems: existing only
- **Records:** the repository (MCL, release records, gates).
- **Evidence:** the private Release evidence library.
- **Security register:** `docs/security/cra-operational-setup.md` §3.
- **Testing:** CAI-TEST and the clean environment.
- **Certificates:** `/api/certificate`.
- **Reporting:** the ENISA SRP account.

No new hosting, database, paid tool or second register.

## 7. Cost, capacity and price

### 7.1 Model (planning assumptions, to be replaced by quotes and dry-run actuals)

| Assumption | Value |
|---|---|
| Reviewer | €130/h |
| Counsel | €200/h |
| Intern | €12/h |
| Students | no cash |
| Founders (loaded view only) | €60/h |
| CAI-TEST capacity | €720/yr |
| FX and fees | $1 = €0.86; 3% fees |

Planned annual prices, net per subscriber:

| Tier | Annual price | Net per subscriber |
|---|---|---|
| L2 | $990 | €826 |
| L3 | $1,490 | €1,243 |
| L4 | $2,490 | €2,077 |

| Scenario (packages × qualifying updates/yr) | Cash cost/yr | Break-even at L4 annual (cash / loaded) | FT load (of 368 h) |
|---|---|---|---|
| 1 × 1 | €7,600 | 4 / 10 | 45% |
| 1 × 2 (dense 2027) | €8,400 | 5 / 11 | 52% |
| 3 × 2 | €12,000 | 6 / 16 | 81% |
| 5 × 2 | €15,500 | 8 / 22 | **110%** |

**At L2 the same cost needs about 2.5 times as many subscribers.** The certified-update cost is per package, not per price tier, so the subscriber mix decides profitability.

### 7.2 Spend categories

| Category | Items | Overlap with existing workstreams | Incremental estimate | Before approval |
|---|---|---|---|---|
| **A. Mandatory legal** (needed to sell lawfully, with or without this programme) | Licence and Terms covering Continuous Certification; §4.4 correction; Art. 50(2) and Annex III applicability; CRA manufacturer status and SRP path; GDPR roles | **High.** Legal texts B2, privacy pack (Gate B), CRA C-questions, the twelve questions in `continuous-certification.md` §8. **Bundle into one counsel engagement** | about 8–12 h on top of the existing legal brief (€1,600–2,400) | written quote from counsel for the bundled brief |
| **B. Independent reviewer** | Onboarding; per-release review (about 6 h); 20% mapping sample; annual review | Partial: O-REVIEW-CONTROL needs a reviewer for code. It may be the same person only if they had no build role | onboarding about €1,000; about €780 per certified update; about €2,100 per year | two written quotes, with CVs and conflict declarations |
| **C. Optional enhancements** (not needed for v1.0) | ISO/IEC standard copies (needed only to verify ISO mappings for public use); accessibility audit by a specialist; Resend delivery webhook | ISO copies are none; the Copilot test capacity overlaps with B7 (P-WORKFLOW-CLEAN) and is counted once | ISO copies about €150–250 each; others by quote | quote; founder yes per item |

**Nothing is spent before a written quote and the founder's yes.** The earlier €6,200 one-off figure is replaced by A + B. C is optional.

### 7.3 Capacity limit (temporary)
Continuous Certification covers **up to three packages** as a **temporary operating constraint**, not a product rule.

**Review:**
- at the end of the dry run;
- each quarter after launch;
- whenever a fourth package is requested.

**Raise the limit when all of these hold:**
- measured FT hours per certified update ≤ 24 h;
- FT load ≤ 70% at the new count;
- the subscriber count covers the cash cost of the added package;
- reviewer capacity is confirmed.

**Lower it** if FT load exceeds 90% for a quarter.

### 7.4 Price
No price change is proposed; prices change only with the founder's explicit authorisation.

**Trigger for a price review:** dry-run actuals over 30 FT hours per update, or a subscriber mix that leaves fewer than 6 L4 annual subscribers or the equivalent per covered package.

## 8. Roadmap: milestone-driven

### 8.1 Phases

| Phase | Planning target | Deliverables | Exit (all must hold) |
|---|---|---|---|
| **P0: baseline** | 31 Dec 2026 | MCL v1.0 approved; SoA for CI 1.0.3.6; Art. 50(2) and Annex III applicability assessments for the actual packages (counsel); D08 procedure and SRP account; free-text mappings verified (AI Act, GDPR, CRA); supplier register | SoA without "applicable, no evidence" rows except existing Gate C blockers; no new Gate C blocker |
| **P1: dry run** | 31 Mar 2027 | Reviewer contracted; student contribution licences; regression suite v1; AI Token Economy benchmark v1 baseline; 12 weeks of monitoring, triage and assessments; **monthly simulated assurance reports and benchmarks**; counsel wording; Deployment Assurance Kit v1; NIST and OWASP mappings verified | Hours measured per role and per update; §4.2 criteria evaluated; reviewer review of the CI evidence pack passed |
| **P2: subscription readiness** | **Planning target 30 Jun 2027; earlier if §8.2 is met** | Certificate four-axis state (T3); subscription GO decision | All §8.2 items met |
| **P3: December 2027 preparation** | **Complete by 30 Sep 2027** | MCL v1.1 controls for CRA Art. 13 and Annex I (from 11 Dec 2027) and, where a package screened Annex III, AI Act high-risk duties (from 2 Dec 2027); SBOM per release; first annual review; second package through the same MCL | Implemented and evidenced at least two months before each deadline; any gap escalated to the founders by 30 Sep 2027 |

### 8.2 Subscription launch readiness (any date, once all are met)

| Area | Requirement |
|---|---|
| Operational | Dry run passed (P1 exit); weekly monitoring with no gap for 12 weeks; reviewer contracted; CRA SRP account registered |
| Technical | T1: Gate C passed for every covered release. T2: subscription checkout and webhooks tested on Preview. T3: certificate four-axis state implemented and tested (§2.1). T4: production acceptance re-run T5: **certificate evidence-log recovery and reconciliation** (see below) |
| Legal | Counsel-approved Licence and Terms covering Continuous Certification, the §4.4 correction, suspension and revocation (D17), and cancellation and refund. Applicability assessments done. The privacy notice covers subscription data |
| Accounting | Tax policy approved for recurring B2B billing (identified-person status); invoice route live |
| Commercial | Founder's written subscription GO, separate from any agent GO, naming the tiers (L2–L4) and the covered packages within the §7.3 limit; reviewed PR with an independent approval; no administrative bypass |

**T5: certificate evidence-log recovery and reconciliation (residual from #588, required before the subscription GO).**

Since #588, issuance, decisions and release adoptions are written to the record by compare-and-set. They are then appended to the permanent log `certification-evidence:<id>`. If that append fails twice, the record change has already been made and the caller receives an error, so a log entry can be missing.

Before any subscription is sold, all of the following must exist and be tested on Preview:
- **(a) Reconciliation.** A read-only procedure compares, for every certificate:
  - the frozen `issuance` with the log's `issued` entry;
  - the current `decision` and adoptions in the bounded history with the log's `decision` and `release-adopted` entries.
  
  It reports gaps as certificate ids and counts only.
- **(b) Recovery.** A documented operator step re-appends a missing entry from the record. Each re-appended entry is marked `recovered: true`, with who recovered it and when. This must happen while the source event is still inside the 200-event history window, so reconciliation runs at least weekly once certificates exist.
- **(c) Detection.** An evidence-append failure is logged with the certificate id (no personal data). The weekly operations check reviews these failures.
- **(d) Backup.** The evidence keys are included in the KV backup and restore check. A restore test is recorded.

Until T5 is complete, the subscription GO cannot be recorded. This is a readiness requirement, not new functionality; under the freeze it is implemented as an approved operational change.

## 9. Decisions

The full approval form for both founders is in `cc-v1.0-approval-decision-pack.md`.
