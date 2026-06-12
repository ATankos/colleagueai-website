# ROADMAP — remaining gaps after the go-live fix rounds

Status date: 2026-06-12. Done so far: see `POST-FIX-RESULTS.md` (round 1) and the
`additional-improvements` commit (round 2: per-agent pages, security.txt, llms.txt,
KV rate limit, CI). Items below need a decision, content, or external access — ordered
by revenue impact.

## Blocking revenue (do first)

1. **Checkout values** — decide pricing model (visible price vs request-access), create
   Stripe TEST-mode Payment Links per agent with `agent_slug` metadata, fill `STORE` in
   `public/agents.html` (FIXES.md §1). Then run one full test-mode purchase:
   checkout → webhook → entitlement in KV → `/api/download` returns a signed URL.
   *Gap found in audit: no `connect-package.zip` artifacts confirmed in R2 — upload them
   per slug before the first sale.* (You. ~half a day once prices are decided.)
2. **Post-purchase UX** — Payment Link success-page redirect + transactional email telling
   the buyer how to download (email+slug → /api/download). (1 day.)
3. **Legal pages** — `/terms`, `/license`, `/privacy` from counsel (English-only by policy),
   drop into `public/` (rewrites exist), re-add to sitemap. The purchase modal links to
   `/license`, so this gates any sale. Include the `foot_legal` translation decision
   (counsel REVIEW item from the i18n audit). (Counsel + 1 hour.)

## Trust & credibility

4. **Trust Center** (`/trust`) — referenced 16× in copy; needs real content: CAI methodology
   summary, security posture, subprocessor list, data-flow diagram. (Copy: 1–2 days.)
5. **Consent/privacy review** — Sentry `sendDefaultPii: true` + session replay for EU
   traffic likely needs a consent banner or `sendDefaultPii: false`. (Counsel question.)
6. **Partner programme terms** — payout threshold/schedule unspecified; partner dashboard
   (`/api/partner-stats` + simple page) so partners can see earnings. (1–2 days.)

## SEO / GEO

7. **Locale-route migration** — per-locale prerendered pages with self-canonicals +
   hreflang (FIXES.md §7). Until then locale URLs serve EN bytes. (2–3 days. Engine and
   encoding fixes already landed, so this is now purely a build-script task.)
8. **/demo prerender** — static frame with H1/copy/FAQ, hydrate the interactive part.
   Last JS-shell route. (0.5–1 day.)
9. **Search console** — submit sitemap in Google Search Console + Bing Webmaster after the
   fixes deploy; verify indexing of the 36 new agent pages. (You; needs account access.)
10. **CSP hardening** — replace `'unsafe-inline'` with build-time hashes once prerendering
    settles (FIXES.md §11). Target securityheaders.com A+. (1 day.)

## Engineering hygiene

11. **Legacy SPA tests** — 2 pre-existing vitest failures (language toggle in the React
    marketplace, which is no longer user-facing). Fix or delete; then remove
    `continue-on-error` from the vitest step in `.github/workflows/ci.yml`.
12. **KV backup/runbook** — entitlements + commissions live only in Upstash; document
    export/restore (RECOVERY.md exists — extend it to cover KV).
13. **dom-smoke #2** — flips green automatically when item 1 lands; then remove its
    `continue-on-error` in CI too.

## Definition of done for go-live

0 Critical / 0 High in `tests/` harness vs the production URL, one completed test-mode
purchase with entitlement + commission verified, legal pages live, Lighthouse ≥90 ×4
(already passing locally), sitemap submitted.
