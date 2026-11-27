/**
 * api/interest.js - "Register your interest" for agents that are not on sale, plus anonymous demand counters.
 *
 * POST /api/interest                   a registration (JSON body, see FIELDS below)
 * POST /api/interest?event=view        an anonymous factsheet/drawer view of one agent: { agent }
 *
 * Registrations:
 *   - only for a known catalogue agent whose public status admits interest (coming-soon, temporarily-unavailable,
 *     early-access); an Available or Discontinued agent is refused, so the form can never stand in for a sale;
 *   - consent is required and recorded with the text version shown; data is minimised (no name, no phone,
 *     no free-form personal data beyond two capped text fields) and kept 365 days (lib/db.js saveLead TTL);
 *   - spam protection: per-IP rate limit, a honeypot field and a minimum fill time;
 *   - duplicate detection: one registration per email and agent per 30 days (SET NX on a salted hash, so the
 *     dedupe key holds no plain address); a duplicate answers 200 with duplicate:true and stores nothing new;
 *   - notification to the existing lead inbox (RESEND_API_KEY + DEMO_NOTIFY_EMAIL), recorded on the registration and
 *     retried idempotently by scripts/interest-notify-retry.mjs (lib/interestNotify.js);
 *   - direct follow-up about the agent (consent, required) is separate from optional marketing (marketingOptIn, unticked);
 *   - success is reported only after the record is stored, and no release date is ever promised.
 * Demand counters (lib/db.js incrDemand): per agent and month, no personal data, read by scripts/demand-report.mjs.
 *
 * GATE B - privacy activation switch. Registrations (personal data) are accepted only when the server-side flag
 * INTEREST_COLLECTION_ENABLED is exactly "true". It is OFF by default and is not set by any deployment step: the
 * founder turns it on after the privacy notice covering interest registrations is approved and published and the
 * production store and notifications are verified (docs/launch/release-gates-abc.md). While it is off, a POST is
 * refused before any field is read or stored, and GET /api/interest?status tells the page so it shows no form.
 * The anonymous view counter stays on: it stores counts only, and its rate-limit key holds no plain IP address.
 */
import crypto from 'node:crypto';
import { rateLimit, saveLead, claimOnce, releaseKey, incrDemand } from '../lib/db.js';
import { recordFor, publicStatus } from '../lib/availability.js';
import { newNotification, notifyInterest } from '../lib/interestNotify.js';

export const CONSENT_VERSION = 'interest-2026-11-26';
export const MARKETING_VERSION = 'marketing-2026-11-26';
export const collectionEnabled = () => process.env.INTEREST_COLLECTION_ENABLED === 'true';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPEN_FOR_INTEREST = new Set(['coming-soon', 'temporarily-unavailable', 'early-access']);
export const TECH = ['m365-copilot', 'copilot-studio', 'power-platform', 'azure', 'other', 'not-sure'];
export const TIMEFRAME = ['0-3-months', '3-6-months', '6-12-months', '12-plus-months', 'exploring'];
export const INDUSTRY = ['financial-services', 'manufacturing', 'public-sector', 'healthcare', 'technology', 'professional-services',
  'retail', 'energy-utilities', 'logistics', 'other'];
const DEDUPE_DAYS = 30;
const MIN_FILL_MS = 2500;

const first = (v) => (Array.isArray(v) ? v[0] : v);
const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : '');
const pick = (v, list) => (list.includes(v) ? v : null);

/**
 * CAI-AUD-002: the keyed secret used for every pseudonymous key. There is NO public fallback constant: a key derived
 * from a known constant can be recomputed from an email address by anyone who reads the store. Returns null when
 * unset; registrations then refuse (see handler), and counters/rate limits use a random per-process key instead.
 */
export function keyedSecret() {
  return process.env.INTEREST_DEDUPE_SALT || process.env.DOWNLOAD_TOKEN_SECRET || null;
}
let ephemeralKey = null;
/** Key for rate limits and anonymous counters: the configured secret, else a random key held only in memory. */
function counterSecret() {
  if (keyedSecret()) return keyedSecret();
  ephemeralKey ??= crypto.randomBytes(32).toString('hex');
  return ephemeralKey;
}

/** A per-day salted hash of the client address: rate limiting without keeping a plain IP in the store. */
function ipKey(req) {
  return crypto.createHmac('sha256', counterSecret()).update(clientIp(req) + '|' + new Date().toISOString().slice(0, 10)).digest('hex').slice(0, 24);
}

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|curl|wget|python-requests|httpclient|axios|node-fetch|go-http|java\//i;
export function isBot(req) {
  const ua = String(first(req.headers?.['user-agent']) || '');
  return !ua || BOT_UA.test(ua);
}
function viewKey(req, agent) {
  const ua = String(first(req.headers?.['user-agent']) || '').slice(0, 200);
  return crypto.createHmac('sha256', counterSecret()).update([clientIp(req), ua, agent, new Date().toISOString().slice(0, 10)].join('|')).digest('hex').slice(0, 32);
}

function clientIp(req) {
  const fwd = first(req.headers['x-forwarded-for']);
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return first(req.headers['x-real-ip']) || req.socket?.remoteAddress || 'unknown';
}

