# Regulatory and standards applicability matrix (MCL v1.0)

**Generated from:** `cai-master-control-library-v1.0.json` (`frameworks`, `applicabilityMatrix`). Edit the JSON, not this file.

**Status today:** 0 verified, 82 indicative, 11 future.

- Nothing in this matrix may appear in customer-facing material until it is **verified**.
- A mapping is a reference for orientation. It is not a claim that the instrument applies, or that it is met.
- No certification against any standard is held or claimed.

## Mapping status

| Status | Meaning |
|---|---|
| **verified** | Checked against the official text of the cited edition by a named checker, with date. Required before a reference appears in any customer-facing material. |
| **indicative** | Prepared by ColleagueAI and not yet checked against the official text. Internal only. |
| **future** | Planned coverage for a later MCL version or an obligation not yet applicable. |

## How a mapping becomes verified

1. **Free official texts** (AI Act, GDPR, CRA, NIST AI RMF and AI 600-1, OWASP):
   - SGB checks each reference against the cited edition;
   - FT confirms;
   - the independent reviewer samples at least 20%.
   - Target: P0 for AI Act, GDPR and CRA; P1 for NIST and OWASP.
2. **ISO texts** are verified only after a licensed copy is bought. This is optional spend (decision pack, item E3).
   - Until then they stay **indicative**, internal only, and are never cited publicly.
3. **Recording.** Each verification records the checker, the date and the edition. `tests/cai-mcl.test.mjs` refuses a `verified` entry without them.

## Frameworks and their applicability to ColleagueAI

| Code | Instrument | Kind | Access | Applicability (counsel to confirm the legal rows) |
|---|---|---|---|---|
| AIA | EU AI Act, Regulation (EU) 2024/1689, as amended by the Digital Omnibus on AI (2026) | law | free official text (EUR-Lex) | Yes: ColleagueAI is provider of AI systems. Art. 4 and Art. 5 apply now; Art. 50 since 2 Aug 2026; Chapter III high-risk duties only if a package's intended purpose is screened as Annex III (from 2 Dec 2027). |
| GDPR | GDPR, Regulation (EU) 2016/679 | law | free official text (EUR-Lex) | Yes: to ColleagueAI's own processing (website, interest, orders). Customer is controller for data its agents process; ColleagueAI has no access and is not processor of that data. |
| CRA | Cyber Resilience Act, Regulation (EU) 2024/2847 | law | free official text (EUR-Lex) | Likely yes for a distributed software package (counsel to confirm 'product with digital elements' and the role as manufacturer). Art. 14 reporting since 11 Sep 2026; Art. 13 and Annex I from 11 Dec 2027. |
| ISO42001 | ISO/IEC 42001:2023 AI management system | voluntary standard | paid; licensed copy needed to verify | Voluntary reference. No certification held or claimed. |
| ISO27001 | ISO/IEC 27001:2022 information security management | voluntary standard | paid | Voluntary reference. No certification held or claimed. |
| ISO27002 | ISO/IEC 27002:2022 information security controls | voluntary standard | paid | Voluntary reference for control wording. |
| ISO27701 | ISO/IEC 27701 privacy information management (edition to be confirmed at purchase) | voluntary standard | paid | Voluntary reference; future coverage only if a privacy management system is adopted. |
| ISO23894 | ISO/IEC 23894:2023 AI risk management guidance | voluntary guidance | paid | Voluntary reference for D01, D16 method. |
| ISO31000 | ISO 31000:2018 risk management guidelines | voluntary guidance | paid | Voluntary reference for the risk method. |
| NIST | NIST AI RMF 1.0 (NIST AI 100-1) and Generative AI Profile (NIST AI 600-1) | voluntary framework | free | Voluntary reference (GOVERN, MAP, MEASURE, MANAGE). |
| OWASP | OWASP Top 10 for LLM Applications 2025 and OWASP Agentic AI Threats and Mitigations | voluntary guidance | free | Voluntary reference; the D07/D13 adversarial test set is organised by it. |

## Domain × framework

Codes: I = indicative, F = future, V = verified, — = no mapping.

