# Stripe end-to-end runbook — the last release gate

This is the test the release verdict is waiting on: **approved test purchase →
Stripe success/failure/3DS → webhook idempotency → entitlement → correct agent
package → cross-customer isolation → 15-minute download expiry → resend/recovery
→ refund/revocation.** Everything below runs in **Stripe TEST MODE** on a
**preview deployment** — production keeps checkout off until this passes.

Nothing in this document contains a secret, and no step asks you to share one.

---

## 0. One-time setup (≈20 minutes)

**Stripe (test mode — toggle "Test mode" ON in the Dashboard):**

1. Dashboard → Developers → API keys → copy the **test** secret key (`sk_test_…`).
2. Dashboard → Developers → Webhooks → Add endpoint:
   `https://<preview>.vercel.app/api/webhook`, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.closed`,
   `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy the signing secret (`whsec_…`).
3. Settings → Payment methods: enable **Cards** (and "Bank transfers" only if you
   want to test the delayed lane in a second pass).

**Vercel → Project → Settings → Environment Variables, scope = _Preview_ ONLY:**

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `DOWNLOAD_TOKEN_SECRET` | any long random string (`openssl rand -hex 32`). Downloads are refused without it. Changing it invalidates every outstanding link; buyers recover by reopening their `/api/success` URL (or, when emailed recovery is switched on, section 6a) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | your Upstash REST pair (already set for demo bookings — confirm they exist for Preview) |
| `CAI_ENABLE_CHECKOUT` | `1` — flips the storefront's pay panel to checkout mode in the built preview only |

**Optional, for the emailed-recovery test only (section 6a). Leave all of these unset for the first pass:**

| Variable | Value |
| --- | --- |
| `RECOVERY_ENABLED` | `1` or `true` — the owner's switch. Absent, empty or anything else means off, whatever else is configured. It is separate from the mail key on purpose: `RESEND_API_KEY` also turns on demo-request alerts, and setting it up for that must not open a public form that sends mail |
| `RESEND_API_KEY` | the Resend API key (the transport `api/demo-booking.js` already uses). Resend sends only from a domain verified in the Resend account, which is a DNS step for the owner |
| `MAIL_FROM` | sender, e.g. `ColleagueAI <hello@colleagueai.ai>`, or `ColleagueAI <no-reply@notify.colleagueai.ai>` when mail goes out from a dedicated sending subdomain. Falls back to `DEMO_NOTIFY_FROM`, then to the first example |
| `MAIL_REPLY_TO` | where a buyer's reply to the recovery mail lands. Default `hello@colleagueai.ai`, so a sending subdomain with no inbox never swallows an answer |
| `PUBLIC_BASE_URL` | the origin that emailed links point at. Unset: Production links point at `https://www.colleagueai.ai`, and a Preview deployment's links point at that deployment itself, so a mail sent from a test never opens the live site |
| `RECOVER_MIN_RESPONSE_MS` | default `700`. Every answer to a recovery request takes at least this long, so response time does not tell an address with an order from one without |

**Preview and Production share one Redis, but not one set of keys.** `lib/db.js` writes every Preview key
under `preview:` (`preview:entitlement:<email>`, `preview:partner:reg:<code>`, `preview:certification:…`,
`preview:lead:…`), so a sandbox purchase, refund, partner code or demo request can never read or change a
production record (`tests/kv-namespace.test.mjs`). Wherever this runbook says "in Upstash", look under the
`preview:` prefix; the unprefixed keys are Production's and must not change during a Preview test. Records
written before this change sit under the unprefixed names and are invisible to Preview.

Leave storage unconfigured for the first pass: `/api/download` then serves a placeholder
PDF **for the dossier only**, which is fine — the gate is the *flow*, the real files come with storage later.

**Storage (`lib/storage.js`):** a **Vercel Private Blob** store connected to the project (OIDC, `BLOB_STORE_ID`;
no static key needed) is used first; Cloudflare R2 (`R2_*`) is the fallback driver. Object key:
`agents/<slug>/<file>`. With storage configured, the dossier link redirects to the public `/docs/agents/<slug>.pdf`.

**Products with a release record (`config/products.json`, e.g. Contract Intelligence & Register,
SKU CAI-L4-CI-001)** behave differently by design:

