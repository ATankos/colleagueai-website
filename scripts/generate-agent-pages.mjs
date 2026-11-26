/**
 * scripts/generate-agent-pages.mjs: build step: prerender one page per agent.
 * Reads the canonical AGENTS data from public/agents.html (single source of truth),
 * writes dist/agents/<slug>.html (EN v1) and regenerates dist/sitemap.xml with the
 * 36 agent URLs added. Runs after `vite build` (see package.json "build").
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';
import PRICING from '../config/pricing.json' with { type: 'json' };
import PACKAGES from '../config/packages.json' with { type: 'json' };
import PRODUCTS from '../config/products.json' with { type: 'json' };
import { publicStatus, recordFor, commercialSaleAllowed, PUBLIC_LABELS } from '../lib/availability.js';
const PKG_LABEL = { 'copilot-studio': 'Copilot Studio managed solution', 'm365-copilot': 'Microsoft 365 Copilot package' };
const packagesFor = (slug) => PACKAGES.agents[slug] || PACKAGES.default;
/* Release status (finding LR-04): an agent with a product record in config/products.json has a released package;
   every other catalogue agent is a concept with a dossier only, and its factsheet says so. */
const releaseOf = (slug) => (slug !== '_comment' && PRODUCTS[slug]?.release) || null;
/* Continuous Certification is sold only once its gate opens (CERTIFICATION_SALES_ENABLED, LR-23). Until then the
 * factsheets say so next to the published subscription price, the same way /api/checkout tells the buyer. */
const CERT_NOT_OPEN = 'Continuous Certification is not yet open for subscription: current orders are for the perpetual licence only.';
/* What a released package needs and costs on the customer's side. Microsoft bills this usage to the customer, not
 * ColleagueAI; the claims test requires every released package to carry a statement here (LR-11). No figures:
 * they depend on the customer's volumes and are given in the sizing estimate. */
const RUNTIME = {
  'contract-intelligence-and-register': 'This package runs on your own Microsoft licences and capacity: a Power Platform environment with Dataverse, a Copilot Studio billing plan (pay-as-you-go Copilot Credits or a credit pack), SharePoint and Microsoft Teams. Document extraction, the scheduled recalculation of deadlines and agent answers consume Copilot Credits that Microsoft bills to you, not ColleagueAI; the amount grows with the number of contracts, amendments and questions. The installation guide lists the prerequisites; ask us for a sizing estimate before you buy.',
};
const STATUS_TEXT = {
  'controlled-test': 'Release candidate: installable and tested in a controlled environment; not on sale.',
  released: 'Commercially available.',
};

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
/* The product facts of each released package (what it does, who buys it, what it needs, what the price includes and
   excludes): the same ten rows the catalogue drawer shows, so the factsheet and the drawer never disagree. */
const PRODUCT_FACTS = extract('window.PRODUCT_FACTS=', '{');
const slugify = (n) => n.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const TIER = { L1: 'Assist', L2: 'Draft', L3: 'Operate', L4: 'Decide (supervised)', L5: 'Autonomous' };
const PILLAR = { ops: 'Operations & Service Delivery', risk: 'Risk, Security & Compliance', data: 'Data & Infrastructure', sales: 'Sales & Marketing', corp: 'Corporate' };
const BASE = 'https://www.colleagueai.ai';
const TIER_DESC = { // verbatim from the CAI Score section of /agents (locked copy, reused not rewritten)
  L2: ['Produces a work product (a document, a query, a report, an outreach message) for a human to review and approve. Nothing the agent makes is used until a person signs off.', 'Reviews & approves'],
  L3: ['Executes routine, low-risk actions inside a bounded workflow: classify, route, fulfil, log. Exceptions and anything unusual are handed to a human. Every action is time-stamped.', 'Owns exceptions'],
  L4: ['Supports decisions and controls in higher-stakes processes: compliance, contracts, security, four-eyes. A named human remains accountable for the call; the agent assists and evidences it. Built for high-risk-process scrutiny.', 'Stays accountable'],
};
const DEPLOY = 'You install the package in your own Microsoft environment (Copilot Studio, Power Automate and Dataverse) and it runs there, in your tenant. Colleague AI hosts none of it: your documents, the register, the reviews and the audit evidence stay with you. Customer business content remains in the customer-controlled Microsoft environment; ColleagueAI receives none of it and keeps only the records of your order, licence and downloads, as described in the Trust Center.';
const ABOUT = 'Colleague AI s.r.o. is a software company in Prague. We build agent packages for Microsoft 365 and classify each one on the CAI Score, a five-tier risk classification (L1 to L5) that fixes the human role and the evidence an agent must produce. Packages run in your own tenant; we host none of your data.';


