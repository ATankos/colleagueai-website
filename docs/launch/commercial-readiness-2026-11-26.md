# Commercial readiness assessment, 26 Nov 2026

**Verdict: no agent is commercially available. All 36 show "Coming soon" across the platform, and none can be bought for real money.**

The registry is `config/availability.json`. The per-agent inventory is `docs/launch/agent-availability-inventory.csv`; it is generated from the registry and checked at build time.

## Portfolio position

| Group | Agents | Lifecycle | Public status |
|---|---|---|---|
| Contract Intelligence & Register (CAI-L4-CI-001) | 1 | technically-approved (release 1.0.3.6 accepted 20 Nov 2026) | Coming soon |
| Operations Procedures Assistant, Service Review Pack Builder | 2 | in-testing (1.0.0.4 E2E: NO-GO; 1.0.0.5 remediation in progress) | Coming soon |
| Risk Event Capture Agent | 1 | in-development (chat prototype, untested) | Coming soon |
| All other catalogue agents | 32 | concept (dossier only) | Coming soon |

Commercial approval: 0 of 36. Early-access approval: 0 of 36. Verified CAI Score: 0 of 36; every CAI level shown is a target classification.

## Release blockers for the first commercial sale (Contract Intelligence & Register)

1. Written approvals from the accountant and from counsel.
2. Tax policy approval (`config/tax-policy.json`, status `unapproved`). The DIČ effective date and the official record are still missing.
3. Clean-tenant functional test: documented as not executed.
4. Founder commercial GO, recorded in **both** places:
   - `saleApproved: true` in `config/products.json`;
   - a complete `commercialApproval` in `config/availability.json` (`approvedBy`, `approvedAt`, `reference`), with lifecycle `commercially-approved` or `generally-available`.
5. Privacy notice: publish the next version (draft in `docs/legal/proposed/`). It adds interest registrations (purpose, legal basis, retention). The form already states consent and the 12-month retention where the data is entered.

## Enforcement (server-side)

A live sale now needs two records to agree:

- `saleApproved` on the release;
- an explicit commercial authorisation in the availability registry.

These are checked in the following places:

| Point | Function |
|---|---|
| Checkout (every request, including direct API calls and Continuous Certification) | `lib/products.js` `liveSaleRefused` |
| Fulfilment of a paid live session, including Payment Links (no entitlement, no licence) | `liveFulfilmentWithheld` |
| Production package delivery | `packageDeliverable` |

L5 is refused in any mode. Unchanged and still independent:

- the tax policy gate;
- the launch scope;
- `CHECKOUT_ENABLED`;
- `CERTIFICATION_SALES_ENABLED`;
- the Preview-only test-delivery flag.

## Demand generation

| Item | What is in place |
|---|---|
| Interest registration | Per-agent "Register your interest" form in all 8 languages, at `/demo?agent=<slug>&intent=interest`. Linked from the catalogue drawer, the package CTAs and every factsheet. Handled by `api/interest.js` |
| Data and consent | Consent required and versioned. Data minimised: no name or phone. Kept 365 days. Duplicates per e-mail and agent are blocked for 30 days by a pseudonymous key |
| Spam protection | Honeypot, minimum fill time and a per-IP rate limit |
| Notification | Sent to the existing lead inbox (`RESEND_API_KEY` + `DEMO_NOTIFY_EMAIL`) |
| Release dates | None promised |
| Demand counters | Anonymous monthly counters per agent: views (factsheets and drawer), interest registrations and demo requests |
| Report | `node scripts/demand-report.mjs --months 6 --out demand.csv` gives per agent: views, registrations, qualified leads, demos, conversion rates, top industry, top technology, top timeframe and a 0–100 demand index |

## Not done in this change (deliberately)

- **No production checkout, subscription or release was activated.**
- **Accepted legal texts were not edited in place.** The privacy change is in the proposed next version.
- **Client-side analytics tool:** none is bundled on the static pages. The demand figures come from the server-side counters, which need no cookie or consent banner.