| Setting | Effect on the release package |
| --- | --- |
| `saleApproved: false` and a live key | `/api/checkout` refuses with `not_approved_for_sale` |
| `saleApproved: false`, `RELEASE_TEST_DELIVERY` unset | success page shows the dossier only; `/api/download` returns 403 `release_not_approved` for the package |
| `RELEASE_TEST_DELIVERY=1` (**Preview scope only, deployment protection on**), no storage | package link shown; `/api/download` returns 503 `package_storage_not_configured` — expected, not a failure |
| `RELEASE_TEST_DELIVERY=1`, private Blob store connected (Preview), bundle uploaded to `agents/<slug>/<release.package>` | package download works; verify its SHA-256 against `release.sha256`, then import that exact ZIP into a clean environment (final acceptance) |

Catalogue agents with no record in `config/products.json` are refused for live sales as well (default-deny): `/api/checkout` returns `not_approved_for_sale` with a live key, and a live session for one is withheld and recorded, as for an unapproved release. Test-mode checkout is unchanged. A purchase that already fulfilled is not judged again, so a re-delivered webhook or a reopened success link keeps its access.

Never set `RELEASE_TEST_DELIVERY` in the Production scope: with it, anyone who completes a test-card
purchase on that deployment receives the unapproved release.

**Deploy a preview:** push any branch (this one) and open the preview URL Vercel
gives the PR.

## 1. Gate 0 — automated preflight (from your machine)

```powershell
$env:BASE_URL = "https://<preview>.vercel.app"
node scripts/verify-stripe-e2e.mjs
```

All checks must pass before spending time on manual steps. It verifies input
hardening, and that downloads fail closed: a forged or legacy link, a tampered
token, an expired token, a token for a file outside the allowlist, and a valid
token for a buyer with no entitlement are all refused. The last four need
`$env:DOWNLOAD_TOKEN_SECRET` set to the preview's secret, so the script can seal
test tokens; with it, the 15-minute expiry is proven as well.

## 2. Happy path — card

1. Open `https://<preview>.vercel.app/agents`, pick an agent, open the access
   panel → the CTA should now go to checkout (preview only).
2. Pay with **`4242 4242 4242 4242`**, any future expiry, any CVC, any name, and
   an email you can check (use something like `buyer-test-1@yourdomain`).
3. You land on `/api/success` → **Download agent package** appears (for a product with a release
   record: **Download ColleagueAI <product>** plus version, SKU and a dossier link — see the table above).
   - The link is `/api/download?t=…`, a sealed token. The buyer's address is not in the URL,
     and the link expires 15 minutes after the success page is rendered.
4. Download works once, and again on refresh (entitlement, not one-shot).
5. Stripe Dashboard → Payments: the payment shows
   `ColleagueAI - <Agent> (L*)` (products with a release record: their configured name, e.g.
   `ColleagueAI Contract Intelligence & Register (L4)`); metadata carries `agent_slug` + `tier`
   (+ `sku` and `release` for products with a release record).
6. Dashboard → Webhooks → the endpoint: `checkout.session.completed`
   delivered, response **200**.

## 3. Failure and 3DS

| Card | Expected |
| --- | --- |
| `4000 0000 0000 0002` | Declined at Stripe; no webhook fulfilment, no entitlement, `/api/success` never reached |
| `4000 0027 6000 3184` | 3DS challenge appears; **complete** it → behaves exactly like the happy path |
| `4000 0027 6000 3184`, then **fail** the challenge | Back at checkout, nothing granted |

