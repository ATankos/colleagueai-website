/**
 * scripts/demand-report.mjs - internal demand intelligence per agent, for prioritising development.
 *
 *   node scripts/demand-report.mjs [--months 6] [--out demand.csv]
 *
 * Needs the KV credentials of the environment (KV_REST_API_URL / KV_REST_API_TOKEN, see lib/db.js).
 * Scoring rules live in config/demand-scoring.json. Five tiers are kept apart:
 *   engagement        filtered website engagement: unique (per visitor, agent and day) non-bot views
 *   registrations     unique interest registrations (one per e-mail and agent per 30 days)
 *   highIntent        registrations with a near timeframe, a supported Microsoft environment and a described use case
 *   qualified         registrations a PERSON qualified after contact (salesQualification stage qualified or higher)
 *   validatedIntent   qualified registrations with an agreed pilot or a stated purchase intent
 * A corporate e-mail and a timeframe alone never make a lead qualified. The demand index normalises each tier
 * across agents before weighting, and an agent below the minimum signals is reported as insufficient data and not
 * ranked. Output holds counts and categories only, never personal data.
 */
import { writeFileSync } from 'node:fs';
import { AVAILABILITY, publicStatus } from '../lib/availability.js';
import SCORING from '../config/demand-scoring.json' with { type: 'json' };

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const MONTHS = Math.max(1, Math.min(24, Number(arg('--months', 6)) || 6));
const OUT = arg('--out', null);
const QUALIFIED = new Set(['qualified', 'pilot-agreed', 'purchase-intent']);
const VALIDATED = new Set(['pilot-agreed', 'purchase-intent']);

export function monthsBack(n, now = new Date()) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return out;
}

export function isHighIntent(lead, s = SCORING) {
  return s.highIntent.timeframes.includes(lead.timeframe) && s.highIntent.techEnvironments.includes(lead.techEnvironment) &&
    typeof lead.useCase === 'string' && lead.useCase.trim().length >= s.highIntent.minUseCaseChars;
}
const stage = (l) => (l.salesQualification && l.salesQualification.by && l.salesQualification.at ? l.salesQualification.stage : null);
export const isQualified = (l) => QUALIFIED.has(stage(l));
export const isValidatedIntent = (l) => VALIDATED.has(stage(l));

const top = (arr) => {
  const c = {}; for (const v of arr) if (v) c[v] = (c[v] || 0) + 1;
  const e = Object.entries(c).sort((a, b) => b[1] - a[1]);
  return e.length ? `${e[0][0]} (${e[0][1]})` : '';
};

/** Pure aggregation, tested without a store. */
export function buildReport({ slugs, counters, interest, demos, scoring = SCORING }) {
  const rows = slugs.map((slug) => {
    const mine = interest.filter((l) => l.agentSlug === slug);
    const row = {
      agent: slug, name: AVAILABILITY.agents[slug]?.name || slug, tier: AVAILABILITY.agents[slug]?.cai?.targetLevel || '',
      availability: publicStatus(slug),
      engagement: counters.view?.[slug] || 0, botViews: counters.bot?.[slug] || 0,
      registrations: mine.length, highIntent: mine.filter((l) => isHighIntent(l, scoring)).length,
      qualified: mine.filter(isQualified).length, validatedIntent: mine.filter(isValidatedIntent).length,
      demos: Math.max(demos.filter((d) => d.agentSlug === slug).length, counters.demo?.[slug] || 0),
      topIndustry: top(mine.map((l) => l.industry)), topTechnology: top(mine.map((l) => l.techEnvironment)), topTimeframe: top(mine.map((l) => l.timeframe)),
    };
    row.engagementToRegistration = row.engagement ? +(row.registrations / row.engagement * 100).toFixed(1) : null;
    const m = scoring.minimumSignals;
    row.insufficientData = !(row.qualified > 0 || row.registrations >= m.registrations || row.demos >= m.demos || row.engagement >= m.engagement);
    return row;
  });
  const tiers = Object.keys(scoring.weights);
  const max = Object.fromEntries(tiers.map((k) => [k, Math.max(0, ...rows.map((r) => r[k] || 0))]));
  for (const r of rows) {
    const score = tiers.reduce((s, k) => s + scoring.weights[k] * (max[k] ? (r[k] || 0) / max[k] : 0), 0);
    r.demandIndex = r.insufficientData ? null : Math.round(score * 100);
  }
  const ranked = rows.filter((r) => r.demandIndex != null).sort((a, b) => b.demandIndex - a.demandIndex || a.agent.localeCompare(b.agent));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  const rest = rows.filter((r) => r.demandIndex == null).sort((a, b) => a.agent.localeCompare(b.agent));
  for (const r of rest) r.rank = null;
  return [...ranked, ...rest];
}

export function toCsv(rows) {
  const cols = ['rank', 'agent', 'name', 'tier', 'availability', 'engagement', 'botViews', 'registrations', 'highIntent', 'qualified', 'validatedIntent', 'demos',
    'engagementToRegistration', 'topIndustry', 'topTechnology', 'topTimeframe', 'insufficientData', 'demandIndex'];
  const q = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n') + '\n';
}

async function main() {
  const { readDemand, listLeads } = await import('../lib/db.js');
  const slugs = Object.keys(AVAILABILITY.agents);
  const months = monthsBack(MONTHS);
  const counters = { view: {}, bot: {}, demo: {} };
  for (const kind of Object.keys(counters)) {
    for (const s of slugs) counters[kind][s] = Object.values(await readDemand(kind, s, months)).reduce((a, b) => a + b, 0);
  }
  const since = `${months[months.length - 1]}-01`;
  const inWindow = (l) => String(l.receivedAt || '') >= since;
  const rows = buildReport({ slugs, counters, interest: (await listLeads('interest', 100000)).filter(inWindow), demos: (await listLeads('demo', 100000)).filter(inWindow) });
  const csv = toCsv(rows);
  if (OUT) { writeFileSync(OUT, csv); console.log(`[demand-report] ${rows.length} agents, ${months.length} months -> ${OUT}`); } else process.stdout.write(csv);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('[demand-report]', e.message); process.exit(1); });
