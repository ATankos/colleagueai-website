# Operational acceptance — 27 Nov 2026

Release candidate: `fix/aud-r3-integrity` @ `dd1cd6f2` (release 1.0.3.6, bundle r3).
Scope: Stripe sandbox and Vercel Preview, Microsoft flagship install (CAI-A6-CLEAN), production readiness.
Method: live checks in Vercel, Power Platform admin center, Dataverse Web API (read-only GETs), Power Automate,
Azure Cost Management, Resend, public DNS and the production site. Synthetic data only. No card, password, key or
token was entered by engineering; no secret value was read or printed.

**Verdict: commercial launch NO-GO.** Nothing found in testing calls for a code change. The NO-GO comes from three
founder-side blockers: Stripe sandbox access, Copilot capacity on the clean environment, and the open legal, tax and
operations gates.

## 1. What was done (engineering, this session)

| # | Action | Result |
|---|---|---|
| 1 | Re-scoped the Preview test flags to the release-candidate branch: `RELEASE_TEST_DELIVERY=1`, `RECOVERY_ENABLED=1`, `TAX_POLICY_SANDBOX=1` (Config type, Preview / `fix/aud-r3-integrity` only, **not** Production). | Saved. The older copies scoped to `preview/launch-check` are left untouched. |
| 2 | Redeployed the release-candidate Preview with the new flags (API redeploy of `dpl_6ChzX9…`). | `dpl_Bi38PDKE6zhXGUbfemCPaYmxDP5k`, sha `dd1cd6f2`, target Preview. |
| 3 | Verified the configured Preview. | `/api/recover` now serves the recovery form (it was 503 before). `/api/checkout?agent=contract-intelligence-and-register` serves the order page: release 1.0.3.6, SKU CAI-L4-CI-001, **$14,900** one-time, card only, Czech B2B scope notice, agreement set 2026-11-21 with fingerprints, "Continuous Certification is not yet open". An unknown slug gives 404, a missing token gives 403, GET on the webhook gives 405, and reconciliation gives 503 `cron_not_configured` (prepared, not active). |
| 4 | Updated `config/release-gates.json` (blockers on P-WORKFLOW-CLEAN, C-E2E-PREVIEW, C-DECLINE-3DS) with today's evidence. | No status changes. Gate tests 36/36. |

## 2. Results by area

### A. Stripe sandbox purchase journey (tests A0–A12): BLOCKED, founder access

- The Stripe Dashboard needs a sign-in, so the "no webhook endpoints" finding could not be verified. If it holds, the
  Preview's `STRIPE_WEBHOOK_SECRET` (all-Preview scope) belongs to a deleted endpoint, and fulfilment would fail
  signature checks.
- Everything engineering can do is ready. The branch flags are set, the Preview is rebuilt, and the order page and
  recovery are live.
- Still to do:
  1. Founder signs in.
  2. Engineering creates the sandbox endpoint for this Preview, with every event in the checklist including
     `charge.dispute.updated`.
  3. Founder pastes the signing secret into Vercel.
  4. Engineering prepares each order with synthetic company data up to the Stripe page.
  5. Founder enters the test cards (2, 3-D Secure, inquiry, dispute).
  6. Engineering verifies each result: KV records, documents, checksum, duplicate events, refund, commission,
     disputes, emails and isolation.

### B. Flagship on CAI-A6-CLEAN (B1–B9): installed, functionally BLOCKED by capacity

| Check | Evidence (27 Nov) | Result |
|---|---|---|
| Installation | `CAIContractIntelligence` **1.0.3.6 managed**, installed 2026-11-20 08:07 UTC (Dataverse `solutions`). | PASS (re-confirmed) |
| Configuration | 7/7 CAI CI flows `statecode=1` (On): Extract contract on upload, Review gate (Teams), Effective terms, Daily recompute, Content version, Compute – Notice deadlines, Compute – Get effective terms. Agent "CAI Contract Intelligence Assistant" published 2026-11-20. Connection references SharePoint, Dataverse and Teams bound to the founder account. | PASS |
| Runtime | Flow checker on both flows: **"This environment has insufficient Copilot Credits."** No runs in the 28-day history. Register empty: `cai_contracts` 0, `cai_fieldevidences` 0, `cai_jobruns` 0. | BLOCKED |
| Extraction accuracy, evidence, human review, register, deadlines, resilience, recovery on the clean install | Cannot run without capacity. These pass on CAI-TEST (P-WORKFLOW, 19 Nov). | BLOCKED |
| Permissions and isolation | PASS on 9–10 Nov (P-ISOLATION); not re-run here. | PASS (prior) |

