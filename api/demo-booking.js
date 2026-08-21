/**
 * api/demo-booking.js — Handle demo booking form submissions
 * Receives: email, company, role, agentsOfInterest[], preferredDate, timeZone
 *
 * What this used to do, and why it changed: it validated the submission,
 * console.logged the visitor's email, company and role into the function logs,
 * and returned {success:true} with a fabricated booking id and the message
 * "We will contact you within 24 hours." Both email sends were commented-out
 * TODOs. So every lead was told they would be contacted, and nobody received
 * the request. Two consequences, both fixed here:
 *
 *   1. The booking is now persisted to the same KV store used for entitlements,
 *      and success is only reported if it was actually stored. If nothing can be
 *      recorded, this returns an error and the form shows its failure state,
 *      which tells the visitor to try again rather than lying to them.
 *   2. Personal data no longer goes to the logs. Vercel function logs are not a
 *      declared processing location and had no retention bound; the record now
 *      lives in KV with an explicit TTL, and the log line carries only the
 *      booking id and non-identifying counts.
 *
 * Email notification is optional and env-gated. With RESEND_API_KEY and
 * DEMO_NOTIFY_EMAIL set the booking is also emailed; without them the lead is
 * still durable and readable via listLeads('demo').
 */
import { rateLimit, saveLead } from '../lib/db.js';

const MAX = { email: 254, company: 200, role: 120, timeZone: 60 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PILLARS = new Set(['ops', 'risk', 'data', 'sales', 'corp']);

const first = (v) => (Array.isArray(v) ? v[0] : v);

function clientIp(req) {
  const fwd = first(req.headers['x-forwarded-for']);
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return first(req.headers['x-real-ip']) || req.socket?.remoteAddress || 'unknown';
}

/** Trim, cap length, and reject anything that isn't a plain string. */
function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

async function notify(record) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.DEMO_NOTIFY_EMAIL;
  if (!key || !to) return { sent: false, reason: 'not-configured' };

  const lines = [
    `Company:   ${record.company}`,
    `Role:      ${record.role}`,
    `Email:     ${record.email}`,
    `Preferred: ${record.preferredDate} (${record.timeZone})`,
    `Interests: ${record.agentsOfInterest.length ? record.agentsOfInterest.join(', ') : 'none specified'}`,
    `Booking:   ${record.id}`,
  ];

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.DEMO_NOTIFY_FROM || 'ColleagueAI <hello@colleagueai.ai>',
      to: [to],
      reply_to: record.email,
      subject: `Demo request — ${record.company}`,
      text: lines.join('\n'),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return { sent: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Public unauthenticated endpoint that writes: bound it per IP.
  // Fails closed — if the store is unreachable we cannot record a booking
  // anyway, so accepting more of them would only lose them faster.
  try {
    const ok = await rateLimit(`demo:${clientIp(req)}`, 5, 3600);
    if (!ok) {
      return res.status(429).json({
        error: 'Too many demo requests from this address. Please email hello@colleagueai.ai.',
      });
    }
  } catch {
    return res.status(503).json({
      error: 'We could not record your request just now. Please email hello@colleagueai.ai.',
      code: 'store_unavailable',
    });
  }

  const body = req.body || {};
  const email = clean(body.email, MAX.email);
  const company = clean(body.company, MAX.company);
  const role = clean(body.role, MAX.role);
  const preferredDate = clean(body.preferredDate, 10);
  const timeZone = clean(body.timeZone, MAX.timeZone) || 'UTC';

  if (!email || !company || !role || !preferredDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (!DATE_RE.test(preferredDate)) {
    return res.status(400).json({ error: 'Invalid preferred date' });
  }
  // The `min` attribute on the input is a convenience, not a control: anything
  // can POST here. One day of slack absorbs the spread of visitor time zones
  // without accepting a date that has genuinely already passed.
  const dayMs = 86400000;
  const requested = Date.parse(`${preferredDate}T00:00:00Z`);
  if (!Number.isFinite(requested) || requested < Date.now() - dayMs) {
    return res.status(400).json({ error: 'Preferred date must be today or later' });
  }

  // Only the catalogue's own pillar ids, so an arbitrary payload cannot be
  // stored through this field.
  const agentsOfInterest = (Array.isArray(body.agentsOfInterest) ? body.agentsOfInterest : [])
    .filter((v) => typeof v === 'string' && PILLARS.has(v))
    .slice(0, PILLARS.size);

  let record;
  try {
    record = await saveLead('demo', {
      email,
      company,
      role,
      agentsOfInterest,
      preferredDate,
      timeZone,
      source: clean(first(req.headers.referer), 300) || null,
    });
  } catch (error) {
    // Do not report success for a booking that was not recorded.
    console.error('[Demo Booking] store failed:', error.message);
    return res.status(503).json({
      error: 'We could not record your request just now. Please email hello@colleagueai.ai.',
      code: 'store_unavailable',
    });
  }

  // The booking is safe at this point. A failed notification is worth knowing
  // about but must not fail the request, since the lead is already durable.
  let notified;
  try {
    notified = await notify(record);
  } catch (error) {
    console.error('[Demo Booking] notification failed for', record.id, '-', error.message);
    notified = { sent: false, reason: 'send-failed' };
  }

  // No personal data in the logs: id and counts only.
  console.log('[Demo Booking]', {
    bookingId: record.id,
    receivedAt: record.receivedAt,
    interests: agentsOfInterest.length,
    notified: notified.sent,
  });

  return res.status(200).json({
    success: true,
    message: 'Demo request received. We will contact you within 24 hours.',
    bookingId: record.id,
  });
}
