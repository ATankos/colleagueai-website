# Continuous Certification development workstream: closure and handover (26 Nov 2026)

**Status:**
- Design, commercial positioning and operating model are accepted in principle by the founders.
- Development is closed: no further conceptual expansion and no new features.
- All 36 agents and all Continuous Certification subscriptions stay "Coming soon".
- Checkout, interest collection, subscriptions and commercial distribution stay disabled.

## Delivered
| PR | Content | State at closure |
|---|---|---|
| #582, #583, #587 | Programme specification, CAI Master Control Library (18 domains, 86 controls), applicability matrix, decision pack | merged (without an approving review; see R1) |
| #584 | Certificate four-axis state | merged and live (without an approving review; see R1) |
| #588 | Certificate integrity: subscription term required, compare-and-set writes, permanent evidence | merged and live 27 Nov 2026 (without an approving review; see R1). Residual: T5 evidence-log recovery and reconciliation, required before the subscription GO (spec §8.2) |
| #585 | Operating templates, commercial metrics, Gate B wording, R1, review-governance note, this closure | open; needs independent review |
| #586 | Website: Continuous Certification as a commercial pillar in 8 languages; L5 removed from customer pricing; /certified accessibility | open; needs founder approval (operational change), independent review, native-language review |

## Remaining dependencies, transferred

| Dependency | Goes to | Record |
|---|---|---|
| An independent approving reviewer; the admin bypass removed | Founders (governance) | `docs/launch/review-governance-2026-11-26.md`; R1; O-REVIEW-CONTROL |
| Review and merge of #585 and #586, with no administrative bypass; retrospective independent review of #584 and #588 (merged without approval) | Independent review | the PRs |
| Native-language review of the seven translations | Independent review (native speakers) | `translation-review.md` |
| Contract wording; Art. 50(2) and Annex III applicability; CRA manufacturer status and reporting path; §4.4 correction | Legal approval (bundled counsel brief, decision D3) | decision pack D2, D3 |
| Verification of the 82 indicative mappings (free texts first; ISO only if a licensed copy is bought) | Regulatory mapping verification | `applicability-matrix-v1.0.md` |
| **Immediate priority:** the first complete Continuous Certification assurance cycle (dry run): change register, impact assessment, evidence pack, quarterly assurance report, AI Token Economy benchmark, hours per update, all on 1.0.3.6 | Operational testing | `operations/`; spec §4.2 and §8.1 (P1) |
| **Immediate priority:** product certification of Contract Intelligence & Register 1.0.3.6 (Gate C blockers B1–B13, then `certifiedAt` after reviewer and founder sign-off) | Product certification | `release-readiness-2026-11-21.md` §8; `operations/certification-evidence-pack.md` |
| T5 certificate evidence-log recovery and reconciliation | Commercial launch (subscription readiness) | spec §8.2 T5 |
| Subscription GO, once spec §8.2 readiness is complete | Commercial launch; founders | decision pack D11 |

No pricing, legal commitment, expenditure or switch was changed in this workstream.

**Freeze:** further development is limited to verified defects, security requirements and explicitly approved operational changes.

**Deployment:** after the independent approvals, merge #585 and #586 (normal merge, no bypass), then verify production. All 36 agents and all Continuous Certification subscriptions must still be "Coming soon"; checkout and interest collection must still be disabled.
