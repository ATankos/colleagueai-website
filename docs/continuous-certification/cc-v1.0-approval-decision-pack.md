# Continuous Certification v1.0: approval decision pack

**For:** both founders (Alexandr Tankos, Marek Těšitel). **Prepared:** 26 Nov 2026.

**Asked of you:** approve the programme as ColleagueAI's standard and operating plan, and the expenditure route.

**Not asked:**
- no subscription opens;
- no price changes;
- no contractual commitment is published;
- no paid service is bought.

All 36 agents and all subscriptions stay "Coming soon".

## 1. What you are approving, in five lines

1. **One standard:** the CAI Master Control Library: 18 domains, 86 controls, each with an owner, evidence and target.
2. **Four separate dimensions:** product certification, subscription coverage, customer deployment assurance and customer operational compliance. A certificate covers only the first two.
3. **Security and statutory fixes go to every buyer.** The subscription buys currency (assessments, certified updates, certificate state), not safety.
4. **An active subscription never shows "Active" by itself.** "Active" needs a paid-up subscription, the current certified release and a valid certificate.
5. **Launch on readiness, not on date.** Subscriptions open when every readiness item in spec §8.2 is met. 30 Jun 2027 is a planning target; earlier is allowed.

## 2. Corrections made since the first draft

| # | Point | Where |
|---|---|---|
| 1 | Applicability matrix for AI Act, GDPR, CRA, ISO/IEC 42001, 27001, 27002, 27701 and 23894, ISO 31000, NIST AI RMF and OWASP: 0 verified, 82 indicative, 11 future. Nothing is cited publicly until verified | `applicability-matrix-v1.0.md`; MCL JSON |
| 2 | GDPR, privacy, data protection, risk, compliance, Microsoft compatibility and AI Token Economy are named in the domains, the spec (§5.1) and the positioning | spec §5.1; D09, D11, D18 names; positioning |
| 3 | Certificate state on four axes (subscription, release currency, decision, customer-reported deployment). "Active" needs three of them. The current code derives "Active" from payment alone; this is fixed before any subscription sale (readiness item T3) | spec §2.1; D17-03 |
| 4 | Art. 50(2): its transitional period applies only where its eligibility conditions are met. Our packages have not been placed on the market, so an applicability assessment is required before the first sale, not by 2 Dec 2026. December 2027 preparation completes by 30 Sep 2027 | spec §8.1; D03-02 |
| 5 | CRA reporting with early warning 24 h, notification 72 h, final report (14 days after a fix for a vulnerability; one month after notification for an incident), intermediate reports and user information | D08-03; spec D08 row; `docs/security/cra-operational-setup.md` §6 |
| 6 | Quarterly assurance report and AI Token Economy benchmark are priority deliverables from the dry run, with criteria and draft wording for future contractual inclusion | spec §4.2 |
| 7 | Customer-facing pricing: L2–L4 only; L5 not offered | spec header; positioning |
| 8 | Spend split into mandatory legal, independent reviewer and optional, with overlap and quotes required | spec §7.2 |
| 9 | Three-package cap is temporary, with review triggers | spec §7.3 |
| 10 | Milestone-driven launch | spec §8.2 |

## 3. Decisions

Recommended option first.