function page(a) {
  const slug = slugify(a.n);
  const url = `${BASE}/agents/${slug}`;
  const tier = `${a.t} · ${TIER[a.t] ?? ''}`;
  // one legacy PDF name predates the agent's rename
  const PDF_ALIAS = {} /* canonical acceptance-test-script-generator.pdf now exists with the corrected
       content; the legacy oat- file stays on disk so old external links keep
       working, but nothing on the site links it any more */;
  const pdf = `/docs/agents/${PDF_ALIAS[slug] ?? slug}.pdf`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${BASE}/#org`, name: 'Colleague AI', url: BASE, logo: `${BASE}/logo.svg` },
      { '@type': 'Product', '@id': `${url}#product`, name: a.n, description: a.desc,
        category: a.dom, brand: { '@type': 'Brand', name: 'Colleague AI' }, url,
        /* Availability comes from config/availability.json. No Offer is published unless the commercial sale is
           authorised, so search engines never read a Coming-soon agent as on sale. The CAI level is a target. */
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'Target CAI level (classification, not a verified CAI Score)', value: a.t },
          { '@type': 'PropertyValue', name: 'Availability', value: PUBLIC_LABELS.en[publicStatus(slug)] }],
        ...(commercialSaleAllowed(slug) ? { offers: { '@type': 'Offer', availability: 'https://schema.org/InStock', price: String(PRICING.tiers[a.t].oneTimeCents / 100), priceCurrency: 'USD', url } } : {}) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Agent Catalogue', item: `${BASE}/agents` },
        { '@type': 'ListItem', position: 2, name: a.n, item: url }] },
    ],
  };
  const usdFmt = (n) => '$' + n.toLocaleString('en-US');
  const price = (t) => (PRICING.tiers[t] ? usdFmt(PRICING.tiers[t].oneTimeCents / 100) : 'Price on request');
  const cert = (t) => (PRICING.tiers[t] ? usdFmt(PRICING.tiers[t].monthlyCents / 100) : '');
  const sec = (h, b) => b ? `<section><h2>${esc(h)}</h2><p>${esc(b)}</p></section>` : '';
  /* Released packages open with the product facts: the questions a buyer, an administrator and a finance team ask,
     answered in the same words as the catalogue drawer. Concepts have no facts block. */
  const facts = (s) => {
    const rows = PRODUCT_FACTS[s]?.en;
    if (!rows) return '';
    return `<section class="facts"><h2>Product facts</h2><dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>`;
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(a.n)} | Governed ${esc(a.t)} Enterprise AI Agent | Colleague AI</title>
<meta name="description" content="${esc(a.desc)}">
<meta name="robots" content="index, follow, max-snippet:-1">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(a.n)} | Governed ${esc(a.t)} Enterprise AI Agent | Colleague AI">
<meta property="og:description" content="${esc(a.desc)}">
<meta property="og:image" content="${BASE}/og-image.png">
<meta property="og:site_name" content="Colleague AI">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#F5F0E8;color:#1D1B1A;line-height:1.65}
main{max-width:760px;margin:0 auto;padding:48px 24px 80px}
.crumb{font-size:13px;margin-bottom:18px}.crumb a{color:#C65D3A;text-decoration:none}
.fact-lang{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 28px;font-size:12.5px;color:#6f6a62}
.fact-lang select{font:500 12.5px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1D1B1A;border:1px solid #d8d2c6;border-radius:999px;padding:6px 10px;background:#fff}
.eyebrow{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;font-size:12.5px;color:#8a857d;letter-spacing:.05em;margin-bottom:10px}
h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:0 0 14px}
.meta{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 30px}
.chip{font-size:12.5px;padding:5px 13px;border:1px solid #d8d2c6;border-radius:999px;background:#fff}
.chip strong{color:#C65D3A}
h2{font-size:15px;font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;letter-spacing:.04em;color:#8a857d;margin:34px 0 8px;text-transform:uppercase}
section p{margin:0}
.facts dl{margin:10px 0 0;border:1px solid #d8d2c6;border-radius:14px;background:#fff;padding:4px 18px}
.facts dl div{padding:12px 0;border-bottom:1px solid #ece6da}.facts dl div:last-child{border-bottom:none}
.facts dt{font-weight:600;font-size:14px;margin:0 0 3px}.facts dd{margin:0;font-size:14.5px;color:#4a4641}
ul{margin:6px 0 0;padding-left:20px}
.cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:44px}
.cta-top{margin:-10px 0 8px}
.btn{display:inline-block;padding:12px 26px;border-radius:999px;text-decoration:none;font-size:14.5px}
.btn-p{background:#1D1B1A;color:#F5F0E8}.btn-s{border:1.5px solid #1D1B1A;color:#1D1B1A}
footer{font-size:12px;color:#8a857d;margin-top:56px;border-top:1px solid #d8d2c6;padding-top:18px}
</style>
</head>
<body>
<main>
<nav class="crumb"><a href="/agents">← Agent Catalogue</a></nav>
<div class="fact-lang">
  <span>This factsheet is available in English. Catalogue language:</span>
  <select id="factsheet-lang" aria-label="Catalogue language">
    <option value="en" selected>English</option>
    <option value="cs">Čeština</option>
    <option value="de">Deutsch</option>
    <option value="fr">Français</option>
    <option value="es">Español</option>
    <option value="it">Italiano</option>
    <option value="pl">Polski</option>
    <option value="pt">Português</option>
  </select>
</div>
<div class="eyebrow">CAI Score™ · ${esc(tier)}</div>
<h1>${esc(a.n)}</h1>
<p>${esc(a.desc)}</p>
<div class="meta">
  <span class="chip">CAI tier <strong>${esc(a.t)}</strong></span>
  <span class="chip">${esc(PUBLIC_LABELS.en[publicStatus(slug)])}</span>
  <span class="chip">${esc(PILLAR[a.p] ?? a.p)}</span>
  <span class="chip">${esc(a.dom)}</span>
</div>
${releaseOf(slug) ? `<div class="cta cta-top"><a class="btn btn-p" href="/demo?agent=${slug}&amp;tier=${esc(a.t)}">Book a demo →</a><a class="btn btn-s" href="/pricing">${price(a.t)} one-time · what is included</a></div>` : ''}
${facts(slug)}
${sec('Where it fits', a.fit)}
${sec('What it improves', a.roi)}
${sec('The number it moves', a.kpi)}
${sec('Risk and compliance posture', a.comp)}
${a.pains?.length ? `<section><h2>The problems it removes</h2><ul>${a.pains.map(p => `<li>${esc(p)}</li>`).join('')}</ul></section>` : ''}
${TIER_DESC[a.t] ? `<section><h2>What the ${esc(a.t)} · ${esc(TIER_DESC[a.t] ? TIER[a.t] : '')} tier means</h2><p>${esc(TIER_DESC[a.t][0])} Human role: ${esc(TIER_DESC[a.t][1])}.</p></section>` : ''}
<section><h2>Deployment &amp; data</h2><p>${esc(DEPLOY)}</p></section>
<section><h2>Availability and certification status</h2><dl class="status">
  <div><dt>Availability</dt><dd>${esc(PUBLIC_LABELS.en[publicStatus(slug)])}${publicStatus(slug) === 'coming-soon' ? ' &mdash; not yet available for purchase. No release date has been announced.' : ''}</dd></div>
  <div><dt>CAI framework classification</dt><dd>Target level ${esc(a.t)} (${esc(TIER[a.t] ?? '')}). A target classification, not an achieved certification.</dd></div>
  <div><dt>Verified CAI Score</dt><dd>${recordFor(slug)?.cai?.verifiedScore != null ? esc(String(recordFor(slug).cai.verifiedScore)) : 'Not yet assessed.'}</dd></div>
  <div><dt>Technical status</dt><dd>${releaseOf(slug)
    ? esc((STATUS_TEXT[releaseOf(slug).status] || 'Released.') + ' Current release ' + releaseOf(slug).version + '.')
    : 'In design. The dossier sets out the governed workflow, its controls and the human role; the installable package is not yet released.'}</dd></div>
  <div><dt>Commercial release</dt><dd>${commercialSaleAllowed(slug) ? 'Authorised.' : 'Not yet authorised.'}</dd></div>
  <div><dt>Continuous Certification</dt><dd>No active coverage; it can start only with a licence purchase.</dd></div>
</dl></section>
${RUNTIME[slug] ? `<section><h2>Microsoft prerequisites and running costs</h2><p>${esc(RUNTIME[slug])}</p></section>` : ''}
<section><h2>What you get</h2><ul>${packagesFor(slug).map((k) => `<li>${esc(PKG_LABEL[k] || k)}</li>`).join('')}<li>Agent dossier (PDF)</li></ul><p>${releaseOf(slug)
  ? 'One-time purchase. You accept the licence terms at checkout, pay through Stripe and download the package from your order page, where your licence agreement confirmation and invoice are kept. Checkout opens once our final legal and tax checks are complete; book a demo and we will tell you when.'
  : 'Today you can review the agent dossier; the installable package is coming soon.'}</p></section>
<section><h2>Price</h2><p>${releaseOf(slug) ? '' : 'Published tier price once a package is released: '}<b>${price(a.t)} one-time</b> for a perpetual licence to this version, plus <b>${cert(a.t)} / month</b> for Continuous Certification &mdash; recommended, and the only route to updated certified releases. ${esc(CERT_NOT_OPEN)}</p>
<p>The version you buy is yours forever. The rules it was built against are not: without an active subscription a newer certified release is a new licence purchase, and you follow the covered scope yourself. With it, the package stays listed as a current Colleague AI Certified Release, you get the updated release when a change inside the covered scope requires one at no further licence fee, and you get a Certificate ID a reviewer can check.</p>
<p style="font-size:13px;color:#5c574f">Colleague AI&rsquo;s own programme &mdash; not third-party accreditation, and it does not certify how you use the agent. <a href="/certified">What it covers</a>.</p></section>
<section><h2>About Colleague AI</h2><p>${esc(ABOUT)}</p></section>
<div class="cta">
  ${commercialSaleAllowed(slug) ? `<a class="btn btn-p" href="/demo?agent=${slug}&amp;tier=${esc(a.t)}">Book a demo →</a>` : `<a class="btn btn-p" href="/demo?agent=${slug}&amp;tier=${esc(a.t)}&amp;intent=interest" data-track="interest_cta" data-agent="${slug}">Register your interest →</a>`}
  ${releaseOf(slug) ? '<a class="btn btn-s" href="/pricing">Pricing and what is included</a>' : `<a class="btn btn-s" href="/demo?agent=${slug}&amp;tier=${esc(a.t)}">Request a demo</a>`}
  <a class="btn btn-s" href="${pdf}" target="_blank" rel="noopener">⤓ Agent dossier (PDF)</a>
</div>
<footer>Runs in your tenant · Customer-controlled business data plane · © Colleague AI 2026</footer>
</main>
<script>try{if(navigator.sendBeacon)navigator.sendBeacon("/api/interest?event=view",new Blob([JSON.stringify({agent:${JSON.stringify(slug)}})],{type:"application/json"}));}catch(e){}</script>
<script>
(function () {
  var select = document.getElementById("factsheet-lang");
  if (!select) return;

  var routes = {
    en: location.pathname,
    cs: "/cs/agenti",
    de: "/de/agenten",
    fr: "/fr/agents",
    es: "/es/agentes",
    it: "/it/agenti",
    pl: "/pl/agenci",
    pt: "/pt/agentes"
  };

  select.addEventListener("change", function () {
    var target = routes[select.value];
    if (!target) return;

    try {
      localStorage.setItem("cai-lang", select.value);
    } catch (e) {}

    if (select.value !== "en") {
      location.assign(target);
    }
  });
})();
</script>
</body>
</html>`;
}

mkdirSync(join(DIST, 'agents'), { recursive: true });
const slugs = [];
for (const a of AGENTS) {
  const slug = slugify(a.n);
  slugs.push(slug);
  writeFileSync(join(DIST, 'agents', slug + '.html'), page(a));
  const PDF_ALIAS2 = {} /* canonical acceptance-test-script-generator.pdf now exists with the corrected
       content; the legacy oat- file stays on disk so old external links keep
       working, but nothing on the site links it any more */;
  if (!existsSync(join(ROOT, 'public/docs/agents', (PDF_ALIAS2[slug] ?? slug) + '.pdf')))
    console.warn('[gen] missing dossier PDF for', slug);
}
// Dossier library: a real, crawlable landing for /docs/agents/ so the catalogue
// drawer's "Download agent dossier (PDF)" resolves to something honest without
// JavaScript (the drawer itself swaps in the agent's own PDF once it opens).
{
  const PDF_ALIAS3 = {} /* canonical acceptance-test-script-generator.pdf now exists with the corrected
       content; the legacy oat- file stays on disk so old external links keep
       working, but nothing on the site links it any more */;
  const byTier = {};
  for (const a of AGENTS) (byTier[a.t] ??= []).push(a);
  const tierName = { L2: 'Draft', L3: 'Operate', L4: 'Decide (supervised)' };
  const sections = Object.keys(byTier).sort().map(t => `<h2>CAI ${t} · ${esc(tierName[t] || t)}</h2><ul>` +
    byTier[t].map(a => { const s = slugify(a.n); return `<li><a href="/docs/agents/${PDF_ALIAS3[s] ?? s}.pdf">${esc(a.n)}</a> <span class="dom">${esc(a.dom || '')}</span> · <a class="fs" href="/agents/${s}">factsheet</a></li>`; }).join('') + '</ul>').join('\n');
  const index = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent dossiers (PDF) | Colleague AI</title><meta name="description" content="One PDF dossier per governed agent package: scope, CAI Score tier, controls and deployment boundary. English only.">
<meta name="robots" content="index, follow"><link rel="canonical" href="${BASE}/docs/agents/"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#F5F0E8;color:#1D1B1A;line-height:1.65}
main{max-width:780px;margin:0 auto;padding:48px 24px 80px}.crumb{font-size:13px;margin-bottom:28px}.crumb a{color:#C65D3A;text-decoration:none}
.eyebrow{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;font-size:11.5px;color:#8a857d;letter-spacing:.05em;margin-bottom:10px}
h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:0 0 14px}h2{font-size:15px;font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;letter-spacing:.04em;color:#8a857d;margin:40px 0 10px;text-transform:uppercase}
p,li{font-size:15px}ul{margin:6px 0 0;padding-left:20px}li{padding:4px 0}a{color:#C65D3A}.dom{color:#8a857d;font-size:13px}.fs{font-size:13px}
.note{font-size:13px;color:#6b665e;background:#fff;border:1px solid #d8d2c6;border-radius:10px;padding:14px 16px;margin-top:14px}
footer{font-size:12px;color:#8a857d;margin-top:56px;border-top:1px solid #d8d2c6;padding-top:18px}</style></head><body><main>
<nav class="crumb"><a href="/agents">← Agent Catalogue</a></nav><div class="eyebrow">Documentation</div><h1>Agent dossiers (PDF)</h1>
<p>One dossier per governed agent package: what it does, its CAI Score tier and human-oversight model, the controls it ships with, and the deployment boundary inside your own tenant.</p>
<p class="note">Dossiers are in English. They describe the package as delivered after approval; indicative prices and commercial terms are on the <a href="/pricing">pricing page</a>. Access to the deployable packages themselves is released after commercial setup — <a href="/demo">request access</a>.</p>
${sections}
<footer>Runs in your tenant · © Colleague AI 2026 · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/imprint">Legal notice</a></footer>
</main></body></html>`;
  mkdirSync(join(DIST, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(DIST, 'docs', 'agents', 'index.html'), index);
  console.log('[gen] dossier index written to dist/docs/agents/index.html');
}
// sitemap: base + agent urls
let sm = readFileSync(join(ROOT, 'public/sitemap.xml'), 'utf8');
const extraUrls = [`${BASE}/demo`, `${BASE}/docs/agents/`];
const entries = extraUrls.map(u =>
  `  <url>\n    <loc>${u}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`).concat(slugs.map(s =>
  `  <url>\n    <loc>${BASE}/agents/${s}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`)).join('\n');
sm = sm.replace('</urlset>', entries + '\n</urlset>');
writeFileSync(join(DIST, 'sitemap.xml'), sm);
console.log(`[gen] ${slugs.length} agent pages + sitemap (${slugs.length + (sm.match(/<loc>/g).length - slugs.length)} urls) written to dist/`);
