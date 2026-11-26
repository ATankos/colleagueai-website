/**
 * scripts/interest-ops.mjs - operations on interest registrations (docs/launch/interest-operations.md).
 * Needs the KV credentials of the environment (KV_REST_API_URL / KV_REST_API_TOKEN); the retry also needs
 * RESEND_API_KEY and DEMO_NOTIFY_EMAIL. Every command is a dry run unless --apply is given.
 * Output never prints an e-mail address or company name: ids, agents and states only.
 *
 *   node scripts/interest-ops.mjs status
 *       counts by notification state, and the ids that need attention
 *   node scripts/interest-ops.mjs retry [--apply]
 *       retries the notification of every registration whose retry is due (lib/interestNotify.js: idempotent,
 *       locked, exponential back-off, at most 5 attempts; an accepted one is never sent again)
 *   node scripts/interest-ops.mjs qualify --id <id> --stage <qualified|pilot-agreed|purchase-intent|not-qualified> --by <name> [--apply]
 *       records the sales qualification a PERSON made after talking to the customer (the demand report's
 *       "commercially qualified" and "validated intent" tiers count only these records)
 *   node scripts/interest-ops.mjs delete --email <address> [--apply]
 *       deletes every registration of that address and its duplicate-check keys (data-subject request)
 */
import crypto from 'node:crypto';
import { listLeads, getLead, updateLead, deleteLead, releaseKey } from '../lib/db.js';
import { notifyInterest, retryDue } from '../lib/interestNotify.js';

export const STAGES = ['not-qualified', 'qualified', 'pilot-agreed', 'purchase-intent'];
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes('--apply');
const ALL = 100000;

function dedupeKey(email, agent) {
  const salt = process.env.INTEREST_DEDUPE_SALT || process.env.DOWNLOAD_TOKEN_SECRET || 'colleagueai-interest';
  return 'interest:seen:' + crypto.createHmac('sha256', salt).update(email.toLowerCase() + '|' + agent).digest('hex').slice(0, 32);
}

export async function status() {
  const leads = await listLeads('interest', ALL); const by = {};
  for (const l of leads) { const s = l.notification?.status || 'legacy-unrecorded'; by[s] = (by[s] || 0) + 1; }
  const attention = leads.filter((l) => ['failed', 'gave-up', 'not-configured', 'pending', undefined].includes(l.notification?.status)).map((l) => `${l.id} ${l.agentSlug} ${l.notification?.status || 'legacy-unrecorded'} attempts=${l.notification?.attempts ?? 0}`);
  return { total: leads.length, byStatus: by, attention };
}

export async function retry({ apply = APPLY, now = Date.now() } = {}) {
  const due = (await listLeads('interest', ALL)).filter((l) => retryDue(l, now));
  const out = [];
  for (const l of due) out.push(apply ? { id: l.id, ...(await notifyInterest(l.id)) } : { id: l.id, wouldRetry: true, attempts: l.notification.attempts });
  return out.map((r) => ({ id: r.id, status: r.status, attempts: r.attempts, lastError: r.lastError, wouldRetry: r.wouldRetry }));
}

export async function qualify({ id, stage, by, apply = APPLY, now = new Date() }) {
  if (!STAGES.includes(stage)) throw new Error(`stage must be one of ${STAGES.join(', ')}`);
  if (!by || !String(by).trim()) throw new Error('--by <name of the person who qualified it> is required');
  const rec = await getLead('interest', id);
  if (!rec) throw new Error('no such registration');
  const salesQualification = { stage, by: String(by).trim().slice(0, 80), at: now.toISOString() };
  if (apply) await updateLead('interest', { ...rec, salesQualification });
  return { id, agent: rec.agentSlug, salesQualification, applied: apply };
}

export async function deleteByEmail({ email, apply = APPLY }) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) throw new Error('--email <address> is required');
  const mine = (await listLeads('interest', ALL)).filter((l) => String(l.email || '').toLowerCase() === e);
  if (apply) {
    for (const l of mine) { await deleteLead('interest', l.id); await releaseKey(dedupeKey(e, l.agentSlug)); }
  }
  return { matched: mine.length, ids: mine.map((l) => l.id), deleted: apply };
}

async function main() {
  const cmd = process.argv[2];
  let r;
  if (cmd === 'status') r = await status();
  else if (cmd === 'retry') r = await retry();
  else if (cmd === 'qualify') r = await qualify({ id: arg('--id'), stage: arg('--stage'), by: arg('--by') });
  else if (cmd === 'delete') r = await deleteByEmail({ email: arg('--email') });
  else { console.error('usage: status | retry [--apply] | qualify --id --stage --by [--apply] | delete --email [--apply]'); process.exit(2); }
  console.log(JSON.stringify(r, null, 2));
  if (!APPLY && cmd !== 'status') console.log('(dry run: add --apply to change anything)');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('[interest-ops]', e.message); process.exit(1); });
