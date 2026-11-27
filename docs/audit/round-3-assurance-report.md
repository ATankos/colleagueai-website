# ColleagueAI Round 3 — advanced independent assurance and launch decision

Date: 27 Nov 2026. Release candidate: the stack #590 → #591 → #592 → #593 (all draft), code head `856c4766`.
Author: engineering assistant (Claude Opus 5.5). Engineering assessment: **not** legal advice, **not** a third-party audit.
Nothing was merged, no commercial function was activated, no money was spent, no prices were changed, no reviewer identity was created.

Legend: **PASS** run and passed · **FAIL** run and failed · **BLOCKED** needs access or an owner action not available here · **NOT TESTED** not attempted.

## 1. Launch decision

**Not yet ready for the first sale. Engineering is not the obstacle.** Every engineering finding from Rounds 1–3 is fixed and covered by a test that fails on `origin/main`. What remains before a first sale is:
- verification that needs the owner's accounts: Stripe test mode, a Microsoft test tenant, email;
- production configuration;
- owner and counsel decisions.

Continuous Certification additionally needs the decider register filled and an independent reviewer contracted.

### First-sale blockers (all owner actions; none is code)

| # | Blocker | What closes it |
|---|---|---|
| FS-1 | Sandbox purchase journey on the release candidate: discovery → Stripe test checkout (card, decline, 3-D Secure) → invoice → licence confirmation → download → refund. **BLOCKED here**: no Stripe credentials in this environment; card details must be entered by the owner, never by the assistant. Earlier Preview sandbox journeys exist in this engagement's records, but they ran on older commits. | Owner runs the documented Preview journey on this stack (`scripts/verify-stripe-e2e.mjs`), or connects the Stripe connector and authorizes test-mode reads |
| FS-2 | Flagship 1.0.3.6 install and use in a **clean** Microsoft environment (install, extraction, evidence, review, register, deadlines, permissions, failure and recovery). **BLOCKED here**: no tenant access in this session. Earlier tenant runs exist for 1.0.3.5 and 1.0.3.6 in this engagement's records | One clean-environment run by the owner/administrator on 1.0.3.6, recorded |
| FS-3 | Production secrets present: `DOWNLOAD_TOKEN_SECRET` (downloads), optionally `ACCEPTANCE_SALT`, `INTEREST_DEDUPE_SALT`. **BLOCKED**: Vercel API returns 403 for environment variables | Owner confirms in the dashboard |
| FS-4 | Order and recovery email delivery (Resend domain verified). **BLOCKED** | Owner sends one test order email to a test inbox |
| FS-5 | Final legal and tax checks (the factsheet promises checkout after them); merge of the stack after **independent** review (61 merges so far had none; R1 in `release-gates-abc.md`) | Counsel/accountant; an independent reviewer approves; no admin bypass |

### Continuous Certification launch blockers

| # | Blocker |
|---|---|
| CC-1 | Decider register `config/certificate-deciders.json` is empty by design: no decision can be recorded until the owner registers the authorized commercial founder (FC) and a contracted, qualified independent reviewer (IR) |
| CC-2 | Activate the daily reconciliation: set `CRON_SECRET` (and optionally `OPS_ALERT_EMAIL`) in Production; runbook `docs/continuous-certification/reconciliation-runbook.md` |
| CC-3 | Counsel approves retention periods and the privacy-notice row: `docs/legal/proposed/certification-retention-proposal.md` |
| CC-4 | Native-speaker review of the seven preliminary translations (Rounds 2–3; `translation-review.md`) |
| CC-5 | A subscription-mode sandbox run: certificate issued, renewal, dispute opened/won/lost, refund (the logic is tested locally; not against Stripe) |

### Optional improvements (only those that materially help)

1. State a support **response target** next to "e-mail support for 24 months"; procurement asks for one first (owner decision on the number).
2. Reconcile the Microsoft running-cost estimate on the factsheet with a real invoice and say so (it is labelled "not yet reconciled").
3. Key the holder lookup (`cert:holder:`) with an HMAC; low risk, one migration.
4. Translate the factsheet (it is English-only by design today) once the flagship is on sale.
5. Run `npm run e2e:engines` (Firefox, WebKit, iPhone) once in CI or on a developer machine.

## 2. Corrections to earlier assessments