| # | Decision | Options | Recommendation | Owner |
|---|---|---|---|---|
| D1 | Adopt MCL v1.0 as ColleagueAI's certification standard and the spec as the operating plan | approve / approve with changes / reject | **Approve** | both founders |
| D2 | Art. 50(2) and Annex III applicability assessment for Contract Intelligence & Register (and each later package) before first placing on the market | include in the bundled counsel brief / separate engagement | **Bundle** with the existing legal brief | FC |
| D3 | Counsel: one bundled brief covering legal texts (B2), privacy pack (Gate B), CRA questions, the twelve Continuous Certification questions and the §4.4 correction | request quote | **Request a written quote now**; approve the spend on the quote | FC |
| D4 | Independent reviewer: qualification criteria and two quotes (CV, conflict declaration). The same person may also close O-REVIEW-CONTROL if they had no build role | request quotes | **Request quotes**; contract before the dry run | FC |
| D5 | Optional spend: ISO standard copies, accessibility audit | defer / buy | **Defer.** ISO mappings stay internal and indicative until a public citation is wanted | FT |
| D6 | Temporary cap of three packages, reviewed at the dry-run end and quarterly | approve / other number | **Approve** | both |
| D7 | Quarterly assurance report and AI Token Economy benchmark: priority dry-run deliverables; contractual only when the §4.2 criteria are met | approve / make contractual now | **Approve** (not contractual now) | both |
| D8 | Student and intern contributions: signed contribution licence (and IFSA's position) before any output is reused | approve | **Approve**; counsel drafts within D3 | FC |
| D9 | Certificate four-axis state (T3): engineering change in a separate reviewed PR before any subscription sale | approve as an operational change under the freeze | **Approve**, scheduled before the subscription GO | FT |
| D10 | `/certified` price table still shows an L5 row ($399/month), with a note that no L5 package is offered. Remove the row and update the note in 8 languages | approve as an operational change / leave until launch | **Approve**: a small reviewed PR, separate from #582 | FC |
| D11 | Subscription launch on readiness (spec §8.2); 30 Jun 2027 as the planning target | approve | **Approve** | both |

## 4. Money: what needs a quote before any spend

| Category | Estimate (planning only) | Overlap | Status |
|---|---|---|---|
| A. Mandatory legal, bundled | about 8–12 h incremental to the existing legal brief | High: B2, Gate B, CRA, Continuous Certification §8 | quote to request (D3) |
| B. Independent reviewer | onboarding about €1,000; about €780 per certified update; about €2,100 per year | Partial with O-REVIEW-CONTROL | two quotes to request (D4) |
| C. Optional | ISO copies about €150–250 each; accessibility audit by quote | ISO copies: none. CAI-TEST capacity is counted once with B7 | deferred (D5) |

**Profitability at today's prices (cash, planning assumptions):**
- The first package breaks even at about **5 L4 annual subscribers**, or about **11 at L2**.
- Each additional package adds about €1,800 per year.
- The limiting factor is technical-founder hours (52% of available programme time at one package, 81% at three), not cash.

## 5. What happens next if approved

1. **P0, by 31 Dec 2026:**
   - SoA for 1.0.3.6;
   - applicability assessments;
   - free-text mappings verified;
   - CRA SRP account;
   - supplier register.
2. **P1 dry run, about 12 weeks:**
   - reviewer contracted;
   - regression suite and benchmark baseline;
   - monthly simulated assurance reports;
   - hours measured.
3. **Subscription GO** as a separate written decision, once spec §8.2 is met.
4. **December 2027 preparation** complete by 30 Sep 2027.

## 5a. Follow-up pull requests prepared (26 Nov 2026, none merged)

Each pull request needs an independent approving review. No administrative bypass.

| PR | Content | Decision it implements | Status |
|---|---|---|---|
| #584 | Certificate four-axis state: payment never implies an active certification claim | D9 | prepared; awaiting founder approval of D9 and review |
| #585 | Operating templates (change register, impact assessment, evidence pack, quarterly assurance report, AI Token Economy benchmark, Deployment Assurance Kit) and commercial metrics | D7 | prepared; operational, not contractual |
| #586 | Website: Continuous Certification as a commercial pillar in 8 languages; L5 removed from customer pricing; video slot for an approved asset | D10 and positioning | prepared; operational change under the freeze, needs founder approval |

Approving a decision here does not merge a pull request, approve spend, or create a contractual commitment.

## 6. Approval record

| Decision | Founder (technical) | Founder (commercial) | Date | Notes |
|---|---|---|---|---|
| D1 | | | | |
| D2 | | | | |
| D3 | | | | |
| D4 | | | | |
| D5 | | | | |
| D6 | | | | |
| D7 | | | | |
| D8 | | | | |
| D9 | | | | |
| D10 | | | | |
| D11 | | | | |

After signature, record the approval reference in the MCL (`status` from `draft-for-approval` to `approved`, with date and reference) in a reviewed PR.