The flow owner shown in Power Automate is the earlier tester account (name withheld from this record). Recommendation:
before the clean-environment run, set the owner and connections to a service or admin account, as a customer would.

### C. Microsoft consumption and cost — actual evidence

| Source | Figure |
|---|---|
| PPAC → Licensing → Copilot Studio, month to date (to 27 Nov) | **1.30 Copilot Credits** consumed, all in **CAI-A6-CLEAN**: Daily recompute 0.91 and Extract on upload 0.52. Purchased capacity **0**; pay-as-you-go **0**. |
| Billing plans | `CAICopilotPAYGCH` (Switzerland, Azure subscription 1) targets CAI-TEST, CAI-CI-TEST, CAI-DEV and CAI-LAB. `CAICopilotPAYG` (Europe) targets **no** environments. CAI-A6-CLEAN is in **neither**. |
| Azure Cost Management, Azure subscription 1 | "No service usage reported during this period". **€0 billed.** |
| Price (Microsoft) | Pay-as-you-go $0.01 per Copilot Credit, billed monthly in arrears. Prepaid pack: 25,000 credits for $200 a month. |

Value of today's consumption at the pay-as-you-go rate: about $0.013.

Estimate for a full B1–B9 run: about 100 credits per synthetic contract, or roughly $1. A 10-contract acceptance run
is about 1,000 credits, roughly $10. This is an estimate, not a quote. It assumes a few pages per contract at
Microsoft's published content-processing and flow-action rates. Recommend an Azure budget alert at $25 on the plan's
resource group.

### D. Production readiness

