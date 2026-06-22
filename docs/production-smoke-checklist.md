# Production Smoke Checklist

This checklist is for final manual review before production-facing launch activity.

It is not a legal, security, privacy, financial, or regulatory approval. Paid launch remains blocked until legal review, Stripe end-to-end testing, webhook entitlement testing, and production operating approvals are complete.

## 1. Release scope

- [ ] Confirm the release branch or commit under review.
- [ ] Confirm GitHub checks are green.
- [ ] Confirm no unreviewed public-page copy changes are included.
- [ ] Confirm no new launch-readiness, compliance, legal, pricing, or partner claims were introduced.
- [ ] Confirm generated public output matches the intended build process.

## 2. Local validation

Run before release review:

- npm run build
- npm run check
- npm run lhci
- npm audit

Expected result:

- [ ] Build passes.
- [ ] Lint passes.
- [ ] Tests pass.
- [ ] Global language navigation check passes.
- [ ] Localized copy check passes.
- [ ] Visible i18n audit passes.
- [ ] URL-locale check passes.
- [ ] Lighthouse thresholds pass.
- [ ] npm audit reports no actionable vulnerabilities.

## 3. Homepage smoke test

Review `/` on desktop and mobile.

- [ ] Hero loads correctly.
- [ ] Marketplace section is visible.
- [ ] Agent cards are readable.
- [ ] CAI Score / Trust section is visible.
- [ ] Pricing section is visible.
- [ ] Contact section is visible.
- [ ] Mobile quick navigation appears on mobile viewport.
- [ ] Mobile navigation links scroll to the correct sections.
- [ ] Language selector remains usable.
- [ ] No horizontal overflow appears on mobile.

## 4. Localized page smoke test

Review `/en/agents`, `/cs/agents`, `/de/agents`, `/fr/agents`, `/es/agents`, `/it/agents`, `/pl/agents`, and `/pt/agents`.

For each locale:

- [ ] Page loads successfully.
- [ ] Language selector uses same-page locale links.
- [ ] URL locale matches the visible language state.
- [ ] No unsupported `/sk/` route appears.
- [ ] No obvious untranslated English leakage appears.
- [ ] Navigation labels are appropriate for the locale.
- [ ] Mobile layout remains readable.

## 5. Trust and legal-page smoke test

Review `/trust`, `/partners`, `/privacy`, and `/terms`.

For each page:

- [ ] Page loads successfully.
- [ ] Global language switcher is present where expected.
- [ ] Same-page locale links work.
- [ ] Trust guide copy is localized on localized routes.
- [ ] Legal/compliance copy remains unchanged unless separately reviewed.
- [ ] No claim states the product is legally compliant, EU AI Act compliant, paid-launch-ready, or commercially approved.
- [ ] Governance language remains framed as support for review, not approval.

## 6. Privacy and telemetry gate

- [ ] Sentry replay/session recording remains disabled unless separate DPA/privacy review approves it.
- [ ] No new tracking or telemetry script was introduced without review.
- [ ] Privacy page remains reachable.
- [ ] Privacy wording was not changed without review.

## 7. Paid launch blockers

Paid launch remains blocked until all items below are complete:

- [ ] Legal review completed.
- [ ] Stripe end-to-end checkout test completed.
- [ ] Stripe webhook entitlement test completed.
- [ ] Refund/cancellation path reviewed.
- [ ] Terms and privacy pages reviewed against actual production behavior.
- [ ] Support/contact handling reviewed.
- [ ] Production monitoring and rollback process reviewed.

## 8. Partner-flow smoke test

- [ ] Partner page loads.
- [ ] Partner interest language does not imply automatic approval.
- [ ] Commission or attribution language remains agreement-based.
- [ ] Partner CTA works as expected.
- [ ] No affiliate approval claim was introduced.

## 9. Evidence record

| Area | Evidence | Reviewer | Date |
| --- | --- | --- | --- |
| Build/check |  |  |  |
| Lighthouse |  |  |  |
| Localized pages |  |  |  |
| Trust/legal pages |  |  |  |
| Privacy/telemetry |  |  |  |
| Stripe/entitlements |  |  |  |
| Partner flow |  |  |  |

## 10. Final decision

- [ ] Proceed with non-paid public smoke review only.
- [ ] Proceed with partner/demo review only.
- [ ] Proceed with paid launch only after all blockers are cleared.
- [ ] Do not proceed; issues require remediation.

Final reviewer:

Date:

Decision notes:
