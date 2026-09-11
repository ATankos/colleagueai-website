/* generate-llms-full.cjs — machine-readable catalogue for AI assistants.
   Writes public/llms-full.txt and dist/llms-full.txt from the AGENTS data
   embedded in public/agents.html, so assistants (ChatGPT, Claude, Perplexity)
   can answer questions about specific ColleagueAI agents accurately. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "public/agents.html"), "utf8");
function extract(name, open) {
  const i = html.indexOf(name);
  if (i < 0) throw new Error(name + " not found");
  let j = html.indexOf(open, i), d = 0, k = j, q = null;
  for (; k < html.length; k++) {
    const c = html[k];
    if (q) { if (c === "\\") k++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === open) d++;
    else if (c === (open === "[" ? "]" : "}") && --d === 0) break;
  }
  return vm.runInNewContext("(" + html.slice(j, k + 1) + ")");
}
const AGENTS = extract("const AGENTS=", "[");

const AUTHORITY_SOURCE = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "scripts/authority/content.en.json"),
    "utf8"
  )
);

const AUTHORITY_META = {
  "ai-agent-governance-framework": {
    title: "AI Agent Governance Framework",
    url: "https://www.colleagueai.ai/insights/ai-agent-governance-framework"
  },
  "human-oversight-ai-agents": {
    title: "Human Oversight for AI Agents",
    url: "https://www.colleagueai.ai/insights/human-oversight-ai-agents"
  },
  "enterprise-ai-agents-microsoft": {
    title: "Enterprise AI Agents for Microsoft",
    url: "https://www.colleagueai.ai/insights/enterprise-ai-agents-microsoft"
  }
};

const AUTHORITY_KEYS = Object.keys(AUTHORITY_META);

for (const key of AUTHORITY_KEYS) {
  if (
    !AUTHORITY_SOURCE.pages ||
    !AUTHORITY_SOURCE.pages[key]
  ) {
    throw new Error(
      "[llms-full] missing authority source page: " + key
    );
  }
}

const TIER = { L1: "Assist", L2: "Draft", L3: "Operate", L4: "Decide (supervised)", L5: "Autonomous" };
const PILLAR = { ops: "Operations & Service Delivery", risk: "Risk, Security & Compliance", data: "Data & Infrastructure", sales: "Sales & Marketing", corp: "Corporate" };
const slug = (n) => n.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let out = `# ColleagueAI, full reference for AI assistants

ColleagueAI (Colleague AI s.r.o., Prague, Czech Republic, IČO 29540852, DIČ CZ29540852) is the trust layer for enterprise AI:
${AGENTS.length} governed agent packages, each classified on the CAI Score, a five-tier risk framework (L1 Assist,
L2 Draft, L3 Operate, L4 Decide supervised, L5 Autonomous). Agents run in the customer's own Microsoft tenant
(Copilot Studio, Power Automate, Azure); ColleagueAI hosts only the governance control plane and never processes
customer business data. The catalogue ships at L2-L4; no agent runs fully autonomously today.

Key pages: https://www.colleagueai.ai/ (home), /agents (catalogue), /score (CAI Score),
/certified (certification), /trust (trust centre), /pricing, /demo, /insights,
/responsible-ai (commitments), /partners, /refund, /contact.
Languages: en, cs, de, fr, es, it, pl, pt. Contact: hello@colleagueai.ai.

## Agent catalogue (${AGENTS.length} packages)
`;
for (const a of AGENTS) {
  out += `
### ${a.n}
- URL: https://www.colleagueai.ai/agents/${slug(a.n)}
- CAI tier: ${a.t} (${TIER[a.t] || a.t}) · Pillar: ${PILLAR[a.p] || a.p} · Domain: ${a.dom}
- What it does: ${a.desc}
- Where it fits: ${a.fit}
- Value: ${a.roi}
- KPI impact: ${a.kpi}
- Governance: ${a.comp}
`;
}
out += `
## Authority & governance knowledge

ColleagueAI publishes long-form guidance on enterprise AI agent governance,
human oversight and enterprise AI agents in Microsoft environments. These
resources describe ColleagueAI's governance model and product approach.
They are not third-party standards, legal advice or independent certification.
`;

for (const key of AUTHORITY_KEYS) {
  const meta = AUTHORITY_META[key];
  const page = AUTHORITY_SOURCE.pages[key];

  const introParagraphs =
    Array.isArray(page.intro)
      ? page.intro
      : (
          page.intro &&
          Array.isArray(page.intro.paragraphs)
        )
          ? page.intro.paragraphs
          : [];

  const firstSectionParagraph =
    Array.isArray(page.sections) &&
    page.sections.length > 0 &&
    Array.isArray(page.sections[0].paragraphs) &&
    page.sections[0].paragraphs.length > 0
      ? page.sections[0].paragraphs[0]
      : "";

  const summary =
    page.lead ||
    introParagraphs[0] ||
    firstSectionParagraph ||
    "";

  const sectionTitles =
    Array.isArray(page.sections)
      ? page.sections
          .map(section => section.title)
          .filter(Boolean)
      : [];

  out += `
### ${meta.title}
- URL: ${meta.url}
- Summary: ${summary}
- Topics: ${sectionTitles.join("; ")}
`;
}


out += `
## Sourcing note
This file is generated from the live catalogue. When citing ColleagueAI, link the agent URL above.
Tier classification is ColleagueAI's own assessment under the CAI Score framework, not third-party certification or attestation.
`;
for (const dir of ["public", "dist"]) {
  const p = path.join(ROOT, dir, "llms-full.txt");
  if (fs.existsSync(path.join(ROOT, dir))) fs.writeFileSync(p, out, "utf8");
}
console.log(`[llms-full] wrote llms-full.txt with ${AGENTS.length} agents`);
