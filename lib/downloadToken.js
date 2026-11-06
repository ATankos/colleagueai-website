/**
 * lib/downloadToken.js - download links that do not carry the buyer's email.
 *
 * A link is /api/download?t=<token>. The token seals the buyer's email, the slug, the file
 * and the expiry with AES-256-GCM under a key derived from DOWNLOAD_TOKEN_SECRET. So the
 * email never appears in the URL, in browser history, or in access logs, and any change to
 * the token fails authentication. The link expires after its ttl (15 minutes by default).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const secret = () => process.env.DOWNLOAD_TOKEN_SECRET || '';
const keyFor = () => createHash('sha256').update(`colleagueai:download-token:v2:${secret()}`).digest();
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_TOKEN_CHARS = 1024;

export function signDownload({ email, slug, file = 'dossier.pdf', ttlSeconds = 900 }) {
  if (!secret()) throw new Error('DOWNLOAD_TOKEN_SECRET not set');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFor(), iv);
  const plain = Buffer.from(JSON.stringify({ e: String(email).toLowerCase(), s: slug, f: file, x: exp }), 'utf8');
  const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);
  const t = Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64url');
  return { exp, t, path: `/api/download?${new URLSearchParams({ t }).toString()}` };
}

/**
 * Open a token. Returns { ok: true, email, slug, file, exp } for a live, untampered token,
 * otherwise { ok: false, reason } with reason one of: server-misconfigured, missing-token,
 * bad-token, expired.
 */
export function openDownload(t) {
  if (!secret()) return { ok: false, reason: 'server-misconfigured' };
  if (typeof t !== 'string' || !t || t.length > MAX_TOKEN_CHARS) return { ok: false, reason: 'missing-token' };
  const raw = Buffer.from(t, 'base64url');
  if (raw.length <= IV_BYTES + TAG_BYTES) return { ok: false, reason: 'bad-token' };
  let claims;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
    claims = JSON.parse(plain.toString('utf8'));
  } catch {
    return { ok: false, reason: 'bad-token' };
  }
  if (!claims || typeof claims.e !== 'string' || typeof claims.s !== 'string' ||
      typeof claims.f !== 'string' || !Number.isFinite(claims.x)) {
    return { ok: false, reason: 'bad-token' };
  }
  if (claims.x < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  return { ok: true, email: claims.e, slug: claims.s, file: claims.f, exp: claims.x };
}