/** Duplicate marker for a registration. Only ever built with the keyed secret (the handler refuses without one). */
function dedupeKey(email, agent) {
  return 'interest:seen:' + crypto.createHmac('sha256', keyedSecret()).update(email.toLowerCase() + '|' + agent).digest('hex').slice(0, 32);
}

export default async function handler(req, res) {
  if (req.method === 'GET' && first(req.query?.status) !== undefined) {
    res.setHeader?.('Cache-Control', 'no-store');
    return res.status(200).json({ enabled: collectionEnabled() });
  }
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const agent = clean(body.agent, 64);
  const rec = recordFor(agent);
  if (!rec) return res.status(400).json({ error: 'Unknown agent', code: 'unknown_agent' });

  // Anonymous view beacon: counts only, no personal data, its own rate limit; never fails the page.
  // Filtered engagement: obvious automation is counted apart, and each visitor counts once per agent per day.
  // The daily key is a salted hash of address + user agent + agent + day, kept 24 h: no persistent visitor id.
  if (first(req.query?.event) === 'view') {
    try {
      if (isBot(req)) await incrDemand('bot', agent);
      else if (await rateLimit(`interest-view:${ipKey(req)}`, 120, 3600) && await claimOnce(`demand:seen:${viewKey(req, agent)}`, 86400)) await incrDemand('view', agent);
    } catch { /* counters are best-effort */ }
    return res.status(204).end();
  }

  // Gate B: no personal data is read, checked or stored unless collection has been switched on.
  if (!collectionEnabled()) {
    return res.status(503).json({ error: 'Interest registration is not open yet. Please email hello@colleagueai.ai.', code: 'interest_collection_disabled' });
  }
  // CAI-AUD-002: a registration needs the keyed secret for its duplicate marker. Without it, refuse; never store
  // personal data under a predictable key.
  if (!keyedSecret()) {
    console.error('[interest] INTEREST_DEDUPE_SALT (or DOWNLOAD_TOKEN_SECRET) is not set: registration refused');
    return res.status(503).json({ error: 'We could not record your registration just now. Please email hello@colleagueai.ai.', code: 'interest_not_configured' });
  }

  const availability = publicStatus(agent);
  if (!OPEN_FOR_INTEREST.has(availability)) {
    return res.status(409).json({ error: 'Interest registration is not open for this agent', code: 'not_open_for_interest', availability });
  }

  try {
    if (!(await rateLimit(`interest:${ipKey(req)}`, 8, 3600))) {
      return res.status(429).json({ error: 'Too many registrations from this address. Please email hello@colleagueai.ai.', code: 'rate_limited' });
    }
  } catch {
    return res.status(503).json({ error: 'We could not record your registration just now. Please email hello@colleagueai.ai.', code: 'store_unavailable' });
  }

  // Spam: a filled honeypot or an instant submission is answered like a success and stored nowhere.
  const startedAt = Number(body.startedAt);
  if (clean(body.website, 200) || (Number.isFinite(startedAt) && Date.now() - startedAt < MIN_FILL_MS)) {
    return res.status(200).json({ success: true });
  }

  const email = clean(body.email, 254);
  const company = clean(body.company, 200);
  const useCase = clean(body.useCase, 600);
  if (!email || !company) return res.status(400).json({ error: 'Missing required fields', code: 'missing_fields' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email format', code: 'invalid_email' });
  if (body.consent !== true) return res.status(400).json({ error: 'Consent is required', code: 'consent_required' });

  try {
    if (!(await claimOnce(dedupeKey(email, agent), DEDUPE_DAYS * 86400))) return res.status(200).json({ success: true, duplicate: true });
  } catch {
    return res.status(503).json({ error: 'We could not record your registration just now. Please email hello@colleagueai.ai.', code: 'store_unavailable' });
  }

  let record;
  try {
    record = await saveLead('interest', {
      email, company,
      role: clean(body.role, 120) || null,
      agentSlug: agent,
      agentTier: rec.cai?.targetLevel || null,
      availability,
      useCase: useCase || null,
      industry: pick(body.industry, INDUSTRY),
      techEnvironment: pick(body.techEnvironment, TECH),
      timeframe: pick(body.timeframe, TIMEFRAME),
      requirements: clean(body.requirements, 600) || null,
      consent: { version: CONSENT_VERSION, at: new Date().toISOString(), scope: 'follow-up about this agent' },
      marketing: { optIn: body.marketingOptIn === true, version: MARKETING_VERSION, at: body.marketingOptIn === true ? new Date().toISOString() : null },
      notification: newNotification(),
      locale: /^[a-z]{2}$/.test(clean(body.locale, 2)) ? clean(body.locale, 2) : 'en',
      source: clean(first(req.headers.referer), 300) || null,
    }, { ttlDays: 365 });
  } catch (error) {
    console.error('[interest] store failed:', error.message);
    try { await releaseKey(dedupeKey(email, agent)); } catch { /* the dedupe marker expires on its own */ }
    return res.status(503).json({ error: 'We could not record your registration just now. Please email hello@colleagueai.ai.', code: 'store_unavailable' });
  }

  try { await incrDemand('interest', agent); } catch { /* counters are best-effort */ }
  let notified;
  try { notified = await notifyInterest(record.id); } catch { notified = { status: 'failed' }; }
  // No personal data in logs: the id, the agent and the notification state only.
  console.log('[interest]', { id: record.id, agent, availability, notification: notified.status });

  return res.status(200).json({ success: true, id: record.id });
}
