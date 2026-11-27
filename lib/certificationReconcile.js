/**
 * lib/certificationReconcile.js - the daily certificate reconciliation (founder decision, Round 3).
 *
 * One routine for both entry points: scripts/certification-reconcile.mjs (an operator, by hand) and
 * api/certification-reconcile.js (the daily Vercel cron). It finishes certificate work that failed part-way and reports
 * what is still outstanding, in counts only (no email address, no certificate id):
 *   pendingIssuances  paid subscriptions whose certificate is not issued yet (lib/db.js recordPendingIssuance)
 *   evidenceRepairs   certificates whose permanent evidence still misses an entry (lib/db.js queueEvidenceRepair)
 * A report is "ok" only when both are zero and nothing failed in this run. Anything else raises an alert: always to the
 * log (Vercel runtime logs), and by email through the existing Resend transport when OPS_ALERT_EMAIL is configured.
 * Nothing here costs money beyond the existing plan: one function run per day, one email only when something is wrong.
 */
import { retryPendingIssuances, retryEvidenceRepairs, pendingIssuanceCount, evidenceRepairCount } from './db.js';
import { mailConfigured, sendMail } from './mail.js';

export async function reconcileCertificates({ apply = true, limit = 200 } = {}) {
  const run = apply
    ? { issuing: await retryPendingIssuances({ limit }), repairs: await retryEvidenceRepairs({ limit }) }
    : {};
  const pendingIssuances = await pendingIssuanceCount();
  const evidenceRepairs = await evidenceRepairCount();
  const failed = (run.issuing?.failed ?? 0) + (run.repairs?.failed ?? 0);
  return {
    at: new Date().toISOString(),
    mode: apply ? 'run' : 'status',
    ...run,
    pendingIssuances,
    evidenceRepairs,
    ok: pendingIssuances === 0 && evidenceRepairs === 0 && failed === 0,
  };
}

/** Raise an alert for a report that is not ok. Returns how it was raised; never throws (an alert must not hide the report). */
export async function alertIfNeeded(report, { env = process.env } = {}) {
  if (report.ok) return { alerted: false };
  console.error('[certification-reconcile] ALERT %s', JSON.stringify(report));
  const to = env.OPS_ALERT_EMAIL;
  if (!to || !mailConfigured()) return { alerted: true, channels: ['log'] };
  try {
    const sent = await sendMail({
      to,
      subject: `[ColleagueAI] Certificate reconciliation needs attention (${report.pendingIssuances} issuance(s), ${report.evidenceRepairs} evidence repair(s))`,
      text: [
        'The daily certificate reconciliation found work it could not finish.',
        '',
        `Pending issuances: ${report.pendingIssuances}`,
        `Outstanding evidence repairs: ${report.evidenceRepairs}`,
        `Failed in this run: issuances ${report.issuing?.failed ?? 0}, evidence repairs ${report.repairs?.failed ?? 0}`,
        '',
        'Run `node scripts/certification-reconcile.mjs --status` for the current counts, then follow',
        'docs/continuous-certification/reconciliation-runbook.md. This email contains counts only.',
      ].join('\n'),
    });
    return sent?.sent === false ? { alerted: true, channels: ['log'], emailFailed: true } : { alerted: true, channels: ['log', 'email'] };
  } catch (err) {
    console.error('[certification-reconcile] alert email failed:', err?.message ?? err);
    return { alerted: true, channels: ['log'], emailFailed: true };
  }
}
