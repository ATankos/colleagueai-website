# ColleagueAI Round 2 — independent assurance report

Date: 27 Nov 2026. Scope: ColleagueAI.ai and Contract Intelligence & Register 1.0.3.6. Reviewed commit: `2af2d03f` (stack #590 → #591 → #592, all draft).
Author: engineering assistant (Claude Sonnet 5.5). This is an engineering assessment, **not** legal advice and **not** a third-party audit.
Nothing was merged, no commercial function was activated, no money was spent, no prices were changed.

Result legend: **PASS** run and passed · **FAIL** run and failed · **BLOCKED** needs credentials, a tenant or an owner action that is not available here · **NOT TESTED** not attempted.

## 1. Verdict

The platform is technically close to a first sale of one agent, but it is **not ready to sell yet**. What stands between the site and a first sale is mostly **verification that needs the owner's accounts** (Stripe test mode, Microsoft tenant, email, production secrets) and **owner decisions**, not missing engineering.

Round 1 (#590) was not fully correct. Three claims did not hold and are fixed in #591/#592:
1. The CAI-AUD-001 regression test described in the PR body was **not in the commit**.
2. The rate-limit fix used a **random key per serverless process**, so every instance had its own window and the limit did not limit.
3. The corrective-release correction (AUD-009) reached **English only**; seven languages still said security fixes reach "every licensee".

I did **not** independently re-derive CAI-AUD-002..008 on origin/main with behavioural black-box tests. Their round-1 tests exist and pass (761/761), but the round-1 "red on main" check for some of them was an import error, which is a weak red. Treat those as *covered by tests*, not *independently reproduced*.

## 2. Test evidence (clean clone, `npm ci`, `npm run build`, commit 2af2d03f)

| Check | Result |
|---|---|
| Node test suite (`tests/*.test.mjs`) | **PASS** 761/761 (a fresh clone fails 22 until `npm run build` has run: tests read `dist`) |
| Vitest | **PASS** 37/37 |
| ESLint | **PASS** exit 0 |
| `qa:static`, global-language, localized-copy, visible-copy, url-locale audits | **PASS** |
| Playwright `full-site-qa`, desktop | **PASS** 164/164 |
| Playwright `full-site-qa`, back-to-top, modal-focus, language-switch, unified-navigation, mobile (Pixel 7) | **169 passed, 20 failed**; the 20 failures are in `language-switch` and `unified-navigation` (below) |
| `language-switch.spec`, `unified-navigation.spec` | **FAIL** 20/20, **identical on origin/main** (they look for `.cai-uni-header`, which no page contains): pre-existing, stale spec or missing header |
| `a11y.spec` (axe, WCAG 2.1 AA, React homepage, en + cs) | **FAIL** colour contrast, identical on origin/main |
| Lighthouse (local build): home, pricing, catalogue, factsheet; mobile + desktop | **PASS** SEO 100 everywhere; accessibility 96–100; performance 98–100 except catalogue mobile **79** (LCP 3.9 s) |
| Sitemap: 207 URLs resolve through `vercel.json` | **PASS** |
| Canonical (single host), JSON-LD parses, one `<h1>`, `lang` set | **PASS** |
| hreflang | **FAIL (minor)**: 24 pages lack `x-default`; 47 pages have none (36 English-only factsheets, localized demo pages) |
| Meta description missing/short | **FAIL (minor)**: 5 pages (`/responsible-ai`, fr accessibility/responsible-ai/terms) |
| Security headers in `vercel.json` (HSTS preload, nosniff, X-Frame, Referrer, Permissions, CSP without `unsafe-inline` for scripts) | **PASS** (configuration read; live response headers NOT TESTED) |
| Local signed-webhook tests: duplicates, concurrency, delayed and out-of-order events, refunds, partial store failures | **PASS** 23/23 (`tests/certification-recovery.test.mjs`) |
| Stripe test-mode checkout, declines, 3-D Secure, refunds, invoices, entitlements | **BLOCKED** (no test keys here; checkout is frozen) |
| Email delivery, partner-registration email | **BLOCKED** (no mail credentials) |
| Microsoft connectivity and flagship agent installation | **BLOCKED** (no tenant) |
| Production environment variables, function regions, log retention, analytics/monitoring config | **BLOCKED** (Vercel API returns 403 / does not expose them) |
| Live site, DNS, email authentication (SPF/DKIM/DMARC) | **NOT TESTED** |
| Tablet viewport | **NOT TESTED** (no tablet project configured; desktop and Pixel 7 only) |
| Firefox, WebKit | **NOT TESTED** (browsers not installed here) |

The Playwright runner serves the committed `public/` folder, not the built `dist/`.

## 3. Findings

Severity: **S1** blocks the sale/launch, **S2** serious, **S3** minor. "Fixed" means fixed in #591/#592 with a test that fails without the fix.

### Fixed in this round

| ID | Finding | Sev | Repro (on origin/main) | Fix / evidence |
|---|---|---|---|---|
| R2-01 | A certificate issuance that fails inside webhook processing is lost | S1 | Make the certificate write fail once; deliver `checkout.session.completed`: answered 200, nothing queued, no certificate ever | Queue + recovery on next event / operator script; 5xx if queueing fails. W1, W2 |
| R2-02 | Refund or cancellation arriving before a delayed checkout event still ends with an active certificate | S1 | `lapseCertification('sub', 'refunded')` then deliver the checkout event | Tombstone + refused-purchase guard. W4, W5 |
| R2-03 | `invoice.paid` before checkout loses the paid-through date | S2 | Deliver invoice, then checkout | Term stash. W6 |
| R2-04 | Failure between certificate write, evidence write and holder link is never completed | S2 | Fail the evidence write or the holder-link write once | Idempotent re-issue, evidence dedupe. P tests |
| R2-05 | Reinstatement and decisions have no verified attribution | S1 for subscription launch | Reinstate with no decider; accepted | Registered FC + different IR required; intent→commit evidence; repair queue. D1–D7 |
| R2-06 | Per-process random rate-limit key | S2 | Two module instances derive different keys | Shared secret, fails closed. S1–S4 |
| R2-07 | Referrer query string stored in interest records | S3 | Referer with `?token=…` | `referrerPath` |
| R2-08 | AUD-001 regression test missing from #590 | S3 | `grep` | Restored |
| R2-09 | Buyer-facing copy still promises "register your interest" (portfolio heading, home, Token Monitor button, 36 factsheet buttons) in 8 languages while collection is closed | S2 | Survey of `public/` | Neutral wording; `tests/interest-claims.test.mjs` |
| R2-10 | Seven languages still say corrective releases reach "every licensee" | S2 | `certified-content.json` | Preliminary translations; `tests/certified-corrective-wording.test.mjs` |
| R2-11 | Partner page headlines say "10% of every sale"; its terms say eligible net revenue | S2 | Page text | Headlines aligned in 8 languages; `tests/partner-terms-consistency.test.mjs` |
| R2-12 | Changing the English source made the generator fall back to English in seven localized partner pages | S2 | Rebuild after editing | Dictionary re-keyed; guard test |

### Open — first-sale blockers (need the owner, not code)

| ID | Item | Sev | What is needed |
|---|---|---|---|
| FS-1 | Stripe test-mode E2E not run: checkout, decline, 3-D Secure, refund, invoice, entitlement, download | S1 | Test keys and written authorization; `scripts/verify-stripe-e2e.mjs`; then a human reviews the evidence |
| FS-2 | Flagship install in a real Microsoft 365 tenant not run | S1 | A test tenant and an administrator |
| FS-3 | Production secrets unverified (`DOWNLOAD_TOKEN_SECRET` is required for downloads; `ACCEPTANCE_SALT`, `INTEREST_DEDUPE_SALT` for two optional records) | S1 | Owner confirms in the Vercel dashboard |
| FS-4 | Order and recovery email delivery unverified | S1 | Mail credentials, a test inbox |
| FS-5 | Final legal and tax checks (the factsheets say checkout opens when these are complete) | S1 | Owner / counsel |
| FS-6 | WCAG 2.1 AA colour contrast: brand coral `#c65d3a` on white (4.17–4.18:1) and as text on `#fbf8f2` (3.94:1) on the React homepage and the catalogue/factsheet pages | S2 | Darken the accent for text and buttons (`#b4492a` measures 5.35:1 on white and 5.04:1 on `#fbf8f2`); procurement reviewers run these checks |

### Open — subscription-launch blockers

| ID | Item | Sev | Note |
|---|---|---|---|
| SL-1 | The decider register is empty by design: no certificate decision can be recorded | S1 | Owner registers the FC person; a qualified independent reviewer must be contracted |
| SL-2 | Disputes revoke the licence but leave the certification active | S2 | Owner decision |
| SL-3 | Nobody runs the recovery job on a schedule; it also runs opportunistically on later subscription events | S2 | Create a scheduled task for `scripts/certification-reconcile.mjs` (needs authorization); alert when `--status` shows a non-zero queue |
| SL-4 | Three certification key families have no TTL (by design); the pending record holds the buyer's email | S2 | Owner/counsel sets the retention statement; see the privacy reconciliation |
| SL-5 | Does the partner 10% apply to Continuous Certification revenue? The partner agreement page still says "refer, resell or deploy" and "rates … in your partner order" | S2 | Owner / counsel |
| SL-6 | Seven translations are preliminary and unreviewed | S2 | Native review, rows in `translation-review.md` |
| SL-7 | Privacy items 5, 9, 10, 13 and the vendor DPAs are unverified | S2 | See `cai-aud-007-privacy-reconciliation.md` |

### Optional improvements

- Make the stale `language-switch` / `unified-navigation` specs pass or delete them (20 failing, pre-existing); a failing test nobody watches hides real regressions.
- Add `x-default` hreflang to 24 pages and meta descriptions to 5 pages.
- Catalogue page on mobile: LCP 3.9 s (performance 79); defer below-the-fold cards and images.
- Add a CI step that builds before the tests; today a clean checkout fails 22 tests with a clear message.
- Add a tablet project to Playwright.

## 4. Customer experience, by role

- **First-time customer:** the product, the human-in-the-loop principle and the price per tier are clear on the pricing and factsheet pages, and "coming soon" is honest. A customer cannot buy today, and the pages say so. The one gap is a visible next step: the site now says "Ask about this agent" instead of promising a registration that does not exist.
- **Procurement director:** price, perpetual licence and the optional subscription are stated; the licence note says corrective releases need no subscription. Procurement will run an accessibility check (FS-6) and ask for the DPA and retention list (SL-4, SL-7).
- **CIO:** the customer-controlled Microsoft architecture is stated consistently. The missing proof is an installed reference (FS-2).
- **CISO:** HSTS preload, a CSP without inline scripts, signed webhooks, HMAC tokens, no remote decision endpoint, no holder data on the public certificate view. Open: production secrets (FS-3) and live header check.
- **Auditor:** certificate evidence is append-only with intent→commit records and a repair queue; decisions name registered persons by role. Open: the register is empty (SL-1), so the audit trail cannot yet record a decision.
- **Implementation partner:** the partner page now says one thing about the commission; the basis for subscription revenue is undecided (SL-5), and the partner agreement page is a skeleton that points to the order.

## 5. Commercial recommendations (no change to model, prices, architecture, CAI Score or Continuous Certification)

1. Make **Contract Intelligence & Register** the only call to action on the catalogue and home pages: one agent, one price, one guided evaluation. "Book a guided evaluation (30 min, test tenant, synthetic contracts)" is already the strongest offer on the site.
2. Put a three-line "what you need" box next to the price: Microsoft 365 plan, SharePoint library, one administrator for about half a day (confirm the duration with a real install first). Prerequisites are the first thing a CIO asks.
3. Publish the limits beside the claims: human reviewer required, no savings promised, Continuous Certification not yet open.
4. For partners, one sentence on whether commission covers the subscription, once decided (SL-5).
5. Run one real install in a design-partner tenant before the first sale; a reference is worth more than any copy change.

## 6. Reproduction commands

```
npm ci && npm run build
node --test tests/*.test.mjs
npx vitest run && npm run lint && npm run qa:static
node scripts/run-playwright-static.cjs tests/e2e/full-site-qa.spec.ts --project=chromium-desktop
node --test tests/certification-recovery.test.mjs       # failure-injection suite (23)
node scripts/certification-reconcile.mjs --status       # operator view of the issuance queue
```
