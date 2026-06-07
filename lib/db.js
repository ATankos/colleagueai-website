/**
 * lib/db.js — Entitlement store (Upstash Redis / Vercel KV)
 *
 * Both Upstash Redis and Vercel KV expose identical REST APIs.
 * Set one of these env vars:
 *   KV_REST_API_URL   + KV_REST_API_TOKEN  (Vercel KV)
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (Upstash)
 *
 * The key schema is:  entitlement:<email>  → JSON string
 */

const BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!BASE || !TOKEN) {
  console.warn('[db] No KV env vars set — entitlements will not persist.');
}

async function kv(command, ...args) {
  const res = await fetch(`${BASE}/${command}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`KV error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.result;
}

/**
 * Grant access for an email + array of agent slugs.
 * Merges with any existing entitlement for the same email.
 */
export async function grantEntitlement(email, slugs, stripeSessionId) {
  const key = `entitlement:${email.toLowerCase()}`;
  const existing = await getEntitlement(email);
  const merged = {
    email: email.toLowerCase(),
    slugs: Array.from(new Set([...(existing?.slugs ?? []), ...slugs])),
    grantedAt: existing?.grantedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stripeSessionIds: [...(existing?.stripeSessionIds ?? []), stripeSessionId],
  };
  await kv('SET', key, JSON.stringify(merged));
  return merged;
}

/**
 * Look up entitlement for an email. Returns null if none found.
 */
export async function getEntitlement(email) {
  const raw = await kv('GET', `entitlement:${email.toLowerCase()}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Check if an email is entitled to a specific agent slug.
 */
export async function isEntitled(email, slug) {
  const ent = await getEntitlement(email);
  if (!ent) return false;
  return ent.slugs.includes(slug) || ent.slugs.includes('*');
}
