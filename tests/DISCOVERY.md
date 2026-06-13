# DISCOVERY — colleagueai-website (Phase 0, read-only)

Date: 2026-06-12 · Repo: main (shallow) · Production: https://www.colleagueai.ai

## Framework & routing
- **Vite + React 19 SPA** (`vite.config.js`, `src/main.jsx`) — NOT Next.js. No SSR/SSG framework.
- **Vercel** routing via `vercel.json`:
  - Redirect: `/` → `/agents` (302, `permanent:false`).
  - Rewrites to static prerendered files in `public/`: `/agents→/agents.html`, `/partners→/partners.html`,
    `/trust→/trust.html`, `/terms→/terms.html`, `/license→/license.html`, `/privacy→/privacy.html`,
    `/partner-agreement→/partner-agreement.html`.
  - Locale rewrites (7 non-EN): `/cs/agenti`, `/es/agentes`, `/pt/agentes`, `/fr/agents`, `/de/agenten`,
    `/pl/agenci`, `/it/agenti` → all to `/agents.html?lang=xx` (one EN file, translated client-side).
  - Catch-all `/(.*)→/index.html` (React SPA; `/demo` renders Demo.jsx).
- **`public/` contains only `agents.html` + `partners.html`.** trust/terms/license/privacy/partner-agreement
  HTML files DO NOT EXIST → those rewrites fall through to the SPA shell.
- **Deployed config ≠ repo HEAD**: production `/partners` serves the SPA shell although
  `public/partners.html` + rewrite exist in repo. Live deployment predates repo state.

## Two front-ends
1. `public/agents.html` (606 KB, one file) — the real marketplace. All copy, 36 agents, all 8 locale
   dictionaries (`I18N`, `AGENTS_CS..IT`) inline, plus payment/scheduler/partner scripts.
   **File is UTF-8-BOM with DOUBLE-ENCODED (mojibake) characters** (em-dash stored as
   `\xc3\xa2\xe2\x82\xac\xe2\x80\x9d` → renders literally as `â€”` to users and crawlers).
2. React SPA (`src/`) — served on `/demo` and any unrewritten path. Non-JS clients get the
   "This site uses JavaScript to render" fallback.

## Locales (8)
`en, cs, es, pt, fr, de, pl, it`. No separate locale files — everything inline in agents.html:
`var I18N={en:{...},...}` (~line 2585) and `AGENTS_CS..AGENTS_IT` arrays (~2806-2825).
Selection: `?lang=` + `localStorage('cai_lang')`. The Phase-3 "8 locale files / 229 keys" assumption
does not match the repo; the i18n audit extracts the inline objects instead (repo wins).

## Stripe webhook — `api/webhook.js`
- `bodyParser:false`, raw body read manually, `stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)`
  (default 300s tolerance). Handles ONLY `checkout.session.completed`.
- Flow: `grantEntitlement(email, slugs, session.id)`; if `session.metadata.partner` set →
  `recordCommission({code, amountGross: session.amount_total, commissionRate, stripeSessionId})`.
- Royalty rule as coded: **flat `PARTNER_COMMISSION_RATE` (default 0.20) of `amount_total`, credited
  once per `checkout.session.completed`. `invoice.paid` is ignored → renewals never credited.**
- No idempotency on `event.id`. KV failure → returns **200** (comment in code is wrong: 200 means
  Stripe will NOT retry). No accreditation gate: unknown partner codes get a stub record and earn.

## Upstash KV — `lib/db.js`
- REST via fetch; env `KV_REST_API_URL|UPSTASH_REDIS_REST_URL` + `KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN`.
- Keys: `entitlement:<email>`, `partner:reg:<code>`, `partner:email:<email>`.
- Writers: grantEntitlement, registerPartner (api/partner-register.js), recordCommission.
- Readers: getEntitlement/isEntitled (api/download.js), getPartnerStats.

## Partner attribution (client)
- Param is **`?partner=`** (not `?ref=`). agents.html (~2783): `.slice(0,64)`,
  `localStorage('cai_partner')`, `window.__cai_partner`, appended to demo/partners links and to
  checkout URLs (`&partner=`) along with `client_reference_id=cai-<slug>-<uuid>`.
- partners.html: code = `CAI-` + SHA-256(email)[0:8]; `api/partner-register.js` persists to KV.

## Payment config (agents.html ~2606)
`STORE={currency:'EUR', price:null, perAgentPrice:{}, checkoutBase:'https://www.colleagueai.ai/checkout',
paymentLinks:{}, gate:{copilotStudio:true,m365:true,dossier:false}, schedulerUrl:'YOUR_SCHEDULER_URL'}`
- `price:null` → empty Price/"on request"; `/checkout` is not a real route; paymentLinks empty;
  schedulerUrl is a literal placeholder (runtime fallback sets Book-a-call links to /demo, JS-only).
- Dossier link set by JS to `/docs/agents/<slug>.pdf` (PDFs exist in repo).

## Other API routes
- `api/download.js` (R2 signed URLs, env R2_*; checks isEntitled), `api/demo-agent.js` (Anthropic,
  in-memory rate limit), `api/partner-register.js`.

## SEO surface (repo)
- robots.txt: allows *, GPTBot, ClaudeBot, Google-Extended, PerplexityBot; sitemap ref OK.
- sitemap.xml: 5 URLs; `/trust`, `/terms`, `/privacy` listed but have no real page.
- agents.html head: self-canonical www/agents, hreflang ×8 + x-default, ONE JSON-LD `@graph`
  [Organization, WebPage/CollectionPage, BreadcrumbList, DefinedTerm, FAQPage]; `og:locale:alternate`
  lists only `cs`. NO Product JSON-LD.
- SPA index.html head: `canonical: https://colleagueai.ai/` (non-www root, which 302s) — emitted on
  EVERY catch-all route (/demo, /trust, /terms, ...).

## Prod vs preview
- Production: `https://www.colleagueai.ai` (root + non-www → 30x → www/agents). Vercel project
  `colleagueai-website-s-projects`. No preview URL available; all scripts take `BASE_URL`.

## Existing test infra (additive, untouched)
Vitest unit tests, Playwright (`playwright.config.js`, `playwright.prod.config.js`, e2e/*),
Lighthouse CI (`lighthouserc.cjs`, `scripts/run-lhci.mjs`). New harness lives in `tests/`.
