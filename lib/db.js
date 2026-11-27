/**
 * lib/db.js — Entitlement + Partner store (Upstash Redis / Vercel KV)
 *
 * Key schema:
 *   entitlement:<email>        → JSON  (download entitlements)
 *   partner:reg:<code>         → JSON  (partner registration + earnings)
 *   partner:email:<email>      → code  (reverse lookup)
 *
 * Key namespace:
 *   Production and every test deployment share one Redis. Production, and any process that is not running on
 *   Vercel (the local test suites), use the keys exactly as written above. A Vercel Preview or Development
 *   deployment puts "preview:" or "development:" in front of every key (kvNamespace), so a sandbox purchase,
 *   refund, partner code or demo request can neither read nor change a production entitlement, partner ledger,
 *   lead or certificate. tests/kv-namespace.test.mjs holds that line.
 *
 * Concurrent changes to an entitlement:
 *   A buyer's record is one JSON string, and the thank-you page, the checkout webhook and the refund and dispute
 *   webhooks all change it, often at the same moment. grant/revoke/restoreEntitlement therefore never write from a
 *   stale read: each change is applied with compare-and-set (updateEntitlement) and redone on what is stored if the
 *   record moved in between. tests/entitlement-concurrency.test.mjs forces every such overlap and holds that line.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import DECIDERS from '../config/certificate-deciders.json' with { type: 'json' };
import { canonicalSlug, slugFamily } from './products.js';
import { holdsLicence } from './releaseAccess.js';
import { certificateState, decisionChangeError, subscriptionState, decisionState, certifiedReleases, TERMINAL_DECISIONS, deciderLabel } from './certificateState.js';
import { compareVersions } from './products.js';

const BASE  = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!BASE || !TOKEN) {
  console.warn('[db] No KV env vars set — data will not persist.');
}

/**
 * "" for production and for a process outside Vercel; "preview:" or "development:" for a Vercel test deployment.
 * Read on every call, so it always follows the environment the function is running in.
 */
export function kvNamespace() {
  const env = process.env.VERCEL_ENV;
  return env && env !== 'production' ? `${env}:` : '';
}

