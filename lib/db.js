/**
 * lib/db.js — Entitlement + Partner store (Upstash Redis / Vercel KV)
 *
 * Key schema:
 *   entitlement:<email>        → JSON  (download entitlements)
 *   partner:reg:<code>         → JSON  (partner registration + earnings)
 *   partner:email:<email>      → code  (reverse lookup)
 */

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

/* Reverse a commission after a refund, dispute or chargeback. Idempotent: a
 * second call for the same session is a no-op, because Stripe can deliver
 * refund and dispute events for the same charge. */
export async function reverseCommission(stripeSessionId, reason = 'refund') {
  const entryKey = `commission:${stripeSessionId}`;
  const raw = await kv('GET', entryKey);
  if (!raw) return { reversed: false, reason: 'no-commission-recorded' };

  const entry = JSON.parse(raw);
  if (entry.state === 'reversed') return entry;

  const wasPaid = entry.state === 'paid';
  const reversed = { ...entry, state: 'reversed', reversedReason: reason, reversedAt: new Date().toISOString() };
  await kv('SET', entryKey, JSON.stringify(reversed));

  const regKey = `partner:reg:${entry.code}`;
  const regRaw = await kv('GET', regKey);
  if (regRaw) {
    const rec = JSON.parse(regRaw);
    const bucket = wasPaid ? 'paidAmount' : 'pendingAmount';
    await kv('SET', regKey, JSON.stringify({
      ...rec,
      [bucket]: Math.round((((rec[bucket] || 0) - entry.commission) + Number.EPSILON) * 100) / 100,
      reversedCount: (rec.reversedCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    }));
  }
  return reversed;
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

// ─── Inbound leads (pricing proposals + partner applications) ────────────────

/**
 * Persist an inbound lead.
 *   lead:<type>:<id>  → JSON
 *   lead:index:<type> → LPUSH of ids (newest first)
 */