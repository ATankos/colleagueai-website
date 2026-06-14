import { createHmac, timingSafeEqual } from 'node:crypto';
const secret = () => process.env.DOWNLOAD_TOKEN_SECRET || '';
const payload = (email, slug, file, exp) => `${String(email).toLowerCase()}:${slug}:${file}:${exp}`;
export function signDownload({ email, slug, file = 'dossier.pdf', ttlSeconds = 900 }) {
  if (!secret()) throw new Error('DOWNLOAD_TOKEN_SECRET not set');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac('sha256', secret()).update(payload(email, slug, file, exp)).digest('hex');
  const qs = new URLSearchParams({ email, slug, file, exp: String(exp), sig });
  return { exp, sig, query: qs.toString(), path: `/api/download?${qs.toString()}` };
}
export function verifyDownload({ email, slug, file = 'dossier.pdf', exp, sig }) {
  if (!secret()) return { ok: false, reason: 'server-misconfigured' };
  if (!email || !slug || !exp || !sig) return { ok: false, reason: 'missing-token' };
  if (Number(exp) < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  const expected = createHmac('sha256', secret()).update(payload(email, slug, file, Number(exp))).digest('hex');
  let a, b; try { a = Buffer.from(expected, 'hex'); b = Buffer.from(String(sig), 'hex'); } catch { return { ok: false, reason: 'bad-signature' }; }
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad-signature' };
  return { ok: true };
}