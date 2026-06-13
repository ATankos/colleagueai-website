/**
 * scripts/generate-agent-pages.mjs — build step: prerender one page per agent.
 * Reads the canonical AGENTS data from public/agents.html (single source of truth),
 * writes dist/agents/<slug>.html (EN v1) and regenerates dist/sitemap.xml with the
 * 36 agent URLs added. Runs after `vite build` (see package.json "build").
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const html = readFileSync(join(ROOT, 'public/agents.html'), 'utf8');

function extract(name, open) {
  const i = html.indexOf(name);
  if (i < 0) throw new Error(name + ' not found');
  let j = html.indexOf(open, i), d = 0, k = j, q = null;
  for (; k < html.length; k++) {
    const c = html[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === open) d++;
    else if (c === (open === '[' ? ']' : '}') && --d === 0) break;
  }
  return vm.runInNewContext('(' + html.slice(j, k + 1) + ')');
}
const AGENTS = extract('const AGENTS=', '[');
const slugify = (n) => n.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TIER = { L1: 'Assist', L2: 'Draft', L3: 'Operate', L4: 'Decide (supervised)', L5: 'Autonomous' };
const PILLAR = { ops: 'Operations & Service Delivery', risk: 'Risk, Security & Compliance', data: 'Data & Infrastructure', sales: 'Sales & Marketing', corp: 'Corporate' };
const BASE = 'https://www.colleagueai.ai';
const TIER_DESC = { // verbatim from the CAI Score section of /agents (locked copy, reused not rewritten)
  L2: ['Produces a work product — a document, a query, a report, an outreach message — for a human to review and approve. Nothing the agent makes is used until a person signs off.', 'Reviews & approves'],
  L3: ['Executes routine, low-risk actions inside a bounded workflow — classify, route, fulfil, log. Exceptions and anything unusual are handed to a human. Every action is time-stamped.', 'Owns exceptions'],
  L4: ['Supports decisions and controls in higher-stakes processes — compliance, contracts, security, four-eyes. A named human remains accountable for the call; the agent assists and evidences it. Built for high-risk-process scrutiny.', 'Stays accountable'],
};
const ADOPT = 'Ships pre-built for Microsoft Copilot Studio, Power Automate and Azure. You connect it to your environment, certify it on the CAI Score, and it runs in your own tenant — no rebuild, no data leaving your walls.';
const DEPLOY = 'Agents run inside your own Microsoft Copilot Studio, Power Automate and Azure environment. Colleague AI hosts only the control plane — scores, policies and audit metadata. No customer data is ever processed on our side. Your data stays in your tenant.';


function page(a) {
  const slug = slugify(a.n);
  const url = `${BASE}/agents/${slug}`;
  const tier = `${a.t} · ${TIER[a.t] ?? ''}`;
  // one legacy PDF name predates the agent's rename
  const PDF_ALIAS = { 'acceptance-test-script-generator': 'oat-test-script-generator' };
  const pdf = `/docs/agents/${PDF_ALIAS[slug] ?? slug}.pdf`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${BASE}/#org`, name: 'Colleague AI', url: BASE, logo: `${BASE}/logo.svg` },
      { '@type': 'Product', '@id': `${url}#product`, name: a.n, description: a.desc,
        category: a.dom, brand: { '@type': 'Brand', name: 'Colleague AI' }, url,
        additionalProperty: [{ '@type': 'PropertyValue', name: 'CAI Score tier', value: a.t }] },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Agent Catalogue', item: `${BASE}/agents` },
        { '@type': 'ListItem', position: 2, name: a.n, item: url }] },
    ],
  };
  const sec = (h, b) => b ? `<section><h2>${esc(h)}</h2><p>${esc(b)}</p></section>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(a.n)} — Certified ${esc(a.t)} Enterprise AI Agent | Colleague AI</title>
<meta name="description" content="${esc(a.desc)}">
<meta name="robots" content="index, follow, max-snippet:-1">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(a.n)} — Certified ${esc(a.t)} Enterprise AI Agent | Colleague AI">
<meta property="og:description" content="${esc(a.desc)}">
<meta property="og:image" content="${BASE}/og-image.png">
<meta property="og:site_name" content="Colleague AI">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
body{margin:0;font-family:'Inter',system-ui,sans-serif;background:#F5F0E8;color:#1D1B1A;line-height:1.65}
main{max-width:760px;margin:0 auto;padding:48px 24px 80px}
.crumb{font-size:13px;margin-bottom:28px}.crumb a{color:#9A4B2F;text-decoration:none}
.eyebrow{font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#8a857d;letter-spacing:.05em;margin-bottom:10px}
h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:0 0 14px}
.meta{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 30px}
.chip{font-size:12.5px;padding:5px 13px;border:1px solid #d8d2c6;border-radius:999px;background:#fff}
.chip strong{color:#9A4B2F}
h2{font-size:15px;font-family:'JetBrains Mono',monospace;letter-spacing:.04em;color:#8a857d;margin:34px 0 8px;text-transform:uppercase}
section p{margin:0}
ul{margin:6px 0 0;padding-left:20px}
.cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:44px}
.btn{display:inline-block;padding:12px 26px;border-radius:999px;text-decoration:none;font-size:14.5px}
.btn-p{background:#1D1B1A;color:#F5F0E8}.btn-s{border:1.5px solid #1D1B1A;color:#1D1B1A}
footer{font-size:12px;color:#8a857d;margin-top:56px;border-top:1px solid #d8d2c6;padding-top:18px}
</style>
</head>
<body>
<main>
<nav class="crumb"><a href="/agents">← Agent Catalogue</a></nav>
<div class="eyebrow">Certified under CAI Score™ · ${esc(tier)}</div>
<h1>${esc(a.n)}</h1>
<p>${esc(a.desc)}</p>
<div class="meta">
  <span class="chip">CAI tier <strong>${esc(a.t)}</strong></span>
  <span class="chip">${esc(PILLAR[a.p] ?? a.p)}</span>
  <span class="chip">${esc(a.dom)}</span>
</div>
${sec('Where it fits', a.fit)}
${sec('Value & ROI', a.roi)}
${sec('KPI it moves', a.kpi)}
${sec('Risk & compliance posture', a.comp)}
${a.pains?.length ? `<section><h2>Pain points it removes</h2><ul>${a.pains.map(p => `<li>${esc(p)}</li>`).join('')}</ul></section>` : ''}
${TIER_DESC[a.t] ? `<section><h2>What the ${esc(a.t)} · ${esc(TIER_DESC[a.t] ? TIER[a.t] : '')} tier means</h2><p>${esc(TIER_DESC[a.t][0])} Human role: ${esc(TIER_DESC[a.t][1])}.</p></section>` : ''}
<section><h2>How you adopt it</h2><p>${esc(ADOPT)}</p></section>
<section><h2>Deployment &amp; data</h2><p>${esc(DEPLOY)}</p></section>
<section><h2>What you get</h2><ul><li>Copilot Studio connect package</li><li>Microsoft 365 Copilot package</li><li>Agent dossier (PDF)</li></ul><p>One-time purchase. Your connect packages unlock as soon as secure checkout completes.</p></section>
<section><h2>About Colleague AI</h2><p>Colleague AI is the trust layer for enterprise AI. It certifies AI agents against the CAI Score — a five-tier risk classification from L1 to L5 — documenting each agent\u2019s controls and producing an audit trail. Agents run inside your own environment; we host only the governance control plane. So you deploy AI you can defend.</p></section>
<div class="cta">
  <a class="btn btn-p" href="/agents#catalogue">Get this agent →</a>
  <a class="btn btn-s" href="/demo">See it in a live demo</a>
  <a class="btn btn-s" href="${pdf}" target="_blank" rel="noopener">⤓ Agent dossier (PDF)</a>
</div>
<footer>Runs in your tenant · No customer data processed by us · EU AI Act · DORA · ISO/IEC 42001 aligned · © Colleague AI 2026</footer>
</main>
</body>
</html>`;
}

mkdirSync(join(DIST, 'agents'), { recursive: true });
const slugs = [];
for (const a of AGENTS) {
  const slug = slugify(a.n);
  slugs.push(slug);
  writeFileSync(join(DIST, 'agents', slug + '.html'), page(a));
  const PDF_ALIAS2 = { 'acceptance-test-script-generator': 'oat-test-script-generator' };
  if (!existsSync(join(ROOT, 'public/docs/agents', (PDF_ALIAS2[slug] ?? slug) + '.pdf')))
    console.warn('[gen] missing dossier PDF for', slug);
}
// sitemap: base + agent urls
let sm = readFileSync(join(ROOT, 'public/sitemap.xml'), 'utf8');
const entries = slugs.map(s =>
  `  <url>\n    <loc>${BASE}/agents/${s}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`).join('\n');
sm = sm.replace('</urlset>', entries + '\n</urlset>');
writeFileSync(join(DIST, 'sitemap.xml'), sm);
console.log(`[gen] ${slugs.length} agent pages + sitemap (${slugs.length + (sm.match(/<loc>/g).length - slugs.length)} urls) written to dist/`);
