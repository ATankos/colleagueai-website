/**
 * api/certification-reconcile.js - the daily certificate reconciliation, run by Vercel Cron (vercel.json "crons").
 *
 * Founder decision (Round 3): finish failed certificate issuances and evidence repairs every day and alert when anything
 * is still outstanding. Uses existing infrastructure only (Vercel Cron on the current plan, the existing Resend transport).
 *
 * PREPARED, NOT ACTIVE: Vercel calls this with "Authorization: Bearer <CRON_SECRET>". Until the owner sets CRON_SECRET in
 * the Production environment the endpoint refuses every call (503), so merging it changes nothing. Vercel runs cron jobs
 * on Production deployments only, never on Previews. The response holds counts only.
 */
import { timingSafeEqual } from 'node:crypto';
import { reconcileCertificates, alertIfNeeded } from '../lib/certificationReconcile.js';

function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return null; // not configured: the job is not active
  const got = String(req.headers?.authorization ?? '');
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const ok = authorised(req);
  if (ok === null) return res.status(503).json({ error: 'Reconciliation is not configured', code: 'cron_not_configured' });
  if (!ok) return res.status(401).json({ error: 'Unauthorised' });
  try {
    const report = await reconcileCertificates({ apply: true });
    const alert = await alertIfNeeded(report);
    return res.status(200).json({ ...report, alert });
  } catch (err) {
    // The store itself is unreachable: that is an alert too, and the cron run shows as failed in Vercel.
    const report = { at: new Date().toISOString(), mode: 'run', ok: false, error: 'store-unavailable' };
    console.error('[certification-reconcile] run failed:', err?.message ?? err);
    await alertIfNeeded({ ...report, pendingIssuances: 'unknown', evidenceRepairs: 'unknown' });
    return res.status(500).json(report);
  }
}