async function kv(command, ...args) {
  // The only place that talks to Redis. Every command used here takes its key first, so the prefix goes on the first
  // argument and keeps a test deployment out of production's keys. The one exception is EVAL (updateEntitlement below),
  // whose key follows the script and the key count; it gets the same prefix there.
  const keyAt = command === 'EVAL' ? 2 : 0;
  const scoped = args.map((a, i) => (i === keyAt ? kvNamespace() + a : a));
  const headers = { Authorization: `Bearer ${TOKEN}` };
  // EVAL is sent as a JSON command in a POST body: the script and two copies of a record do not belong in a URL path.
  const [url, init] = command === 'EVAL'
    ? [BASE, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify([command, ...scoped]) }]
    : [`${BASE}/${command}/${scoped.map(encodeURIComponent).join('/')}`, { headers }];
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`KV error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.result;
}

// ─── Shared secret ────────────────────────────────────────────────────────────

/* CAI-AUD-002/005: a random secret shared by every serverless instance, for keys that must agree across instances
 * (rate limits, anonymous counters). It is created once (SET NX) in the store, so two instances that start together
 * still end up reading the same value; a per-process random key would give every instance its own counting window and
 * make a limit meaningless. A configured environment secret always wins (lib/pseudonym.js). Not for values derived from
 * a long-lived identifier such as an email address: those need a secret that is NOT kept beside the data. */
const secretCache = new Map();
export function resetSharedSecretCache() { secretCache.clear(); }
export async function sharedSecret(name) {
  const cached = secretCache.get(name);
  if (cached) return cached;
  const key = `secret:${name}`;
  let value = await kv('GET', key);
  if (!value) {
    await kv('SET', key, randomBytes(32).toString('hex'), 'NX');
    value = await kv('GET', key);
  }
  if (typeof value !== 'string' || value.length < 32) throw new Error('KV error: shared secret not readable');
  secretCache.set(name, value);
  return value;
}

// ─── Entitlements ─────────────────────────────────────────────────────────────

/* Compare-and-set on one string key, run inside Redis so nothing can slip in between the compare and the set:
 * store ARGV[2] only if the key still holds ARGV[1] ('' = the key is absent). It always answers {1 or 0, what the
 * key holds now}, so a caller that lost the race can redo its change on the current value without another read. */
const CAS_SCRIPT = [
  "local cur = redis.call('GET', KEYS[1])",
  "if not cur then cur = '' end",
  "if cur ~= ARGV[1] then return {0, cur} end",
  "redis.call('SET', KEYS[1], ARGV[2])",
  "return {1, ARGV[2]}",
].join('\n');

// Real contention on one buyer is a handful of events; this many lost races in a row means something is wrong.
const ENTITLEMENT_ATTEMPTS = 8;

function parseRecord(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

/**
 * Change one buyer's record without ever writing from a stale read.
 *
 * change(existing) receives the parsed record (null when there is none) and returns { next, result }: `next` is the
 * record to store, or absent when nothing needs writing, and `result` is what the caller gets back. It runs again on
 * the stored value whenever another change lands first, so it must be a pure function of `existing`. The write itself
 * is a compare-and-set against the exact string that was read; a miss re-reads nothing, it takes the current value
 * from the reply. An error from Redis, an unusable reply, or too many lost races in a row throws, and nothing is
 * written: callers fail closed (the webhook answers 5xx and Stripe retries, the thank-you page withholds the links).
 */
async function updateEntitlement(email, change) {
  return updateJson(`entitlement:${email.toLowerCase()}`, change);
}

/**
 * The same compare-and-set loop for any JSON record (entitlements, orders). change(existing) must be a pure function of
 * `existing` and return { next, result }; see updateEntitlement above for the contract.
 */
export async function updateJson(key, change) {
  let raw = (await kv('GET', key)) ?? '';
  for (let attempt = 1; attempt <= ENTITLEMENT_ATTEMPTS; attempt += 1) {
    const { next, result } = change(parseRecord(raw));
    if (!next) return result;
    const reply = await kv('EVAL', CAS_SCRIPT, '1', key, raw, JSON.stringify(next));
    if (!Array.isArray(reply) || (reply[0] !== 0 && reply[0] !== 1)) {
      throw new Error('KV error: unusable reply to the entitlement update');
    }
    if (reply[0] === 1) return result;
    raw = String(reply[1] ?? ''); // someone else changed the record first: redo the change on what is stored now
  }
  throw new Error('Entitlement update did not settle: too many concurrent changes');
}

/** Read one JSON record, or null when it is absent or unreadable. */
export async function getJson(key) {
  return parseRecord(await kv('GET', key));
}

/** Next number of a named sequence (atomic INCR): 1, 2, 3 ... Used for sandbox invoice numbers. */
export async function nextSequence(name) {
  const n = Number(await kv('INCR', `seq:${name}`));
  if (!Number.isInteger(n) || n < 1) throw new Error(`KV error: unusable sequence value for ${name}`);
  return n;
}

/** Store a JSON record. With { onlyIfAbsent: true } nothing is written when the key exists, and false is returned. */
export async function setJson(key, value, { onlyIfAbsent = false } = {}) {
  const reply = onlyIfAbsent ? await kv('SET', key, JSON.stringify(value), 'NX') : await kv('SET', key, JSON.stringify(value));
  return reply === 'OK';
}

/* `release`: the release version this purchase bought (lib/releaseAccess.js releaseVersionForSession). It is
 * recorded once per purchase and product and never overwritten, so a later grant for the same session (the webhook
 * after the thank-you page, a redelivery after a new release shipped) cannot move a buyer onto another version. */
export async function grantEntitlement(email, slugs, stripeSessionId, { release = null } = {}) {
  const canon = slugs.map(canonicalSlug);
  return updateEntitlement(email, (existing) => {
    // A refunded or disputed purchase stays revoked. Without this, reopening the thank-you link
    // (Stripe keeps payment_status 'paid' after a refund) or a replayed webhook re-granted access.
    if (stripeSessionId && (existing?.revokedSessionIds ?? []).includes(stripeSessionId)) {
      return { result: { ...existing, refused: 'session-revoked' } };
    }
    const sessionSlugs = { ...(existing?.sessionSlugs ?? {}) };
    if (stripeSessionId) {
      sessionSlugs[stripeSessionId] = Array.from(new Set([...(sessionSlugs[stripeSessionId] ?? []), ...canon]));
    }
    const sessionReleases = { ...(existing?.sessionReleases ?? {}) };
    if (stripeSessionId && typeof release === 'string' && release) {
      const recorded = sessionReleases[stripeSessionId] ?? {};
      sessionReleases[stripeSessionId] = { ...Object.fromEntries(canon.map((s) => [s, release])), ...recorded };
    }
    const merged = {
      ...(existing ?? {}),
      email: email.toLowerCase(),
      // New grants are stored under the current slug; retired slugs already stored stay as they are
      // and keep working through slugFamily() in isEntitled / revokeEntitlement.
      slugs: Array.from(new Set([...(existing?.slugs ?? []), ...canon])),
      grantedAt:        existing?.grantedAt ?? new Date().toISOString(),
      updatedAt:        new Date().toISOString(),
      // Deduped like slugs above. Both api/success.js (self-fulfil on the redirect
      // back from Stripe) and api/webhook.js (checkout.session.completed /
      // async_payment_succeeded) call this for the SAME session by design, so it
      // must be safe to call twice with one stripeSessionId — a bare push made this
      // "idempotent" only in the sense that access wasn't duplicated; the session-id
      // audit trail was, every time both paths ran for one purchase.
      stripeSessionIds: Array.from(new Set([...(existing?.stripeSessionIds ?? []), stripeSessionId].filter(Boolean))),
      // Which purchase granted which agents, so a refund removes only what that purchase paid for.
      sessionSlugs,
      // Which release each purchase bought (version-specific entitlement, lib/releaseAccess.js).
      ...(Object.keys(sessionReleases).length ? { sessionReleases } : {}),
    };
    // A purchase that is already fully recorded (a reload of the thank-you page, a redelivered event) adds nothing,
    // so it writes nothing: a reload can no longer put an older copy of the record back.
    if (existing?.grantedAt &&
        merged.slugs.length === (existing.slugs ?? []).length &&
        merged.stripeSessionIds.length === (existing.stripeSessionIds ?? []).length &&
        (!stripeSessionId || merged.sessionSlugs[stripeSessionId].length === (existing.sessionSlugs?.[stripeSessionId] ?? []).length) &&
        (!stripeSessionId || Object.keys(merged.sessionReleases?.[stripeSessionId] ?? {}).length ===
          Object.keys(existing.sessionReleases?.[stripeSessionId] ?? {}).length)) {
      return { result: existing };
    }
    return { next: merged, result: merged };
  });
}

/** True when this purchase was refunded or charged back (it can never be re-granted). */
export async function isSessionRevoked(email, stripeSessionId) {
  const ent = await getEntitlement(email);
  return Boolean(ent && stripeSessionId && (ent.revokedSessionIds ?? []).includes(stripeSessionId));
}

/* A checkout session that has already fulfilled: its webhook claim exists, or the buyer's entitlement
 * records it for this agent (the success page grants the same way). Such a purchase is not a new sale,
 * so a re-delivery or a revisit of the thank-you page is never judged as one. */
export async function sessionAlreadyFulfilled(email, stripeSessionId, slug) {
  if (!stripeSessionId) return false;
  if (await kv('GET', `stripe:session:${stripeSessionId}`)) return true;
  if (!email) return false;
  const ent = await getEntitlement(email);
  return Boolean(ent?.sessionSlugs?.[stripeSessionId]?.includes(canonicalSlug(slug)));
}

export async function getEntitlement(email) {
  const raw = await kv('GET', `entitlement:${email.toLowerCase()}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function isEntitled(email, slug) {
  return holdsLicence(await getEntitlement(email), slug);
}

// ─── Rate limiting (fixed window: the counter is born with its expiry) ───────

