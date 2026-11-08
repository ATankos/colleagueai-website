/**
 * lib/recovery.js - the parts of buyer recovery (release gate A8) that api/recover.js and api/success.js share.
 *
 * A buyer who closed the thank-you page used to have one way back: write to support. Recovery lets them ask for a
 * fresh link by email. It is only on when the owner has switched it on (RECOVERY_ENABLED=1) AND it can work end to
 * end - a signing secret and a mail transport - and is invisible otherwise, so nothing on the live site changes
 * until the owner decides. The switch is separate from the mail key on purpose: RESEND_API_KEY is also what turns
 * on demo-request alerts, and setting it up for that must not quietly open a public form that sends mail.
 */
import { createHash } from 'node:crypto';
import { canonicalSlug } from './products.js';
import { mailConfigured, sendMail } from './mail.js';
import { signRecovery, RECOVERY_TTL_SECONDS } from './recoveryToken.js';
import { ORDER_LOCALES, ot } from './orderI18n.js';

export const SUPPORT_EMAIL = 'hello@colleagueai.ai';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The owner's switch: RECOVERY_ENABLED is 1 or true. Absent, empty or anything else means off. */
export function recoveryEnabled() {
  return /^(1|true)$/i.test(String(process.env.RECOVERY_ENABLED ?? '').trim());
}

/** Switched on, and a link can be sealed AND mailed. Anything less and recovery is off: it refuses, and no page mentions it. */
export function recoveryAvailable() {
  return recoveryEnabled() && Boolean(process.env.DOWNLOAD_TOKEN_SECRET) && mailConfigured();
}

/**
 * Where the emailed link points. PUBLIC_BASE_URL when set; on Production the live site; on a Vercel Preview or
 * Development deployment that deployment itself, so a link mailed from a test never opens the live site.
 */
export function publicBaseUrl() {
  const set = process.env.PUBLIC_BASE_URL;
  if (set) return set.replace(/\/+$/, '');
  const env = process.env.VERCEL_ENV;
  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (env && env !== 'production' && host) return `https://${host}`;
  return 'https://www.colleagueai.ai';
}

/** The address, lower-cased and trimmed, or '' when it is not a plausible single address. */
export function normaliseEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : '';
}

/** Rate-limit key part: a hash, so the limiter does not add one more place that holds buyers' addresses. */
export function emailKey(email) {
  return createHash('sha256').update(email).digest('hex').slice(0, 32);
}

/**
 * What a buyer can get again: whatever the entitlement still holds. Refunds and charge-backs remove an agent from
 * the entitlement (revokeEntitlement), so a refunded purchase is simply not here. "*" is an operator grant, not a purchase.
 */
export function recoverableSlugs(entitlement) {
  const list = Array.isArray(entitlement?.slugs) ? entitlement.slugs : [];
  return Array.from(new Set(list.filter((s) => typeof s === 'string' && s && s !== '*').map(canonicalSlug)));
}

/**
 * Where a buyer's reply to the recovery email goes: MAIL_REPLY_TO when set, else the support address. The mail may be
 * sent from a dedicated sending subdomain that has no inbox, and a buyer who answers it must still reach a person.
 */
export function replyToAddress() {
  return String(process.env.MAIL_REPLY_TO ?? '').trim() || SUPPORT_EMAIL;
}

/** Seal a link for this address and mail it, in the buyer's language. Throws if the provider refuses. */
export async function sendRecoveryEmail(email, lang) {
  const l = ORDER_LOCALES.includes(lang) ? lang : 'en';
  const { t } = signRecovery({ email });
  const link = `${publicBaseUrl()}/recover?${new URLSearchParams({ t, lang: l })}`;
  return sendMail({
    to: email,
    replyTo: replyToAddress(),
    subject: ot(l, 'rec_mail_subject'),
    text: ot(l, 'rec_mail_body', { link, minutes: String(RECOVERY_TTL_SECONDS / 60), email: SUPPORT_EMAIL }),
  });
}

/** One line under the download block on the thank-you page. Empty unless recovery is on. */
export function recoverHint(lang) {
  if (!recoveryAvailable()) return '';
  const l = ORDER_LOCALES.includes(lang) ? lang : 'en';
  const link = `<a href="/recover?lang=${l}">${esc(ot(l, 'rec_hint_link'))}</a>`;
  return `<p class="o-note">${esc(ot(l, 'rec_hint', { link: '@@LINK@@' })).replace('@@LINK@@', link)}</p>`;
}
