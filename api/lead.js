/**
 * api/lead.js — Inbound lead capture for the pricing page and the partner programme.
 *
 * POST { type: "pricing" | "partner", ...fields, consent: true }
 *   → validates, rate-limits, persists to KV, returns { ok: true }
 *
 * Uses the KV store already configured for entitlements/partners; no new
 * dependency and no new env vars. If KV is unavailable the request fails
 * closed with a 503 so the form can tell the user to email us instead.
 */
import { saveLead, rateLimit } from '../lib/db.js';

const ORIGIN = 'https://www.colleagueai.ai';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only these keys are stored, and each is length-capped. Anything else is dropped.
const FIELDS = {
  pricing: {
    required: ['name', 'email', 'company'],
    optional: ['jobTitle', 'country', 'companySize', 'useCase', 'timeline', 'systems', 'problem', 'locale', 'page']
  },
  partner: {
    required: ['name', 'email', 'company'],
    optional: ['website', 'country', 'partnerType', 'industries', 'reach', 'description', 'existingPartnerships', 'locale', 'page']
  }
};
const MAX = { problem: 2000, description: 2000, default: 300 };

const clean = (v, key) => String(v ?? '').trim().slice(0, MAX[key] || MAX.default);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);

  const body = req.body ?? {};
  const type = String(body.type || '').toLowerCase();
  const schema = FIELDS[type];
  if (!schema) return res.status(400).json({ error: 'Unknown lead type' });

  // Honeypot: bots fill hidden fields. Accept silently so they do not retry.
  if (clean(body.website_confirm)) return res.status(200).json({ ok: true });

  if (body.consent !== true && body.consent !== 'true') {
    return res.status(400).json({ error: 'Consent to the privacy policy is required' });
  }

  const fields = {};
  for (const key of [...schema.required, ...schema.optional]) {
    const v = clean(body[key], key);
    if (v) fields[key] = v;
  }
  for (const key of schema.required) {
    if (!fields[key]) return res.status(400).json({ error: `Missing required field: ${key}` });
  }
  if (!EMAIL_RE.test(fields.email)) return res.status(400).json({ error: 'Invalid email address' });

  // Abuse protection: per-IP and per-email windows.
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  try {
    const okIp = await rateLimit(`lead:ip:${ip}`, 10, 3600);
    const okEmail = await rateLimit(`lead:email:${fields.email.toLowerCase()}`, 5, 3600);
    if (!okIp || !okEmail) return res.status(429).json({ error: 'Too many submissions — please try again later' });
  } catch (err) {
    console.error('[lead] rate limit unavailable', err);
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }

  try {
    await saveLead(type, { ...fields, consent: true, consentAt: new Date().toISOString(), ip });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[lead]', err);
    return res.status(503).json({ error: 'Could not record your request — please email hello@colleagueai.ai' });
  }
}