- **Round 2 said 20 navigation/language tests "fail identically on main".** True for the local runner, but the cause was the runner. `scripts/run-playwright-static.cjs` served the committed `public/` folder, which lacks what the build injects, including the unified header. The specs were correct and the site was correct. CI was not affected: it runs `e2e:site`, whose config serves `dist/`. Fixed: the runner now serves `dist/`.
- **#592 introduced an English fallback**: the partner step-3 sentence appeared in English in seven languages, because its translation was keyed on the old English text. Found and fixed in Round 3; the guard test now checks visible text.
- **Round 1 "fail on main" checks for AUD-002/005/006 were import errors.** Round 3 adds `tests/audit-blackbox-002-006.test.mjs`, which uses only exports that also exist on main: red on main, green on the fix.

## 3. Founder decisions — implementation

| Decision | Result | Evidence |
|---|---|---|
| Decisions need an authorized commercial founder and a separate qualified IR; no invented identities | Enforced since Round 2; register ships empty; Round 3 adds that a reference must be a case id, so no name or free text can enter evidence | `tests/certification-recovery.test.mjs` D1–D7, `tests/certification-dispute.test.mjs` M1–M2 |
| Stripe / Microsoft / email E2E where access is available | **BLOCKED** in this session (see FS-1, FS-2, FS-4) | — |
| Disputes suspend subscription benefits and the active claim while unresolved; controlled restoration; payment status separate from technical decisions | **Implemented.** `paymentHold` on the payment axis. Won, closed inquiry or prevented releases that dispute's hold; lost ends the certification and cancels the subscription (no further billing). Renewal-charge disputes now reach the certificate. A decision never clears a hold and a hold never changes a decision | `tests/certification-dispute.test.mjs` X1–X10 (all red on the Round 2 head) |
| 10% on eligible net perpetual licence revenue; no recurring commission | **Implemented, and a defect fixed:** the ledger took 10% of the charge total including tax and the first certification period. Copy in 8 languages updated | `tests/commission-base.test.mjs`, `tests/partner-terms-consistency.test.mjs` |
| Separate minimized evidence from personal records; propose retention | **Implemented** (allow-listed evidence writer, opaque decider ids, case-id references). Periods **proposed** for counsel, not applied | `docs/legal/proposed/certification-retention-proposal.md` |
| Daily reconciliation and failure alerts on existing infrastructure, no new spend | **Prepared, inactive** until `CRON_SECRET` is set. Vercel Cron on Production only; alerts to the log, and to email via the existing Resend transport if configured. Also fixed: the status view now reports **evidence repairs as well as pending issuances**, and stuck repairs are counted | `tests/certification-reconcile.test.mjs` (7) |

## 4. Independent technical verification

### Audit findings on `origin/main` (29410808) vs the release candidate

| Finding | On main | On the candidate | How reproduced |
|---|---|---|---|
| AUD-001 release access fails open | FAIL (reproduced) | PASS | `release-access` AUD-001 case red on main |
| AUD-002 predictable interest secret | reproduced (public fallback constant in `api/interest.js`) | PASS | black-box test |
| AUD-003 issuance recovery and decision attribution | reproduced: 19/23 recovery tests and 12/12 dispute tests red (behavioural, e.g. "failure swallowed", "renewal dispute left certificate active") | PASS | recovery and dispute suites |
| AUD-004 demo tier trusted from URL | reproduced: a URL tier changes the price shown (`$9,900` for the flagship instead of `$14,900`) | PASS | 4 `Demo.test.jsx` cases red on main |
| AUD-005 raw IP in rate-limit key | reproduced: store key `rl:demo:203.0.113.77` | PASS | black-box test |
| AUD-006 predictable fingerprint salt | reproduced: fingerprint recomputable from IP with the public salt | PASS | black-box test |
| AUD-007 privacy reconciliation | documented; owner/counsel items open | documented + retention proposal | — |
| AUD-008 interest claims | reproduced (4/4 red) | PASS | `interest-claims` |
| AUD-009 corrective-release wording | reproduced (8/9 red) | PASS (translations preliminary) | `certified-corrective-wording` |

### Areas

| Area | Result |
|---|---|
| Payment and entitlement integrity: duplicate, concurrent, delayed, out-of-order events, refunds, disputes, partial store failures | **PASS** (local, signed webhooks, failure-injecting store: recovery 23, dispute 12, commission 5) |
| Production / Preview isolation | **PASS**: every key, including the new ones, goes through `kv()` with the `preview:` prefix (`kv-namespace` tests); the cron runs on Production only |
| Secrets and authorization | **PASS** in code: cron endpoint fails closed without `CRON_SECRET`, constant-time compare; no decision endpoint exists. Production values **BLOCKED** (FS-3) |
| Dependency security | **PASS**: `npm audit` 0 vulnerabilities (prod and dev) |
| Backup and rollback | **NOT TESTED**: no access to Upstash backups or Vercel promotion here. Rollback paths documented: Vercel instant rollback to the previous deployment; cron rollback in the runbook; every change is in reviewable PRs |
| Microsoft compatibility | Package-level tests in the suite **PASS** (`cai-release-*`); tenant behaviour **BLOCKED** (FS-2) |
| GDPR / minimization / retention | evidence minimization **PASS** (tests M1–M2); retention **proposal** for counsel |

