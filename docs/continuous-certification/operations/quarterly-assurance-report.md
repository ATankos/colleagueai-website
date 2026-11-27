# Quarterly Certification Assurance Report: template

`QAR-<agent-slug>-<yyyy>Q<n>` · MCL D18-05 · issued to active subscribers of the package

> **Status in v1.0:** a priority operational deliverable produced from the dry run (monthly cadence during the dry run). It becomes a contractual subscription benefit only after the criteria in spec §4.2 are met. It describes the **certified release**, not the holder's deployment, and it is not legal or compliance advice.

## 1. Summary (≤ 150 words)
- Current certified release of the package: `x.y.z` (certified on …)
- Certificate state for this holder: subscription / release currency / decision (the four-axis model; customer-reported deployment shown as reported)
- In this quarter: n changes logged · n in scope · n required a release · n corrective releases (all licensees)

## 2. Regulatory and Microsoft changes assessed
| Change (CHG id) | Instrument or platform | Class | Release required? | Published assessment (CIA id) |
|---|---|---|---|---|

## 3. Security and incidents (class M, for all licensees)
| Ref | Severity | Status | Corrective release | CRA report required / submitted |
|---|---|---|---|---|
Write "No security incident or vulnerability affected this package in the quarter" when none.

## 4. Quality and reliability (central regression on the certified release)
| Measure | This quarter | Previous | Threshold |
|---|---|---|---|
| Critical regression cases failed | | | 0 |
| Non-critical pass rate | | | ≥ release record |
| Golden-set per-field accuracy (lowest field) | | | ≥ release record, ≤ 2-point drop |
| Lineage cases passed | | | 100% |

## 5. AI Token Economy (from the benchmark report)
| Measure | This quarter | Previous certified release | Change | Flag |
|---|---|---|---|---|
| Copilot Studio consumption per business transaction | | | | > +15% |
| p50 / p95 latency | | | | |
| Task success rate | | | | < −2 points |

## 6. What the holder may want to do
- Install certified update `x.y.z` (available since …), at your discretion. Release notes: …
- Review the Deployment Assurance Kit checklist after any update.

## 7. Scope statement
The Colleague AI Certified standard is Colleague AI's own programme. It is not accreditation, attestation or certification by any third party, notified body or regulator, and it is not legal, regulatory or compliance advice. Benchmarks are measured on Colleague AI's reference environment with a synthetic workload.

Prepared by (INT) · Approved by (FT) · Date
