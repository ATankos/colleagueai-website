const fs = require("fs");
const path = require("path");

const ROOTS = ["public", "dist"];
const LOCALES = ["en", "cs", "de", "fr", "es", "it", "pl", "pt"];

const TITLES = {
  en: "Enterprise AI insights",
  cs: "Přehledy podnikové AI",
  de: "Enterprise-KI-Einblicke",
  fr: "Analyses sur l’IA d’entreprise",
  es: "Perspectivas sobre IA empresarial",
  it: "Approfondimenti sull’AI enterprise",
  pl: "Wiedza o AI dla przedsiębiorstw",
  pt: "Perspetivas sobre IA empresarial"
};

const INTRO = {
  en: "Explore practical guidance on AI agent governance, human oversight and enterprise AI agents in Microsoft environments.",
  cs: "Prozkoumejte praktické materiály o governance AI agentů, lidském dohledu a podnikových AI agentech v prostředí Microsoft.",
  de: "Entdecken Sie praxisnahe Leitfäden zu KI-Agent-Governance, menschlicher Aufsicht und Enterprise-KI-Agenten in Microsoft-Umgebungen.",
  fr: "Découvrez des ressources pratiques sur la gouvernance des agents IA, la supervision humaine et les agents IA d’entreprise dans les environnements Microsoft.",
  es: "Explore recursos prácticos sobre gobernanza de agentes de IA, supervisión humana y agentes de IA empresariales en entornos Microsoft.",
  it: "Esplora risorse pratiche sulla governance degli agenti AI, la supervisione umana e gli agenti AI enterprise negli ambienti Microsoft.",
  pl: "Poznaj praktyczne materiały o governance agentów AI, nadzorze człowieka i agentach AI dla przedsiębiorstw w środowiskach Microsoft.",
  pt: "Explore recursos práticos sobre governança de agentes de IA, supervisão humana e agentes de IA empresariais em ambientes Microsoft."
};

const LINKS = {
  en: [
    ["/insights/ai-agent-governance-framework", "AI Agent Governance Framework"],
    ["/insights/human-oversight-ai-agents", "Human Oversight for AI Agents"],
    ["/insights/enterprise-ai-agents-microsoft", "Enterprise AI Agents for Microsoft"]
  ],
  cs: [
    ["/cs/insights/ramec-governance-ai-agentu", "Rámec governance AI agentů"],
    ["/cs/insights/lidsky-dohled-ai-agentu", "Lidský dohled nad AI agenty"],
    ["/cs/insights/podnikovi-ai-agenti-microsoft", "Podnikoví AI agenti pro Microsoft"]
  ],
  de: [
    ["/de/insights/governance-framework-fuer-ki-agenten", "Governance-Framework für KI-Agenten"],
    ["/de/insights/menschliche-aufsicht-ki-agenten", "Menschliche Aufsicht für KI-Agenten"],
    ["/de/insights/enterprise-ki-agenten-microsoft", "Enterprise-KI-Agenten für Microsoft"]
  ],
  fr: [
    ["/fr/insights/cadre-gouvernance-agents-ia", "Cadre de gouvernance des agents IA"],
    ["/fr/insights/supervision-humaine-agents-ia", "Supervision humaine des agents IA"],
    ["/fr/insights/agents-ia-entreprise-microsoft", "Agents IA d’entreprise pour Microsoft"]
  ],
  es: [
    ["/es/insights/marco-gobernanza-agentes-ia", "Marco de gobernanza de agentes de IA"],
    ["/es/insights/supervision-humana-agentes-ia", "Supervisión humana de agentes de IA"],
    ["/es/insights/agentes-ia-empresariales-microsoft", "Agentes de IA empresariales para Microsoft"]
  ],
  it: [
    ["/it/insights/framework-governance-agenti-ai", "Framework di governance degli agenti AI"],
    ["/it/insights/supervisione-umana-agenti-ai", "Supervisione umana degli agenti AI"],
    ["/it/insights/agenti-ai-enterprise-microsoft", "Agenti AI enterprise per Microsoft"]
  ],
  pl: [
    ["/pl/insights/ramy-governance-agentow-ai", "Ramy governance agentów AI"],
    ["/pl/insights/nadzor-czlowieka-agenci-ai", "Nadzór człowieka nad agentami AI"],
    ["/pl/insights/agenci-ai-enterprise-microsoft", "Agenci AI dla przedsiębiorstw w Microsoft"]
  ],
  pt: [
    ["/pt/insights/framework-governanca-agentes-ia", "Framework de governança de agentes de IA"],
    ["/pt/insights/supervisao-humana-agentes-ia", "Supervisão humana de agentes de IA"],
    ["/pt/insights/agentes-ia-empresariais-microsoft", "Agentes de IA empresariais para Microsoft"]
  ]
};