| Area | Evidence | Result |
|---|---|---|
| Commercial freeze on Production | `/api/checkout` 503 `checkout_disabled`; `/api/download`, `/api/order-document`, `/api/recover`, `/api/success` 503 (no secrets, fail-closed). Product page shows no purchase control. `CHECKOUT_ENABLED` is Production-scoped; no Stripe, download, Blob or Resend secrets in Production. | PASS (freeze holds) |
| Environment separation | Stripe, download and mail secrets are Preview-only. KV is **one Upstash database (Free, `dub1`) shared by Production and Preview**, with Preview keys prefixed `preview:`. The Free plan allows 1 database per account. | Acceptable for pre-launch; decision before GO (F7) |
| Demo requests (the only live call to action) | Leads are stored in KV (store configured in Production), but Production has no `RESEND_API_KEY` or `DEMO_NOTIFY_EMAIL`, so **nobody is notified of a demo request**. | **Defect (operational)**, founder (F5) |
| Email | Resend domain `colleagueai.ai` **Verified**; DKIM `resend._domainkey` published; SPF and MX on `send.` subdomain; 2 emails delivered 21 Nov (order and recovery). One API key ("Onboarding", sending only). **No DMARC record** (`_dmarc` NXDOMAIN). Inbound mail goes through Porkbun forwarding. | Works; DMARC missing (F6) |
| Data location | Functions run in `iad1` (US East); KV is in `dub1` (EU). Personal data from forms crosses to the US on each request, and adds latency. | Recommendation (F8) |
| Deployment stability | Runtime errors, 7 days: only expected fail-closed messages (checkout without Stripe 23×, from direct or old links; today's probes 8×), plus one historical alert for an r2 package path (21 Nov). No unexpected errors. Production #589 is live; #586 is the instant-rollback candidate. | PASS |
| Website | 207/207 sitemap URLs return 200; 62/62 internal links on home, cs, de, pricing and demo OK; hreflang for 8 languages plus x-default; one h1; canonical, JSON-LD and meta description present; 0 images without alt; 0 unlabeled inputs; HSTS (preload), CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy present (COOP absent, minor). `robots.txt`, `sitemap.xml`, `llms.txt` served. | PASS |
| Hosting plan | The Vercel team is on **Hobby**. Vercel restricts Hobby to non-commercial personal use; commercial use needs Pro or Enterprise. A site promoting a company's services already counts as commercial. | **Blocker** (F4, expenditure) |
| Account security | Vercel 2FA not enabled. Dashboard redeploys now need an emailed code. | Recommendation (F9) |

## 3. Release gates (19)

Unchanged: **9 PASS · 3 BLOCKED · 7 REQUIRES FOUNDER APPROVAL**.

- BLOCKED:
  - P-WORKFLOW-CLEAN: capacity (F1).
  - C-E2E-PREVIEW: Stripe access, webhook and test cards (F2, F3).
  - C-DECLINE-3DS: same as C-E2E-PREVIEW.
- Founder:
  - C-REFUND-PREVIEW
  - L-LEGAL-TEXTS
  - L-IP
  - T-TAX-POLICY
  - O-DPA-SECURITY
  - O-PROD-CONFIG (now also F4, F5)
  - O-REVIEW-CONTROL

## 4. Defects and blockers

| ID | Severity | Item | Owner |
|---|---|---|---|
| D1 | High (operational) | Production demo requests are stored but no one is notified. | Founder (F5) |
| D2 | High (compliance) | Commercial site on Vercel Hobby. | Founder (F4) |
| B1 | Blocker | No Copilot capacity on CAI-A6-CLEAN, so the flows never run. | Founder (F1) |
| B2 | Blocker | Stripe sandbox not accessible to engineering; webhook endpoint unverified. | Founder (F2, F3) |
| R1 | Medium | No DMARC record. | Founder (F6) |
| R2 | Medium | Shared Production/Preview KV. | Founder (F7) |
| R3 | Low | US function region for EU data. | Founder (F8) |
| R4 | Low | No Vercel 2FA. | Founder (F9) |

No code defect was found. No PR, merge or code change was made in this round.

## 5. Founder actions (consolidated)

1. **F1, approval (metered spend).** Attach CAI-A6-CLEAN to the existing pay-as-you-go plan `CAICopilotPAYGCH`. This
   is no purchase: $0.01 per credit, estimated ≤ $10 for the full acceptance run. On "yes", engineering edits the plan
   in PPAC, adds a $25 budget alert and runs B1–B9.
2. **F2, access (2 min).** Sign in to the Stripe sandbox ("ColleagueAI s.r.o.") in Chrome. Engineering then verifies
   the endpoints and creates the Preview endpoint.
3. **F3, about 15 min.**
   1. Paste the new signing secret into Vercel as `STRIPE_WEBHOOK_SECRET`, Preview / `fix/aud-r3-integrity`.
   2. Enter the five test cards on the Stripe pages engineering prepares.
   3. Instruct the sandbox refund (C-REFUND-PREVIEW).
4. **F4, expenditure.** Upgrade the Vercel team to Pro (required for commercial use; arguably already now).
5. **F5, now.** In Production, add `DEMO_NOTIFY_EMAIL` and a dedicated Production `RESEND_API_KEY` (new key in Resend,
   sending-only). Engineering adds the non-secret value and verifies one synthetic demo request on the Preview.
6. **F6.** Add a DMARC record at the DNS host (start with `p=none` and a report address). Engineering can do it if
   signed in, on your yes.
7. **F7, decision.** Keep one KV database with prefixes, or take a paid Upstash plan (or a separate account) for a
   Production-only database before GO.
8. **F8, decision (no cost).** Move the Vercel function region to `fra1` or `dub1`. This is a Production setting
   change, made on your yes.
9. **F9.** Enable Vercel 2FA.
10. **Legal, accounting and governance (unchanged):**
    - close L-LEGAL-TEXTS in writing;
    - sign IP Instrument A after counsel review;
    - get the accountant's T1/T3/T7/T8/T13 confirmation and decide on Microsoft invoice G195024562;
    - file the six DPAs (Vercel, Upstash, Stripe, Resend, Sentry, Plausible);
    - appoint a second reviewer, or record a decision to keep the owner bypass;
    - review the open PRs independently before any merge.
