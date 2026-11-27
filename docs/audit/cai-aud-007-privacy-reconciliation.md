# CAI-AUD-007 — Privacy processing reconciliation

Status: engineering reconciliation, not legal advice. Items marked **owner/counsel** need a decision that cannot be made
from the code. Compared against `public/en/privacy.html` (built from the privacy proposal dated 2026-11-21) at `origin/main` 29410808.

## Method

Every write to the key-value store and every outbound processor found in `api/` and `lib/` was listed, and each was compared
with the published "what we store / who receives / how long" statements. Vendor data-processing agreements and transfer
mechanisms were **not** verified from the repository (see the open items).

## Processing found in code and its status

| # | Processing (code) | Published statement | Finding | Status |
|---|---|---|---|---|
| 1 | Booking rate-limit key `demo:<IP>` (1 h) | not stated | Raw IP stored in the key | **Fixed here** (keyed HMAC, CAI-AUD-005) |
| 2 | Recovery rate-limit keys `recover:ip:<IP>` (window) and `recover:email:<sha256(email)>` | not stated | Raw IP stored; the email key was an unkeyed SHA-256, recomputable for any guessed address | **Fixed here** (both keyed with `DOWNLOAD_TOKEN_SECRET`) |
| 3 | Interest view counter and registration limiter (1 h / 24 h) | not stated | Keyed hash with a public fallback constant | **Fixed here** (CAI-AUD-002): no public constant; a random per-process key when unset |
| 4 | Interest duplicate marker `interest:seen:` (30 days), keyed HMAC of email+agent | "12 months" retention for enquiries | With the public fallback the marker was recomputable from an email address | **Fixed here**: registration refused without a keyed secret |
| 5 | Interest registration record (`saveLead`, 365 days) | "Demo and enquiry requests: 12 months" | 365 days vs 12 months — equivalent in practice, but not stated as the same period for interest records | **Owner/counsel**: state the interest-record period explicitly |
| 6 | Interest `source` = HTTP `Referer` (up to 300 chars) | not stated | A referrer can carry a query string | **Open**: strip query strings, or state the processing |
| 7 | Acceptance fingerprint (salted hash of IP) in orders | "a salted hash of your network address" | Used a public salt; the policy statement was true only in form | **Fixed here** (CAI-AUD-006): keyed; not recorded when no secret is set. The policy must say "keyed hash, recorded when configured" or the secret must be guaranteed |
| 8 | Order/acceptance user agent (200 chars) | "browser type" | Consistent | Consistent |
| 9 | Vercel function logs | "Function logs: days (provider default)" | Plan retention for runtime logs is about one hour (observed 27 Nov); runtime-error clusters keep seven days | **Owner/counsel**: state the actual figures |
| 10 | Upstash (store), Resend (mail), Vercel Blob (documents) hosting regions | "EU (Dublin / Frankfurt)" | Region is an environment setting; not checked against the live project | **Open**: verify the production stores' regions |
| 11 | Stripe | processor and independent controller | Consistent with the Stripe integration | Consistent; DPA not checked |
| 12 | Google Fonts | "your browser's request discloses your IP to Google" | `index.html` loads Google Fonts, consistent | Consistent |
| 13 | Analytics and error monitoring (Plausible, Sentry) | cookieless analytics; error monitoring | Both referenced in the build; live configuration not verified | **Open**: confirm both are live and match the text |

## Transfers and DPAs (not verified from the repository)

- Vercel, Upstash, Resend, Stripe, Google, Plausible, Functional Software (Sentry): the published text relies on the EU-US
  Data Privacy Framework "where certified", otherwise SCCs in the provider terms. **Owner/counsel**: confirm each DPA is
  signed and each certification is current; record the evidence in `docs/legal/`.
- Rate-limit and dedupe keys are now pseudonymous; they still count as personal data under GDPR because the key is
  derived from an identifier. The text should say so.

## Open items for the owner

1. Choose the interest-record retention statement (item 5).
2. Decide the referrer policy (item 6): strip the query string or disclose it.
3. Publish the actual log retention (item 9).
4. Confirm the production store regions (item 10) and the analytics and monitoring configuration (item 13).
5. Confirm the vendor DPAs and transfer mechanisms (section above).
6. Make the acceptance-fingerprint sentence (item 7) match the deployment, or guarantee the secret is set in production.

Until items 5–7 are settled the published privacy text is not reconciled with the code. Nothing in this document changes the text itself.
