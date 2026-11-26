# Continuous Certification v1.0: programme specification

**Status:** draft for founder approval and counsel review, 26 Nov 2026. Nothing here is published, sold or contractually promised.

**Commercial state is unchanged:**
- All 36 agents and the Continuous Certification subscriptions stay "Coming soon".
- `CHECKOUT_ENABLED`, per-product `saleApproved`, `INTEREST_COLLECTION_ENABLED` and the Gate C release evidence keep their current values.
- Prices in `config/pricing.json` are unchanged.

**Supersedes and extends:** `docs/continuous-certification.md`. The four subscription components and the covered-scope limiters in its §§1–5 still apply, with one correction in §4.3 below.

**Canonical control library:** `docs/continuous-certification/cai-master-control-library-v1.0.json`
- 18 domains, 86 controls, one list for every package and all four dimensions.
- `tests/cai-mcl.test.mjs` checks its structure.

---

## 1. The core logic

1. **What is certified.** ColleagueAI certifies **its own packaged releases** against **its own standard**: the CAI Master Control Library. It does not certify customers, their deployments or their legal compliance.
2. **Every certified release** passes the same controls, checked by the same central tests, recorded in the same evidence report, and reviewed by someone who did not build it.
3. **The subscription keeps a release *current*:** changes are assessed, the outcome is published, and an updated certified release is made available when a change in the covered scope requires one.
4. **What is never subscription-only.** Security fixes, statutory remediation and notices to affected licensees are owed to **every** buyer, subscribed or not.
5. **Why the margin works.** Delivery is central:
   - one control library;
   - one regression suite;
   - one benchmark protocol;
   - one report template.
   
   Work scales with the number of packages and qualifying changes, not with the number of customers. The subscription contains no per-customer services.

## 2. Four assurance dimensions

They are kept separate on purpose. A certificate speaks only to the first two.

| # | Dimension | Question it answers | Who acts | What ColleagueAI states |
|---|---|---|---|---|
| PC | **Product certification** | Does this release, as shipped, meet the MCL? | ColleagueAI, with an independent reviewer | "Certified Release" record per version. Required before any sale (Gate C) |
| SC | **Active subscription coverage** | Is this certified release still current? | ColleagueAI | Certificate status `active` while subscribed; published change assessments; certified updates |
| DA | **Customer deployment assurance** | Does the customer's installation match the certified configuration? | **Customer**, with ColleagueAI's Deployment Assurance Kit | Nothing about the customer's installation. The kit is a checklist and report template the customer completes. An optional review of the customer's completed report is a separately quoted service, outside the subscription |
| OC | **Customer operational compliance** | Does the customer meet its own legal and operational duties? | **Customer** | Never certified. The MCL marks these controls `C`, with guidance only |

**Rules that follow:**
- A certificate never covers DA or OC.
- The website and certificate page state this in plain words (see the positioning document).
- ColleagueAI gets **no automatic access** to any customer environment. Any access is granted by the customer, for a stated purpose and time, under a separate written agreement.

## 3. Three kinds of entitlement (plus customer duties)

Every control in the MCL carries one class:

| Class | Meaning | Who receives it | Examples (MCL ids) |
|---|---|---|---|
| **M**: mandatory provider obligation | ColleagueAI must do it for every certified release and every affected licensee | **All buyers**, subscribed or not | vulnerability intake and CRA reporting (D08-01..03); notice to all affected licensees (D08-04); statutory remediation (D06-03); suspension and revocation rules (D17-05); kill switches (D15-04) |
| **L**: perpetual licence entitlement | Part of the version bought, for the life of the licence | All buyers of that version | documentation set (D05-01); corrective and security releases in the support period (D08-05, D07-05); version-pinned downloads (D14-02); no runtime dependency on ColleagueAI (D15-03); historic certification record (D17-04) |
| **S**: incremental subscription benefit | Only while Continuous Certification is active | Active subscribers | published change assessments (D06-04); certified updates for covered-scope changes (D06-05, D14-03); certificate status `active` (D17-03); quarterly evidence and consumption reports (D18-02, D18-05) |
| **C**: customer responsibility | The customer's own duty; ColleagueAI gives guidance only | — | oversight persons (D02-03); retention (D04-03); DLP policies (D12-05); backups (D15-06) |

Counts in v1.0: M 56, L 14, S 8, C 8.

The subscription is deliberately thin. It buys **currency**, not safety. Safety is in M and L and goes to everyone.

## 4. Commitments: contractual, operational and excluded

### 4.1 Contractual in v1.0
These are the four existing components, reworded only by counsel:
1. Active certification status.
2. Monitoring of the covered scope.
3. Certified updates when a covered-scope change requires one.
4. Certificate verification.

Change-assessment publication (D06-04) is part of component 2, under existing covered-scope limiter 5.3.

