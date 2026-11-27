/**
 * lib/pseudonym.js - pseudonymous keys for rate limits and anonymous counters (CAI-AUD-002, -005).
 *
 * A key derived from a client address must (a) not be recomputable from the address by someone who can read the store
 * and (b) be the SAME on every serverless instance, or a rate limit counts per instance and limits nothing.
 *
 * The key material is, in order: a configured secret (PSEUDONYM_SECRET, RATE_LIMIT_SECRET or DOWNLOAD_TOKEN_SECRET), else a
 * random secret created once in the shared store (lib/db.js sharedSecret). The earlier per-process random key met (a)
 * but not (b). Each purpose gets its own derived key, so a key for one use cannot be replayed for another.
 *
 * Do NOT use this for values derived from an email address that are stored for weeks (the interest duplicate marker):
 * a secret kept in the same store as the marker would not protect it. Those require a configured secret.
 */
import { createHmac } from 'node:crypto';
import { sharedSecret } from './db.js';

export const configuredPseudonymSecret = () =>
  process.env.PSEUDONYM_SECRET || process.env.RATE_LIMIT_SECRET || process.env.DOWNLOAD_TOKEN_SECRET || null;

/** HMAC-SHA256 of `value` under a key derived for `purpose`, hex, cut to `length` characters. */
export async function pseudonym(purpose, value, length = 32) {
  const master = configuredPseudonymSecret() || await sharedSecret('pseudonym');
  const key = createHmac('sha256', master).update(`colleagueai:${purpose}`).digest();
  return createHmac('sha256', key).update(String(value)).digest('hex').slice(0, length);
}
