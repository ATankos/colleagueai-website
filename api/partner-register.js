/**
 * api/partner-register.js — Self-serve partner registration
 *
 * POST { name, email, code, consent }
 *   → stores the partner record in KV
 *   → returns { ok: true, code, link }
 *
 * The partner code is generated client-side (SHA-256 of email, first 8 hex chars,
 * prefixed with "CAI-"). This endpoint validates the code matches the email and
 * persists the registration so the back-office can track partners.
 *
 * Env vars needed (none beyond the existing KV vars already in .env).
 */

import { registerPartner } from '../lib/db.js';

// Reproduce the same deterministic code logic used on the frontend
// so we can verify the submitted code isn't tampered with.
async function deriveCode(email) {
  const enc = new TextEncoder().encode(email.toLowerCase().trim());
  // Node 18+ has Web Crypto in globalThis
  const buf = await globalThis.crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return 'CAI-' + hex.slice(0, 8).toUpperCase();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  'https://www.colleagueai.ai');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, code, consent } = req.body ?? {};

  if (!name || !email || !code) {
    return res.status(400).json({ error: 'name, email and code are required' });
  }
  if (consent !== true && consent !== 'true') {
    return res.status(400).json({ error: 'GDPR consent is required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Verify the submitted code matches what we'd derive from the email
  let expected;
  try { expected = await deriveCode(email); } catch (e) {
    return res.status(500).json({ error: 'Code derivation failed' });
  }
  if (code !== expected) {
    return res.status(400).json({ error: 'Code does not match email' });
  }

  try {
    const record = await registerPartner({ code, name: name.trim(), email, consent: true, consentAt: new Date().toISOString() });
    const link = `https://www.colleagueai.ai/agents?partner=${code}`;
    res.setHeader('Access-Control-Allow-Origin', 'https://www.colleagueai.ai');
    return res.status(200).json({ ok: true, code, link, registeredAt: record.registeredAt });
  } catch (err) {
    console.error('[partner-register]', err);
    return res.status(500).json({ error: 'Registration failed — please try again' });
  }
}