/**
 * Returns true if the caller identified by `key` is within `max` hits per `windowSeconds`. Throws if KV is
 * unavailable — callers decide whether to fail open or closed.
 *
 * The first hit creates the counter AND its expiry in one command (SET NX EX, the same form claimEvent uses), so
 * there is never a moment when a counter exists without an expiry. It used to be INCR, then EXPIRE on the first
 * hit: if that EXPIRE failed, the counter never reset and the caller was locked out for good. Later hits use INCR,
 * which is atomic and keeps the expiry.
 *
 * One narrow case remains: the counter lapses in the instant between the SET and the INCR, so INCR re-creates it with
 * no expiry. It is then given one; if that EXPIRE fails, the counter is deleted (best effort) rather than left behind,
 * and the original error still reaches the caller, who fails closed.
 */
export async function rateLimit(key, max, windowSeconds) {
  const k = `rl:${key}`;
  const ttl = String(windowSeconds);
  if ((await kv('SET', k, '1', 'NX', 'EX', ttl)) === 'OK') return 1 <= max;
  const n = Number(await kv('INCR', k));
  if (n === 1) {
    try {
      await kv('EXPIRE', k, ttl);
    } catch (err) {
      await kv('DEL', k).catch(() => {});
      throw err;
    }
  }
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

/** Release only the event claim, so Stripe's retry of this event runs again while the session stays fulfilled once. */
export async function releaseEventClaim(eventId) {
  await kv('DEL', `stripe:event:${eventId}`).catch(() => {});
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

export async function recordCommission({ code, amountGross, commissionBase = amountGross, commissionRate, stripeSessionId, currency = 'EUR' }) {
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
  const commission = Math.round(commissionBase * rate) / 100;   // commission base: eligible net licence revenue
  const now = new Date();
  const holdUntil = new Date(now.getTime() + HOLD_DAYS * 86400000).toISOString();

  const entryKey = `commission:${stripeSessionId}`;
  const existing = await kv('GET', entryKey);
  if (existing) return JSON.parse(existing);          // idempotent on replay

  const entry = {
    code,
    stripeSessionId,
    amountGross,
    commissionBase,
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

/* Refunds and lost disputes must also take back what the customer bought. `refunded` marks a
 * purchase whose money went back to the buyer: a dispute won afterwards cannot restore it. */
export async function revokeEntitlement(email, slugs, stripeSessionId, { refunded = false } = {}) {
  return updateEntitlement(email, (existing) => {
    if (!existing) {
      // Nothing is stored for this buyer yet, and the refund or charge-back can still overtake the sale: a checkout
      // delivery that keeps failing is retried by Stripe for days, and events do not always arrive in order. Leave a
      // record with no agents and only the history, so the sale that turns up later is refused instead of granted.
      // With no session id there is nothing to remember.
      if (!stripeSessionId) return { result: { revoked: false, reason: 'no-entitlement' } };
      return {
        next: {
          email: email.toLowerCase(),
          slugs: [],
          revokedAt: new Date().toISOString(),
          revokedSessionIds: [stripeSessionId],
          ...(refunded ? { refundedSessionIds: [stripeSessionId] } : {}),
        },
        result: { revoked: false, reason: 'no-entitlement' },
      };
    }
    const revokedSessionIds = Array.from(new Set([...(existing.revokedSessionIds || []), stripeSessionId].filter(Boolean)));
    // An agent stays available when another purchase that was NOT refunded also paid for it
    // (e.g. the buyer bought twice and one charge was refunded). Only purchases recorded with
    // their agents (sessionSlugs) can vouch; older records fall back to dropping the agent.
    const sessionSlugs = existing.sessionSlugs || {};
    const stillPaid = new Set(
      Object.entries(sessionSlugs)
        .filter(([sid]) => !revokedSessionIds.includes(sid))
        .flatMap(([, list]) => (list || []).flatMap(slugFamily))
    );
    const drop = new Set((slugs || []).flatMap(slugFamily).filter((s) => !stillPaid.has(s)));
    const refundedSessionIds = refunded
      ? Array.from(new Set([...(existing.refundedSessionIds || []), stripeSessionId].filter(Boolean)))
      : (existing.refundedSessionIds || []);
    const kept = (existing.slugs || []).filter((s) => !drop.has(s));
    // An event already applied (Stripe redelivers) changes nothing, so it writes nothing.
    if (existing.revokedAt &&
        kept.length === (existing.slugs || []).length &&
        revokedSessionIds.length === (existing.revokedSessionIds || []).length &&
        refundedSessionIds.length === (existing.refundedSessionIds || []).length) {
      return { result: existing };
    }
    const updated = {
      ...existing,
      slugs: kept,
      revokedAt: new Date().toISOString(),
      revokedSessionIds,
      ...(refundedSessionIds.length ? { refundedSessionIds } : {}),
    };
    return { next: updated, result: updated };
  });
}

/* A dispute the merchant won. dispute.created revoked this purchase, and grantEntitlement refuses
 * a revoked session by design, so the restore lifts that one session explicitly and puts its agents
 * back. A purchase that was also refunded stays revoked: winning a dispute does not undo money
 * that has already gone back to the buyer. */
export async function restoreEntitlement(email, slugs, stripeSessionId) {
  return updateEntitlement(email, (existing) => {
    if (!existing) return { result: { restored: false, reason: 'no-entitlement' } };
    if (!(existing.revokedSessionIds || []).includes(stripeSessionId)) return { result: { restored: false, reason: 'not-revoked' } };
    if ((existing.refundedSessionIds || []).includes(stripeSessionId)) return { result: { restored: false, reason: 'refunded' } };
    const updated = {
      ...existing,
      slugs: Array.from(new Set([...(existing.slugs || []), ...(slugs || []).map(canonicalSlug)])),
      revokedSessionIds: (existing.revokedSessionIds || []).filter((id) => id !== stripeSessionId),
      restoredSessionIds: Array.from(new Set([...(existing.restoredSessionIds || []), stripeSessionId])),
      restoredAt: new Date().toISOString(),
    };
    return { next: updated, result: { restored: true } };
  });
}

/* A live-mode payment that was deliberately NOT fulfilled (liveFulfilmentWithheld). Nothing here
 * moves money. The log line is the alert, and the record is what the owner looks up to refund the
 * order in Stripe. The buyer's email is left out: the session id finds it in the dashboard. */
export async function recordWithheldSale({ sessionId, slug = null, reason, amountTotal = null, currency = null, source, eventId = null, livemode = true, orderId = null }) {
  console.error(`[ALERT] ${livemode ? 'live' : 'test'} payment NOT fulfilled (${reason}): session ${sessionId}${orderId ? `, order ${orderId}` : ''}, ${slug || 'no slug'}, ` +
    `amount ${amountTotal ?? '?'} minor units ${currency || ''}, via ${source}. Decide by hand in Stripe (refund or fulfil).`);
  const record = { sessionId, orderId, slug, reason, livemode, amountTotal, currency, source, eventId, recordedAt: new Date().toISOString() };
  await kv('SET', `sale-withheld:${sessionId}`, JSON.stringify(record));
  return record;
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
/** One lead by id, or null. */
export async function getLead(type, id) {
  if (!/^[0-9]+-[a-z0-9]+$/.test(String(id))) return null;
  const raw = await kv('GET', `lead:${type}:${id}`);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
/** Replace a stored lead, keeping its retention (KEEPTTL); never creates one. */
export async function updateLead(type, record) {
  if (!record?.id) throw new Error('updateLead: record without id');
  return (await kv('SET', `lead:${type}:${record.id}`, JSON.stringify(record), 'XX', 'KEEPTTL')) === 'OK';
}
/** Delete a lead and its index entry (data-subject deletion). */
export async function deleteLead(type, id) {
  await kv('DEL', `lead:${type}:${id}`);
  await kv('LREM', `lead:index:${type}`, '0', String(id));
}
// ─── Interest registrations and demand counters ─────────────────────────────
/** SET key NX EX ttl: true the first time within the window, false after (duplicate detection). */
export async function claimOnce(key, ttlSeconds) {
  return (await kv('SET', key, '1', 'NX', 'EX', String(ttlSeconds))) === 'OK';
}
export async function releaseKey(key) {
  await kv('DEL', key);
}
/* demand:<kind>:<slug>:<yyyy-mm> - anonymous monthly counters (views, interest, demo) for prioritisation.
 * No personal data; kept 25 months so a year-on-year comparison is possible. */
const DEMAND_KINDS = new Set(['view', 'interest', 'demo', 'bot']);
export async function incrDemand(kind, slug, now = new Date()) {
  if (!DEMAND_KINDS.has(kind) || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(String(slug))) return null;
  const key = `demand:${kind}:${slug}:${now.toISOString().slice(0, 7)}`;
  const n = await kv('INCR', key);
  if (Number(n) === 1) await kv('EXPIRE', key, String(25 * 31 * 86400));
  return Number(n);
}
export async function readDemand(kind, slug, months) {
  const out = {};
  for (const m of months) out[m] = Number((await kv('GET', `demand:${kind}:${slug}:${m}`)) || 0);
  return out;
}
// ─── Legal acceptance (order confirmation) ───────────────────────────────────
/* acceptance:<id> → JSON. Written by /api/checkout before the Stripe session exists, bound to the session
 * id once Stripe answers, and to the buyer email when the webhook fulfils. It is contract evidence, so it
 * has no TTL: retention follows the order record, not a privacy window (the record holds a company name,
 * a declaring name and a salted address hash, never card data or a plain IP). lib/acceptance.js explains
 * the fields; tests/acceptance.test.mjs holds the line that no session is created without one. */

export function newAcceptanceId() {
  return `acc_${randomBytes(12).toString('hex')}`;
}

export async function recordAcceptance(record) {
  const id = newAcceptanceId();
  const stored = { id, acceptedAt: new Date().toISOString(), ...record };
  await kv('SET', `acceptance:${id}`, JSON.stringify(stored));
  return stored;
}

export async function getAcceptance(id) {
  if (!/^acc_[0-9a-f]{24}$/.test(String(id))) return null;
  return parseRecord(await kv('GET', `acceptance:${id}`));
}

/** Add the Stripe session id (from checkout) or the buyer email + fulfilment time (from the webhook). Idempotent. */
export async function bindAcceptance(id, fields) {
  const cur = await getAcceptance(id);
  if (!cur) return null;
  const next = { ...cur, ...fields };
  await kv('SET', `acceptance:${id}`, JSON.stringify(next));
  return next;
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

/** Append-only lifecycle evidence kept on the record (never published; bounded so the record cannot grow without limit). */
const HISTORY_MAX = 200;
function withEvent(cert, event, detail = {}) {
  const entry = { at: new Date().toISOString(), event, ...detail };
  const history = [...(Array.isArray(cert?.history) ? cert.history : []), entry];
  return history.length > HISTORY_MAX ? history.slice(history.length - HISTORY_MAX) : history;
}

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

/** The paid-through date for a new certificate: the later of the date the checkout event carried and any date an earlier
 *  invoice event left (see patchBySubscription). Null when neither is known; the certificate then reads as not current
 *  until a payment event supplies the term. */
async function termFor(subscriptionId, currentPeriodEnd) {
  const given = currentPeriodEnd ? currentPeriodEnd * 1000 : NaN;
  const held = Date.parse(await kv('GET', `cert:term:${subscriptionId}`) ?? '');
  const best = Math.max(Number.isFinite(given) ? given : -Infinity, Number.isFinite(held) ? held : -Infinity);
  return Number.isFinite(best) ? new Date(best).toISOString() : null;
}

/**
 * Issue (or re-activate) a certification for one purchased package.
 * Idempotent per subscription: a redelivered checkout event returns the existing
 * certificate instead of minting a second id for the same subscription.
 */
export async function issueCertification({ email, slug, tier, subscriptionId, currentPeriodEnd, certifiedVersion = null }) {
  if (!email || !slug || !subscriptionId) {
    return { issued: false, reason: 'missing-fields' };
  }
  slug = canonicalSlug(slug);

  const ended = parseRecord(await kv('GET', `cert:ended:${subscriptionId}`));
  if (ended) return { issued: false, reason: 'subscription-ended', lapseReason: ended.reason };

  const existingId = await kv('GET', `cert:sub:${subscriptionId}`);
  if (existingId) {
    const existing = await getCertification(existingId);
    if (existing) return completeIssuance(existing, email, slug);
  }

  // Two deliveries of the same checkout can race. The subscription index is claimed atomically (SET NX): exactly one
  // certificate id ever belongs to a subscription. The loser adopts the winner's id; the record itself is also written
  // only if absent, so a half-finished first attempt is completed rather than duplicated.
  const claimed = await kv('SET', `cert:sub:${subscriptionId}`, newCertificateId(tier), 'NX');
  const certificateId = await kv('GET', `cert:sub:${subscriptionId}`);
  if (!certificateId) throw new Error('KV error: certificate index not readable after claim');
  if (claimed !== 'OK') {
    const existing = await getCertification(certificateId);
    if (existing) return completeIssuance(existing, email, slug);
  }
  const record = {
    certificateId,
    email: String(email).toLowerCase(),   // never published; used for holder lookup only
    agentSlug: slug,
    tier: tier ?? null,
    certifiedVersion,
    status: 'active',
    subscriptionId,
    issuedAt: new Date().toISOString(),
    validUntil: await termFor(subscriptionId, currentPeriodEnd),
    updatedAt: new Date().toISOString(),
  };
  // Issuance facts, frozen: no later write may change them (they are stripped from every patch below).
  record.issuance = { at: record.issuedAt, certifiedVersion, tier: record.tier, agentSlug: slug, validUntil: record.validUntil };
  // A dispute that arrived before the certificate existed (delayed checkout event) is still open: issue it on hold.
  const stashedHold = parseRecord(await kv('GET', `cert:hold:${subscriptionId}`));
  if (stashedHold?.state === 'disputed') record.paymentHold = stashedHold;
  record.history = withEvent(null, 'issued', { certifiedVersion, subscription: 'active' });

  const written = await kv('SET', `certification:${certificateId}`, JSON.stringify(record), 'NX');
  if (written !== 'OK') {
    const existing = await getCertification(certificateId);
    if (!existing) throw new Error('KV error: certificate record neither written nor readable');
    return completeIssuance(existing, email, slug);
  }
  await appendCertificateEvidence(certificateId, { event: 'issued', evidenceId: `issued:${certificateId}`, ...record.issuance });
  await kv('SET', holderKey(email, slug), certificateId);
  return record;
}

/**
 * CAI-AUD-003: finish an issuance that was interrupted after its record was written (a failed evidence append or holder
 * link). Idempotent: a complete issuance is returned unchanged. Without this a retry returned the certificate with no
 * issuance evidence and no holder link, so the holder could not find it and the issuance was never evidenced.
 */
async function completeIssuance(existing, email, slug) {
  const evidence = await getCertificateEvidence(existing.certificateId);
  if (!evidence.some((e) => e.event === 'issued') && existing.issuance) {
    // Same evidenceId as the first attempt: if two deliveries race here, the reader keeps one entry.
    await appendCertificateEvidence(existing.certificateId, { event: 'issued', evidenceId: `issued:${existing.certificateId}`, ...existing.issuance });
  }
  if (email && slug) await kv('SET', holderKey(email, slug), existing.certificateId);
  return existing;
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
  for (const s of slugFamily(slug)) {
    const id = await kv('GET', holderKey(email, s));
    if (id) return getCertification(id);
  }
  return null;
}

/* Permanent certification evidence, separate from the bounded operational history on the record: issuance,
 * every decision and every adoption of a newer certified release. Append-only (RPUSH); nothing here deletes or
 * rewrites an entry, and it is never published. */
const evidenceKey = (certificateId) => `certification-evidence:${certificateId}`;
const SIGNIFICANT = new Set(['issued', 'decision', 'release-adopted', 'payment-hold', 'payment-hold-released']);
const FINAL_LAPSE = new Set(['canceled', 'cancelled', 'refunded', 'incomplete_expired', 'deleted', 'dispute_lost']);

/* Founder decision (Round 3): certification evidence is MINIMIZED and kept apart from personal operational records. The
 * evidence never holds an email address, a name or free text: only these fields, and decision-makers as opaque register
 * ids. The personal record (certification:<id>, with the holder's email) and the evidence have separate retention
 * (docs/legal/proposed/certification-retention-proposal.md). Anything else a caller passes is dropped here. */
const EVIDENCE_FIELDS = new Set(['at', 'event', 'evidenceId', 'decisionId', 'from', 'to', 'reason', 'reference', 'decidedBy', 'deciders',
  'certifiedVersion', 'tier', 'agentSlug', 'validUntil', 'disputeId', 'outcome', 'error', 'recoveredFromHistory', 'decidedAt']);
export function minimizedEvidence(entry) {
  const out = {};
  for (const [k, v] of Object.entries(entry || {})) {
    if (!EVIDENCE_FIELDS.has(k)) continue;
    out[k] = k === 'deciders' && Array.isArray(v) ? v.map((d) => ({ role: d?.role ?? null, id: d?.id ?? null })) : v;
  }
  return out;
}

async function appendCertificateEvidence(certificateId, entry) {
  const line = JSON.stringify(minimizedEvidence({ at: new Date().toISOString(), ...entry }));
  try {
    await kv('RPUSH', evidenceKey(certificateId), line);
  } catch {
    await kv('RPUSH', evidenceKey(certificateId), line); // one retry; a second failure surfaces to the caller
  }
}

/** The permanent evidence entries of a certificate, oldest first (operator use only). */
export async function getCertificateEvidence(certificateId) {
  const rows = (await kv('LRANGE', evidenceKey(certificateId), '0', '-1')) || [];
  const seen = new Set();
  // An entry carries an evidenceId when more than one writer could append the same fact (a retried issuance, a repair
  // run beside the original write). The first one stands; later copies are not evidence of anything new.
  return rows.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean)
    .filter((e) => { if (!e.evidenceId) return true; if (seen.has(e.evidenceId)) return false; seen.add(e.evidenceId); return true; });
}

/* Fields only their own procedure may change. Payment events never touch any of them. */
const PROTECTED_FIELDS = ['paymentHold', 'decision', 'certifiedVersion', 'history', 'deployment', 'issuance', 'issuedAt', 'certificateId', 'subscriptionId', 'email', 'agentSlug', 'tier'];
const stripProtected = (patch) => Object.fromEntries(Object.entries(patch).filter(([k]) => !PROTECTED_FIELDS.includes(k)));

/** Patch a certificate by subscription id. Returns null when no certificate exists yet. */
async function patchBySubscription(subscriptionId, patch, event = 'subscription-updated') {
  const id = await kv('GET', `cert:sub:${subscriptionId}`);
  if (!id) {
    // The event arrived before the certificate exists (Stripe often sends invoice.paid before checkout.session.completed,
    // and the checkout event carries no period end). Remember the paid-through date so issuance can use it; without this the
    // renewal was dropped and a paying customer's certificate had no term until the next billing cycle.
    if (patch.validUntil && Number.isFinite(Date.parse(patch.validUntil))) {
      const held = await kv('GET', `cert:term:${subscriptionId}`);
      if (!held || Date.parse(patch.validUntil) > Date.parse(held)) await kv('SET', `cert:term:${subscriptionId}`, patch.validUntil);
    }
    return null;
  }
  // Payment events change the SUBSCRIPTION axis only, through a compare-and-set on the stored record, so a concurrent
  // decision, deployment report or adoption is never overwritten, and a renewal can never lift a suspension or a
  // revocation. Out-of-order delivery is also handled here: a cancelled, expired or refunded subscription stays ended
  // (Stripe never revives one; a new subscription has a new id), and the paid-through date never moves backwards.
  const safe = stripProtected(patch);
  return updateJson(`certification:${id}`, (cert) => {
    if (!cert) return { result: null };
    // A cancelled, expired or refunded subscription is final in Stripe; an "unpaid" one can still be paid and resume.
    if (cert.status === 'lapsed' && FINAL_LAPSE.has(String(cert.lapseReason)) && safe.status && safe.status !== 'lapsed') return { result: cert };
    if (safe.validUntil && cert.validUntil && Date.parse(safe.validUntil) < Date.parse(cert.validUntil)) delete safe.validUntil;
    const updated = { ...cert, ...safe, updatedAt: new Date().toISOString() };
    updated.history = withEvent(cert, event, { subscription: updated.status });
    return { next: updated, result: updated };
  });
}

/** A paid invoice renews the term: status back to active, validUntil pushed out. When the period end
 *  cannot be read, the term already on the certificate is kept rather than cleared. */
export async function renewCertification(subscriptionId, currentPeriodEnd) {
  return patchBySubscription(subscriptionId, {
    status: 'active',
    ...(currentPeriodEnd ? { validUntil: new Date(currentPeriodEnd * 1000).toISOString() } : {}),
    pastDueSince: null,
  }, 'subscription-renewed');
}

/** A failed payment does NOT lapse the certificate immediately — Stripe still retries. */
export async function markCertificationPastDue(subscriptionId) {
  return patchBySubscription(subscriptionId, { status: 'past_due', pastDueSince: new Date().toISOString() }, 'subscription-past-due');
}

/** Cancellation or final payment failure. The download entitlement is untouched. */
export async function lapseCertification(subscriptionId, reason = 'cancelled') {
  const cert = await patchBySubscription(subscriptionId, { status: 'lapsed', lapsedAt: new Date().toISOString(), lapseReason: reason }, 'subscription-ended');
  // A final end (refund, cancellation, expiry) that arrives BEFORE the certificate exists (delayed or failed checkout
  // event) is remembered, so a late issuance cannot create an active certificate for a subscription that already ended.
  if (!cert && FINAL_LAPSE.has(String(reason))) {
    await kv('SET', `cert:ended:${subscriptionId}`, JSON.stringify({ reason: String(reason), at: new Date().toISOString() }), 'NX');
  }
  return cert;
}

/* ─── Payment disputes (axis 1) ────────────────────────────────────────────────────────────────────────────────────────
 * Founder decision (Round 3): an unresolved payment dispute suspends the commercial subscription benefits and the active
 * certificate claim. This is a PAYMENT status, deliberately separate from the technical certification decision (axis 3):
 *   - it is set by charge.dispute.created and cleared only by charge.dispute.closed (won) for the same dispute;
 *   - a lost dispute ends the subscription (final, like a refund);
 *   - it never creates, changes or lifts a decision, and a decision never clears it;
 *   - the perpetual licence follows the entitlement rules (a dispute already revokes it); nothing here touches it.
 * Each change is evidenced (permanent, append-only, no personal data) and every function is idempotent. */
const holdStashKey = (subscriptionId) => `cert:hold:${subscriptionId}`;

export async function holdCertificationForDispute(subscriptionId, { disputeId = null } = {}) {
  const hold = { state: 'disputed', disputeId: disputeId ? String(disputeId) : null, since: new Date().toISOString() };
  const id = await kv('GET', `cert:sub:${subscriptionId}`);
  if (!id) {
    // Delayed checkout event: remember the dispute so the certificate, when issued, starts on hold.
    await kv('SET', holdStashKey(subscriptionId), JSON.stringify(hold), 'NX');
    return { ok: true, held: false, reason: 'no-certificate-yet' };
  }
  const out = await patchById(id, (cert) => {
    const kept = cert.paymentHold?.state === 'disputed' ? cert.paymentHold : hold;
    const record = { ...cert, paymentHold: kept, history: withEvent(cert, 'payment-hold', { disputeId: kept.disputeId }) };
    return { record, evidence: { event: 'payment-hold', evidenceId: `hold:${kept.disputeId ?? 'unknown'}`, disputeId: kept.disputeId } };
  });
  return { ok: out.ok, held: out.ok, ...(out.ok ? {} : { reason: out.error }) };
}

/** outcome 'won': clear the hold for this dispute (another open dispute keeps it); 'lost': the subscription ends. */
export async function resolveCertificationDispute(subscriptionId, { disputeId = null, outcome } = {}) {
  if (outcome === 'lost') {
    const cert = await lapseCertification(subscriptionId, 'dispute_lost');
    if (cert) await appendCertificateEvidence(cert.certificateId, { event: 'payment-hold-ended', evidenceId: `lost:${disputeId ?? 'unknown'}`, disputeId, outcome: 'lost' });
    return { ok: true, state: cert ? 'lapsed' : 'ended-before-issuance' };
  }
  if (outcome !== 'won') return { ok: false, reason: 'unknown-outcome' };
  const stash = parseRecord(await kv('GET', holdStashKey(subscriptionId)));
  if (stash && (!stash.disputeId || !disputeId || stash.disputeId === String(disputeId))) await kv('DEL', holdStashKey(subscriptionId));
  const id = await kv('GET', `cert:sub:${subscriptionId}`);
  if (!id) return { ok: true, state: 'no-certificate-yet' };
  let cleared = false;
  const out = await patchById(id, (cert) => {
    const h = cert.paymentHold;
    if (!h || h.state !== 'disputed') return { record: cert, evidence: null };
    if (h.disputeId && disputeId && h.disputeId !== String(disputeId)) return { record: cert, evidence: null }; // a different dispute is still open
    cleared = true;
    const { paymentHold: _gone, ...rest } = cert;
    return { record: { ...rest, history: withEvent(cert, 'payment-hold-released', { disputeId: h.disputeId }) },
      evidence: { event: 'payment-hold-released', evidenceId: `release:${h.disputeId ?? 'unknown'}`, disputeId: h.disputeId, outcome: 'won' } };
  });
  return { ok: out.ok, state: cleared ? 'released' : 'unchanged' };
}

/**
 * The public "Colleague AI Certified — Active" claim. It needs the product record: an active subscription alone is
 * never enough (four-axis rule, lib/certificateState.js). Called without a product it fails closed.
 */
export function isCertificationCurrent(cert, product = null, now = Date.now()) {
  return certificateState(cert, product, now).active;
}

/** Write one certificate record by id, re-reading first so concurrent payment events are not overwritten blindly. */
async function patchById(certificateId, change) {
  // Compare-and-set (updateJson): the change is re-run on the stored record whenever a payment event or another
  // procedure landed first, so nothing overwrites anything. Issuance facts are carried over unchanged.
  const out = await updateJson(`certification:${certificateId}`, (cert) => {
    if (!cert) return { result: { ok: false, error: 'not-found' } };
    const r = change(cert);
    if (r.error) return { result: { ok: false, error: r.error } };
    const updated = { ...r.record, issuance: cert.issuance, issuedAt: cert.issuedAt, certificateId: cert.certificateId, updatedAt: new Date().toISOString() };
    return { next: updated, result: { ok: true, record: updated, evidence: r.evidence } };
  });
  if (out.ok && out.evidence && SIGNIFICANT.has(out.evidence.event)) await appendCertificateEvidence(certificateId, out.evidence);
  if (out.ok) delete out.evidence;
  return out;
}

/**
 * Axis 3, the D17 procedure: suspend, reinstate, revoke or discontinue. Operator-only (no public route calls this).
 * next = { state, reason (public category), reference, deciders: [{ role: 'FC', id }, { role: 'IR', id }], note? (internal) }.
 *
 * CAI-AUD-003 - every material decision is attributable and its evidence cannot be lost silently:
 *   1. the decision is validated, including that both deciders are registered and active (config/certificate-deciders.json);
 *   2. an INTENT entry is appended to the permanent evidence BEFORE the record changes;
 *   3. the record changes (compare-and-set, re-validated against what is stored);
 *   4. the COMMITTED entry is appended. If that last write fails the decision stands, `evidencePending` is returned and the
 *      certificate is queued for reconcileCertificateEvidence, which rebuilds the entry from the record's history.
 * A decision whose intent is never followed by a commit is recorded as aborted by the reconciliation, never left dangling.
 */
export async function setCertificateDecision(certificateId, next, { register = DECIDERS, now = Date.now() } = {}) {
  const current = await getCertification(certificateId);
  if (!current) return { ok: false, error: 'not-found' };
  const pre = decisionChangeError(current, next, { register, now });
  if (pre) return { ok: false, error: pre };

  const decisionId = `dec-${randomUUID()}`;
  const deciders = (next.deciders || []).map((d) => ({ role: d.role, id: d.id }));
  const detail = {
    decisionId, from: decisionState(current), to: next.state, reason: next.reason ?? null, reference: next.reference,
    decidedBy: deciderLabel(deciders), deciders,
  };
  await appendCertificateEvidence(certificateId, { event: 'decision-intent', evidenceId: `intent:${decisionId}`, ...detail });

  const out = await patchById(certificateId, (cert) => {
    const error = decisionChangeError(cert, next, { register, now });
    if (error) return { error };
    const decision = next.state === 'valid'
      ? null
      : { id: decisionId, state: next.state, reason: next.reason, reference: next.reference, decidedBy: detail.decidedBy, deciders, at: new Date().toISOString(), ...(next.note ? { note: String(next.note).slice(0, 500) } : {}) };
    return { record: { ...cert, decision, history: withEvent(cert, 'decision', { ...detail, from: decisionState(cert) }) } };
  });
  if (!out.ok) {
    try { await appendCertificateEvidence(certificateId, { event: 'decision-aborted', evidenceId: `aborted:${decisionId}`, decisionId, error: out.error }); } catch { /* reconcile records it */ }
    return out;
  }
  try {
    await appendCertificateEvidence(certificateId, { event: 'decision', evidenceId: decisionId, ...detail });
  } catch (err) {
    console.error('[certificate] decision %s stored; evidence entry queued for repair:', decisionId, err?.message ?? err);
    await queueEvidenceRepair(certificateId);
    return { ...out, evidencePending: true, decisionId };
  }
  return { ...out, decisionId };
}

const EVIDENCE_REPAIR_INDEX = 'cert:evidence-repair';
async function queueEvidenceRepair(certificateId) {
  await kv('RPUSH', EVIDENCE_REPAIR_INDEX, certificateId);
}

/**
 * Bring the permanent evidence in line with the record: every decision and adoption in the record's history has its
 * committed entry, and every intent that never committed is closed as aborted. Idempotent (entries carry an evidenceId
 * and the reader keeps one copy), so it is safe to run at any time and concurrently with live writes.
 */
export async function reconcileCertificateEvidence(certificateId) {
  const cert = await getCertification(certificateId);
  if (!cert) return { ok: false, error: 'not-found' };
  const have = new Set((await getCertificateEvidence(certificateId)).map((e) => e.evidenceId).filter(Boolean));
  const committed = new Set();
  let added = 0;
  const add = async (entry) => { if (!have.has(entry.evidenceId)) { await appendCertificateEvidence(certificateId, entry); have.add(entry.evidenceId); added += 1; } };
  for (const h of Array.isArray(cert.history) ? cert.history : []) {
    if (h.event === 'decision' && h.decisionId) {
      committed.add(h.decisionId);
      const { at, event, ...detail } = h;
      await add({ event: 'decision', evidenceId: h.decisionId, recoveredFromHistory: true, decidedAt: at, ...detail });
    } else if (h.event === 'release-adopted' && h.to) {
      await add({ event: 'release-adopted', evidenceId: `adopt:${certificateId}:${h.to}`, recoveredFromHistory: true, decidedAt: h.at, from: h.from ?? null, to: h.to });
    }
  }
  for (const id of [...have].filter((x) => x.startsWith('intent:'))) {
    const decisionId = id.slice('intent:'.length);
    if (!committed.has(decisionId) && !have.has(decisionId) && !have.has(`aborted:${decisionId}`)) {
      await add({ event: 'decision-aborted', evidenceId: `aborted:${decisionId}`, decisionId, error: 'intent-without-commit' });
    }
  }
  return { ok: true, added };
}

/** Certificates whose evidence still needs a repair (distinct ids in the repair queue). Counts only. */
export async function evidenceRepairCount() {
  return new Set((await kv('LRANGE', EVIDENCE_REPAIR_INDEX, '0', '-1')) || []).size;
}

/** Run the queued evidence repairs (operators and the webhook call this). Returns counts only. */
export async function retryEvidenceRepairs({ limit = 10 } = {}) {
  const ids = [...new Set((await kv('LRANGE', EVIDENCE_REPAIR_INDEX, '0', '-1')) || [])].slice(0, limit);
  let repaired = 0, failed = 0;
  for (const id of ids) {
    try {
      const r = await reconcileCertificateEvidence(id);
      if (r.ok || r.error === 'not-found') { await kv('LREM', EVIDENCE_REPAIR_INDEX, '0', id); repaired += 1; }
      else failed += 1; // still queued; counted, so a stuck repair is reported instead of silently skipped
    } catch { failed += 1; }
  }
  return { attempted: ids.length, repaired, failed };
}

// ─── Durable certificate issuance ─────────────────────────────────────────────

/* CAI-AUD-003: issuance runs after the licence was granted, and a failure there must not fail the fulfilment. But it
 * must not be forgotten either: the failed issuance is stored with everything needed to repeat it, and retried by
 * retryPendingIssuances until it succeeds (or the subscription is found to have ended). The record holds the buyer's
 * email, like the certificate it stands for, and is deleted when the issuance completes. */
const PENDING_INDEX = 'cert:pending';
const pendingKey = (subscriptionId) => `cert:pending:${subscriptionId}`;

export async function recordPendingIssuance(args, error) {
  const rec = {
    args: { email: args.email, slug: args.slug, tier: args.tier ?? null, subscriptionId: args.subscriptionId, currentPeriodEnd: args.currentPeriodEnd ?? null, certifiedVersion: args.certifiedVersion ?? null },
    firstFailedAt: new Date().toISOString(), attempts: 0, lastError: String(error?.message ?? error ?? '').slice(0, 200),
  };
  if ((await kv('SET', pendingKey(args.subscriptionId), JSON.stringify(rec), 'NX')) === 'OK') await kv('RPUSH', PENDING_INDEX, args.subscriptionId);
  return true;
}

export async function pendingIssuanceCount() {
  const ids = new Set((await kv('LRANGE', PENDING_INDEX, '0', '-1')) || []);
  let n = 0;
  for (const id of ids) if (await kv('GET', pendingKey(id))) n += 1;
  return n;
}

/** Repeat queued issuances. Counts only (no personal data), so callers can log the result. */
export async function retryPendingIssuances({ limit = 10 } = {}) {
  const ids = [...new Set((await kv('LRANGE', PENDING_INDEX, '0', '-1')) || [])].slice(0, limit);
  const out = { attempted: 0, issued: 0, ended: 0, failed: 0 };
  for (const id of ids) {
    const rec = parseRecord(await kv('GET', pendingKey(id)));
    if (!rec) { await kv('LREM', PENDING_INDEX, '0', id); continue; }
    out.attempted += 1;
    try {
      const result = await issueCertification(rec.args);
      if (result?.issued === false && result.reason !== 'subscription-ended') throw new Error(`issuance refused: ${result.reason}`);
      if (result?.issued === false) out.ended += 1; else out.issued += 1;
      await kv('DEL', pendingKey(id));
      await kv('LREM', PENDING_INDEX, '0', id);
    } catch (err) {
      out.failed += 1;
      await kv('SET', pendingKey(id), JSON.stringify({ ...rec, attempts: (rec.attempts || 0) + 1, lastAttemptAt: new Date().toISOString(), lastError: String(err?.message ?? err).slice(0, 200) }));
    }
  }
  return out;
}

/** Axis 4: the customer's own report of the version in use. Recorded as reported, never as verified. */
export async function recordDeploymentReport(certificateId, { versionInUse }) {
  if (typeof versionInUse !== 'string' || !/^\d+(\.\d+){0,3}$/.test(versionInUse)) return { ok: false, error: 'bad-version' };
  return patchById(certificateId, (cert) => ({
    record: { ...cert, deployment: { versionInUse, reportedAt: new Date().toISOString(), source: 'customer' }, history: withEvent(cert, 'deployment-reported', { versionInUse }) },
  }));
}

/**
 * Move the certificate to a newer certified release the holder has adopted. Only while the subscription is active,
 * only to a certified, non-withdrawn release newer than the one covered, and never while a terminal decision stands.
 * The previous version stays in the history.
 */
export async function adoptCertifiedRelease(certificateId, version, product) {
  return patchById(certificateId, (cert) => {
    if (subscriptionState(cert) !== 'active') return { error: 'subscription-not-active' };
    if (TERMINAL_DECISIONS.includes(decisionState(cert))) return { error: 'terminal' };
    const target = certifiedReleases(product).find((r) => r.version === version);
    if (!target) return { error: 'not-a-certified-release' };
    if (cert.certifiedVersion && compareVersions(version, cert.certifiedVersion) <= 0) return { error: 'not-newer' };
    const detail = { from: cert.certifiedVersion ?? null, to: version };
    return { record: { ...cert, certifiedVersion: version, history: withEvent(cert, 'release-adopted', detail) }, evidence: { event: 'release-adopted', evidenceId: `adopt:${cert.certificateId}:${version}`, ...detail } };
  });
}