const START = "<!-- CAI_AUTHORITY_GRAPH_START -->";
const END = "<!-- CAI_AUTHORITY_GRAPH_END -->";

function render(locale) {
  const anchors = LINKS[locale]
    .map(([href, label]) => `<a href="${href}">${label}</a>`)
    .join("\n");

  return `${START}
<section class="cai-authority-graph" aria-labelledby="cai-authority-title">
  <div class="cai-authority-inner">
    <h2 id="cai-authority-title">${TITLES[locale]}</h2>
    <p>${INTRO[locale]}</p>
    <div class="cai-authority-links">
      ${anchors}
    </div>
  </div>
</section>
<style>
.cai-authority-graph{margin:48px auto 24px;padding:0 24px;max-width:1180px}
.cai-authority-inner{border:1px solid rgba(29,27,26,.14);border-radius:18px;padding:28px;background:#F5F0E8}
.cai-authority-inner h2{margin:0 0 10px;color:#1D1B1A;font-size:clamp(1.45rem,2vw,2rem)}
.cai-authority-inner p{margin:0 0 18px;max-width:820px;color:#4a4643;line-height:1.6}
.cai-authority-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.cai-authority-links a{display:block;border:1px solid rgba(29,27,26,.14);border-radius:12px;padding:14px 16px;background:#fff;color:#1D1B1A;text-decoration:none;font-weight:600}
.cai-authority-links a:hover{border-color:#C65D3A}
@media(max-width:760px){.cai-authority-links{grid-template-columns:1fr}.cai-authority-graph{padding:0 16px}}
</style>
${END}`;
}

function stripExisting(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);

  if (start === -1 && end === -1) {
    return html;
  }

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Malformed authority graph markers.");
  }

  return html.slice(0, start) + html.slice(end + END.length);
}

function inject(html, block) {
  html = stripExisting(html);

  const footerIndex = html.toLowerCase().lastIndexOf("<footer");

  if (footerIndex !== -1) {
    return html.slice(0, footerIndex) +
      block +
      "\n" +
      html.slice(footerIndex);
  }

  const bodyIndex = html.toLowerCase().lastIndexOf("</body>");

  if (bodyIndex !== -1) {
    return html.slice(0, bodyIndex) +
      block +
      "\n" +
      html.slice(bodyIndex);
  }

  throw new Error("No footer or closing body tag.");
}

function localeForFile(relative) {
  const first = relative.replace(/\\/g, "/").split("/")[0];
  return LOCALES.includes(first) ? first : "en";
}

const TARGET_NAMES = new Set([
  "agents",
  "agenti",
  "agentes",
  "agenten",
  "agenci",
  "score",
  "trust",
  "duvera",
  "vertrauen",
  "confiance",
  "confianza",
  "fiducia",
  "zaufanie",
  "confianca",
  "certified",
  "certifikace",
  "zertifizierung",
  "certification",
  "certificacion",
  "certificazione",
  "certyfikacja",
  "certificacao"
]);

function isTarget(relative) {
  const normalized = relative.replace(/\\/g, "/");

  if (!normalized.endsWith(".html")) {
    return false;
  }

  const parts = normalized.split("/");

  let name = parts[parts.length - 1];

  if (name === "index.html" && parts.length >= 2) {
    name = parts[parts.length - 2];
  } else {
    name = name.replace(/\.html$/, "");
  }

  return TARGET_NAMES.has(name);
}

function walk(root, dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(root, full, callback);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    callback(full, path.relative(root, full));
  }
}

let processed = 0;
const processedFiles = [];

for (const root of ROOTS) {
  if (!fs.existsSync(root)) {
    continue;
  }

  walk(root, root, (full, relative) => {
    if (!isTarget(relative)) {
      return;
    }

    const locale = localeForFile(relative);
    const before = fs.readFileSync(full, "utf8");
    const after = inject(before, render(locale));

    fs.writeFileSync(full, after, "utf8");

    processed++;
    processedFiles.push(`${root}/${relative.replace(/\\/g, "/")}`);
  });
}

console.log(`[authority-graph] processed ${processed} target files`);

if (processed === 0) {
  throw new Error("Authority graph injector found zero target files.");
}