### 4.2 Operational targets (not contractual in v1.0)
- Quarterly standardised evidence report (D18-05).
- Consumption benchmark comparison (D18-02).
- Model-change re-evaluation within 30 days (D11-03).

These become contractual only after the Phase 1 dry run shows the hours are affordable (section 8), and only through counsel's wording at a renewal (covered-scope limiter 5.4: prospective only).

### 4.3 Correction to `continuous-certification.md` §1 item 3
"Regulatory-driven updates go to subscribers" holds only for changes to **the CAI standard** or to **ColleagueAI's own listing requirements**.

Where a change in law creates an obligation on ColleagueAI **as provider** of a shipped version, the remediation is **M** and goes to every affected licensee (D06-03). Counsel to confirm the wording.

### 4.4 Not promised, anywhere
- Independent or third-party accreditation, or certification by a notified or conformity-assessment body.
- Blanket regulatory compliance, or compliance of the customer's use.
- Unlimited implementation, migration, customisation or support services.
- Automatic access to, or changes in, customer environments.
- Periodic releases on a schedule.
- A guaranteed return or a fixed consumption level.

The vocabulary contract in `continuous-certification.md` §3 and `tests/journey.test.mjs` keep enforcing this on the site.

## 5. The 18 assurance domains

- **Owner:** **A** = accountable, **R** = responsible.
- **Targets:**
  - P0 = 31 Dec 2026, product certification of 1.0.3.6 against the MCL;
  - P1 = 31 Mar 2027, operational readiness and dry run;
  - P2 = 30 Jun 2027, subscription service, if approved;
  - P3 = 31 Dec 2027, the 2027 regulatory window.

| # | Domain (new in bold) | Measurable acceptance criteria | Evidence | A / R | Target |
|---|---|---|---|---|---|
| D01 | Governance, accountability, CAI tier classification | MCL versioned; 100% of releases carry a tier and rationale, an impact assessment, and an Art. 5 / Annex III screening; every "possibly high-risk" result has a counsel note before sale | MCL history; dossier; screening record | FT / SGB, EC | P0 (impact assessment P1) |
| D02 | Human oversight | 100% of listed stop points have a passing regression case; pause and override tested each release | regression report; test record | FT / SGA | P0–P1 |
| D03 | Transparency | AI disclosure and unverified-label cases pass; **Art. 50(2) applicability decision recorded by 2 Dec 2026** | regression report; decision record | FC / EC, SGA | P0 |
| D04 | Audit trail | Every schema field written in regression; isolation proves no ColleagueAI access path | schema; regression; P-ISOLATION | FT / SGA | P0 |
| D05 | Documentation and statement of applicability | 100% of MCL controls marked applicable or not, with evidence; documentation set listed in SHA256SUMS | SoA; SHA256SUMS | FT / SGB | P0 |
| D06 | Regulatory monitoring and change assessment | Weekly log, no gap over 10 business days; triage within 10 business days; assessment published within 30 days; update available within 60 days of the trigger | monitoring log; triage; published assessments | FT / INT | P1 (publication P2) |
| D07 | Security engineering | 0 unexcepted high/critical findings at release; 100% of critical adversarial cases pass; 24-month security support stated | CI; scan; security-set report | FT / SGA | P0–P1 |
| **D08** | **AI incident and vulnerability management** | Acknowledged within 2 business days; CRA early warning within 24 h and notification within 72 h; all affected licensees notified; every closed incident adds a regression case | register; SRP record; notification log | FT, FC / INT | **P0** (CRA reporting in force since 11 Sep 2026) |
| D09 | Privacy by design | Data inventory per package; no provider data access; DPIA input pack; synthetic data only | dossier; DPIA input; fixture register | FT / SGB | P0–P1 |
| **D10** | **Data governance, lineage, quality, knowledge integrity** | 100% of extracted values traceable in lineage cases; per-field accuracy ≥ release threshold, with no drop over 2 points against the previous certified release; superseded and unverified handling passes | golden-set report; regression | FT / SGA | P1 |
| **D11** | **AI model lifecycle** | Dependency record per release; weekly Microsoft change log; re-run within 30 days of a relevant model change (S); safety defects fixed as corrective releases for all (M) | dependency record; re-run reports | FT / INT, SGA | P1–P2 |
| **D12** | **Third-party, connector and supply-chain risk** | Machine-readable SBOM per release (by P2, ahead of CRA Annex I from 11 Dec 2027); 100% of connectors risk-classed; supplier register with DPA status | SBOM; connector table; supplier register | FT, FC / SGB | P0–P2 |
| D13 | Testing, evaluation, regression | 17/17 mandatory gates PASS; central suite run per release and per affected change; 0 failed critical cases | gates; suite run report | FT / SGA | P0–P1 |
| D14 | Release integrity and distribution | Package hash equality enforced; certified updates delivered as releases the customer installs itself; release notes give the reason class | release record; notes | FT / SGB | P0 |
| **D15** | **Resilience, recovery, rollback, decommissioning** | Rollback to the previous certified release tested with data preserved; uninstall leaves only listed residual data; kill switches fail closed in CI; discontinuation path documented | rollback and uninstall records; CI | FT / SGA | P0–P1 |
| **D16** | **Responsible AI, fairness, accessibility, human rights** | Intended purpose and prohibited uses per package; fairness screening 100%, with an evaluation where relevant; key WCAG 2.1 AA criteria checked (a design target, not a claim); FRIA and AI-literacy inputs shipped | dossier; screening; checklist | FT / SGB | P1–P2 |
| **D17** | **Independent review, conflicts, suspension, revocation** | 100% of certified releases reviewed by a qualified reviewer with no build role and a signed conflict declaration; suspension and revocation criteria published; appeals decided within 30 days; annual programme review | review records; declarations; annual report | FC / IR | **P1**, a prerequisite for any listing |
| **D18** | **Business value, performance, consumption benchmarking** | Baseline benchmark per release (consumption per transaction, p50/p95 latency, success rate); subscriber comparison flags over +15% consumption or −2 points success; value model labelled illustrative | benchmark reports; evidence report | FT / SGA, INT | P1–P2 |

