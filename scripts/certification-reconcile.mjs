#!/usr/bin/env node
/**
 * scripts/certification-reconcile.mjs - finish certificate work that failed part-way (CAI-AUD-003).
 *
 *   node scripts/certification-reconcile.mjs            run the queued issuances and evidence repairs, print counts
 *   node scripts/certification-reconcile.mjs --status   print how many issuances are waiting; change nothing
 *
 * Needs KV_REST_API_URL and KV_REST_API_TOKEN (the same as the site). Output is counts only: no email, no certificate id.
 * Exit code 1 when anything is still failing or waiting, so a scheduled run can alert.
 */
import { retryPendingIssuances, retryEvidenceRepairs, pendingIssuanceCount } from '../lib/db.js';

if (process.argv.includes('--status')) {
  const waiting = await pendingIssuanceCount();
  console.log(JSON.stringify({ waiting }));
  process.exit(waiting ? 1 : 0);
}
const issuing = await retryPendingIssuances({ limit: 200 });
const repairs = await retryEvidenceRepairs({ limit: 200 });
const waiting = await pendingIssuanceCount();
console.log(JSON.stringify({ issuing, repairs, waiting }));
process.exit(issuing.failed || repairs.failed || waiting ? 1 : 0);
