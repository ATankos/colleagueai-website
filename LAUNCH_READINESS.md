# ColleagueAI Launch Readiness

_Last updated: 2026-06-18_

## Current release checkpoint

```text
Tag: demo-partner-launch-ready-2026-06-18
Branch: main
State: demo and partner-interest launch-ready
Paid checkout: gated / disabled
```

## Public production surface

The following pages are expected to be live, indexable, and free of known launch blockers:

```text
https://www.colleagueai.ai/agents
https://www.colleagueai.ai/en/agents
https://www.colleagueai.ai/cs/agents
https://www.colleagueai.ai/de/agents
https://www.colleagueai.ai/fr/agents
https://www.colleagueai.ai/es/agents
https://www.colleagueai.ai/it/agents
https://www.colleagueai.ai/pl/agents
https://www.colleagueai.ai/pt/agents
https://www.colleagueai.ai/trust
https://www.colleagueai.ai/partners
https://www.colleagueai.ai/privacy
https://www.colleagueai.ai/terms
https://www.colleagueai.ai/sitemap.xml
```

## Current launch status

ColleagueAI is ready for:

- Enterprise demo traffic.
- Partner-interest registration.
- Technical evaluation.
- Legal review.
- Stripe checkout and webhook testing.

ColleagueAI is **not yet approved for paid commercial launch**.

Paid checkout must remain disabled until all legal and Stripe readiness items below are complete.

## Active launch gate

The `/agents` page and localized `/agents` pages include a launch-readiness gate.

Expected gate markers:

```text
id="launch-readiness-gate"
id="cai-launch-gate-script"
Paid checkout is not enabled
CAI_COMMERCIAL_LAUNCH_ENABLED=false
Stripe end-to-end
customer-use-case dependent
```

## Legal readiness checklist

Before enabling paid checkout, confirm legal approval for:

- Terms of Service.
- Privacy Policy.
- Partner / affiliate agreement.
- Refund and cancellation wording.
- Checkout wording.
- AI-agent governance wording.
- No public legal compliance guarantee.
- AI risk classification wording remains customer-use-case dependent.
- Partner commission eligibility and fraud controls.
- Data processing and subprocessor disclosures.
- Cross-border data transfer wording, if applicable.
- Customer responsibility wording for tenant configuration, RBAC, connectors, and use-case-specific obligations.

## Stripe readiness checklist

Before enabling paid checkout, complete and document:

- Stripe test checkout session creation.
- Stripe hosted checkout redirect.
- Successful test payment.
- Failed payment path.
- Cancelled checkout path.
- Webhook signature verification.
- Webhook idempotency behavior.
- Entitlement creation or fulfilment record.
- Refund test path.
- Stripe product/price naming review.
- Production secret storage review.
- No Stripe secrets committed to git.

## Partner readiness checklist

Before making commission claims operational, confirm:

- Partner approval workflow.
- Partner agreement acceptance.
- Attribution window.
- Self-referral fraud rule.
- Refund/chargeback handling.
- Commission calculation timing.
- Payment threshold.
- Tax/invoice requirements.
- Manual review process for disputed referrals.

## Freeze list

Do not enable or add the following before legal and Stripe approval:

- `CAI_COMMERCIAL_LAUNCH_ENABLED=true`.
- Live Stripe payment links.
- Public checkout flow.
- Automated entitlement fulfilment.
- Partner commission automation.
- New compliance claims.
- “EU AI Act compliant” wording.
- New tracking providers.
- Sentry session replay.
- Third-party demo recording tools without privacy review.

## Repeatable production smoke

Run this before and after every production-impacting PR:

```powershell
npm run smoke:prod
npm audit
git status
```

Expected result:

```text
All production smoke checks pass.
npm audit reports 0 vulnerabilities.
main is clean and synced after merge.
```

## Rollback reference

If a future production change regresses the demo/partner-interest state, use the tag below as the known-good reference:

```powershell
git checkout demo-partner-launch-ready-2026-06-18
```

Use rollback only with the standard branch and PR process unless an emergency requires otherwise.
