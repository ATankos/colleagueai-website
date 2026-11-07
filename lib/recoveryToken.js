/**
 * lib/recoveryToken.js - the link in a "send me my download link again" email (release gate A8).
 *
 * Sealed like lib/downloadToken.js (AES-256-GCM, key derived from DOWNLOAD_TOKEN_SECRET), but under its own
 * key label and with its own purpose claim, so a recovery token can never be opened as a download token or the
 * other way round. It carries the buyer's email and an expiry and nothing else: the page it opens issues the
 * short-lived download links itself, after checking the entitlement again. The email is never in a URL in the clear.
 *
 * Not single-use, on purpose. Mail scanners (Outlook Safe Links, Defender, corporate gateways) open every link in a
 * message before the buyer does, and a single-use link would already be spent by the scanner. The window is short
 * instead (30 minutes), and nothing it opens can outlive a refund: the entitlement is read again on every open.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const secret = () => process.env.DOWNLOAD_TOKEN_SECRET || '';
const keyFor = () => createHash('sha256').update(`colleagueai:recovery-token:v1:${secret()}`).digest();
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_TOKEN_CHARS = 1024;

export const RECOVERY_TTL_SECONDS = 30 * 60;

export function signRecovery({ email, ttlSeconds = RECOVERY_TTL_SECONDS }) {
  if (!secret()) throw new Error('DOWNLOAD_TOKEN_SECRET not set');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFor(), iv);
  const plain = Buffer.from(JSON.stringify({ p: 'recover', e: String(email).toLowerCase(), x: exp }), 'utf8');
  const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);
  const t = Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64url');
  return { exp, t };
}

/**
 * Open a token. { ok: true, email, exp } for a live, untampered recovery token, otherwise { ok: false, reason }
 * with reason one of: server-misconfigured, missing-token, bad-token, expired.
 */
export function openRecovery(t) {
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
  if (!claims || claims.p !== 'recover' || typeof claims.e !== 'string' || !claims.e || !Number.isFinite(claims.x)) {
    return { ok: false, reason: 'bad-token' };
  }
  if (claims.x < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  return { ok: true, email: claims.e, exp: claims.x };
}
