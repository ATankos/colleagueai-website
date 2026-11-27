#!/usr/bin/env node
/**
 * scripts/certification-reconcile.mjs - finish certificate work that failed part-way (CAI-AUD-003), by hand.
 * The same routine runs daily as api/certification-reconcile.js once CRON_SECRET is set (lib/certificationReconcile.js).
 *
 *   node scripts/certification-reconcile.mjs            run the queued issuances and evidence repairs, print the report
 *   node scripts/certification-reconcile.mjs --status   print pending issuances AND outstanding evidence repairs; change nothing
 *
 * Needs KV_REST_API_URL and KV_REST_API_TOKEN (the same as the site). Output is counts only: no email, no certificate id.
 * Exit code 1 when anything is still waiting or failed, so a scheduled run can alert.
 */
import { reconcileCertificates } from '../lib/certificationReconcile.js';

const report = await reconcileCertificates({ apply: !process.argv.includes('--status') });
console.log(JSON.stringify(report));
process.exit(report.ok ? 0 : 1);
