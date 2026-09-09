const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "scripts", "authority");
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(SOURCE, "authority-pages.json"),
    "utf8"
  )
);

const SITE = manifest.site;
const DEFAULT = manifest.defaultLocale;

const labels = {
  en: {
    language: "Language",
    home: "Home",
    insights: "Insights",
    related: "Related resources",
    request: "Request access"
  },
  cs: {
    language: "Jazyk",
    home: "Domů",
    insights: "Analýzy",
    related: "Související zdroje",
    request: "Požádat o přístup"
  },
  de: {
    language: "Sprache",
    home: "Startseite",
    insights: "Einblicke",
    related: "Verwandte Ressourcen",
    request: "Zugang anfragen"
  },
  fr: {
    language: "Langue",
    home: "Accueil",
    insights: "Analyses",
    related: "Ressources associées",
    request: "Demander l’accès"
  },
  es: {
    language: "Idioma",
    home: "Inicio",
    insights: "Análisis",
    related: "Recursos relacionados",
    request: "Solicitar acceso"
  },
  it: {
    language: "Lingua",
    home: "Home",
    insights: "Approfondimenti",
    related: "Risorse correlate",
    request: "Richiedi accesso"
  },
  pl: {
    language: "Język",
    home: "Strona główna",
    insights: "Analizy",
    related: "Powiązane materiały",
    request: "Poproś o dostęp"
  },
  pt: {
    language: "Idioma",
    home: "Início",
    insights: "Insights",
    related: "Recursos relacionados",
    request: "Solicitar acesso"
  }
};

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function pagePath(locale, key) {
  const page = manifest.pages[key];
  const slug = page.slugs[locale];

  if (locale === DEFAULT) {
    return "/insights/" + slug;
  }

  return "/" + locale + "/insights/" + slug;
}

function href(locale, route) {
  const translated = {
    score: {
      en: "/score",
      cs: "/cs/score",
      de: "/de/score",
      fr: "/fr/score",
      es: "/es/score",
      it: "/it/score",
      pl: "/pl/score",
      pt: "/pt/score"
    },
    trust: {
      en: "/trust",
      cs: "/cs/duvera",
      de: "/de/vertrauen",
      fr: "/fr/confiance",
      es: "/es/confianza",
      it: "/it/fiducia",
      pl: "/pl/zaufanie",
      pt: "/pt/confianca"
    },
    certified: {
      en: "/certified",
      cs: "/cs/certifikace",
      de: "/de/zertifizierung",
      fr: "/fr/certification",
      es: "/es/certificacion",
      it: "/it/certificazione",
      pl: "/pl/certyfikacja",
      pt: "/pt/certificacao"
    },
    agents: {
      en: "/agents",
      cs: "/cs/agenti",
      de: "/de/agenten",
      fr: "/fr/agents",
      es: "/es/agentes",
      it: "/it/agenti",
      pl: "/pl/agenci",
      pt: "/pt/agentes"
    }
  };

  return translated[route][locale] || translated[route].en;
}

function alternateBlock(key) {
  const out = [];

  out.push(
    '<link rel="alternate" hreflang="x-default" href="' +
      SITE +
      pagePath("en", key) +
      '">'
  );

  for (const locale of manifest.locales) {
    out.push(
      '<link rel="alternate" hreflang="' +
        locale +
        '" href="' +
        SITE +
        pagePath(locale, key) +
        '">'
    );
  }

  return out.join("\n");
}


const AUTHORITY_FOOTER = {
  en: "ColleagueAI — Governed Enterprise AI Agents",
  cs: "ColleagueAI — Řízené podnikové AI agenty",
  de: "ColleagueAI — Kontrollierte KI-Agenten für Unternehmen",
  fr: "ColleagueAI — Agents IA d’entreprise gouvernés",
  es: "ColleagueAI — Agentes de IA empresariales gobernados",
  it: "ColleagueAI — Agenti AI enterprise governati",
  pl: "ColleagueAI — Nadzorowani agenci AI dla przedsiębiorstw",
  pt: "ColleagueAI — Agentes de IA empresariais governados"
};

function homePath(locale) {
  return locale === "en" ? "/" : "/" + locale + "/";
}

function demoPath(locale) {
  return locale === "en" ? "/demo" : "/" + locale + "/demo";
}


