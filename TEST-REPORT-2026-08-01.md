# ColleagueAI — Consolidated Test Report

**Date:** 1 August 2026
**Environment:** production, `www.colleagueai.ai`, deployment `dpl_k7kKEks…` (merge of PR #283)
**Scope:** functionality, QA, UAT journeys, UX, design, accessibility, security, cybersecurity posture, abuse/fraud, AI surface, SEO/GEO

---

## Summary

**3 defects found.** One I introduced and should fix, one cost/security risk that predates this work and matters most, one accessibility failure affecting every page.

| # | Finding | Severity | Origin |
|---|---------|----------|--------|
| 1 | `/api/demo-agent` is unauthenticated and its spend cap cannot be enforced | **High** | Pre-existing |
| 2 | Partner pages still describe a code generator that no longer exists | **Medium** | Introduced today |
| 3 | Primary CTA fails WCAG AA colour contrast (4.18:1) | **Medium** | Pre-existing |

Everything else tested clean. Details and evidence below.

---

## 1. Functionality, QA and scripted UAT

**Result: pass.**

| Check | Result |
|---|---|
| Live URLs tested across 8 languages | **58/58 returned 200** |
| Pages crawled for link integrity | 149 |
| Dead in-page anchors | **0** |
| Broken internal links | **0** (see note) |
| Repo validators | **5/5 pass** |
| `journey.test.mjs` | **17/17 pass** |
| `locale-smoke` / `audit-i18n` / `integrity-check` | pass |
| `dom-smoke` | 7/8 — the failure is `STORE.price is null`, a known issue marked `continue-on-error` in CI |

*Note on broken links:* the static crawl initially flagged 24 links to `/agents/<slug>` on the localised homepages. These are generated into `dist/` at build time rather than committed, and all three resolve **200 on production**. Not a defect.

Also verified live: the language switcher keeps the reader on the same page across locales (`/pricing` → `/de/preise` → `/cs/cenik`), and the new email CTAs render correctly localised on `/pricing`, `/de/preise` and `/cs/partneri`.

---

## 2. Defect 1 — `/api/demo-agent` spends your Anthropic budget without a working cap

**Severity: high. This is the most important finding in the report.**

`api/demo-agent.js` is a publicly reachable `POST` endpoint with **no authentication**. Each call invokes `claude-haiku-4-5` at `max_tokens: 1024`, billed to `ANTHROPIC_API_KEY`.

It has two protection layers, and neither works right now:

```js
const HAS_KV = Boolean((process.env.KV_REST_API_URL || …) && (process.env.KV_REST_API_TOKEN || …));
```

`HAS_KV` is **false**, because you chose not to configure the datastore. So it falls back to:

```js
const requestLog = new Map();     // per-IP, 10 requests / 60s
let totalCalls = 0;               // global daily cap, DEMO_MAX_CALLS = 500
```

Both live in the **memory of a single serverless instance**. Vercel creates instances on demand and discards them, so every cold start resets the per-IP window *and* the daily counter to zero. The 500-call cap is per-instance, not per-day. Under concurrency the effective ceiling is unbounded.

To be fair to the code, the KV path was written to fail closed — it returns `true` (rate-limited) if the store errors. That instinct was right. The gap is the *no-KV* path, which was presumably written for local development and is now what production runs.

**Mitigating factor:** nothing on the site calls this endpoint any more — the flight-advisor demo it served was replaced with the "coming soon" page. It is reachable only by someone who finds the URL. That is obscurity, not a control.

**Recommendation:** delete `api/demo-agent.js` and remove `ANTHROPIC_API_KEY` from Vercel. It serves no live feature, and deleting it removes both the spend risk and an unused API credential from your attack surface.

Two other routes are now also uncalled and could go at the same time:

- `api/lead.js` — the forms that called it were removed today
- `api/partner-register.js` — the button that called it was removed today; note it has **no authentication and no rate limiting**, so if you ever enable the datastore it becomes an open write endpoint

---

## 3. Defect 2 — partner pages describe a feature that no longer exists

**Severity: medium. I introduced this today and it should be fixed.**

Removing the dead "generate your partner code" widget left the surrounding copy intact on all 9 partner pages. The buttons work — they now point at the email application CTA — but the text still promises the removed behaviour:

- *"Use this page to register interest and **generate an initial partner reference**."*
- Step 01 of *How it works*: *"**Enter your name and email.** Your unique partner code is derived cryptographically from your email, deterministic, so you can always regenerate the same link. **30 seconds**"*
- Step 02 depends on step 01: *"Share it — send the link to clients…"*

A partner reading this looks for a form that isn't there. The three-step "how it works" narrative is now inaccurate in all 8 languages.

**Recommendation:** rewrite steps 01–02 and the interest box to describe the email route. This needs a copy decision from you plus 7 translations — say the word and I'll do it.

---

## 4. Defect 3 — primary CTA fails WCAG AA contrast

**Severity: medium. Affects every page on the site.**

The terracotta CTA button, white text on `#C65D3A`:

| Pair | Ratio | WCAG AA (4.5:1 for normal text) |
|---|---|---|
| White on `#C65D3A` (current) | **4.18:1** | **fail** |
| White on `#BC5837` (5% darker) | 4.58:1 | pass |
| White on `#A94A2C` (your existing hover colour) | 5.67:1 | pass comfortably |

Button text is 15px semibold, which is below the "large text" threshold (18.66px bold), so the 3:1 allowance does not apply.

The cheapest fix is to make the resting state your current hover colour, or `#BC5837` if you want to preserve more of the original hue. Either is a one-line CSS change.

Body text is fine: `#2B2A28` on `#F5F0E8` is **12.64:1**.

---

## 5. Security and cybersecurity posture

**Result: strong, with one structural weakness.**

Response headers are configured well in `vercel.json`:

| Header | Value |
|---|---|
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `SAMEORIGIN` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | camera, geolocation, microphone, payment all denied |
| Access-Control-Allow-Origin | pinned to `https://www.colleagueai.ai` |

The CSP is genuinely well built — `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`, and connect/script sources explicitly allowlisted rather than wildcarded.

**The one weakness:** `script-src` includes `'unsafe-inline'`. That is the single largest gap in an otherwise tight policy, because it removes CSP's protection against injected inline script. It is also not trivially fixable — the pages rely heavily on inline `<script>` blocks, so eliminating it means moving to nonces or hashes across the whole site. Worth planning, not worth rushing.

**Secret scan:** no live keys, tokens or private keys in any shipped file (`public/`, `src/`). Clean.

**Dependency audit:** 18 advisories — 17 moderate, 1 high (`brace-expansion`, a denial-of-service via exponential expansion). **All are transitive through build tooling** (`lighthouse`, `serve-handler`, `@sentry/node`), not through your 8 production dependencies. The realistic blast radius is your own CI, not your visitors. `npm audit fix` resolves them.

**API authentication review:**

| Route | Method guard | Auth | Rate limit |
|---|---|---|---|
| `webhook.js` | POST | Stripe signature verification (9 checks) | n/a |
| `download.js` | GET | entitlement checks | none |
| `demo-agent.js` | POST | **none** | broken (see Defect 1) |
| `lead.js` | POST | none (public by design) | depends on dead KV |
| `partner-register.js` | POST | **none** | **none** |

The Stripe webhook is the one that most needed to be right, and it is — signature verification is present.

---

## 6. Fraud and abuse

The commercial surface is currently closed, which removes most of the fraud exposure:

- `COMMERCIAL_LAUNCH_ENABLED = false` and every catalogue price is `null`, so checkout is gated behind a notice. **No payment can be taken.** This matters, because `webhook.js` and `download.js` both depend on the dead datastore — if purchasing were live, a customer could be charged and then refused their download. It cannot currently happen.
- Partner commission attribution depended on the code generator, which is now removed. No attribution can be claimed or spoofed.
- The honeypot and per-IP/per-email throttles went with the lead forms; they are no longer needed, as there is nothing to submit.

**The live abuse vector is Defect 1** — an uncapped endpoint that spends money.

**Flag for later:** when you do enable commercial launch, the purchase → entitlement → download chain needs the datastore working, and `partner-register.js` needs rate limiting before it is exposed again.

---

## 7. AI surface

- The only AI endpoint is `demo-agent.js`. It interpolates user-supplied fields (`preferences`, `origin`, `destination`) into a prompt, so it carries ordinary prompt-injection exposure. Since the endpoint serves no live feature, **deletion resolves this** rather than hardening it.
- No AI-generated content is rendered to visitors anywhere on the site, so there is no unreviewed-output risk.
- No AI claims on the site assert third-party certification. The Trust page remains explicit that classifications are self-assigned — consistent with the homepage after the earlier claim corrections.

---

## 8. SEO and GEO

**Structurally clean.** Across 64 audited pages:

| Check | Result |
|---|---|
| Missing `<title>` | 0 |
| Missing meta description | 0 |
| Canonical tags (exactly one per page) | **0 problems** |
| `<h1>` count (exactly one per page) | **0 problems** |
| JSON-LD parse errors | **0** |
| Images missing `alt` | **0** |
| Sitemap | 125 entries, **0 duplicates**, all key routes present |

**GEO is well handled** — `robots.txt` explicitly allows `GPTBot`, `ClaudeBot`, `Google-Extended` and `PerplexityBot`, and both `llms.txt` and `llms-full.txt` are published. That is ahead of most sites.

**Improvements worth making:**

1. **14 titles exceed 65 characters** and will truncate in search results. Worst: `de/trust` (90), `es/trust` (91), `de/partners` (79).
2. **32 meta descriptions fall outside the useful 110–165 character band.** Several are far too long and will be cut (`de/home` 207, `cs/home` 201, `cs/pricing` 174); `cs/terms` at 29 is too thin to be useful.
3. **8 contact pages have no `hreflang` block**, including `x-default`. Every other page type has one. Search engines cannot connect the localised contact pages to each other.
4. **`llms.txt` does not mention `/pricing`.** It was written before the pricing page existed. Since pricing is exactly what a generative engine gets asked about, this is a real omission — `llms-full.txt` references it once.
5. **`llms.txt` starts with a UTF-8 BOM.** Harmless in most parsers, but it is a plain-text file consumed by machines; the BOM can surface as a stray character in naive readers.

---

## 9. UX, design and accessibility

**Design consistency: good.** Header, wordmark, navigation, typography and colour are consistent across pages and languages. The German partner page and English pricing page render with identical structure and spacing. The pricing page reads clearly: hero → indicative-range disclaimer → jump navigation → five tiers with Tier 2 visually emphasised.

**Accessibility, measured on `/pricing`:**

| Check | Result |
|---|---|
| Heading hierarchy skips | **0** |
| `<h1>` per page | 1 |
| Images without `alt` | 0 |
| Links with no accessible name | 0 |
| `lang` attribute | correct per locale |
| CTA button height | 52px (comfortably above the 44px guideline) |
| Colour contrast | **1 failure — see Defect 3** |
| Targets under 24×24px | **15** (header navigation links) |

The 15 small targets are the text links in the header (*Catalogue*, *CAI Score*, *Pricing*, *Trust*…). They fall below the WCAG 2.5.8 minimum of 24×24px. On desktop with a mouse this is a minor issue; on a phone it is the difference between hitting the right link and the wrong one — which is worth checking given the header rework.

---

## 10. What this report does not cover

I want to be explicit about the limits rather than imply broader coverage than I have:

- **Real UAT.** I ran the journeys; I cannot tell you whether an enterprise buyer finds the pricing page persuasive or the tier names meaningful. That needs actual users.
- **Penetration testing.** This is a posture review from headers, configuration and source. No attack traffic was sent at your site. A real pen test needs a scoped engagement and authorisation.
- **Real-device mobile testing.** I cannot resize the browser below the OS window minimum. Everything mobile in this report is inferred from markup and CSS, not observed on a phone.
- **Native language review.** ~235 translated strings across 7 languages remain unreviewed by native speakers. The commercially loaded ones — commission percentages, partner terms, the pricing disclaimer — are the ones that would cost you if wrong.
- **Performance.** No Lighthouse run; the tooling needs a full install and a browser download that this environment blocks.

---

## Recommended order of action

1. **Delete `api/demo-agent.js`** and remove `ANTHROPIC_API_KEY` from Vercel — closes the only live money-losing vector
2. **Fix the partner page copy** — currently describes a feature that isn't there, in 8 languages
3. **Darken the CTA colour** to `#A94A2C` or `#BC5837` — one line, fixes contrast site-wide
4. Delete `api/lead.js` and `api/partner-register.js` — dead code, one of them an unauthenticated write endpoint
5. Add `/pricing` to `llms.txt`; add `hreflang` to the contact pages
6. Trim the 14 over-length titles and 32 meta descriptions
7. `npm audit fix` for the build-tooling advisories
8. Plan the move off `'unsafe-inline'` in CSP
