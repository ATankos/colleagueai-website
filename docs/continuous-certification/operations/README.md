# Continuous Certification: operating templates (v1.0)

**Status:** prepared 26 Nov 2026 for the Phase 1 dry run.
- **Operational, not contractual.** None of these deliverables is a subscription commitment until the criteria in spec §4.2 are met and counsel has worded it.
- **All existing records.** Each template is filled from records that already exist: release records, release gates, the SoA, regression and benchmark runs, the security register and certificate records. Nothing here adds a system, service or cost.

| Template | MCL controls | Filled by (role) | Cadence |
|---|---|---|---|
| `change-register.csv`: regulatory and Microsoft change register | D06-01, D06-02, D11-02 | INT, triage by FT | weekly |
| `certification-impact-assessment.md` | D06-02 to D06-05, D11-03 | INT draft, FT decision, IR sample | per in-scope change |
| `certification-evidence-pack.md`: version-specific | D05-01, D05-02, D13-01, D14-01, D17-01 | FT, SGB; IR review | per release or certified update |
| `quarterly-assurance-report.md` | D18-05 | INT assembles, FT signs | quarterly (monthly in the dry run) |
| `ai-token-economy-benchmark.md`: protocol and report | D18-01, D18-02 | SGA runs, INT reports | per release and quarterly |
| `deployment-assurance-kit.md`: customer-run | DA and C controls | customer | at install and each update |
| `commercial-metrics.md` + `engineering-hours-log.csv` | spec §7 | FC (commercial), FT (hours) | monthly |

**Role codes** are as in the MCL: FT and FC (founders), SGA and SGB (student groups), INT (intern), IR (independent reviewer).

**Data rule:** synthetic data only. No customer data or personal data goes into any template except the commercial metrics, and those are aggregates only.

Workstream closure and the handover of remaining dependencies: `../cc-workstream-closure-2026-11-26.md`. Review governance (read-only finding and the minimum fix): `../../launch/review-governance-2026-11-26.md`.