const RELEVANT_AGENTS = {
  "ai-agent-governance-framework": [
    {
      name: "Risk Control Oversight Agent",
      slug: "risk-control-oversight-agent"
    },
    {
      name: "Compliance & Audit Action Tracker",
      slug: "compliance-and-audit-action-tracker"
    },
    {
      name: "Four-Eyes Control Assistant",
      slug: "four-eyes-control-assistant"
    }
  ],

  "human-oversight-ai-agents": [
    {
      name: "Four-Eyes Control Assistant",
      slug: "four-eyes-control-assistant"
    },
    {
      name: "Security Defect Triage Agent",
      slug: "security-defect-triage-agent"
    },
    {
      name: "Contract Obligations Review Agent",
      slug: "contract-obligations-review-agent"
    }
  ],

  "enterprise-ai-agents-microsoft": [
    {
      name: "Power Query Code Generator",
      slug: "power-query-code-generator"
    },
    {
      name: "Service Delivery Manager Copilot",
      slug: "service-delivery-manager-copilot"
    },
    {
      name: "Cyber Security Reporting Agent",
      slug: "cyber-security-reporting-agent"
    }
  ]
};

const RELEVANT_AGENT_LABEL = {
  en: "Relevant agents",
  cs: "Související agenti",
  de: "Relevante Agenten",
  fr: "Agents associés",
  es: "Agentes relacionados",
  it: "Agenti correlati",
  pl: "Powiązani agenci",
  pt: "Agentes relacionados"
};

function relevantAgentPath(locale, slug) {
  return locale === "en"
    ? "/agents/" + slug
    : "/" + locale + "/agents/" + slug;
}

function renderRelevantAgents(locale, key) {
  const agents = RELEVANT_AGENTS[key] || [];

  if (!agents.length) return "";

  const label =
    RELEVANT_AGENT_LABEL[locale] ||
    RELEVANT_AGENT_LABEL.en;

  return `
    <section class="relevant-agents" aria-labelledby="relevant-agents-title">
      <h2 id="relevant-agents-title">${esc(label)}</h2>
      <ul>
        ${agents.map(agent => `
          <li>
            <a href="${esc(relevantAgentPath(locale, agent.slug))}">
              ${esc(agent.name)}
            </a>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function languageOptions(locale, key) {
  const names = {
    en: "English",
    cs: "Čeština",
    de: "Deutsch",
    fr: "Français",
    es: "Español",
    it: "Italiano",
    pl: "Polski",
    pt: "Português"
  };

  return manifest.locales
    .map((code) => {
      const selected = code === locale ? " selected" : "";

      return (
        '<option value="' +
        code +
        '"' +
        selected +
        ">" +
        esc(names[code]) +
        "</option>"
      );
    })
    .join("");
}

function renderBullets(items) {
  if (!items || !items.length) return "";

  return (
    "<ul>" +
    items.map((item) => "<li>" + esc(item) + "</li>").join("") +
    "</ul>"
  );
}

function renderSection(section) {
  return `
<section id="${esc(section.id)}">
  <h2>${esc(section.title)}</h2>
  ${(section.paragraphs || [])
    .map((p) => "<p>" + esc(p) + "</p>")
    .join("\n")}
  ${renderBullets(section.bullets)}
</section>`;
}

function renderFaq(content) {
  const items = content.faq
    .map(
      (item) => `
<details class="faq">
  <summary>${esc(item.q)}</summary>
  <p>${esc(item.a)}</p>
</details>`
    )
    .join("\n");

  return `
<section id="faq">
  <h2>${esc(content.common.faqLabel)}</h2>
  ${items}
</section>`;
}

function renderFramework(frame) {
  return `
<section class="framework" id="lifecycle">
  <h2>${esc(frame.title)}</h2>
  <ol>
    ${frame.steps.map((step) => "<li>" + esc(step) + "</li>").join("")}
  </ol>
</section>`;
}

function schema(key, locale, identity, content) {
  const url = SITE + pagePath(locale, key);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": url + "#article",
        headline: identity.h1,
        description: identity.description,
        mainEntityOfPage: url,
        inLanguage: locale,
        author: {
          "@type": "Organization",
          "@id": SITE + "/#org",
          name: "ColleagueAI"
        },
        publisher: {
          "@type": "Organization",
          "@id": SITE + "/#org",
          name: "ColleagueAI",
          url: SITE
        },
        about: ({
          en: [
            "Enterprise AI agents",
            "AI agent governance",
            "Human oversight",
            "Microsoft Copilot Studio",
            "Enterprise AI governance"
          ],
          cs: [
            "Podnikoví AI agenti",
            "Governance AI agentů",
            "Lidský dohled",
            "Microsoft Copilot Studio",
            "Governance podnikové AI"
          ],
          de: [
            "Enterprise-KI-Agenten",
            "Governance von KI-Agenten",
            "Menschliche Aufsicht",
            "Microsoft Copilot Studio",
            "Enterprise-KI-Governance"
          ],
          fr: [
            "Agents IA d’entreprise",
            "Gouvernance des agents IA",
            "Supervision humaine",
            "Microsoft Copilot Studio",
            "Gouvernance de l’IA d’entreprise"
          ],
          es: [
            "Agentes de IA empresariales",
            "Gobernanza de agentes de IA",
            "Supervisión humana",
            "Microsoft Copilot Studio",
            "Gobernanza de IA empresarial"
          ],
          it: [
            "Agenti AI enterprise",
            "Governance degli agenti AI",
            "Supervisione umana",
            "Microsoft Copilot Studio",
            "Governance AI enterprise"
          ],
          pl: [
            "Agenci AI dla przedsiębiorstw",
            "Governance agentów AI",
            "Nadzór człowieka",
            "Microsoft Copilot Studio",
            "Governance AI w przedsiębiorstwie"
          ],
          pt: [
            "Agentes de IA empresariais",
            "Governança de agentes de IA",
            "Supervisão humana",
            "Microsoft Copilot Studio",
            "Governança de IA empresarial"
          ]
        }[locale] || [
          "Enterprise AI agents",
          "AI agent governance",
          "Human oversight",
          "Microsoft Copilot Studio",
          "Enterprise AI governance"
        ])
      },
      {
        "@type": "FAQPage",
        "@id": url + "#faq",
        mainEntity: content.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a
          }
        }))
      }
    ]
  };
}

