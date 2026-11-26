/**
 * lib/interestNotify.js - the lead-inbox notification for an interest registration, recorded on the registration.
 *
 * Each registration carries `notification`:
 *   status       pending | accepted | failed | gave-up | not-configured
 *                 'accepted' means the provider (Resend) ACCEPTED the message (HTTP 2xx with an id). It is not proof of
 *                 delivery: no delivery webhook is configured, so deliveredAt stays null unless delivery evidence is
 *                 recorded later (docs/launch/interest-operations.md).
 *   attempts, lastAttemptAt, acceptedAt, providerId, deliveredAt
 *   lastError    sanitised: an HTTP status or an error class, never a response body or an address.
 *
 * Idempotent and bounded:
 *   - a per-registration lock (SET NX, 120 s) stops two runs sending at once;
 *   - Resend's Idempotency-Key "interest-notify/<id>" stops a duplicate e-mail if an accepted send is retried;
 *   - an accepted registration is never sent again; at MAX_ATTEMPTS the status becomes gave-up;
 *   - retries wait an exponential back-off (retryDue).
 * Uses only the existing store (lib/db.js) and the existing Resend configuration.
 */
import { getLead, updateLead, claimOnce, releaseKey } from './db.js';

export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 5 * 60 * 1000;

export function newNotification() {
  return { status: 'pending', attempts: 0, lastAttemptAt: null, acceptedAt: null, providerId: null, deliveredAt: null, lastError: null };
}

/** Is a retry due now for this registration? */
export function retryDue(rec, now = Date.now()) {
  const n = rec?.notification;
  if (!n || !['pending', 'failed', 'not-configured'].includes(n.status) || n.attempts >= MAX_ATTEMPTS) return false;
  if (!n.lastAttemptAt) return true;
  return now - Date.parse(n.lastAttemptAt) >= BASE_DELAY_MS * 2 ** Math.max(0, n.attempts - 1);
}

function body(record) {
  return [
    `Agent:       ${record.agentSlug} (${record.agentTier || '-'}, ${record.availability})`,
    `Company:     ${record.company}`,
    `Role:        ${record.role || '-'}`,
    `Email:       ${record.email}`,
    `Industry:    ${record.industry || '-'}`,
    `Technology:  ${record.techEnvironment || '-'}`,
    `Timeframe:   ${record.timeframe || '-'}`,
    `Use case:    ${record.useCase || '-'}`,
    `Other needs: ${record.requirements || '-'}`,
    `Marketing:   ${record.marketing?.optIn ? 'opted in' : 'no'}`,
    `Record:      ${record.id}`,
  ].join('\n');
}

/**
 * Try once to notify for a stored registration and record the outcome on it. Returns the notification state.
 * fetchImpl is injectable for tests.
 */
export async function notifyInterest(id, { fetchImpl = fetch, now = () => new Date() } = {}) {
  const lock = `interest:notify-lock:${id}`;
  if (!(await claimOnce(lock, 120))) return { status: 'locked' };
  try {
    const rec = await getLead('interest', id);
    if (!rec) return { status: 'missing' };
    const n = { ...newNotification(), ...(rec.notification || {}) };
    if (n.status === 'accepted' || n.status === 'gave-up') return n;
    if (n.attempts >= MAX_ATTEMPTS) { n.status = 'gave-up'; await updateLead('interest', { ...rec, notification: n }); return n; }

    const key = process.env.RESEND_API_KEY; const to = process.env.DEMO_NOTIFY_EMAIL;
    n.lastAttemptAt = now().toISOString();
    if (!key || !to) {
      n.status = 'not-configured'; n.lastError = 'not-configured';
      await updateLead('interest', { ...rec, notification: n });
      return n;
    }
    n.attempts += 1;
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `interest-notify/${rec.id}` },
        body: JSON.stringify({
          from: process.env.DEMO_NOTIFY_FROM || 'ColleagueAI <hello@colleagueai.ai>',
          to: [to], reply_to: rec.email,
          subject: `Interest registered: ${rec.agentSlug} (${rec.company})`,
          text: body(rec),
        }),
      });
      if (res.ok) {
        let pid = null; try { pid = (await res.json())?.id ?? null; } catch { pid = null; }
        Object.assign(n, { status: 'accepted', acceptedAt: now().toISOString(), providerId: typeof pid === 'string' ? pid.slice(0, 80) : null, lastError: null });
      } else {
        Object.assign(n, { status: n.attempts >= MAX_ATTEMPTS ? 'gave-up' : 'failed', lastError: `HTTP ${res.status}` });
      }
    } catch (e) {
      Object.assign(n, { status: n.attempts >= MAX_ATTEMPTS ? 'gave-up' : 'failed', lastError: String(e?.name || 'Error').slice(0, 40) });
    }
    await updateLead('interest', { ...rec, notification: n });
    return n;
  } finally {
    try { await releaseKey(lock); } catch { /* the lock expires on its own */ }
  }
}
