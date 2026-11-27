# Certificate reconciliation runbook

The daily job finishes certificate work that failed part-way and alerts when anything is still outstanding.
Code: `lib/certificationReconcile.js` (shared), `api/certification-reconcile.js` (daily, Vercel Cron), `scripts/certification-reconcile.mjs` (by hand).

## What it reports (counts only, no personal data)

| Field | Meaning |
|---|---|
| `pendingIssuances` | paid subscriptions whose certificate is not issued yet (store failed during the webhook) |
| `oldestPendingDays` | age in days of the oldest pending issuance (null when none); escalate after 7, 90 is the proposed retention limit |
| `evidenceRepairs` | certificates whose permanent evidence still misses a committed decision entry |
| `issuing.{attempted,issued,ended,failed}` | this run's issuance retries (`ended` = the subscription was found ended: correctly not issued) |
| `repairs.{attempted,repaired,failed}` | this run's evidence repairs |
| `ok` | true only when both outstanding counts are 0 and nothing failed |

## Activation (owner steps; nothing is active until they are done)

1. In Vercel → Project → Settings → Environment Variables → **Production**, add `CRON_SECRET` (a random value of 32+ characters). Until this exists the endpoint answers 503 to every call, including Vercel's.
2. Optional: add `OPS_ALERT_EMAIL` (the address that receives alerts). Alerts are emailed only if `RESEND_API_KEY` is also set (the existing transport); otherwise they go to the runtime log only.
3. Redeploy Production. Vercel then calls `/api/certification-reconcile` once a day at 04:17 UTC (`vercel.json` → `crons`). Vercel runs cron jobs on Production only, never on Previews.
4. Check the first run: Vercel → Project → Cron Jobs → View logs, or Runtime Logs filtered by `certification-reconcile`.

Cost: one function run per day and, only when something is wrong, one email. Both are within the existing plan and Resend's free tier; no new service is added.

## When an alert arrives

1. `node scripts/certification-reconcile.mjs --status` (needs `KV_REST_API_URL`, `KV_REST_API_TOKEN` for Production) prints the current counts and changes nothing.
2. `node scripts/certification-reconcile.mjs` runs the retries now and prints the report. Exit code 1 means work is still outstanding.
3. If `failed` stays above 0 for two runs, the store or Stripe is failing for a specific record. Read the runtime log for `[certificate]` / `[webhook]` lines (they name the subscription or certificate id, never the email). An issuance outstanding for more than 7 days is escalated to the owner; the buyer holds a valid licence meanwhile, only the certificate is missing.
4. Record the incident and the outcome in the operational record.

## Rollback

Remove the `crons` entry from `vercel.json` (or delete `CRON_SECRET`) and redeploy. The webhook still retries queued work opportunistically on later subscription events, and the script still works by hand.
