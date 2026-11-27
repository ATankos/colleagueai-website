# Operational record — 27 Nov 2026

Final operational activities after the merge of #586. No development, redesign, price, kill-switch or scope change.

## 1. Production after the merge of #586

Production deployment `dpl_J9kEofk4rJs8rEjNuu9xSHeFMNtd` (main `2da5396e`, #586), checked on www.colleagueai.ai at about 09:40–09:55 UTC.

| Check | Result |
|---|---|
| Continuous Certification block on home, pricing (full) and catalogue, Trust Center, CAI Score, partners (compact) | Present on all 48 page × language combinations, in the page's own language |
| Links to the localized Continuous Certification page (`/certified`, `/cs/certifikace`, `/de/zertifizierung`, `/fr/certification`, `/es/certificacion`, `/it/certificazione`, `/pl/certyfikacja`, `/pt/certificacao`) | All 8 answer 200 |
| Sitemap | 207 URLs, all 200 |
| Prices | `config/pricing.json` unchanged by #586 (L2 7,900 / L3 9,900 / L4 14,900 USD one-time; monthly from 99 USD). L2–L4 one-time prices shown on the pricing page in all 8 languages. The L5 price is not shown anywhere |
| Agents | 36 agent pages, all "Coming soon" |
| Checkout | No page links to checkout; `/api/checkout` answers 503 `checkout_disabled` |
| Video slot | Hidden (`config/media.json` `ccVideo` is null) |
| Browser console | No errors on home, pricing, the Contract Intelligence & Register page or `/de/` |

## 2. Translation reviews

**Not completed.** `docs/continuous-certification/translation-review.md` shows all seven native-language reviews (cs, de, fr, es, it, pl, pt) as pending, with no reviewer or date. #586 states that it is "not published until every row is signed off". It was merged and published anyway. The reviews remain an open requirement for the published copy.

## 3. #586 review bypass

#586 was merged by the repository owner on 27 Nov 2026 at 09:34 UTC (merge commit `2da5396e`). It had no approving review; the only review is an automated CodeQL comment. The required-review rule (ruleset 27653464) was bypassed through the owner's bypass role. This is recorded under R1 in `docs/launch/release-gates-abc.md` and in the O-REVIEW-CONTROL evidence in `config/release-gates.json`, together with #588 (also merged with no approving review). O-REVIEW-CONTROL stays open.

## 4. The checkout requests logged as "STRIPE_SECRET_KEY not set"

**What is available.** Vercel's error clusters keep counts, the number of distinct clients and the deployment. On the current plan, individual request records (time, path, deployment, environment) are retained for one hour only. They hold no IP address or user agent. No other source holds them.

**Counts.** 24 events from 7 to 27 Nov, all on Production and all answered 503 `checkout_disabled`:
- 22 were counted before today's verification;
- 2 are today's verification calls, at 09:23:34 and 09:50:28 UTC.

| Window (UTC) | Events | Distinct clients |
|---|---|---|
| 7–13 Nov | 14 | 9 |
| 14–20 Nov | 3 | 2 |
| 21–26 Nov | 19 | 6 |
| 27 Nov | 4 | 1 |

The windows overlap the error cluster's own 7-day count, so they are not additive.

**Classification.**

- **Genuine customer purchases: none possible.**
  - No published page links to checkout. That was verified on all 207 sitemap URLs today.
  - Every request was refused before any Stripe call: no session, no charge, no personal data processed beyond the request itself.
  - A visitor can reach `/api/checkout` only by typing or reusing the URL.
- **Internal testing: confirmed for 2, likely for more.**
  - The two retained records today are this verification, made from the founder's browser.
  - The other two events on 27 Nov came from the same single client.
  - The 21–26 Nov window coincides with internal release testing of 1.0.3.6 and Continuous Certification.
  - CI does not call Production checkout: its tests use a local server, and the Production smoke test does not touch checkout.
- **Automated requests: cannot be separated from internal testing for the 20 older events.**
  - The records that would show the client type have expired.
  - The rising distinct-client count in 7–13 Nov suggests crawlers revisiting the URL, but this is not proven.

**Logging corrected.** In the same PR, `api/checkout.js` now:
- logs an intentionally closed checkout without a Stripe key as **info**;
- keeps an **error** when the key is missing while the kill switch says checkout is open.

The response is unchanged: 503 `checkout_disabled`. Tests in `tests/checkout-switch.test.mjs` cover both cases.

## 5. Missing release package download (21 Nov 2026, 19:27 UTC)

- **Event:** one `[ALERT] release package CAI-L4-CI-001_1.0.3.6-r2.zip … missing in storage; download refused` on `/api/download`.
- **Where:** deployment `dpl_9gJyu333M66YUskgBgoQAx41ciwo`, a **Preview** (branch `preview/launch-check`, commit `03d4097e`), not Production.
- **Cause:** documented in the release-gate history.
  - #552 (bundle revision 2) was merged before `CAI-L4-CI-001_1.0.3.6-r2.zip` was uploaded to the private Blob store.
  - Commit `486b3b1f` (20:21 CET) recorded gate C-BUNDLE-R2-PUBLISHED as FAIL, with a Blob listing at about 20:15 CET that showed the file absent.
  - The 19:27 UTC (20:27 CET) alert is the launch-check buyer download on the Preview, during that window.
  - The file was then uploaded. Commit `91d75adc` (20:40 CET) recorded the gate as PASS, "verified by buyer download".
- **Effect:** the download path failed closed as designed: 503 `package_missing`, no broken link, no wrong file, no customer. The alert has not recurred.

## 6. Pending pull requests

- **#585 (operating templates):** open, all checks green, pending an independent approval.
- **#572 (stripe 23.2.0, API version 2026-11-18.endive):** open, all checks green, pending an independent approval.
  - Commercial readiness requirement retained: a **sandbox (Stripe TEST) end-to-end payment test on a Preview**, following `docs/stripe-e2e-runbook.md`, after #572 is merged and before any checkout is enabled.
  - The webhook endpoint's own API version stays as set in the Dashboard until that test passes (runbook §8a).
