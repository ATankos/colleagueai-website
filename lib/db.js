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

// ─── Partner programme ────────────────────────────────────────────────────────

/**
 * Register a partner (or update if they re-register).
 * Keys: partner:reg:<code>   → JSON record
 *       partner:email:<email> → code  (reverse lookup)
 */
export async function registerPartner({ code, name, email }) {
  const now       = new Date().toISOString();
  const regKey    = `partner:reg:${code}`;
  const emailKey  = `partner:email:${email.toLowerCase()}`;
  const existing  = await kv('GET', regKey);
  const record    = existing
    ? { ...JSON.parse(existing), name, updatedAt: now }
    : { code, name, email: email.toLowerCase(), registeredAt: now, updatedAt: now,
        salesCount: 0, totalEarned: 0 };
  await Promise.all([
    kv('SET', regKey,   JSON.stringify(record)),
    kv('SET', emailKey, code),
  ]);
  return record;
}

/**
 * Record a commission when a referred sale completes.
 * amountGross is in smallest currency unit (e.g. cents).
 */
export async function recordCommission({ code, amountGross, commissionRate, stripeSessionId }) {
  const regKey = `partner:reg:${code}`;
  const raw    = await kv('GET', regKey);
  // Store commission in major currency units (divide by 100)
  const commission = Math.round(amountGross * commissionRate) / 100;
  if (!raw) {
    // Unknown code — create a stub so we never lose a sale
    const stub = { code, salesCount: 1, totalEarned: commission,
                   sessions: [stripeSessionId], registeredAt: new Date().toISOString() };
    await kv('SET', regKey, JSON.stringify(stub));
    return stub;
  }
  const rec     = JSON.parse(raw);
  const updated = {
    ...rec,
    salesCount:  (rec.salesCount  || 0) + 1,
    totalEarned: Math.round(((rec.totalEarned || 0) + commission) * 100) / 100,
    sessions:    [...(rec.sessions || []), stripeSessionId],
    updatedAt:   new Date().toISOString(),
  };
  await kv('SET', regKey, JSON.stringify(updated));
  return updated;
}

/** Get partner stats by code. Returns null if not found. */
export async function getPartnerStats(code) {
  const raw = await kv('GET', `partner:reg:${code}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