| Domain | AIA | GDPR | CRA | ISO42001 | ISO27001 | ISO27002 | ISO27701 | ISO23894 | ISO31000 | NIST | OWASP |
|---|---|---|---|---|---|---|---|---|---|---|---|
| D01 Governance, accountability and CAI tier classification | I | I | F | I | I | — | — | I | I | I | — |
| D02 Human oversight and intervention | I | — | — | I | — | — | — | — | — | I | I |
| D03 Transparency and user disclosure | I | I | — | I | — | — | — | — | — | I | I |
| D04 Audit trail and record-keeping | I | I | F | I | — | I | — | — | — | I | — |
| D05 Documentation, instructions for use and statement of applicability | I | — | F | I | — | — | — | — | — | I | — |
| D06 Regulatory monitoring and change assessment | I | — | F | I | I | — | — | — | I | I | — |
| D07 Security engineering and secure development | I | — | F | I | I | I | — | — | — | I | I |
| D08 AI incident and vulnerability management | I | I | F/I | I | — | I | — | — | — | I | — |
| D09 Privacy and data protection by design | — | I | — | I | — | I | F | — | — | I | I |
| D10 Data governance, lineage, quality and knowledge integrity | I | I | — | I | — | — | — | — | — | I | I |
| D11 AI model lifecycle and Microsoft platform compatibility | I | — | — | I | — | — | — | — | — | I | I |
| D12 Third-party, connector and supply-chain risk | — | I | F | I | — | I | — | — | — | I | I |
| D13 Testing, evaluation and regression | I | — | F | I | — | I | — | — | — | I | I |
| D14 Release integrity, packaging and distribution | — | — | F | I | — | I | — | — | — | I | — |
| D15 Operational resilience, recovery, rollback and safe decommissioning | — | I | F | I | — | I | — | — | — | I | — |
| D16 Responsible AI, fairness, accessibility and human rights | I | — | — | I | — | — | — | I | — | I | — |
| D17 Independent certification review, conflicts of interest, suspension and revocation | — | — | — | I | I | — | — | — | — | I | — |
| D18 Business value, performance and AI Token Economy benchmarking | — | — | — | I | — | — | — | — | — | I | I |

## References per domain

**D01 Governance, accountability and CAI tier classification**

- AIA: Art. 4, 5, 6 and Annex III screening; Art. 9 (reference) (indicative)
- GDPR: Art. 24 (indicative)
- CRA: Art. 13(2)-(3) cybersecurity risk assessment (future)
- ISO42001: cl. 5, 6.1; Annex A.2, A.3, A.5 (indicative)
- ISO27001: cl. 5, 6.1 (indicative)
- ISO23894: cl. 5-6 (indicative)
- ISO31000: cl. 5-6 (indicative)
- NIST: GOVERN, MAP (indicative)

**D02 Human oversight and intervention**

- AIA: Art. 14 (reference; binding only if high-risk); Art. 26(2) deployer (indicative)
- ISO42001: Annex A.9 (indicative)
- NIST: MANAGE (indicative)
- OWASP: LLM06 Excessive Agency; agentic human-in-the-loop (indicative)

**D03 Transparency and user disclosure**

- AIA: Art. 50(1), 50(2) (applicability assessment pending); Art. 13 (reference) (indicative)
- GDPR: Art. 13-14 (customer as controller) (indicative)
- ISO42001: Annex A.8 (indicative)
- NIST: GOVERN, MAP (indicative)
- OWASP: LLM09 Misinformation (indicative)

**D04 Audit trail and record-keeping**

- AIA: Art. 12, 19, 26(6) (reference) (indicative)
- GDPR: Art. 5(1)(e), 30 (indicative)
- CRA: Annex I part I (security logging) (future)
- ISO27002: 8.15 Logging (indicative)
- ISO42001: Annex A.6 (event logs) (indicative)
- NIST: MEASURE (indicative)

**D05 Documentation, instructions for use and statement of applicability**

- AIA: Art. 11, 13, 18 (reference) (indicative)
- CRA: Annex II information to users (future)
- ISO42001: cl. 7.5; Annex A.6, A.8 (indicative)
- NIST: GOVERN (indicative)

**D06 Regulatory monitoring and change assessment**

- AIA: whole Regulation (monitoring of amendments, delegated and implementing acts) (indicative)
- CRA: Art. 13 (future)
- ISO42001: cl. 4.1, 6.3 (indicative)
- ISO27001: cl. 4, 6.3 (indicative)
- ISO31000: cl. 6.6 (indicative)
- NIST: GOVERN 1 (indicative)