## 5. Website and customer experience (against the deployable build `dist/`)

| Check | Result |
|---|---|
| Site specs (11 files: full-site QA, back-to-top, language switch, modal focus, unified navigation, purchase flow, keyboard, accessibility) | desktop 251/251, mobile 251/251, tablet 248/251: the 3 failures were one accessibility defect visible only at tablet width (the privacy-notice link relied on colour alone), fixed and rerun at 50/50; see §6 for the clean-clone CI run |
| Accessibility, axe WCAG 2.1 A/AA, 50 buyer pages in 8 languages | **PASS** desktop 50/50, mobile 50/50, tablet 50/50 (24/50 before) |
| Keyboard: visible focus on every Tab stop, demo call to action reachable, card opens with Enter | **PASS** 9/9; dialog focus trap covered by `modal-focus` |
| Mobile performance, catalogue (local Lighthouse, uncompressed; Vercel adds compression) | **PASS** 79 → 96, LCP 3.9 s → 2.3 s (en, cs, de); factsheet 99, pricing 100, partners 99, certification 99, home 100 |
| Chromium desktop, mobile, tablet | **PASS** |
| Firefox, WebKit, iPhone | **BLOCKED**: browser download refused by the network allowlist. Projects are configured (`npm run e2e:engines`) |
| Eight languages, localized copy, URL locale, SEO and structured data audits | **PASS** (static audits) |
| Forms, email and partner registration delivery | Form behaviour **PASS** (suite); delivery **BLOCKED** (FS-4) |

Brand: the terracotta keeps its hue. Small text uses the darker shade the homepage already used (`#A94A2C`, 5.0:1 on cream), and the light coral `#E8A07F` stays on the dark header.

## 6. Clean-environment rerun (fresh clone of `856c4766`, `npm ci`, `npm run build`)

| Suite | Result |
|---|---|
| Node tests | **796/796 PASS** |
| Vitest | **37/37 PASS** |
| ESLint | **PASS** |
| Static QA, global language, localized copy, visible copy, URL locale | **PASS** |
| `npm audit` | 0 vulnerabilities |
| `npm run e2e:site` (CI equivalent: 11 specs × desktop, mobile, tablet, against `dist/`) | **753/753 PASS** (17.1 min) |

## 7. Commercial challenge (the six reviewers)

- **Prospective customer:** the flagship factsheet already answers what it does, what it costs, what Microsoft bills, what is excluded, how long installation takes and where data stays. Do not add more claims. Add a support response target and one real installed reference.
- **Procurement:** the price is fixed and published, the licence is perpetual, and corrective releases come at no fee for 24 months. Commission terms are now consistent: licence only, net of tax. Missing: the support response target, and the counsel-approved retention statement.
- **CIO:** prerequisites are explicit (Dataverse, Copilot Studio capacity, one SharePoint library, one administrator for 60–90 minutes), and the customer-controlled architecture is stated consistently.
- **CISO:** no tenant connection by ColleagueAI, signed webhooks, no inline scripts under the CSP, a fail-closed cron, isolated previews, 0 dependency vulnerabilities. Open: production secrets and the live response headers.
- **Auditor:** the evidence is append-only, minimized and attributable to registered roles, with intent-then-commit entries and a repair queue that is now reported daily. It cannot record a decision until CC-1 is closed.
- **Implementation partner:** one clear rate on one clear base. The partner agreement page still says "refer, resell or deploy" while the programme offers referral; align it when counsel reviews the agreement.

The conclusion is unchanged: sell one agent, Contract Intelligence & Register, with one call to action (a guided evaluation, then purchase), and keep the other 35 visible as "Coming soon".

## 8. Pull requests

| PR | Base | Content |
|---|---|---|
| #590 | main | Round 1 remediation |
| #591 | #590 | Round 2 integrity |
| #592 | #591 | Round 2 claims, partner terms, translations, Round 2 report |
| #593 | #592 | Round 3: disputes, commission base, reconciliation, minimization, website (build-based tests, accessibility, performance), this report |
| #585 | main | conflict resolved by merging `main` into the branch (R1 row combined: 61 merges without review; nothing dropped) |