Control-level detail (trigger, method, evidence artefact, role, phase, reuse, status, references) is in the MCL JSON. Of the 86 controls, 60 are **central** (one implementation for every package) and 26 are per package. 36 already exist in the repository or the 1.0.3.6 evidence and are re-used, not rebuilt.

## 6. Operating model

### 6.1 Roles and limits

| Role | Holds | Limit |
|---|---|---|
| Founder, technical (FT) | Programme owner; accountable for engineering controls; builds certified updates | Cannot take the certification decision on a release he built (D17-01) |
| Founder, commercial (FC) | Approver; customer and authority communication; CRA reporting; suspension and revocation decisions with the reviewer | — |
| Student group A (SGA) | Central regression suite, golden sets, benchmark harness and runs | Synthetic data and CAI-TEST only; no production, customer or commercial-tenant access; every output reviewed by FT; **outputs may be reused only after a signed contribution licence** from each student (`docs/legal/restricted-works.md`) |
| Student group B (SGB) | Control mappings, SoA template, dossier sections, evidence report template, accessibility and fairness checklists | Same as SGA |
| Intern (INT) | Weekly monitoring log, triage drafts, registers, report assembly | Drafts only; no decisions; IP terms in the internship agreement before start |
| Independent reviewer (IR) | Review of each certified release's evidence pack; annual programme review; joint suspension and revocation decisions | Qualification file and yearly conflict declaration; paid per engagement; **not** an accreditation body and never described as one |
| External counsel (EC) | Contract wording; Art. 5 / Annex III and Art. 50(2) questions; suspension and revocation terms | Fixed scope per engagement |

**Student cohorts:** semester-bound work is cut into bounded work packages, each with a definition of done. If a cohort is not available, P1 scope narrows to Contract Intelligence & Register only and dates hold.

### 6.2 Cadence

| Rhythm | Activity | Output |
|---|---|---|
| Weekly | Regulatory and Microsoft change scan (INT 3 h, FT 1 h) | monitoring log rows |
| Within 10 business days of a log entry | Triage: statutory / CAI standard / no effect | triage record |
| Within 30 days of a change | Change assessment, published against affected certificates | assessment |
| Per release or certified update | Gates, central suite, benchmark, SoA, evidence report, IR review, then listing | Certified Release record |
| Quarterly | Benchmark run and evidence report per package (an operational target in v1.0) | evidence report |
| Annually | IR programme review; conflict declarations; supplier register; MCL revision | annual review summary |
| Event | Incident and vulnerability handling (D08); suspension, revocation and appeals (D17) | register; decisions |

### 6.3 Systems: existing only
- **MCL and release records:** the repository (`config/`, `scripts/cai-release/`, `config/release-gates.json`).
- **Evidence:** the existing private Release evidence library.
- **Security register:** the planned list in `docs/security/cra-operational-setup.md` §3.
- **Testing:** CAI-TEST and the clean environment.
- **Certificates:** `/api/certificate` and the existing certification records.
- **Reporting:** the ENISA SRP account (O5).

No new hosting, database, paid tool or second register is introduced.

## 7. Cost and capacity against the existing price

**Planning assumptions (to be replaced by quotes and dry-run actuals):**

| Item | Assumption |
|---|---|
| Independent reviewer | €130/h |
| Counsel | €200/h |
| Intern | €12/h |
| Students | no cash cost |
| Founders' time | valued at €60/h for the loaded view only |
| CAI-TEST Copilot Studio capacity for regression and benchmark | €720/yr |
| FX and payment fees | $1 = €0.86; 3% payment fees |
| L4 annual subscription | $2,490, about **€2,077 net** |

