# Production activation (platform) — then one GO per product

Two separate things: **activating the platform** (once) and **opening sale of a product** (a GO PR per product,
`docs/commercial-framework/README.md` §3 step 8). Neither takes a payment by itself. Live payments start only when
the founder sets `CHECKOUT_ENABLED=true` in Production. Any other value, or no value, keeps checkout closed
(`lib/checkoutSwitch.js`, fail closed). `false` closes it everywhere.

## A. Preconditions (evidence, not intentions)

| # | Condition | Owner | Evidence | Gate |
|---|---|---|---|---|
| A1 | Vercel Pro; spend limit and usage alerts set | Founder | Billing page shows Pro; spend management configured | O-PROD-CONFIG |
| A2 | Company VAT position established; accountant's written T1/T3/T6/T7/T8/T13; `config/tax-policy.json` `status: approved` merged | Accountant → founder | registration decision or written confirmation; merged tax PR (`tests/tax-policy.test.mjs` green) | T-TAX-POLICY |
| A3 | IP instrument(s) executed for every product to be sold; SHA-256 in `config/agents/<slug>.json` | Licensor(s); company via its sole jednatel | signed PDFs outside the public repo | L-IP |
| A4 | Provider DPAs accepted and filed: Vercel, Upstash, Stripe, Resend, Sentry, Plausible | Founder | date and location of each | O-DPA-SECURITY |
| A5 | Agreement set in force recorded as approved by the founder (published 2026-11-21 via #562) | Founder | written close of the gate | L-LEGAL-TEXTS |
| A6 | Review control decided: a second account with write access, or a recorded decision to keep the owner's PR bypass | Founder | ruleset 27653464 state | O-REVIEW-CONTROL |
| A7 | Stripe live account activated (business details, bank account, statement descriptor) | Founder | Stripe Dashboard: payments enabled | O-PROD-CONFIG |
| A8 | Customer-support owner and monitoring owner named (hello@ inbox, Sentry alerts, Stripe e-mails) | Founder | names in the PR | O-PROD-CONFIG |

## B. Production environment (Vercel → Settings → Environment Variables → Production; values typed by the founder)

| Name | Value | Note |
|---|---|---|
| `STRIPE_SECRET_KEY` | live restricted key `rk_live_…` (Checkout, Customers, Tax IDs, Invoices, Credit notes, Refunds read) or `sk_live_…` | Sensitive |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the live endpoint (C) | Sensitive |
| `DOWNLOAD_TOKEN_SECRET` | new random value, 32+ bytes, not the Preview one | Sensitive |
| `ACCEPTANCE_SALT` | new random value | Sensitive; otherwise a public default is used |
| `BLOB_STORE_ID` | connect store `cai-release-packages` to the Production environment | packages and order documents |
| `RESEND_API_KEY` | key for the verified domain colleagueai.ai | Sensitive |
| `MAIL_FROM` / `MAIL_REPLY_TO` | `ColleagueAI <hello@colleagueai.ai>` / `hello@colleagueai.ai` | |
| `DEMO_NOTIFY_EMAIL` | the founder inbox for demo leads | |
| `RECOVERY_ENABLED` | `1` | buyers can re-request download links |
| `CAI_PAYMENT_METHODS` | `card` | the launch scope enforces card anyway |
| `CHECKOUT_ENABLED` | **`false`** until step D6 | fail closed |
| `KV_*` | already set | Production keys are unprefixed, Preview uses `preview:` |

Never in Production (refused or ignored with a live key, but keep them out): `TAX_POLICY_SANDBOX`,
`TAX_SANDBOX_INVOICE_ROUTE`, `RELEASE_TEST_DELIVERY`, `LAUNCH_SCOPE_TEST_BYPASS`, `INVOICE_SANDBOX_FAIL`,
`STRIPE_API_HOST`, `CERTIFICATION_SALES_ENABLED`.

## C. Stripe live webhook

Endpoint `https://www.colleagueai.ai/api/webhook`. Events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
`charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `customer.tax_id.created`,
`customer.tax_id.updated`, `customer.subscription.updated`, `customer.subscription.deleted`.

## D. Order of operations

1. A1–A8 evidenced. 2. Production variables (B) and webhook (C) set; redeploy.
3. Rehearse the switch: `/api/checkout?agent=<slug>` answers 503 `checkout_disabled` with `CHECKOUT_ENABLED` unset and
   with `false`.
4. Merge the tax-approval PR. 5. Merge the product's GO PR (its `tests/product-onboarding.test.mjs` must be green:
   that is the per-product evidence check). Production redeploys; checkout still closed.
6. **GO:** founder sets `CHECKOUT_ENABLED=true`, redeploys.
7. **Controlled first live order** with a real Czech business customer (not a self-purchase to test): founder watches
   the webhook delivery (200), the order page (licence, agreement PDF, invoice from the company ledger, download of
   the exact file: SHA-256 equal to `config/products.json`), the e-mail, and records the invoice in the books.
   Accounting obligations (invoice series, VAT return/control statement if registered, CZK conversion rule) follow the
   accountant's T-answers.
8. First week: daily check of Stripe payouts against orders (`lib/reconciliation.js` report) and Sentry.

## E. Rollback

- Stop new sales: `CHECKOUT_ENABLED=false` + redeploy (seconds). Paid orders keep their access.
- Stop one product: revert its GO PR (`saleApproved: false`).
- Bad deployment: Vercel instant rollback to the previous Production deployment.
- Bad bundle: never overwrite; publish a new bundle revision, keep the old one in `previousBundles`.
- Refund: Stripe Dashboard refund → webhook revokes the entitlement and issues the credit note.