function template(key, locale, identity, content, common) {
  const url = SITE + pagePath(locale, key);
  const l = labels[locale] || labels.en;

  const languageSwitchCases = manifest.locales
    .map(
      (code) =>
        `case ${JSON.stringify(code)}: window.location.assign(${JSON.stringify(
          pagePath(code, key)
        )}); break;`
    )
    .join("\n");

  return `<!doctype html>
<html lang="${locale}" data-cai-page="authority-${esc(key)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(identity.title)}</title>
<meta name="description" content="${esc(identity.description)}">
<meta name="robots" content="index, follow, max-snippet:-1">
<link rel="canonical" href="${url}">
${alternateBlock(key)}

<meta property="og:type" content="article">
<meta property="og:site_name" content="ColleagueAI">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(identity.title)}">
<meta property="og:description" content="${esc(identity.description)}">
<meta property="og:image" content="${SITE}/og-image.png">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(identity.title)}">
<meta name="twitter:description" content="${esc(identity.description)}">
<meta name="twitter:image" content="${SITE}/og-image.png">

<link rel="icon" href="/favicon.svg" type="image/svg+xml">

<script type="application/ld+json">${jsonScript(
    schema(key, locale, identity, {
      faq: content.faq
    })
  )}</script>

<style>
:root{
  --bg:#F5F0E8;
  --ink:#1D1B1A;
  --muted:#6B665E;
  --line:#D8D2C6;
  --paper:#FFFDF8;
  --accent:#C65D3A;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;
  background:var(--bg);
  color:var(--ink);
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  line-height:1.68;
}
a{color:var(--accent);text-underline-offset:3px}
.wrap{
  width:min(1120px,calc(100% - 36px));
  margin-inline:auto;
}
.top{
  padding:18px 0;
  border-bottom:1px solid var(--line);
}
.top-inner{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
}
.brand{
  color:var(--ink);
  font-weight:900;
  text-decoration:none;
  letter-spacing:-.03em;
}
.lang{
  border:1px solid var(--line);
  background:#fff;
  color:var(--ink);
  padding:8px 12px;
  border-radius:999px;
}
.hero{
  padding:72px 0 42px;
}
.crumb{
  font-size:13px;
  color:var(--muted);
  margin-bottom:22px;
}
.eyebrow{
  font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
  text-transform:uppercase;
  letter-spacing:.12em;
  font-size:12px;
  color:var(--accent);
  font-weight:800;
}
h1{
  max-width:900px;
  font-size:clamp(42px,7vw,76px);
  line-height:.98;
  letter-spacing:-.055em;
  margin:14px 0 22px;
}
.lead{
  max-width:830px;
  font-size:20px;
  line-height:1.58;
  color:#4E4943;
}
.layout{
  display:grid;
  grid-template-columns:minmax(0,1fr) 280px;
  gap:54px;
  align-items:start;
  padding-bottom:80px;
}
article{
  min-width:0;
}
article>p{
  font-size:17px;
}
section{
  scroll-margin-top:30px;
  margin-top:52px;
}
h2{
  font-size:clamp(26px,4vw,38px);
  line-height:1.08;
  letter-spacing:-.04em;
  margin:0 0 18px;
}
li{margin:8px 0}
.framework{
  background:var(--paper);
  border:1px solid var(--line);
  border-radius:24px;
  padding:30px;
}
.framework ol{
  padding-left:22px;
}
.boundary{
  background:#1D1B1A;
  color:#F5F0E8;
  border-radius:24px;
  padding:28px;
  margin-top:50px;
}
.boundary h2{
  color:#fff;
}
.boundary p{
  color:#E7E0D7;
}
.faq{
  border-top:1px solid var(--line);
  padding:16px 0;
}
.faq:last-child{
  border-bottom:1px solid var(--line);
}
.faq summary{
  cursor:pointer;
  font-weight:800;
  font-size:17px;
}
.side{
  position:sticky;
  top:24px;
  background:rgba(255,255,255,.72);
  border:1px solid var(--line);
  border-radius:22px;
  padding:22px;
}
.side h2{
  font-size:17px;
  margin-bottom:12px;
}
.side a{
  display:block;
  padding:8px 0;
  font-weight:750;
  text-decoration:none;
}

.relevant-agents{
  margin-top:28px;
  padding-top:22px;
  border-top:1px solid var(--line);
}

.relevant-agents h2{
  margin:0 0 12px;
  font-size:1.05rem;
}

.relevant-agents ul{
  margin:0;
  padding-left:20px;
}

.relevant-agents li{
  margin:8px 0;
}

.relevant-agents a{
  font-weight:650;
}

.cta{
  margin-top:24px;
  display:inline-block !important;
  background:var(--ink);
  color:var(--bg) !important;
  padding:11px 18px !important;
  border-radius:999px;
}
footer{
  border-top:1px solid var(--line);
  padding:28px 0 50px;
  color:var(--muted);
  font-size:13px;
}
@media(max-width:820px){
  .layout{grid-template-columns:1fr}
  .side{position:static}
  .hero{padding-top:48px}
}
</style>
</head>

<body>

<header class="top">
  <div class="wrap top-inner">
    <a class="brand" href="${homePath(locale)}">ColleagueAI</a>

    <label>
      <span style="position:absolute;left:-9999px">${esc(l.language)}</span>
      <select
        id="langsel"
        class="lang"
        aria-label="${esc(l.language)}"
      >
        ${languageOptions(locale, key)}
      </select>
    </label>
  </div>
</header>

<main class="wrap">

  <div class="hero">
    <div class="crumb">
      <a href="/">${esc(l.home)}</a>
      &nbsp;/&nbsp;
      ${esc(l.insights)}
    </div>

    <div class="eyebrow">${esc(content.eyebrow)}</div>

    <h1>${esc(identity.h1)}</h1>

    <p class="lead">${esc(content.lead)}</p>
  </div>

  <div class="layout">

    <article>

      ${content.intro.map((p) => "<p>" + esc(p) + "</p>").join("\n")}

      ${content.sections.map(renderSection).join("\n")}

      ${renderFramework(content.framework)}

      <section class="boundary" id="deployment-boundary">
        <h2>${esc(common.boundaryTitle)}</h2>
        <p>${esc(common.boundaryBody)}</p>
      </section>

      ${renderFaq({
        faq: content.faq,
        common
      })}

    </article>

    ${renderRelevantAgents(locale, key)}

    <aside class="side">
      <h2>${esc(common.relatedLabel)}</h2>

      <a href="${href(locale, "score")}">${esc(common.scoreLabel)}</a>
      <a href="${href(locale, "trust")}">${esc(common.trustLabel)}</a>
      <a href="${href(locale, "certified")}">${esc(common.certifiedLabel)}</a>
      <a href="${href(locale, "agents")}">${esc(common.agentsLabel)}</a>

      <a class="cta" href="${demoPath(locale)}">${esc(common.requestLabel)}</a>
    </aside>

  </div>

</main>

<footer>
  <div class="wrap">
    ${esc(AUTHORITY_FOOTER[locale] || AUTHORITY_FOOTER.en)}
  </div>
</footer>

<script>
(() => {
  const selector = document.getElementById("langsel");
  if (!selector) return;

  selector.addEventListener("change", () => {
    switch (selector.value) {
      ${languageSwitchCases}
      default:
        break;
    }
  });
})();
</script>
</body>
</html>`;
}

