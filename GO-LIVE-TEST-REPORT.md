# GO-LIVE TEST REPORT — colleagueai.ai

Date: 2026-06-12 · Harness: `tests/` (this repo) · Targets: production `https://www.colleagueai.ai` + local replica of `vercel.json` routing over a fresh `npm run build`
Mode: **report-only** — no fixes applied, no deploys, nothing modified. Proposed diffs: `FIXES.md`.

## Executive summary

| Severity | FAIL count |
|---|---|
| **Critical** | **7** |
| **High** | **10** |
| **Medium** | **6** |
| Blocked (needs access/browser) | 5 |

**Exit criteria (0 Critical, 0 High, <5 Medium): NOT MET → NO-GO.**

The two findings that change the picture most are **new** (not in the 2026-06-12 external audit):

1. **The entire i18n engine crashes on load** (`ReferenceError: ORDER is not defined` in the language script of `public/agents.html`). The crash happens *before* `applyLang()` is called, so the language dropdown is never populated, `?lang=` is ignored, and **all 7 non-EN locale URLs render English for every user and every crawler**. The full 8-language translation investment (230 UI keys + 36 agents × 7 locales, verified present and key-complete) is currently unreachable by anyone. A second, independent `SyntaxError` (stray `}`) kills the Czech agent-content block even if the first bug is fixed.
2. **The flagship page ships mojibake.** `public/agents.html` contains 1,793 double-encoded UTF-8 sequences — including in the `<title>` tag (`Catalogue â€” Certified…`), every em-dash, every check-mark, and 850 sequences in the Czech dictionary. Every visitor and every search snippet sees corrupted text.

The audit's two CRITICAL revenue findings are confirmed and extended: checkout is dead (no price, no payment links, `/checkout` is not a route), and the Stripe webhook would lose money in three independent ways once checkout *is* live (double-crediting on retries, HTTP 200 on storage failure = silent royalty loss, no accreditation gate).

## Results table

Result key: P=PASS, F=FAIL, B=BLOCKED. Evidence: `tests/results/*` + file:line pointers.

