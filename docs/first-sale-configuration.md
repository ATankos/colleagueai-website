# Smallest first-sale configuration (prepared 20 Nov 2026, not applied)

Everything below stays exactly as it is until the accountant's written answers (T1–T14) and counsel's texts exist. Nothing here approves anything.

| Control | First-sale value | Where | Who flips it |
|---|---|---|---|
| Product on sale | only `contract-intelligence-and-register` (CAI-L4-CI-001), `saleApproved: true` | `config/products.json` — founder's own GO PR | Founder |
| Every other catalogue agent | no record → default-deny (`lib/products.js`), 409 at checkout | already so | — |
| Continuous Certification subscription | closed: `certificationSalesEnabled()` false → 409 "not yet open" | already so | — |
| Bank transfer / pro-forma (T12) | **off**: `CAI_PAYMENT_METHODS=card` (Production) — this PR | Vercel env | Founder, after accountant T12 decides when to open it |
| Buyer categories | accountant's treatment per category in `config/tax-policy.json`: the approved first-sale jurisdiction(s) `action: "sell"`, every other category `action: "hold"` (buyer gets the hold notice, no session is created). Example shape only — values come from the accountant: `cz_business: sell`, all EU/non-EU: `hold`. | `config/tax-policy.json` (`status: approved` only with the accountant's name, role, date, reference) | Accountant decides, founder commits |
| Currency | USD only (EUR price exists in code; keep USD for the first sale unless the accountant's T8 answer says otherwise) | checkout `currency` default | Founder |
| Tax calculation | per accountant: `checkout.stripeTax`, `requireTaxIdIfSupported`, `invoiceRoute` | `config/tax-policy.json` | Accountant |
| Live keys | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (live) entered by the founder; `CAI_ENABLE_CHECKOUT` unset until runbook step 8 | Vercel Production env | Founder only |
| Kill switch | unset `CAI_ENABLE_CHECKOUT` or revert the GO PR → 503 `checkout_disabled` | Vercel / git | Founder (agent may revert on instruction) |

Verification after the founder sets it (sandbox first, Preview with test keys): a `method=bank` request yields a card-only Stripe session; a buyer in a `hold` category sees the hold notice and no session; a buyer in the `sell` category reaches Stripe Checkout with the accountant's invoice wording in the footer.
