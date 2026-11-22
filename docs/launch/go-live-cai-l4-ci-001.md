# GO-LIVE — Contract Intelligence & Register (CAI-L4-CI-001 1.0.3.6, bundle revision 3) only

This PR approves exactly one product for sale (`config/products.json` `saleApproved: true`, release status `released`).
Every other catalogue agent has no approved record and stays refused for live keys (default-deny). The first-sale scope
(`config/launch-scope.json`: Czech businesses, card, USD, this release) and the tax policy gate stay in force: **with the
tax policy unapproved, live checkout still refuses (`tax_policy_not_approved`) even after this PR is merged.**

## Merge only when every line below has its evidence (none may be assumed)

| # | Condition | Evidence to attach to the PR |
|---|---|---|
| 1 | Vercel team on a commercial plan (Pro) | Vercel → Settings → Billing shows Pro |
| 2 | Company VAT position established; accountant's written T1/T3/T6/T7/T8/T13; tax policy PR merged with `status: approved` | registration decision or accountant's written confirmation; the merged policy PR |
| 3 | IP: Instrument A (Alexandr Tankos → company) signed; Instrument B if Schedule B lists works | signed PDF(s) stored outside this public repo; their SHA-256 in the PR |
| 4 | Provider DPAs accepted/filed: Vercel, Upstash, Stripe, Resend, Sentry, Plausible | date and where each is filed |
| 5 | Bundle r3 in Blob, #565 merged, one buyer download verified (371,721 B, `37a047c1…e051d`) | Blob listing + download hash |
| 6 | Production environment (below) set | Vercel env list (names only) |
| 7 | Stripe live account activated; live webhook endpoint (below) created | Stripe Dashboard → Developers → Webhooks |

## Production environment (Vercel → Settings → Environment Variables → Production)

| Name | Value / source |
|---|---|
| `STRIPE_SECRET_KEY` | live restricted or secret key (`rk_live_…`/`sk_live_…`), Sensitive |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the live endpoint below, Sensitive |
| `DOWNLOAD_TOKEN_SECRET` | new random 32+ byte value for Production (not the Preview one), Sensitive |
| `BLOB_STORE_ID` | store `cai-release-packages` connected to Production (Storage → store → Projects → environments) |
| `RESEND_API_KEY` | Resend key for the verified domain colleagueai.ai, Sensitive |
| `MAIL_FROM` | `ColleagueAI <hello@colleagueai.ai>` |
| `RECOVERY_ENABLED` | `1` |
| `CHECKOUT_ENABLED` | stays `false` until step 9 |
| KV (`KV_REST_API_*`) | already set for Production; Production uses unprefixed keys, Preview `preview:` |

Not set in Production: `TAX_POLICY_SANDBOX`, `TAX_SANDBOX_INVOICE_ROUTE`, `RELEASE_TEST_DELIVERY`, `LAUNCH_SCOPE_TEST_BYPASS`
(all ignored or refused with a live key anyway).

## Stripe live webhook

Endpoint `https://www.colleagueai.ai/api/webhook`, events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
`charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `customer.tax_id.created`,
`customer.tax_id.updated`, `customer.subscription.updated`, `customer.subscription.deleted`.
Payment methods: card (the session requests card only). Optional: switch Link off in Settings → Payment methods.

## Order of operations

1. Conditions 1–7 evidenced. 2. Merge the tax-policy approval PR. 3. Merge this PR (Production redeploys; checkout still off).
4. Verify on Production: `/api/checkout?agent=contract-intelligence-and-register` with the kill switch still `false`
   answers 503 `checkout_disabled`; `/agents` factsheet shows "Commercially available", release 1.0.3.6, r3 checksum.
5. Founder sets `CHECKOUT_ENABLED` to anything other than `false` and redeploys. That is the GO.
6. First customer order: the founder watches the webhook delivery (200), the order page (licence, invoice
   CAI-INV-YYYY-00001, agreement PDF, download), and the e-mail.

**Rollback:** set `CHECKOUT_ENABLED=false` and redeploy (refuses new checkouts at once; paid orders keep their access).