**D07 Security engineering and secure development**

- AIA: Art. 15 (indicative)
- CRA: Annex I part I (future)
- ISO27001: Annex A.8 (indicative)
- ISO27002: 8.8, 8.25-8.29 (indicative)
- ISO42001: Annex A.6 (indicative)
- NIST: MEASURE (security) (indicative)
- OWASP: LLM01, LLM02, LLM05, LLM07 (indicative)

**D08 AI incident and vulnerability management**

- CRA: Art. 14 reporting (in force since 11 Sep 2026) (indicative)
- CRA: Annex I part II vulnerability handling (future)
- AIA: Art. 26(5), 73 (deployer and high-risk only) (indicative)
- GDPR: Art. 33-34 (ColleagueAI's own breaches) (indicative)
- ISO27002: 5.24-5.28, 8.8 (indicative)
- ISO42001: cl. 10.2 (indicative)
- NIST: MANAGE 4 (indicative)

**D09 Privacy and data protection by design**

- GDPR: Art. 5, 25, 28, 30, 32, 35 (indicative)
- ISO27701: PIMS controls (future)
- ISO27002: 5.34 (indicative)
- ISO42001: Annex A.5, A.7 (indicative)
- NIST: MAP (privacy) (indicative)
- OWASP: LLM02 Sensitive Information Disclosure (indicative)

**D10 Data governance, lineage, quality and knowledge integrity**

- AIA: Art. 10 (reference; binding only if high-risk) (indicative)
- GDPR: Art. 5(1)(d) (indicative)
- ISO42001: Annex A.7 (indicative)
- NIST: MEASURE (indicative)
- OWASP: LLM04, LLM08, LLM09 (indicative)

**D11 AI model lifecycle and Microsoft platform compatibility**

- AIA: Art. 15; Art. 25 value chain; Art. 53 (Microsoft as GPAI provider) (indicative)
- ISO42001: Annex A.6 (indicative)
- NIST: MANAGE; AI 600-1 (indicative)
- OWASP: LLM03 (model supply chain) (indicative)

**D12 Third-party, connector and supply-chain risk**

- CRA: Art. 13(5) due diligence on components; Annex I part II SBOM (future)
- GDPR: Art. 28 (indicative)
- ISO27002: 5.19-5.23 (indicative)
- ISO42001: Annex A.10 (indicative)
- NIST: GOVERN 6 (indicative)
- OWASP: LLM03 Supply Chain (indicative)

**D13 Testing, evaluation and regression**

- AIA: Art. 9(6)-(8), 15 (reference) (indicative)
- CRA: Annex I part I (testing) (future)
- ISO42001: Annex A.6 (verification and validation) (indicative)
- ISO27002: 8.29 (indicative)
- NIST: MEASURE (indicative)
- OWASP: LLM01-LLM10 test set (indicative)

**D14 Release integrity, packaging and distribution**

- CRA: Annex I part II (secure distribution of updates) (future)
- ISO27002: 8.32 (indicative)
- ISO42001: Annex A.6 (deployment) (indicative)
- NIST: MANAGE (indicative)

**D15 Operational resilience, recovery, rollback and safe decommissioning**

- GDPR: Art. 32(1)(c) (indicative)
- CRA: Annex I part I (resilience) (future)
- ISO27002: 5.29-5.30, 8.13 (indicative)
- ISO42001: Annex A.6 (operation, retirement) (indicative)
- NIST: MANAGE 2 (deactivation) (indicative)

**D16 Responsible AI, fairness, accessibility and human rights**

- AIA: Art. 4, 5, 27 (deployer FRIA where applicable) (indicative)
- ISO42001: Annex A.5 (indicative)
- ISO23894: Annex (AI risk sources) (indicative)
- NIST: MAP 5, MEASURE (fairness) (indicative)

**D17 Independent certification review, conflicts of interest, suspension and revocation**

- ISO42001: cl. 9.2, 9.3 (indicative)
- ISO27001: cl. 9.2 (indicative)
- NIST: GOVERN (indicative)

**D18 Business value, performance and AI Token Economy benchmarking**

- OWASP: LLM10 Unbounded Consumption (indicative)
- NIST: MEASURE (performance) (indicative)
- ISO42001: Annex A.6 (monitoring) (indicative)