function normalizeRequestedLocale(value) {
  switch (value) {
    case "en": return "en";
    case "cs": return "cs";
    case "de": return "de";
    case "fr": return "fr";
    case "es": return "es";
    case "it": return "it";
    case "pl": return "pl";
    case "pt": return "pt";
    default:
      throw new Error("Unsupported locale: " + value);
  }
}

function loadContent(locale) {
  const file = path.join(
    SOURCE,
    "content." + locale + ".json"
  );

  let raw;

  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(
        "Missing authority content for locale: " +
          locale +
          " (" +
          file +
          ")"
      );
    }

    throw error;
  }

  return JSON.parse(raw);
}

function validateLocaleContent(locale, data) {
  const failures = [];

  if (data.locale !== locale) {
    failures.push("locale marker mismatch");
  }

  for (const key of Object.keys(manifest.pages)) {
    const page = data.pages && data.pages[key];

    if (!page) {
      failures.push("missing page " + key);
      continue;
    }

    if (!page.lead) failures.push(key + ": missing lead");
    if (!page.intro || page.intro.length < 2)
      failures.push(key + ": insufficient intro");

    if (!page.sections || page.sections.length < 8)
      failures.push(key + ": fewer than 8 sections");

    if (!page.framework || !page.framework.steps)
      failures.push(key + ": missing framework");

    if (!page.faq || page.faq.length < 4)
      failures.push(key + ": fewer than 4 FAQs");
  }

  if (failures.length) {
    throw new Error(
      "Authority content validation failed for " +
        locale +
        ":\n - " +
        failures.join("\n - ")
    );
  }
}

