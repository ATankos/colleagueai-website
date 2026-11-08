/**
 * lib/mail.js - sends one transactional email.
 *
 * One transport today: Resend, the API api/demo-booking.js already calls. It is switched on by RESEND_API_KEY; the
 * sender is MAIL_FROM, else DEMO_NOTIFY_FROM, else hello@colleagueai.ai. Without a key nothing is sent and the caller
 * is told, so a feature that needs mail can refuse to run instead of pretending it did. Resend only sends from a domain
 * that has been verified in the Resend account (DNS records), which is an owner step, not a code step. A caller may
 * pass replyTo, so that mail sent from a sending subdomain that nobody reads still has its replies land in a real inbox.
 *
 * The error carries the status code only: a provider's error body can echo the recipient's address, and addresses
 * do not go to the logs.
 */

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMail({ to, subject, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'not-configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || process.env.DEMO_NOTIFY_FROM || 'ColleagueAI <hello@colleagueai.ai>',
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`mail provider answered ${res.status}`);
  return { sent: true };
}
