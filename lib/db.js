/**
 * lib/db.js — Entitlement + Partner store (Upstash Redis / Vercel KV)
 *
 * Key schema:
 *   entitlement:<email>        → JSON  (download entitlements)
 *   partner:reg:<code>         → JSON  (partner registration + earnings)
 *   partner:email:<email>      → code  (reverse lookup)
 */

import { createHash, randomBytes } from 'node:crypto';

const BASE  = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!BASE || !TOKEN) {
  console.warn('[db] No KV env vars set — data will not persist.');
}

async function kv(command, ...args) {
  const res = await fetch(`${BASE}/${command}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`KV error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.result;
}

// ─── Entitlements ─────────────────────────────────────────────────────────────

export async function grantEntitlement(email, slugs, stripeSessionId) {
  const key = `entitlement:${email.toLowerCase()}`;
  const existing = await getEntitlement(email);
  const merged = {
    email: email.toLowerCase(),
    slugs: Array.from(new Set([...(existing?.slugs ?? []), ...slugs])),
    grantedAt:        existing?.grantedAt ?? new Date().toISOString(),
    updatedAt:        new Date().toISOString(),
    stripeSessionIds: [...(existing?.stripeSessionIds ?? []), stripeSessionId],
  };
  await kv('SET', key, JSON.stringify(merged));
  return merged;
}

export async function getEntitlement(email) {
  const raw = await kv('GET', `entitlement:${email.toLowerCase()}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function isEntitled(email, slug) {
  const ent = await getEntitlement(email);
  if (!ent) return false;
  return ent.slugs.includes(slug) || ent.slugs.includes('*');
}

// ─── Rate limiting (fixed window via INCR + EXPIRE) ──────────────────────────

/**
 * Returns true if the caller identified by `key` is within `max` hits per
 * `windowSeconds`. Atomic-enough for abuse protection (INCR is atomic; the
 * EXPIRE on first hit bounds the window). Throws if KV is unavailable —
 * callers decide whether to fail open or closed.
 */
export async function rateLimit(key, max, windowSeconds) {
  const k = `rl:${key}`;
  const n = Number(await kv('INCR', k));
  if (n === 1) await kv('EXPIRE', k, String(windowSeconds));
  return n <= max;
}

// ─── Webhook idempotency ──────────────────────────────────────────────────────

/**
 * Atomically claim a Stripe event id (SET NX). Returns true the FIRST time only,
 * false on redeliveries — callers must skip side effects when false.
 */
export async function claimEvent(eventId, ttlSeconds = 60 * 60 * 24 * 30) {
  const res = await kv('SET', `stripe:event:${eventId}`, '1', 'NX', 'EX', String(ttlSeconds));
  return res === 'OK';
}

/** Same per checkout session, so two DIFFERENT events can never credit one sale twice. */
export async function claimSession(sessionId) {
  const res = await kv('SET', `stripe:session:${sessionId}`, '1', 'NX');
  return res === 'OK';
}

/** Best-effort rollback of claims when a later write fails, so Stripe's retry is processed. */
export async function releaseClaims(eventId, sessionId) {
  await Promise.allSettled([
    kv('DEL', `stripe:event:${eventId}`),
    kv('DEL', `stripe:session:${sessionId}`),
  ]);
}

// ─── Partner programme ────────────────────────────────────────────────────────

/**
 * Register a partner (or update if they re-register).
 * Keys: partner:reg:<code>   → JSON record
 *       partner:email:<email> → code  (reverse lookup)
 */
/* Commission ledger.
 *
 * Every commission is a separate ledger entry keyed by the Stripe session, so a
 * sale can be reversed without recomputing partner totals from aggregates. The
 * lifecycle is pending -> approved -> paid, or -> reversed on refund/dispute.
 *
 * Three rules this enforces that the previous version did not:
 *   1. A partner record existing is NOT accreditation. status must be "approved".
 *   2. The rate is read from the partner record and written onto the entry, so
 *      later rate changes cannot retroactively alter a past sale.
 *   3. The agreement version in force at the time of sale is stored with it.
 */
const HOLD_DAYS = Number(process.env.PARTNER_COMMISSION_HOLD_DAYS ?? 30);

export async function recordCommission({ code, amountGross, commissionRate, stripeSessionId, currency = 'EUR' }) {
  const regKey = `partner:reg:${code}`;
  const raw = await kv('GET', regKey);
  if (!raw) throw new Error(`recordCommission: unknown partner code ${code}`);

  const rec = JSON.parse(raw);
  if (rec.status !== 'approved') {
    // Registered but not accredited. Withheld deliberately, not an error.
    return { withheld: 'partner-not-approved', code, status: rec.status ?? 'unknown' };
  }

  // Rate precedence: the partner's agreed rate, then the caller's, then default.
  const rate = typeof rec.commissionRate === 'number' ? rec.commissionRate : commissionRate;
  const commission = Math.round(amountGross * rate) / 100;
  const now = new Date();
  const holdUntil = new Date(now.getTime() + HOLD_DAYS * 86400000).toISOString();

  const entryKey = `commission:${stripeSessionId}`;
  const existing = await kv('GET', entryKey);
  if (existing) return JSON.parse(existing);          // idempotent on replay

  const entry = {
    code,
    stripeSessionId,
    amountGross,
    currency,
    commissionRate: rate,                              // locked to this sale
    agreementVersion: rec.agreementVersion ?? null,    // locked to this sale
    commission,
    state: 'pending',
    holdUntil,
    createdAt: now.toISOString(),
  };
  await kv('SET', entryKey, JSON.stringify(entry));
  await kv('SADD', `commission:index:${code}`, stripeSessionId);

  const updated = {
    ...rec,
    salesCount: (rec.salesCount || 0) + 1,
    pendingAmount: Math.round(((rec.pendingAmount || 0) + commission) * 100) / 100,
    sessions: [...(rec.sessions || []), stripeSessionId],
    updatedAt: now.toISOString(),
  };
  await kv('SET', regKey, JSON.stringify(updated));
  return entry;
}

/* Reverse a commission after a refund, dispute or chargeback.
 *
 * amountRefunded is in the same minor units as the original sale. A partial
 * refund reverses the same proportion of the commission rather than all of it;
 * omitting it reverses in full, which is the right default for a chargeback.
 * Idempotent per reason: Stripe sends both a refund and a dispute event for the
 * same charge, and repeated delivery must not subtract twice. */
export async function reverseCommission(stripeSessionId, reason = 'refund', amountRefunded = null) {
  const entryKey = `commission:${stripeSessionId}`;
  const raw = await kv('GET', entryKey);
  if (!raw) return { reversed: false, reason: 'no-commission-recorded' };

  const entry = JSON.parse(raw);
  const already = entry.reversedAmount || 0;
  const full = entry.commission;
  const share =
    amountRefunded && entry.amountGross
      ? Math.round(full * Math.min(1, amountRefunded / entry.amountGross) * 100) / 100
      : full;
  const delta = Math.round(Math.max(0, Math.min(share, full - already)) * 100) / 100;
  if (delta <= 0) return entry;

  const nowReversed = Math.round((already + delta) * 100) / 100;
  const updated = {
    ...entry,
    reversedAmount: nowReversed,
    state: nowReversed >= full ? 'reversed' : entry.state,
    partialReversal: nowReversed < full,
    reversedReason: reason,
    reversedAt: new Date().toISOString(),
  };
  await kv('SET', entryKey, JSON.stringify(updated));

  const regKey = `partner:reg:${entry.code}`;
  const regRaw = await kv('GET', regKey);
  if (regRaw) {
    const rec = JSON.parse(regRaw);
    const bucket = entry.state === 'paid' ? 'paidAmount' : 'pendingAmount';
    await kv('SET', regKey, JSON.stringify({
      ...rec,
      [bucket]: Math.round(((rec[bucket] || 0) - delta) * 100) / 100,
      reversedCount: (rec.reversedCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    }));
  }
  return updated;
}

/* A dispute closed in the merchant's favour. dispute.created already reversed
 * the commission, so winning must put it back — otherwise the partner silently
 * loses a commission on a sale that was never actually refunded. */
export async function restoreCommission(stripeSessionId, reason = 'dispute-won') {
  const entryKey = `commission:${stripeSessionId}`;
  const raw = await kv('GET', entryKey);
  if (!raw) return { restored: false, reason: 'no-commission-recorded' };

  const entry = JSON.parse(raw);
  const back = entry.reversedAmount || 0;
  if (back <= 0) return entry;

  const updated = {
    ...entry,
    reversedAmount: 0,
    partialReversal: false,
    state: 'pending',
    restoredReason: reason,
    restoredAt: new Date().toISOString(),
  };
  await kv('SET', entryKey, JSON.stringify(updated));

  const regKey = `partner:reg:${entry.code}`;
  const regRaw = await kv('GET', regKey);
  if (regRaw) {
    const rec = JSON.parse(regRaw);
    await kv('SET', regKey, JSON.stringify({
      ...rec,
      pendingAmount: Math.round(((rec.pendingAmount || 0) + back) * 100) / 100,
      reversedCount: Math.max(0, (rec.reversedCount || 1) - 1),
      updatedAt: new Date().toISOString(),
    }));
  }
  return updated;
}

/* The rest of the payout lifecycle: pending -> approved -> paid. Approval is
 * only allowed once the hold window has elapsed and nothing was reversed. */
export async function approveCommission(stripeSessionId, { force = false } = {}) {
  const key = `commission:${stripeSessionId}`;
  const raw = await kv('GET', key);
  if (!raw) return { approved: false, reason: 'not-found' };
  const entry = JSON.parse(raw);
  if (entry.state === 'reversed') return { approved: false, reason: 'reversed' };
  if (entry.state !== 'pending') return entry;
  if (!force && entry.holdUntil && new Date(entry.holdUntil) > new Date()) {
    return { approved: false, reason: 'hold-period-active', holdUntil: entry.holdUntil };
  }
  const updated = { ...entry, state: 'approved', approvedAt: new Date().toISOString() };
  await kv('SET', key, JSON.stringify(updated));
  return updated;
}

export async function markCommissionPaid(stripeSessionId, payoutReference = null) {
  const key = `commission:${stripeSessionId}`;
  const raw = await kv('GET', key);
  if (!raw) return { paid: false, reason: 'not-found' };
  const entry = JSON.parse(raw);
  if (entry.state !== 'approved') return { paid: false, reason: `cannot pay from state ${entry.state}` };

  const payable = Math.round((entry.commission - (entry.reversedAmount || 0)) * 100) / 100;
  const updated = { ...entry, state: 'paid', paidAmount: payable, payoutReference, paidAt: new Date().toISOString() };
  await kv('SET', key, JSON.stringify(updated));

  const regKey = `partner:reg:${entry.code}`;
  const regRaw = await kv('GET', regKey);
  if (regRaw) {
    const rec = JSON.parse(regRaw);
    await kv('SET', regKey, JSON.stringify({
      ...rec,
      pendingAmount: Math.round(((rec.pendingAmount || 0) - payable) * 100) / 100,
      paidAmount: Math.round(((rec.paidAmount || 0) + payable) * 100) / 100,
      updatedAt: new Date().toISOString(),
    }));
  }
  return updated;
}

/* Refunds and lost disputes must also take back what the customer bought. */
export async function revokeEntitlement(email, slugs, stripeSessionId) {
  const key = `entitlement:${email.toLowerCase()}`;
  const existing = await getEntitlement(email);
  if (!existing) return { revoked: false, reason: 'no-entitlement' };
  const drop = new Set(slugs || []);
  const updated = {
    ...existing,
    slugs: (existing.slugs || []).filter((s) => !drop.has(s)),
    revokedAt: new Date().toISOString(),
    revokedSessionIds: [...(existing.revokedSessionIds || []), stripeSessionId].filter(Boolean),
  };
  await kv('SET', key, JSON.stringify(updated));
  return updated;
}

/* Read a partner's ledger. Used for payout runs and for answering "why was I
 * paid this?" without reconstructing it from aggregates. */
export async function listCommissions(code) {
  const ids = (await kv('SMEMBERS', `commission:index:${code}`)) || [];
  const out = [];
  for (const id of ids) {
    const raw = await kv('GET', `commission:${id}`);
    if (raw) out.push(JSON.parse(raw));
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Get partner stats by code. Returns null if not found. */
export async function getPartnerStats(code) {
  const raw = await kv('GET', `partner:reg:${code}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── Inbound leads (demo bookings, pricing proposals, partner applications) ──

/**
 * Persist an inbound lead.
 *   lead:<type>:<id>  → JSON
 *   lead:index:<type> → LPUSH of ids (newest first)
 *
 * Returns the stored record. Throws if KV is unavailable — callers must let
 * that surface rather than reporting success, because a lead this drops is a
 * person who was told they would be contacted and then never is.
 */
export async function saveLead(type, payload, { ttlDays = 365 } = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const record = { id, type, receivedAt: new Date().toISOString(), ...payload };
  const key = `lead:${type}:${id}`;

  await kv('SET', key, JSON.stringify(record));
  // Retention is bounded rather than indefinite, so the privacy policy can state
  // a real period. Raise ttlDays deliberately if a lead type needs longer.
  if (ttlDays) await kv('EXPIRE', key, String(Math.round(ttlDays * 86400)));
  await kv('LPUSH', `lead:index:${type}`, id);

  return record;
}

/** Newest-first page of leads of one type. */
export async function listLeads(type, limit = 50) {
  const ids = (await kv('LRANGE', `lead:index:${type}`, '0', String(Math.max(0, limit - 1)))) || [];
  const out = [];
  for (const id of ids) {
    const raw = await kv('GET', `lead:${type}:${id}`);
    if (raw) { try { out.push(JSON.parse(raw)); } catch { /* expired or malformed */ } }
  }
  return out;
}
// ─── Continuous Certification ────────────────────────────────────────────────
/* Certification is DELIBERATELY a separate record from the entitlement.
 *
 *   entitlement:<email>          → perpetual licence to download the package
 *   certification:<certificateId> → subscription-backed "currently a Colleague AI
 *                                   Certified Release" status
 *
 * A lapsed subscription must NEVER remove a download entitlement: the customer
 * bought the agent outright and only the certification status is rented. The
 * two indexes let the webhook find a certificate from a Stripe subscription id
 * and the site find it from (email, slug).
 *
 * The certificate record is public-facing via api/certificate.js, so anything
 * that would identify the holder stays OUT of the fields that endpoint returns
 * (see PUBLIC_CERT_FIELDS below).
 */


/** CAI-<tier>-<8 hex>. Random, so certificate ids are not enumerable. */
export function newCertificateId(tier = 'L3') {
  const t = /^L[1-5]$/.test(String(tier)) ? tier : 'L3';
  return `CAI-${t}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Fields api/certificate.js is allowed to publish. No email, no customer name. */
export const PUBLIC_CERT_FIELDS = [
  'certificateId', 'agentSlug', 'tier', 'certifiedVersion',
  'status', 'issuedAt', 'validUntil',
];

export function publicCertificate(cert) {
  if (!cert) return null;
  const out = {};
  for (const f of PUBLIC_CERT_FIELDS) if (cert[f] !== undefined) out[f] = cert[f];
  return out;
}

/** Stable pseudonymous holder key, so (email, slug) can be looked up without storing the email in the index name. */
function holderKey(email, slug) {
  const h = createHash('sha256').update(`${String(email).toLowerCase()}:${slug}`).digest('hex').slice(0, 32);
  return `cert:holder:${h}`;
}

/**
 * Issue (or re-activate) a certification for one purchased package.
 * Idempotent per subscription: a redelivered checkout event returns the existing
 * certificate instead of minting a second id for the same subscription.
 */
export async function issueCertification({ email, slug, tier, subscriptionId, currentPeriodEnd, certifiedVersion = '1.0' }) {
  if (!email || !slug || !subscriptionId) {
    return { issued: false, reason: 'missing-fields' };
  }

  const existingId = await kv('GET', `cert:sub:${subscriptionId}`);
  if (existingId) {
    const existing = await getCertification(existingId);
    if (existing) return existing;
  }

  const certificateId = newCertificateId(tier);
  const record = {
    certificateId,
    email: String(email).toLowerCase(),   // never published; used for holder lookup only
    agentSlug: slug,
    tier: tier ?? null,
    certifiedVersion,
    status: 'active',
    subscriptionId,
    issuedAt: new Date().toISOString(),
    validUntil: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    updatedAt: new Date().toISOString(),
  };

  await kv('SET', `certification:${certificateId}`, JSON.stringify(record));
  await kv('SET', `cert:sub:${subscriptionId}`, certificateId);
  await kv('SET', holderKey(email, slug), certificateId);
  return record;
}

export async function getCertification(certificateId) {
  if (!certificateId) return null;
  const raw = await kv('GET', `certification:${certificateId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function getCertificationBySubscription(subscriptionId) {
  const id = await kv('GET', `cert:sub:${subscriptionId}`);
  return id ? getCertification(id) : null;
}

export async function getCertificationForHolder(email, slug) {
  const id = await kv('GET', holderKey(email, slug));
  return id ? getCertification(id) : null;
}

/** Patch a certificate by subscription id. Returns null when no certificate exists yet. */
async function patchBySubscription(subscriptionId, patch) {
  const cert = await getCertificationBySubscription(subscriptionId);
  if (!cert) return null;
  const updated = { ...cert, ...patch, updatedAt: new Date().toISOString() };
  await kv('SET', `certification:${cert.certificateId}`, JSON.stringify(updated));
  return updated;
}

/** A paid invoice renews the term: status back to active, validUntil pushed out. */
export async function renewCertification(subscriptionId, currentPeriodEnd) {
  return patchBySubscription(subscriptionId, {
    status: 'active',
    validUntil: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    pastDueSince: null,
  });
}

/** A failed payment does NOT lapse the certificate immediately — Stripe still retries. */
export async function markCertificationPastDue(subscriptionId) {
  return patchBySubscription(subscriptionId, { status: 'past_due', pastDueSince: new Date().toISOString() });
}

/** Cancellation or final payment failure. The download entitlement is untouched. */
export async function lapseCertification(subscriptionId, reason = 'cancelled') {
  return patchBySubscription(subscriptionId, { status: 'lapsed', lapsedAt: new Date().toISOString(), lapseReason: reason });
}

/** A certificate is only "currently certified" while active AND inside its term. */
export function isCertificationCurrent(cert, now = Date.now()) {
  if (!cert || cert.status !== 'active') return false;
  if (!cert.validUntil) return true;
  return new Date(cert.validUntil).getTime() >= now;
}