function writePage(baseDir, locale, key, html) {
  const relative = pagePath(locale, key).replace(/^\/+/, "");

  const htmlFile = path.join(baseDir, relative + ".html");
  const indexFile = path.join(baseDir, relative, "index.html");

  fs.mkdirSync(path.dirname(htmlFile), { recursive: true });
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });

  fs.writeFileSync(htmlFile, html, "utf8");
  fs.writeFileSync(indexFile, html, "utf8");

  return [htmlFile, indexFile];
}

function main() {
  const requested = process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--locale="))
    .map((arg) =>
      normalizeRequestedLocale(
        arg.slice("--locale=".length)
      )
    );

  const locales = requested.length
    ? requested
    : manifest.locales;

  let written = 0;

  for (const locale of locales) {
    if (!manifest.locales.includes(locale)) {
      throw new Error("Unsupported locale: " + locale);
    }

    const data = loadContent(locale);
    validateLocaleContent(locale, data);

    for (const [key, page] of Object.entries(manifest.pages)) {
      const identity = page.identity[locale];

      if (!identity) {
        throw new Error(
          "Missing identity for " + key + " / " + locale
        );
      }

      const html = template(
        key,
        locale,
        identity,
        data.pages[key],
        data.common
      );

      for (const target of ["public", "dist"]) {
        if (!fs.existsSync(path.join(ROOT, target))) continue;

        written += writePage(
          path.join(ROOT, target),
          locale,
          key,
          html
        ).length;
      }
    }
  }

  console.log(
    "[authority] generated " +
      locales.length +
      " locale(s), " +
      Object.keys(manifest.pages).length +
      " authority page(s), " +
      written +
      " physical files"
  );
}

main();