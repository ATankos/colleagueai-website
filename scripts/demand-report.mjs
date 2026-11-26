/**
 * scripts/demand-report.mjs - internal demand intelligence per agent, for prioritising development.
 *
 *   node scripts/demand-report.mjs [--months 6] [--out demand.csv]
 *
 * Needs the KV credentials of the environment to read (KV_REST_API_URL / KV_REST_API_TOKEN, see lib/db.js).
 * Reads the anonymous monthly counters (views, interest, demo) and the interest and demo leads, and writes one
 * row per agent: views, interest registrations, qualified leads, demo requests, conversion rates, the most
 * frequent industry, technology environment and timeframe, and a relative demand index (0-100).
 * Personal data is never written to the output: only counts and categories.
 *
 * Qualified lead (documented rule, change it here): an interest registration with a timeframe within 12 months,
 * a Microsoft environment the packages run on (M365 Copilot, Copilot Studio or Power Platform) and a use case of
 * at least 40 characters.
 */
import { writeFileSync } from 'node:fs';
import { AVAILABILITY, publicStatus } from '../lib/availability.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const MONTHS = Math.max(1, Math.min(24, Number(arg('--months', 6)) || 6));
const OUT = arg('--out', null);

export function monthsBack(n, now = new Date()) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function isQualified(lead) {
  return ['0-3-months', '3-6-months', '6-12-months'].includes(lead.timeframe) &&
    ['m365-copilot', 'copilot-studio', 'power-platform'].includes(lead.techEnvironment) &&
    typeof lead.useCase === 'string' && lead.useCase.trim().length >= 40;
}

const top = (arr) => {
  const c = {}; for (const v of arr) if (v) c[v] = (c[v] || 0) + 1;
  const e = Object.entries(c).sort((a, b) => b[1] - a[1]);
  return e.length ? `${e[0][0]} (${e[0][1]})` : '';
};

/** Pure aggregation, tested without a store. */
export function buildReport({ slugs, counters, interest, demos }) {
  const rows = slugs.map((slug) => {
    const mine = interest.filter((l) => l.agentSlug === slug);
    const views = counters.view[slug] || 0;
    const reg = Math.max(mine.length, counters.interest[slug] || 0);
    const demo = Math.max(demos.filter((d) => d.agentSlug === slug).length, counters.demo[slug] || 0);
    const qualified = mine.filter(isQualified).length;
    return {
      agent: slug, name: AVAILABILITY.agents[slug]?.name || slug, tier: AVAILABILITY.agents[slug]?.cai?.targetLevel || '',
      availability: publicStatus(slug), views, interest: reg, qualified, demos: demo,
      viewToInterest: views ? +(reg / views * 100).toFixed(1) : null,
      interestToQualified: reg ? +(qualified / reg * 100).toFixed(1) : null,
      topIndustry: top(mine.map((l) => l.industry)), topTechnology: top(mine.map((l) => l.techEnvironment)), topTimeframe: top(mine.map((l) => l.timeframe)),
    };
  });
  // Relative demand: qualified leads weigh 5, other registrations 2, demo requests 3, views 0.05.
  const score = (r) => r.qualified * 5 + (r.interest - r.qualified) * 2 + r.demos * 3 + r.views * 0.05;
  const max = Math.max(1, ...rows.map(score));
  for (const r of rows) r.demandIndex = Math.round(score(r) / max * 100);
  return rows.sort((a, b) => b.demandIndex - a.demandIndex || a.agent.localeCompare(b.agent));
}

export function toCsv(rows) {
  const cols = ['agent', 'name', 'tier', 'availability', 'views', 'interest', 'qualified', 'demos', 'viewToInterest', 'interestToQualified', 'topIndustry', 'topTechnology', 'topTimeframe', 'demandIndex'];
  const q = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n') + '\n';
}

async function main() {
  const { readDemand, listLeads } = await import('../lib/db.js');
  const slugs = Object.keys(AVAILABILITY.agents);
  const months = monthsBack(MONTHS);
  const counters = { view: {}, interest: {}, demo: {} };
  for (const kind of Object.keys(counters)) {
    for (const s of slugs) counters[kind][s] = Object.values(await readDemand(kind, s, months)).reduce((a, b) => a + b, 0);
  }
  const since = `${months[months.length - 1]}-01`;
  const inWindow = (l) => String(l.receivedAt || '') >= since;
  const interest = (await listLeads('interest', 5000)).filter(inWindow);
  const demos = (await listLeads('demo', 5000)).filter(inWindow);
  const rows = buildReport({ slugs, counters, interest, demos });
  const csv = toCsv(rows);
  if (OUT) { writeFileSync(OUT, csv); console.log(`[demand-report] ${rows.length} agents, ${months.length} months -> ${OUT}`); } else process.stdout.write(csv);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('[demand-report]', e.message); process.exit(1); });
