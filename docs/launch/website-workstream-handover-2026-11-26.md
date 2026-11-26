# Website implementation workstream: handover and freeze (26 Nov 2026)

**Status:** accepted by the founder as functionally complete (26 Nov 2026).

**Production commit:** `0355c524`. Verified after deployment:
- all 36 agents show "Coming soon", and 0 can be bought;
- checkout and Continuous Certification subscriptions answer `checkout_disabled`;
- interest collection is off (`{"enabled":false}`; a submission answers 503).

## 1. Change freeze (until the first commercial agent is launched)

Major website development is frozen. Only these changes may be made, each through a reviewed PR:

| Allowed | Condition |
|---|---|
| Verified defect fixes | The defect is reproduced and recorded in the PR |
| Security fixes | Including dependency and CodeQL findings |
| Approved operational changes | Each is approved by the founder in writing and named in the PR. Examples: publishing an approved legal text, recording a Gate B or Gate C decision, an evidence record, a configuration-record update |

**Not allowed:** new features, redesigns, new infrastructure or paid services, and activating any commercial functionality outside the gate procedures in `release-gates-abc.md`.

**Review rule:** O-REVIEW-CONTROL stays open until an independent approving reviewer is established. No administrative bypass, including for this freeze's own PRs.

## 2. Dependencies transferred to existing workstreams

The website workstream holds none of these any more. Each owner closes its items against the referenced record.

| Workstream | Items | Record |
|---|---|---|
| **Privacy** | Privacy approval pack: lawful basis, marketing consent, network-information wording, retention including inbox copies | `privacy-approval-pack-interest-registration.md` |
| **Privacy** | Publishing the Privacy Policy version | `docs/legal/proposed/privacy-2026-11-21-draft.md` |
| **Privacy** | DPAs for Vercel, Upstash, Resend and Stripe | O-DPA-SECURITY |
| **Privacy** | R8: authorised read-only production reconciliation. **Stays open** until it is run, and is a Gate B precondition | `interest-operations.md`; `release-gates-abc.md` R8 |
| **Privacy** | Gate B: founder authorisation first, then production verification evidence | `release-gates-abc.md`, Gate B log |
| **Legal** | Instrument A (exclusive licence agreement) signature and evidence (B3, L-IP) | `docs/legal/ip/` |
| **Legal** | Customer legal texts: Licence, Terms, Refund (B2, L-LEGAL-TEXTS) | `docs/legal/proposed/` |
| **Legal** | Security contact and disclosure page (B4) | O-DPA-SECURITY |
| **Accounting** | Tax policy and invoice route (B1, T-TAX-POLICY) | `config/tax-policy.json` |
| **Accounting** | Accountant's written approval | `release-blockers` entry |
| **Accounting** | Remuneration option for Instrument A (A4) | `docs/legal/ip/remuneration-options.md` |
| **Product certification** | Clean-environment workflow (B7). It costs money, so it needs the founder's yes | P-WORKFLOW-CLEAN |
| **Product certification** | Declined card / 3-D Secure test (B8) | C-DECLINE-3DS |
| **Product certification** | Refund test on the Preview (B9) | C-REFUND-PREVIEW |
| **Product certification** | Certification status (B10) | `config/availability.json` |
| **Product certification** | The 1.0.3.2 package missing from storage (B12) | C-1032-FILE |
| **Product certification** | Live-evidence check on a Preview (R3) | `release-gates-abc.md` |
| **Product certification** | Review of the mandatory gate list per release type (R2) | `release-gates-abc.md` |
| **Founder / governance** | Independent reviewer (B6, O-REVIEW-CONTROL, R1) | `release-gates-abc.md` |
| **Founder / governance** | Production configuration (B5, O-PROD-CONFIG) | O-PROD-CONFIG |
| **Founder / governance** | Written GO decision and the GO PR (B13 together with B11) | `release-readiness-2026-11-21.md`, section 8 |

## 3. Order to first launch

1. **Customer acquisition (Gate B):** the privacy items above, then R8, then the founder's documented authorisation, then enable, then production verification evidence.
2. **First agent (Gate C, 1.0.3.6):**
   - close B1–B10 and B12;
   - then the founder's written GO decision;
   - then one GO PR, which records B13 and clears B11 together and is approved by an independent reviewer;
   - after merge, re-run the production acceptance checks.