After the declined attempts: `/api/download` with the first purchase's link still works
(within its 15 minutes; the first purchase's entitlement is untouched), and no new
entitlement email exists.

## 4. Webhook idempotency (the auditor's specific ask)

1. Dashboard → Webhooks → the endpoint → the delivered
   `checkout.session.completed` event → **Resend**. Do it twice.
2. Expected: HTTP 200 each time with `"duplicate"` in the response body, and in
   Upstash the entitlement's `stripeSessionIds` does **not** grow, partner
   `salesCount` does **not** grow. (Local proof of the same property:
   `node --test tests/webhook.test.mjs`, tests 5/6/9.)

## 5. Cross-customer isolation

1. Make a second purchase for a **different agent** with a **different email**
   (`buyer-test-2@…`, incognito window).
2. Take buyer 1's download URL and change any character of the `t=` token → **403**
   (`bad-token`: the token is sealed with AES-256-GCM, so the buyer's address cannot
   be swapped inside it). Sealing a token for buyer 2 needs the secret, which only the
   server holds; `scripts/verify-stripe-e2e.mjs` already proves tampered tokens are refused.
3. Buyer 2's own link downloads buyer 2's agent only.

## 6. Expiry, resend, recovery

1. Wait 15+ minutes (or reuse the preflight's expired-token check) → the old
   download link now answers **403 `expired`**.
2. Re-open the same `/api/success?session_id=…` URL from the confirmation —
   a **fresh** sealed link is issued and works. That is the recovery path for
   "buyer lost the link": they reopen the Stripe receipt's success URL. Links issued
   before the sealed-token change (`email=…&sig=…`) answer 403 `missing-token` and are
   recovered the same way.
3. `/api/success` with the same session never double-grants (idempotent merge).

## 6a. Emailed recovery (release gate A8) — off until the owner chooses a mail path

A buyer who closed the thank-you page, and no longer has the Stripe receipt, can ask for a fresh link at
`/recover`. It is **off by default**: it needs `RECOVERY_ENABLED=1`, `DOWNLOAD_TOKEN_SECRET` and
`RESEND_API_KEY`, all in the **Preview** scope for this test. While it is off, `/recover` answers 503, a link
mailed earlier opens nothing, and the thank-you page does not mention it. Production stays off until the owner
decides; this section is the proof the owner needs before deciding.

Do section 2 first with a mailbox you can read (the sandbox buyer's address). Then:

| # | Do | Expected |
| --- | --- | --- |
| 1 | With `RECOVERY_ENABLED` **unset**, open `/recover` | 503 "not available" page; no form; the thank-you page shows no recovery line |
| 2 | Set `RECOVERY_ENABLED=1`, redeploy the Preview, open the thank-you page | one line under the download block, "send me a new link" |
| 3 | Open `/recover`, enter the buyer's address | "If that address has an order, a link is on its way" (HTTP 202) |
| 4 | Read the mail (arrives within a minute; check spam) | one mail to that address only; the link starts `https://<this preview>/recover?t=…`, so it opens the Preview and not the live site; the address appears nowhere in the URL. Hit "Reply": the To line is the support address, not the sending address |
| 5 | Open the link **in a browser that is signed in to Vercel for this team** (see the note below) | the downloads for that address, each with a fresh 15-minute link. Reopen it: it works again (it is deliberately not single-use, because mail scanners open links before the buyer does). After 30 minutes: "link expired", with a way to ask again |
| 6 | Enter an address that never bought | **the same** message, same status, and **no mail** |
| 7 | Dashboard → full refund of the payment, then request again, then open the earlier link | no new mail; the earlier link now says no order was found (the entitlement is read again on every open) |
| 8 | Request four times in an hour for one address | the fourth answers 429 "too many requests"; the same holds for an address with no order. Six requests from one client address in an hour: the sixth is refused |
| 9 | Remove `RESEND_API_KEY` (or set `RECOVERY_ENABLED=0`) and redeploy | `/recover` answers 503 again and the thank-you page loses the line |
| 10 | Make the provider refuse (wrong key), request for the buyer's address | the caller still sees the same 202 message; Vercel logs show `[recover] ALERT recovery email not sent:` with a status code and no address. That log line is the alert: the buyer is waiting for a mail that did not go |

**A protected Preview and an emailed link.** The Preview is behind Vercel's deployment protection, so a link in a
mail opens only for someone signed in to Vercel for this team (or holding the protection cookie); anyone else
lands on a Vercel sign-in page, which is the protection working, not recovery failing. Open the link in that
browser. **Do not** append the protection-bypass token to the link, paste it into `PUBLIC_BASE_URL`, or put it in a
mail or a Stripe webhook URL: it would sit in a mailbox and in logs. What this row cannot prove is the buyer's
experience on the live site, where there is no protection page; that is only visible after Production is switched on.

Proved by `node --test tests/recover.test.mjs` (25 tests, against an in-memory store and a fake mail API) and
`tests/ratelimit.test.mjs` (the counters), and **not** proved by them: real delivery and spam placement, the real
Redis counters (their expiry in particular, see "Rate-limit counters" below), and what a buyer's mail gateway does
to the link. Rows 3–5 and 10 are therefore the ones that matter on a real Preview.

**Rate-limit counters.** A counter is created together with its expiry (`SET … NX EX`), so a counter without an
expiry can no longer be made by a failing second command. Counters written by the earlier code (INCR, then EXPIRE)
may still exist without an expiry if that second command ever failed. A read-only look at the `rl:` and
`preview:rl:` keys in Upstash (key names and their TTL only, never values) shows whether any do; an address stuck
behind one is released by deleting that single key, which is an owner action.

Before the owner enables it anywhere real:

- **Mail path.** Resend (already in the code; needs the sending domain verified in DNS, an owner step) or the
  existing licensed Microsoft mailbox through Microsoft Graph (no new vendor, but an Entra app registration and a
  small code change in `lib/mail.js`). Nothing else in the recovery code depends on the choice.
  - *Resend on a dedicated sending subdomain* (for example `notify.colleagueai.ai`) keeps the root domain's mail
    untouched: Resend's own guidance is to verify a subdomain rather than the root, and the records it asks for
    (a return-path MX and an SPF TXT on a `send` name, a DKIM TXT on `resend._domainkey`, per Resend's DNS guide)
    sit under the subdomain's own names, beside the root domain's records and not on them. Read the exact names and
    values off the Resend dashboard; do not copy them from here. **Owner steps, none done by Claude:** create the Resend account; add
    the subdomain there; add the DNS records exactly as the dashboard shows them (this is the one DNS change, and it
    is the owner's to authorise); create an API key; set `RECOVERY_ENABLED`, `RESEND_API_KEY` and `MAIL_FROM` in
    the Preview scope only. `MAIL_REPLY_TO` can stay unset, since replies already go to the support address.
  - Check that the address in `MAIL_FROM` is on the verified subdomain; Resend refuses other domains.
- **Translations.** The 24 recovery strings in `lib/orderI18n.js` were drafted by Claude in all eight languages and
  have not been read by a native speaker. They need that review before a buyer sees them.
- **Production.** `RECOVERY_ENABLED` is set in Production only after this section and section 10 have passed.

## 7. Refund → revocation (fixed in this branch — test it)

1. Dashboard → Payments → the happy-path payment → **Refund** (full).
2. Webhooks: `charge.refunded` delivered → **200**. The handler resolves the
   checkout session **via the payment intent** (live charge events carry no
   session id — this lookup is the fix; before it, refunds silently kept both
   commission and entitlement).
3. Expected in Upstash: the entitlement's `slugs` no longer contains the agent;
   any partner ledger entry for the session is `state: "reversed"`.
4. The buyer's download link (even un-expired) now answers **403 Not entitled**.
5. Partial-refund nuance: a partial refund reverses only that share of the
   commission and does NOT revoke the entitlement (by design). Local proof:
   `tests/webhook.test.mjs` 10a–10d, `tests/commission-ledger.test.mjs`.
6. A refund or charge-back processed **before** the sale was ever stored leaves a record with `slugs: []` and only
   the history (`revokedSessionIds`, plus `refundedSessionIds` for a refund). That is intended: the checkout event
   or the thank-you page that arrives afterwards is refused instead of granted
   (`tests/entitlement-concurrency.test.mjs` 3b, 3c, 4b).
7. Every change to a buyer's record is one `EVAL` compare-and-set, so the thank-you page, the checkout webhook and
   the refund and dispute webhooks cannot overwrite one another (`tests/entitlement-concurrency.test.mjs`). The
   Upstash token must be allowed to run `EVAL` (the default read-write token is). If eight attempts in a row lose
   the race the call fails with `Entitlement update did not settle`: nothing was written, the webhook answers 5xx
   and Stripe retries it; the thank-you page shows the "payment received" notice without a download link.

## 8. Continuous Certification (the subscription half)

Checkout attaches the certification subscription unless `cert=0`. With it
attached the session is `mode: 'subscription'` and the one-time agent price is
billed on the first invoice, so **one** payment covers both.

1. Buy an L4 agent with certification (`4242…`). On the Stripe Dashboard the
   payment shows two line items: the package and `Continuous Certification -
   … (L4)` at $249/month.
2. Upstash should now hold `certification:CAI-L4-XXXXXXXX` with `status:
   "active"`, plus the `cert:sub:<subscription id>` index.
3. Open `/api/certificate?id=CAI-L4-XXXXXXXX` → the verification page shows
   **Colleague AI Certified — Active**, the tier, the term, and the scope
   statement. Confirm it shows **no email and no customer name** — that is the
   privacy contract, and `tests/certification.test.mjs` test 2 pins it.
4. Dashboard → the subscription → **Cancel immediately**.
   - `customer.subscription.deleted` delivers 200; the certificate flips to
     `lapsed`; the verification page says "not currently certified".
   - **The download entitlement must be untouched** — re-open the success URL
     and download again. If that fails, stop: the perpetual licence is being
     revoked by a subscription lapse, which is the one thing this model must
     never do (`tests/webhook.test.mjs` 11d guards it locally).
5. Failed renewal: Dashboard → the customer → attach a failing test card
   (`4000 0000 0000 0341`) and let a renewal invoice fail →
   `invoice.payment_failed` → the certificate reads `past_due`, **not** lapsed,
   because Stripe is still retrying.
6. Bank-transfer lane: request `method=bank` and confirm the session is
   one-time only (Stripe has no `customer_balance` in subscription mode); the
   log line says the certification was not attached.

## 8a. Stripe API version and the webhook endpoint

The code pins `2026-10-28.endive`, the version the installed `stripe` SDK is built against (`lib/stripe.js`).
A webhook endpoint keeps the API version it was created with, which is set separately in the Dashboard, so
its payloads can stay in the legacy shape while our own calls use the pinned version. `lib/stripeCompat.js`
reads both shapes, so this release can deploy before the endpoint is upgraded.

Before upgrading the endpoint's API version (Developers → Webhooks → the endpoint), run section 8 in Preview
with the new version selected. Confirm that `invoice.paid` still renews the certificate
(`certification: "renewed"`) and that a cancellation still lapses it.

## 9. Optional second pass — delayed bank transfer

With "Bank transfers" enabled in the test Dashboard: choose the bank lane,
Stripe issues virtual account details; the session completes `unpaid` (webhook
answers `status: "pending"`, nothing granted). In test mode, fund the balance
from the payment page's test controls → `async_payment_succeeded` arrives →
entitlement granted then, not before. `/api/success` meanwhile shows the
"awaiting your bank transfer" page.

## 10. Sign-off checklist

- [ ] Preflight script: all PASS
- [ ] Card happy path: paid → entitled → downloaded
- [ ] Decline + 3DS complete + 3DS abandon behave
- [ ] Webhook resend ×2: no double credit
- [ ] Cross-customer swap: 403
- [ ] 15-min expiry: 403 `expired`; success-page reopen re-issues
- [ ] Full refund: commission reversed AND entitlement revoked
- [ ] Certification issued on a subscription purchase, verifiable by ID, no PII in the response
- [ ] Cancellation lapses the certificate and leaves the perpetual licence intact
- [ ] Failed renewal reads past_due, not lapsed
- [ ] Renewal, past-due and lapse still work on the endpoint's current API version, before and after an endpoint upgrade (section 8a)
- [ ] (optional) bank-transfer lane grants only on clearance
- [ ] (only if the owner enables emailed recovery) section 6a rows 1–10: off by default; mail reaches only the buyer; unknown address gets the same answer and no mail; refund leaves nothing to recover; fourth request in an hour refused; provider failure leaves an alert line

When every box is ticked, the commercial verdict moves to PASS pending R2 real
files. Going live then = set the same env vars in **Production** scope (live
keys, live webhook endpoint on `www.colleagueai.ai`), upload real packages to
R2, flip `STORE.checkoutEnabled:true` in `public/agents.html` in a reviewed PR,
and keep `CAI_ENABLE_CHECKOUT` OUT of Production (it is a preview-only device).
