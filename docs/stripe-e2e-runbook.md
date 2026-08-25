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
   `charge.dispute.created`, `charge.dispute.closed`.
   Copy the signing secret (`whsec_…`).
3. Settings → Payment methods: enable **Cards** (and "Bank transfers" only if you
   want to test the delayed lane in a second pass).

**Vercel → Project → Settings → Environment Variables, scope = _Preview_ ONLY:**

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `DOWNLOAD_TOKEN_SECRET` | any long random string (`openssl rand -hex 32`) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | your Upstash REST pair (already set for demo bookings — confirm they exist for Preview) |
| `CAI_ENABLE_CHECKOUT` | `1` — flips the storefront's pay panel to checkout mode in the built preview only |

Leave `R2_*` unset for the first pass: `/api/download` then serves a placeholder
PDF, which is fine — the gate is the *flow*, the real files come with R2 later.

**Deploy a preview:** push any branch (this one) and open the preview URL Vercel
gives the PR.

## 1. Gate 0 — automated preflight (from your machine)

```powershell
$env:BASE_URL = "https://<preview>.vercel.app"
node scripts/verify-stripe-e2e.mjs
```

All checks must pass before spending time on manual steps. It verifies input
hardening, signature enforcement, and that downloads fail closed (forged
signature, expired token, missing entitlement) — with `$env:DOWNLOAD_TOKEN_SECRET`
also set, it proves the 15-minute expiry refuses an expired-but-valid signature.

## 2. Happy path — card

1. Open `https://<preview>.vercel.app/agents`, pick an agent, open the access
   panel → the CTA should now go to checkout (preview only).
2. Pay with **`4242 4242 4242 4242`**, any future expiry, any CVC, any name, and
   an email you can check (use something like `buyer-test-1@yourdomain`).
3. You land on `/api/success` → **Download agent package** appears.
   - The link is `/api/download?...&exp=…&sig=…` — note `exp` is ~15 min ahead.
4. Download works once, and again on refresh (entitlement, not one-shot).
5. Stripe Dashboard → Payments: the payment shows
   `ColleagueAI - <Agent> (L*)`; metadata carries `agent_slug` + `tier`.
6. Dashboard → Webhooks → the endpoint: `checkout.session.completed`
   delivered, response **200**.

## 3. Failure and 3DS

| Card | Expected |
| --- | --- |
| `4000 0000 0000 0002` | Declined at Stripe; no webhook fulfilment, no entitlement, `/api/success` never reached |
| `4000 0027 6000 3184` | 3DS challenge appears; **complete** it → behaves exactly like the happy path |
| `4000 0027 6000 3184`, then **fail** the challenge | Back at checkout, nothing granted |

After the declined attempts: `/api/download` with the OLD link still works (the
first purchase's entitlement is untouched), and no new entitlement email exists.

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
2. Take buyer 1's download URL and change `email=` to buyer 2's address → **403**
   (signature covers the email). Re-sign attempts without the secret are
   impossible; `scripts/verify-stripe-e2e.mjs` already proved forged signatures
   are refused.
3. Buyer 2's own link downloads buyer 2's agent only.

## 6. Expiry, resend, recovery

1. Wait 15+ minutes (or reuse the preflight's expired-token check) → the old
   download link now answers **403 `expired`**.
2. Re-open the same `/api/success?session_id=…` URL from the confirmation —
   a **fresh** signed link is issued and works. That is the recovery path for
   "buyer lost the link": they reopen the Stripe receipt's success URL.
3. `/api/success` with the same session never double-grants (idempotent merge).

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

## 8. Optional second pass — delayed bank transfer

With "Bank transfers" enabled in the test Dashboard: choose the bank lane,
Stripe issues virtual account details; the session completes `unpaid` (webhook
answers `status: "pending"`, nothing granted). In test mode, fund the balance
from the payment page's test controls → `async_payment_succeeded` arrives →
entitlement granted then, not before. `/api/success` meanwhile shows the
"awaiting your bank transfer" page.

## 9. Sign-off checklist

- [ ] Preflight script: all PASS
- [ ] Card happy path: paid → entitled → downloaded
- [ ] Decline + 3DS complete + 3DS abandon behave
- [ ] Webhook resend ×2: no double credit
- [ ] Cross-customer swap: 403
- [ ] 15-min expiry: 403 `expired`; success-page reopen re-issues
- [ ] Full refund: commission reversed AND entitlement revoked
- [ ] (optional) bank-transfer lane grants only on clearance

When every box is ticked, the commercial verdict moves to PASS pending R2 real
files. Going live then = set the same env vars in **Production** scope (live
keys, live webhook endpoint on `www.colleagueai.ai`), upload real packages to
R2, flip `STORE.checkoutEnabled:true` in `public/agents.html` in a reviewed PR,
and keep `CAI_ENABLE_CHECKOUT` OUT of Production (it is a preview-only device).