| ID | Phase | Test | Locale | Result | Sev | Evidence |
|---|---|---|---|---|---|---|
| 0.5-1 | 0.5 | Dead checkout: price + CTA | en | **F** | Critical | prod fetch: Price field empty, CTA `(#)`; `public/agents.html:2608` `price:null`, `:2611` `paymentLinks:{}`; dom-smoke #2,#6 |
| 0.5-2 | 0.5 | "Book a call" `href="#"` | all | **F (partial)** | Critical→High | Static HTML `#` at `agents.html:1852,1871` (dead for crawlers/no-JS). JS fallback (`:2802`) rewrites to `/demo`, so JS users are OK — but the rewrite **drops partner attribution** (dom-smoke #4) |
| 0.5-2b | 0.5 | Inventory of all `href="#"` | en | done | — | 8 total in agents.html: logo×2 (intentional, should be `/agents`), nav-call+hero-call (JS-patched), `d-doc` (JS-patched to PDF), `d-cs`/`d-m365` (payment-gated, dead while checkout dead), `pay-cta` (**dead CTA**) |
| 0.5-3 | 0.5 | Deliverable links `#` | en | **F (partial)** | High | `d-doc` set by JS to `/docs/agents/<slug>.pdf` — slug-named PDFs exist in repo (72 files, both naming schemes). `d-cs`/`d-m365` unlock only after payment → dead until 0.5-1 fixed. All three are `#` for crawlers |
| 0.5-4 | 0.5 | No-JS shell routes | — | **F** | Critical | `/demo`, `/trust`, `/terms`, `/privacy`, `/license` (+ deployed `/partners`) serve 261 bytes of text, no real content — headers-audit P1; prod fetch identical |
| 0.5-5 | 0.5 | Canonical chaos | — | **F** | High | SPA shell declares `canonical: https://colleagueai.ai/` (→ 30x redirect) on every catch-all route; locale URLs canonicalize to `/agents` not self — headers-audit C1/C2 |
| 0.5-6 | 0.5 | i18n inline architecture | — | **F** | High | `agents.html` = 606,267 B raw / 166,699 B gzip, all 8 locales inline in the EN page; locale URLs exist but serve EN bytes; `og:locale:alternate` lists only `cs` |
| 0.5-7 | 0.5 | FAQ/Org structured data | en | **P (not reproduced)** | — | `/agents` emits ONE valid JSON-LD `@graph`: Organization, WebPage/CollectionPage, BreadcrumbList, DefinedTerm, FAQPage (parsed, not grepped). Absent on every other route; **no Product schema** (→ H-6) |
| 0.5-8 | 0.5 | Trust Center exists | — | **F** | Medium | Referenced 16× in copy + listed in sitemap; `public/trust.html` does not exist; `/trust` serves SPA shell |
| 0.5-9 | 0.5 | robots/sitemap | — | **P/B** | — | robots.txt OK (allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended; sitemap ref). Sitemap exists but unhealthy (SM-findings). GSC/Bing submission: **BLOCKED** (needs Search Console access) |
| H1-H6 | 1 | Security headers | — | **P** | — | All present in `vercel.json` + local replica: HSTS 63072000 preload, CSP, nosniff, XFO, Referrer-, Permissions-Policy. Production raw-header verification: **B** (re-run: `BASE_URL=https://www.colleagueai.ai node tests/audit-headers.mjs`) |
| H2b | 1 | CSP without unsafe-inline | — | **F** | Medium | `script-src 'unsafe-inline'` + `style-src 'unsafe-inline'` (`vercel.json`) |
| I1/I2 | 1 | No noindex anywhere | all | **P** | — | No `x-robots-tag`, no meta noindex on any route (local + prod fetches). The "site absent from search" cause is 0.5-4/0.5-5/M-3, not noindex |
| C1 | 1 | Self-canonical on www | 10 routes | **F×7** | High | headers-audit.json: `/demo,/trust,/terms,/privacy,/license` → `https://colleagueai.ai/`; `/cs/agenti,/de/agenten` → `/agents` |
| C2 | 1 | Canonical not into redirect | — | **F** | High | `https://colleagueai.ai/` → HTTP 30x `/agents` |
| P1 | 1 | Prerendered (>2KB + H1, no JS) | 10 routes | **F×5** | Critical | textBytes=261 on the 5 shell routes; `/agents` + locale routes = 17,062 B ✓ |
| T1 | 1 | Title brand+category | 10 routes | **F×6** | High | Shell routes: `Colleague AI — AI agents you can actually deploy` (bare-brand-led; loses the name-collision fight); `/partners`: no category term |
| S1/S3 | 1 | Org JSON-LD sitewide, Product on store | — | **F** | High | Org JSON-LD only on `/agents`; Product JSON-LD nowhere |
| M1 | 1 | No mojibake | all | **F** | High | 1,793 double-encoded sequences in served `/agents` HTML incl. `<title>`; per-locale dicts: cs=850, fr=578, pt=237, es=194, it=121, en=77, de=74, pl=73 |
| L1 | 1 | hreflang 8+x-default | locale routes | **P** | — | All present on agents.html |
| R1-R4 | 1 | robots.txt | — | **P** | — | see 0.5-9 |
| SM1-SM4 | 1 | sitemap health | — | **F** | High | `/trust`,`/terms`,`/privacy` in sitemap serve SPA shells (SM4 textBytes=261); `/license` + `/partner-agreement` missing from sitemap; root `https://colleagueai.ai/` 30x (SM3) |
| SEC | 1 | No secrets in build output | — | **P** | — | `tests/scan-bundle.mjs`: 0 hits across dist (sk_live/sk_test/whsec/rk_/upstash-token/sk-ant patterns) |
| W-1a/b/c | 2 | Signature enforcement | — | **P** | — | no-sig→400, bad-sig→400, valid→200; raw body verified before parse (`bodyParser:false`) — `tests/results/webhook-run.txt` |
| W-2 | 2 | Replay tolerance | — | **P** | — | 600s-old timestamp rejected 400 (default 300s tolerance) |
| W-3a | 2 | Idempotent on event.id | — | **F** | Critical | Same `event.id` twice → 2 commission writes, salesCount=2 (no `event.id` ledger) |
| W-3b | 2 | No double-credit per session | — | **F** | Critical | 2 events, same `cs_` session → salesCount=2, totalEarned doubled |
| W-4a | 2 | One-time credit rule | — | **P** | — | 20% of amount_total credited once. **Coded royalty rule:** flat `PARTNER_COMMISSION_RATE` (default 0.20) × `amount_total`, on `checkout.session.completed` only |
| W-4b | 2 | Recurring revenue rule | — | **F (finding)** | High | `invoice.paid` ignored → **subscription renewals are silently uncredited**. (No double-credit on renewals — the opposite bug.) If only one-time sales are intended, document it; the code cannot credit a recurring product |
| W-5a/b | 2 | Attribution present/absent | — | **P** | — | partner→record incl. session id; absent→clean entitlement, no partner writes |
| W-5c | 2 | Malformed/oversized ref | — | **F** | Medium | 5,011-char ref with `<>"\n` stored raw as KV key/record (client truncates at 64; webhook trusts metadata blindly) |
| W-6 | 2 | Unknown event types | — | **P** | — | `customer.created` → 200, zero KV writes |
| W-7 | 2 | KV failure path | — | **F** | Critical | KV 500 → handler returns **200** (`api/webhook.js:71-74`) → Stripe never retries → entitlement + royalty silently lost. The in-code comment says the opposite of what 200 does |
| W-8 | 2 | Accreditation gating | — | **F** | High | No gate exists: unknown code `CAI-NEVERSEEN` got a commission stub (`lib/db.js:recordCommission` "create a stub so we never lose a sale") |
| I18N-1 | 3 | Key parity 8 locales | all | **P** | — | 230 keys (spec said 229 — actual reported) ×8, no missing/extra/empty |
| I18N-2 | 3 | EN-leakage | non-EN | **P** | — | 1–2 identical values per locale (allowlisted terms) |
| I18N-3 | 3 | Compliance claims | all | **P** | — | 0 hits for SOC2/ISO27001/etc. self-claims in any language. Site uses "EU AI Act · DORA · ISO/IEC 42001 **aligned**" — accurate wording, not a certification claim |
| I18N-4 | 3 | Legal not translated | non-EN | **F (review)** | High | `foot_legal` (≈610-char licence notice) IS translated in all 7 locales. It links to the EN `/terms`. Per spec this is a High finding for counsel review — **report-only, nothing touched** |
| I18N-5 | 3 | AGENTS_* parity | non-EN | **P** | — | 36/36 agents translated in all 7 dictionaries (content exists; runtime can't load it — see E-7/E-8) |
| E-1 | 4 | Zero console errors | all | **F** | Critical | jsdom: `ReferenceError: ORDER is not defined` (also `NAMES` and `window.T` undefined — each appears only at use-sites) + `SyntaxError: Unexpected token '}'` (AGENTS_CS block) — both reproduce in ANY browser |
| E-7 | 4 | Language switcher | all | **F** | Critical | dom-smoke #7: dropdown has 0 options; `?lang=cs` renders English (`applyLang(init)` unreachable after the throw) |
| E-8 | 4 | All inline scripts parse | — | **F** | Critical | dom-smoke #8: script#12 (`var AGENTS_CS={...}}` — stray `}` at EOF, `agents.html` line ~2806 block end) |
| E-3 | 4 | Real price shown | all | **F** | Critical | = 0.5-1 |
| E-4 | 4 | Demo CTA resolves | all | **P (JS)/F (attribution)** | High | resolves to `/demo`, but partner param is stripped by the later-running fallback script (dom-smoke #4) |
| E-5 | 4 | Stripe checkout page opens | en | **B** | — | No payment link configured (0.5-1) — nothing to open; also no browser in sandbox |
| E-6 | 4 | `?partner=` journey | en+de | **P (capture)/F (handoff)** | Critical | Capture+persistence+64-char truncation verified (dom-smoke #3,#5). Checkout handoff untestable while checkout is dead; nav/hero links lose it |
| E-8b | 4 | 404 page in-locale | all | **F** | Medium | Catch-all returns 200 + marketplace for any garbage path (soft-404; no 404 page exists) |
| LH | 4 | Lighthouse ≥90 ×4 | en | **B** | — | No Chrome in sandbox. Re-run: `npm run lhci` or commands below |
| E2E | 4 | Playwright vs production | all | **B** | — | Browser download blocked by sandbox allowlist. Suite delivered: 44 tests. Re-run command below |

## Findings detail (each FAIL → fix pointer in FIXES.md)

**F-01 · Critical — Checkout is dead.** `STORE.price=null`, `paymentLinks:{}`, `checkoutBase` points at `/checkout` which is not a route (falls into the SPA catch-all), `schedulerUrl` is the literal string `YOUR_SCHEDULER_URL`. Why it matters: the product cannot take money. → FIXES §1

**F-02 · Critical — i18n engine crashes; translations unreachable.** Three independent defects in the language script: `ORDER`/`NAMES` (dropdown) never defined; `I18N` scoped inside `applyLang` but read outside it; and `window.T` — the translation lookup with 10 call sites — does not exist anywhere in the file. The first throw prevents `applyLang(init)`; even if reached, every lookup would throw. A minimal repair was validated in the harness (see FIXES §2). Why it matters: 7 locales × (230 keys + 36 agents) of paid translation work is invisible to 100% of users. → FIXES §2

**F-03 · Critical — AGENTS_CS block has a stray `}`.** The whole script block fails to parse, so Czech agent content can never load even after F-02 is fixed. → FIXES §2

**F-04 · Critical — Five routes are JS-only shells.** `/demo /trust /terms /privacy /license` (and deployed `/partners`) return 261 bytes of text to non-JS clients. Why it matters: invisible to Google's first-pass crawl and to GPTBot/ClaudeBot/PerplexityBot (none execute JS) — this, not noindex, is the likely reason the site is absent from search; it defeats the GEO strategy. → FIXES §3

**F-05 · Critical — Webhook double-credits on redelivery.** Stripe redelivers events (retries, network flaps); each redelivery of the same `event.id` writes a new commission. → FIXES §4

**F-06 · Critical — Webhook returns 200 when KV write fails.** Stripe treats 200 as success and never retries; the sale's entitlement and the partner's royalty are silently gone. → FIXES §4

**F-07 · Critical — Legal pages do not exist.** The purchase modal requires accepting "licence terms" that link to `/license` → SPA shell; footer Terms, sitemap'd `/terms` and `/privacy` likewise. Selling against non-existent terms is a go-live blocker independent of SEO. → FIXES §3

**F-08 · High — Canonical chaos.** Shell routes declare `https://colleagueai.ai/` (which 30x-redirects); locale URLs canonicalize to `/agents` instead of self. One host (www) + self-referencing canonicals required. → FIXES §5

**F-09 · High — Sitewide mojibake (1,793 sequences).** Double-encoded UTF-8 in the served HTML, including the `<title>`. Customers see `â€”`; SERP snippets too. The CS dictionary alone has 850 corrupt sequences. → FIXES §6

**F-10 · High — No accreditation gate on commissions.** Any string in `metadata.partner` earns 20%. Combined with client-side code generation, anyone can self-refer. → FIXES §4

**F-11 · High — Subscription renewals never credited.** Coded rule pays only on `checkout.session.completed`. If any recurring product is sold, partners are silently shorted from month 2. State the intended rule, then implement it. → FIXES §4

**F-12 · High — i18n architecture defeats SEO.** (a) 606 KB raw / 163 KB gzip HTML payload carrying all 8 locales to every visitor; (b) locale URLs serve EN bytes → hreflang clusters point at duplicates, no non-EN page can rank; (c) `og:locale:alternate` lists only `cs`. → FIXES §7 (migration plan + effort)

**F-13 · High — Structured data coverage.** Organization JSON-LD only on `/agents`; no Product JSON-LD anywhere on a store. (The audit's "no structured data at all" is corrected: `/agents` has a valid, rich `@graph` incl. FAQPage.) → FIXES §8

**F-14 · High — Sitemap lists shells, omits real pages.** `/trust`,`/terms`,`/privacy` are shells; `/license` (linked from the purchase modal!) and `/partner-agreement` absent. → FIXES §3/§5

**F-15 · High — Attribution dropped on primary CTAs.** The scheduler-fallback script runs after the partner-append script and overwrites `nav-call-link`/`hero-call-link` with a clean `/demo` URL — referred demo bookings lose their partner. → FIXES §9

**F-16 · High — Bare-brand titles on shell routes.** `Colleague AI — AI agents you can actually deploy` everywhere the SPA answers; loses the SERP against the unrelated edtech "Colleague AI". → FIXES §3 (prerender) + §5

**F-17 · High (counsel review) — Translated legal wording in footers.** `foot_legal` is translated in 7 locales (~610 chars of licence terms). Per policy legal stays English-only; report-only, no content touched. → FIXES §10

**F-18 · Medium — CSP allows `unsafe-inline`.** Grader ceiling ≈ A-; nonce/hash migration needed (large: the site relies on inline scripts). → FIXES §11
**F-19 · Medium — Soft-404s.** Any path returns 200 + marketplace. → FIXES §3
**F-20 · Medium — Trust Center missing.** Referenced 16×, sitemap'd, doesn't exist. → FIXES §3
**F-21 · Medium — Webhook stores malformed refs raw.** 5KB ref with control chars accepted into KV. → FIXES §4
**F-22 · Medium — `og:locale:alternate` only `cs`.** → FIXES §7
**F-23 · Medium — Deployed config older than repo.** Production `/partners` is a shell although `partners.html` + rewrite exist in repo → next deploy changes behaviour; deploy + retest before judging those routes. (Repo wins; noted per instructions.)

## BLOCKED items — what's needed

| Item | Needs |
|---|---|
| Production raw response headers + securityheaders.com A/A+ | Run `BASE_URL=https://www.colleagueai.ai node tests/audit-headers.mjs` from any machine (1 min) |
| GSC / Bing sitemap submission status | Search Console + Bing Webmaster access |
| Playwright E2E vs production (44 tests) | Any machine with `npx playwright install chromium` (sandbox network allowlist blocked the browser download) |
| Lighthouse ≥90 ×4 (mobile+desktop, 3 pages) | Same machine; `npm run lhci` (config already in repo) |
| Live Stripe Checkout page render (E-5) | Blocked by F-01 itself — configure a TEST-mode payment link first; the harness test exists and will not complete a payment |

## Re-run

```bash
npm ci && npm run build

# Phase 1 — headers/SEO (prod)        # or local: node tests/local-server.mjs 4173 &
BASE_URL=https://www.colleagueai.ai node tests/audit-headers.mjs
node tests/scan-bundle.mjs                                   # secret scan of dist/

# Phase 2 — webhook (fully local, fake KV, signed test payloads, no live Stripe)
node --test tests/webhook.test.mjs

# Phase 3 — i18n integrity (local, parses inline dictionaries)
node tests/audit-i18n.mjs

# Phase 4 — DOM smoke (no browser needed) + full E2E + Lighthouse
node --test tests/dom-smoke.test.mjs
npx playwright install chromium
BASE_URL=https://www.colleagueai.ai npx playwright test -c tests/e2e/playwright.golive.config.js
npm run lhci
```

Machine-readable evidence: `tests/results/headers-audit.json`, `tests/results/webhook-run.txt`, `tests/results/dom-smoke-run.txt`.