Hours per year come from section 6.2 plus about 24 FT hours per qualifying certified update and 6 IR hours per update.

| Scenario | Packages × qualifying updates/yr | Cash cost/yr | Loaded cost/yr | Break-even L4 annual subscribers (cash / loaded) | FT load (of 368 h) | SGA load (of 195 h) |
|---|---|---|---|---|---|---|
| A | 1 × 1 | €7,600 | €18,300 | 4 / 10 | 45% | 53% |
| B | 1 × 2 (dense 2027) | €8,400 | €20,600 | 5 / 11 | 52% | 56% |
| C | 3 × 2 | €12,000 | €31,400 | 6 / 16 | 81% | 77% |
| D | 5 × 2 | €15,500 | €42,200 | 8 / 22 | **110%** | **97%** |

**One-off set-up (cash):** about €6,200:
- counsel, about 25 h;
- reviewer onboarding, 8 h;
- a licensed copy of ISO/IEC 42001, needed before the D-references can be verified.

Each item needs the founder's yes before it is spent.

**Conclusions:**
1. **The existing price works for v1.0 only within these limits:**
   - delivery stays central;
   - the subscription carries no per-customer services;
   - Continuous Certification covers **at most three packages** until a second engineer or reviewer adds capacity (scenario D exceeds FT capacity).
2. **The binding constraint is FT engineering hours for certified updates, not cash.** Additional commitments (quarterly reports as contract terms, response times, deployment reviews) wait for the dry-run actuals.
3. **No price change is proposed.** Pricing changes need the founder's explicit authorisation. If the Phase 1 dry run shows more than 30 FT hours per certified update, the founder decides on scope, price or package cap before opening sales.

## 8. Implementation roadmap

| Phase | By | Deliverables | Exit criterion (all must hold) |
|---|---|---|---|
| **P0: product certification baseline** | 31 Dec 2026 | MCL v1.0 approved; SoA for CI 1.0.3.6; Art. 50(2) decision (by 2 Dec 2026); D08 intake, register and SRP path operational (security@, security.txt, O1–O5); Art. 5 / Annex III screening; supplier register | SoA complete with no open "applicable, no evidence" rows except the existing Gate C blockers; no new Gate C blocker created |
| **P1: operational readiness and dry run** | 31 Mar 2027 | IR contracted (qualification and conflict file); student contribution licences signed before any student output is used; central regression suite v1 and benchmark protocol v1 with a CI baseline; 12 weeks of monitoring, triage and unpublished assessments; counsel's wording for §§3–4 and D17; Deployment Assurance Kit v1 | Dry run measured: hours per role and per update recorded; FT hours per update ≤ 30; IR review of the CI evidence pack passed |
| **P2: subscription service (if approved)** | 30 Jun 2027 | Founder's written GO for Continuous Certification (separate from any agent GO); first published change assessments; first quarterly evidence report; SBOM per release; certificate lifecycle states | Subscription GO recorded with Gate C passed for the covered release; reviewed PR with an independent approval; production acceptance re-run |
| **P3: 2027 regulatory window** | 31 Dec 2027 | MCL v1.1 for CRA Annex I (11 Dec 2027) and Annex III (2 Dec 2027) where applicable; first annual programme review; second package onboarded through the same MCL | Annual review published; the second package's SoA uses only central controls plus its per-package rows |

**Dependencies on existing workstreams** (from the website handover):
- legal: Instrument A, legal texts, counsel answers;
- privacy: DPAs, privacy publication;
- accounting: tax policy;
- governance: O-REVIEW-CONTROL, B6.

The independent reviewer in D17 is a **certification** role. The code-review gap (O-REVIEW-CONTROL) is a separate role; one person may fill both only if they had no build role in the release under review.

## 9. Decisions requested

| # | Decision | Owner | Needed by |
|---|---|---|---|
| CC-1 | Approve MCL v1.0 (18 domains, 4 dimensions, M/L/S/C classes) as the canonical standard | FC with FT | P0 |
| CC-2 | Art. 50(2) applicability for packages already on the market | FC with counsel | **2 Dec 2026** |
| CC-3 | Confirm the §4.3 correction (statutory remediation for all licensees) for the Licence and Terms | counsel | P1 |
| CC-4 | Budget yes for the one-off set-up (about €6,200) and the reviewer per-release fee | FC | P1 |
| CC-5 | Cap Continuous Certification at 3 packages until capacity is added | FC | P1 |
| CC-6 | Student contribution licence and IFSA IP position before any student output is reused | FC with counsel | P1 |
| CC-7 | Subscription GO, separate from the agent GO, after the dry run | FC | P2 |

The four existing commitments still need counsel's answers from `continuous-certification.md` §8 (the twelve questions).
