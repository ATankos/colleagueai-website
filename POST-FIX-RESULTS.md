# POST-FIX RESULTS — branch `golive-fixes` (2026-06-12)

Applied per approval; checkout values deferred and royalty rule = one-time-only (your choices).
Everything below re-verified by re-running the harness after the changes.

## What was fixed (and proven)

| Fix | Was | Now | Evidence |
|---|---|---|---|
| i18n engine (FIXES §2: ORDER/NAMES, I18N scope, missing `window.T`, stray `}`) | Crashes; all locales render EN | Dropdown 8 locales, `?lang=cs` renders Czech, switching works | dom-smoke #7/#8 ok (`tests/results/dom-smoke-postfix.txt`) |
| Encoding (§6, ftfy `fix_encoding` — wording unchanged, incl. CAI Score copy) | 1,793 mojibake sequences, corrupt `<title>` | 0 in all 8 dictionaries + clean title; partners/index were already clean | `tests/results/i18n-postfix.txt` |
| Webhook idempotency (§4) | Double-credit on redelivery & per-session | `SET NX` claims on event.id + session.id; duplicates acked, never credited | webhook tests 3a/3b ok (15/15, `tests/results/webhook-postfix.txt`) |
| KV failure path (§4) | 200 returned, sale silently lost | 5xx + claim release → Stripe retries; retry credits exactly once | tests 7 + new 9 ok |
| Accreditation gate (§4) | Any string earned 20% | Only registered partner codes credit; unknown logged + withheld | test 8 ok |
| Ref sanitization (§4) | 5KB ref w/ control chars stored raw | `^[A-Za-z0-9_-]{1,64}$` or dropped | test 5c ok |
| Royalty rule (§4) | Implicit | Documented in code: one-time only; renewals intentionally uncredited; regression-tested | test 4b ok |
| Attribution on Book-a-call (§9) | Partner param stripped | Preserved through the scheduler fallback | dom-smoke #4 ok |
| Crawlable CTAs (§1-static) | `href="#"` on nav/hero/logo/pay CTAs | Real URLs in static HTML (only the 3 payment-gated downloads remain `#` by design) | headers-audit clean |
| Canonicals (§5) | Non-www root on every catch-all route | `index.html` self-canonical `/demo` (its only route now); www everywhere | headers-audit C1/C2 |
| Soft-404s (§3-partial) | Every path → 200 + marketplace | Catch-all removed; real `404.html` (noindex) with 404 status | headers-audit P0/I2 |
| Structured data (§8) | No Product schema; Org only on /agents | ItemList of 36 Product nodes on /agents; Org JSON-LD on /demo + /partners; titles categorized | headers-audit S1/S3 ok |
| `og:locale:alternate` (§7-partial) | only `cs` | all 7 alternates | grep |
| Sitemap (§3-partial) | Listed non-existent pages | Only live pages (`/agents`+8 hreflang, `/partners`) until trust/legal exist | headers-audit SM* ok |

Harness totals after fixes (local replica): **headers-audit 4 FAIL (was 34)** · webhook **15/15** (was 9/14) · dom-smoke **7/8** (was 3/8) · i18n mojibake **0/8 locales** (was 8/8) · secret scan clean.

## Still open (deliberately — they need you, counsel, or content)

1. **Checkout values** (Critical): price + Stripe TEST-mode Payment Link → FIXES §1. dom-smoke #2 stays red until then.
2. **Legal pages + Trust Center** (Critical/Medium): `/terms /license /privacy /trust` now honestly 404 (noindex) instead of serving duplicate shells. English drafts from counsel → drop into `public/` (rewrites already in place), re-add to sitemap. The purchase modal links to `/license` — blocking for any sale.
3. **/demo prerender** (Critical for GEO): still a JS shell (275 bytes no-JS). FIXES §3.
4. **Locale-route migration** (High): locale URLs still serve EN bytes with `/agents` canonical — correct only as an interim. FIXES §7 plan + effort.
5. **foot_legal translations** (counsel): untouched per constraints. FIXES §10.
6. **CSP `unsafe-inline`** (Medium): defer until prerender work. FIXES §11.
7. **Deploy + external re-check**: production still runs the old build. After deploying this branch:
   `BASE_URL=https://www.colleagueai.ai node tests/audit-headers.mjs`
   `BASE_URL=https://www.colleagueai.ai npx playwright test -c tests/e2e/playwright.golive.config.js`
   `npm run lhci`

## How to apply

```bash
git fetch <this-patch>            # or: git am golive-fixes.patch on a clean main
git diff main golive-fixes        # review
# merge → Vercel preview deploy → re-run the two commands above against the preview URL → promote
```
