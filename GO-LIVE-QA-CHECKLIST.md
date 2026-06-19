# Go-Live QA Checklist — ColleagueAI

Run this before every production deploy. The automated gates catch the defects that have
actually hit this site (raw code leaking onto the page, broken nav, dead `/demo`); the manual
pass covers what a machine can't judge (does it *look* right, does the flow make sense).

> Rule of thumb: **do not merge to `main` (which auto-deploys) until every automated gate is green
> and the manual smoke pass is done on a Vercel Preview URL.**

---

## 1. Automated gates — run these first

From `C:\Users\alexa\Documents\colleagueai-website` in PowerShell:

```powershell
npm run lint                              # code style / obvious errors
npm run test:run                          # unit tests (vitest)
node --test tests/webhook.test.mjs        # Stripe webhook security + idempotency (15 tests)
node tests/integrity-check.mjs            # NEW: static HTML integrity (would have caught the analytics bug)
npm run build                             # production build must succeed
npx playwright install                    # one-time: download browsers (first run only)
npx playwright test golive.spec.js        # NEW: real-page nav / demo / locales / no-leaked-code
```

All six must pass. `npm run check:full` runs lint + unit + all e2e + Lighthouse in one shot once you're set up.

- [ ] `npm run lint` clean
- [ ] `npm run test:run` green
- [ ] `node --test tests/webhook.test.mjs` → 15/15
- [ ] `node tests/integrity-check.mjs` → "Integrity check PASSED"
- [ ] `npm run build` succeeds
- [ ] `npx playwright test golive.spec.js` green (desktop + mobile projects)

---

## 2. Navigation (manual — desktop + a real phone)

- [ ] Desktop top nav: all 8 links (Philosophy, The Score, Catalogue, How they fit, ROI, Deployment, Readiness, FAQ) scroll to the right section.
- [ ] Active-section underline (terracotta) tracks as you scroll.
- [ ] Header stays sticky and gains its hairline shadow after scrolling.
- [ ] Logo returns to the top / `/agents`.
- [ ] **Mobile**: the hamburger appears; tapping opens the drawer; every section link + "Try it live" + "Book a call" is present; tapping a link scrolls and closes the drawer.
- [ ] Language selector switches copy (EN → CS/DE/FR/ES/IT/PL/PT) and nav labels update.
- [ ] "Skip to content" link works with the keyboard (Tab on load, Enter).
- [ ] Every localized page (`/de/agents`, `/fr/agents`, …) shows the same working nav + drawer.

## 3. Core functionality (manual)

- [ ] `/demo` loads the interactive demo (not a stuck loading shell); the flight-advisor reasoning runs.
- [ ] ROI calculator: change headcount / cost / sliders → outputs (money saved, hours, FTE, ROI, payback) update and are never `NaN`.
- [ ] Catalogue filter: pillar + tier filters narrow the agent grid; "All / Any" restores it.
- [ ] Opening an agent shows its detail (modal/panel) with the dossier link.
- [ ] Readiness quiz: answering the questions produces a maturity result.
- [ ] All CTAs ("Book a call", "Try it live", "Request access") go to `/demo`; partner CTAs go to `/partners`.
- [ ] Checkout stays **gated** (paid checkout disabled) — confirm the launch-readiness gate copy is shown.

## 4. Content & markup integrity

- [ ] No raw code, `{{ }}` placeholders, or `undefined` visible anywhere (the integrity check + e2e cover this — eyeball the hero, footer, and bottom of `/agents`).
- [ ] No broken images; favicon and OG image load.
- [ ] Footer links (Terms, Licence, Trust, Privacy, Partners) all resolve.
- [ ] Spot-check one localized page for untranslated English leaking through.

## 5. SEO & crawlability

- [ ] `robots.txt` ends with `Sitemap: https://www.colleagueai.ai/sitemap.xml`.
- [ ] `sitemap.xml` loads and lists the agent + locale URLs.
- [ ] `/agents` and `/demo` each return real, indexable HTML (view-source shows content, not just an empty `#root`).
- [ ] Canonical + hreflang tags present on localized pages.

## 6. Security & payments

- [ ] Webhook fails closed: a `checkout.session.completed` with **no `agent_slug`** withholds entitlement (covered by `webhook.test.mjs`). When you enable paid checkout, every Stripe payment link MUST set `agent_slug` metadata.
- [ ] Security headers present in production (CSP, HSTS, X-Frame-Options) — `vercel.json`.
- [ ] No secrets in the client bundle (`node tests/scan-bundle.mjs` if present).

## 7. Performance & accessibility

- [ ] `npm run lhci` (Lighthouse) — performance/SEO/best-practices/a11y within budget.
- [ ] `npx playwright test a11y.spec.js` passes (axe checks).
- [ ] Page is usable at 360 px width with no horizontal scroll.

## 8. Deploy & verify

- [ ] Push the branch → open a PR → check the **Vercel Preview URL** (re-run the manual smoke pass there).
- [ ] Merge the PR (this is what deploys `main`).
- [ ] After deploy, hard-refresh production (`Ctrl+Shift+R`) and re-verify `/agents`, `/demo`, and one localized page.
- [ ] `npm run smoke:prod` (production smoke test) green.

---

### What's automated vs. manual

| Area | Automated by | 
|---|---|
| Tag balance / leaked code / orphaned tags / anchors | `tests/integrity-check.mjs` |
| Nav, mobile drawer, scroll-spy, demo mount, locales, no-console-errors | `e2e/golive.spec.js` |
| Webhook security + idempotency | `tests/webhook.test.mjs` |
| Accessibility | `e2e/a11y.spec.js` |
| Diacritics / localization | `e2e/diacritics.spec.js`, `e2e/localization-all-languages.spec.js` |
| Visual regression | `e2e/visual.spec.js` |
| Production smoke | `e2e/prod-smoke.spec.js` (`npm run smoke:prod`) |

Everything else above is a human judgment call — keep it on the list.
