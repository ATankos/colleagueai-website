# Continuous Certification: commercial measurement framework (internal)

**Status:** prepared 26 Nov 2026.
- **Recorded:** every value is "n/a, not yet selling" until the subscription GO.
- **No new service.** Every metric comes from existing records: Stripe exports, the certification records in the existing KV store (read-only), the interest and demand report, and the hours log.
- **Not published.** No metric is published or used in customer material. That includes renewal rates: the vocabulary contract bans renewal claims without cohort data.

## 1. Definitions

| # | Metric | Formula | Source | Owner | Cadence | Decision it feeds |
|---|---|---|---|---|---|---|
| M1 | **Subscription attachment rate** | agent licences sold with Continuous Certification ÷ agent licences sold, per tier (L2–L4), rolling 90 days | Stripe export (one-time + subscription line items) | FC | monthly | price and positioning review |
| M2 | **MRR** | Σ active subscriptions × monthly-equivalent price (annual ÷ 12), net of VAT | Stripe export | FC | monthly | — |
| M3 | **ARR** | MRR × 12 | M2 | FC | monthly | — |
| M4 | **Renewal rate** | subscriptions renewed ÷ subscriptions due for renewal in the period (annual and monthly cohorts separately) | Stripe export; certificate history `subscription-renewed` | FC | quarterly | — |
| M5 | **Churn** | subscriptions ended (`subscription-ended` events) ÷ active subscriptions at period start; also revenue churn | certificate history; Stripe | FC | monthly | — |
| M6 | **Subscription delivery cost** | Σ (hours by role × planning rate) + reviewer and counsel invoices attributed to Continuous Certification + CAI-TEST capacity share | `engineering-hours-log.csv`; invoices | FT, FC | monthly | price review (spec §7.4) |
| M7 | **Certification gross margin** | (subscription revenue net of fees − M6 cash part) ÷ subscription revenue; also shown with founders' time (loaded) | M2, M6 | FC | quarterly | price and cap review |
| M8 | **Covered agents** | packages with ≥ 1 certified release and ≥ 1 active subscription | `config/products.json` (certifiedAt); certificate records | FT | monthly | capacity cap (spec §7.3) |
| M9 | **Engineering hours per certified update** | Σ hours with activity `certified-update` ÷ number of certified updates released | `engineering-hours-log.csv` | FT | per update; quarterly median | §4.2 criteria; cap; price trigger (> 30 h) |
| M10 | **Customer demand for Continuous Certification** | per agent and tier: interest registrations and their stated timeframe (the form has no Continuous Certification field: no new field is added); demo conversations tagged by FC when Continuous Certification is raised; after launch, M1 | `scripts/demand-report.mjs` output (aggregates only); demo log | FC | monthly | which packages to certify first |

## 2. Thresholds that trigger a founder review

| Trigger | Threshold | Review |
|---|---|---|
| Hours per certified update | median > 30 h over two updates | price, scope or cap (spec §7.4) |
| Technical-founder load | > 90% of available programme hours in a quarter | lower the cap (spec §7.3) |
| Cash coverage per covered package | subscription revenue < cash delivery cost for two consecutive quarters | price or cap |
| Attachment rate | < 30% after 10 licence sales | positioning and offer |
| Monthly churn | > 3% for two consecutive months | delivery quality and value review |

These thresholds are planning values. The founders confirm or change them at the subscription GO.

## 3. Recording rules
- **Hours.** Every hour on Continuous Certification goes into `engineering-hours-log.csv`, with an activity from this list:
  - `monitoring`
  - `triage`
  - `impact-assessment`
  - `certified-update`
  - `regression`
  - `benchmark`
  - `evidence-pack`
  - `report`
  - `incident`
  - `review-support`
  - `admin`
- **Aggregates only.** No customer names or e-mail addresses go into any metric file.
- **Reproducible.** Each monthly snapshot is kept as a dated CSV in the private evidence library, so the figures can be recalculated.
