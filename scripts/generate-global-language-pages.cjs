const fs = require("fs");
const path = require("path");
const { LOCALES: LOCALE_CONFIG, GLOBAL_PAGES, canonicalPath } = require("./i18n/config.cjs");

const LOCALES = LOCALE_CONFIG.map((locale) => locale.code);
const PAGES = GLOBAL_PAGES;
const SITE = "https://www.colleagueai.ai";
const UI = {
  "en": {
    "language": "Language",
    "choose": "Choose your path",
    "useCase": "I need an AI agent use case",
    "useCaseDesc": "Browse packaged agents, factsheets, CAI Score, and the controlled demo path.",
    "governance": "I need governance assurance",
    "governanceDesc": "Review security, data handling, AI governance, telemetry, and launch gate status.",
    "partner": "I want to partner",
    "partnerDesc": "Register partner interest. Approval and commission eligibility remain agreement-based.",
    "faqKicker": "Questions, answered",
    "faqTitle": "What buyers and AI assistants ask about ColleagueAI.",
    "faqLead": "Direct answers on the CAI Score, deployment, EU AI Act alignment, and how the trust layer differs from an agent management platform."
  },
  "cs": {
    "language": "Jazyk",
    "choose": "Vyberte si cestu",
    "useCase": "Potřebuji use case pro AI agenta",
    "useCaseDesc": "Procházejte balíčky agentů, factsheety, CAI Score a kontrolovanou demo cestu.",
    "governance": "Potřebuji jistotu governance",
    "governanceDesc": "Zkontrolujte bezpečnost, nakládání s daty, AI governance, telemetrii a stav launch gate.",
    "partner": "Chci se stát partnerem",
    "partnerDesc": "Zaregistrujte partnerský zájem. Schválení a nárok na provizi zůstávají závislé na smlouvě.",
    "faqKicker": "Otázky zodpovězeny",
    "faqTitle": "Na co se kupující a AI asistenti ptají ohledně ColleagueAI.",
    "faqLead": "Přímé odpovědi k CAI Score, nasazení, sladění s EU AI Act a rozdílu mezi trust vrstvou a platformou pro správu agentů."
  },
  "de": {
    "language": "Sprache",
    "choose": "Wählen Sie Ihren Weg",
    "useCase": "Ich brauche einen KI-Agenten-Use-Case",
    "useCaseDesc": "Durchsuchen Sie Agentenpakete, Factsheets, CAI Score und den kontrollierten Demo-Pfad.",
    "governance": "Ich brauche Governance-Sicherheit",
    "governanceDesc": "Prüfen Sie Sicherheit, Datenverarbeitung, KI-Governance, Telemetrie und Launch-Gate-Status.",
    "partner": "Ich möchte Partner werden",
    "partnerDesc": "Registrieren Sie Partnerinteresse. Freigabe und Provisionsfähigkeit bleiben vertragsabhängig.",
    "faqKicker": "Fragen, beantwortet",
    "faqTitle": "Was Käufer und KI-Assistenten über ColleagueAI fragen.",
    "faqLead": "Direkte Antworten zu CAI Score, Deployment, EU-AI-Act-Ausrichtung und wie sich die Trust-Schicht von einer Agentenmanagement-Plattform unterscheidet."
  },
  "fr": {
    "language": "Langue",
    "choose": "Choisissez votre parcours",
    "useCase": "J’ai besoin d’un cas d’usage agent IA",
    "useCaseDesc": "Parcourez les agents packagés, les fiches, le CAI Score et le parcours de démo contrôlé.",
    "governance": "J’ai besoin d’assurance gouvernance",
    "governanceDesc": "Examinez sécurité, traitement des données, gouvernance IA, télémétrie et statut du launch gate.",
    "partner": "Je veux devenir partenaire",
    "partnerDesc": "Enregistrez un intérêt partenaire. L’approbation et l’éligibilité aux commissions restent contractuelles.",
    "faqKicker": "Questions, réponses",
    "faqTitle": "Ce que les acheteurs et assistants IA demandent sur ColleagueAI.",
    "faqLead": "Réponses directes sur le CAI Score, le déploiement, l’alignement EU AI Act et la différence entre la couche de confiance et une plateforme de gestion d’agents."
  },
  "es": {
    "language": "Idioma",
    "choose": "Elige tu camino",
    "useCase": "Necesito un caso de uso de agente IA",
    "useCaseDesc": "Explora agentes empaquetados, fichas, CAI Score y el recorrido de demo controlado.",
    "governance": "Necesito garantía de gobernanza",
    "governanceDesc": "Revisa seguridad, manejo de datos, gobernanza de IA, telemetría y estado del launch gate.",
    "partner": "Quiero ser partner",
    "partnerDesc": "Registra interés como partner. La aprobación y elegibilidad de comisión siguen sujetas a acuerdo.",
    "faqKicker": "Preguntas respondidas",
    "faqTitle": "Lo que compradores y asistentes IA preguntan sobre ColleagueAI.",
    "faqLead": "Respuestas directas sobre CAI Score, despliegue, alineación con EU AI Act y cómo la capa de confianza difiere de una plataforma de gestión de agentes."
  },
  "it": {
    "language": "Lingua",
    "choose": "Scegli il tuo percorso",
    "useCase": "Mi serve un caso d’uso per un agente AI",
    "useCaseDesc": "Esplora agenti pacchettizzati, schede, CAI Score e percorso demo controllato.",
    "governance": "Mi serve assurance di governance",
    "governanceDesc": "Rivedi sicurezza, gestione dati, governance AI, telemetria e stato del launch gate.",
    "partner": "Voglio diventare partner",
    "partnerDesc": "Registra interesse partner. Approvazione e idoneità alle commissioni restano basate su accordo.",
    "faqKicker": "Domande, risposte",
    "faqTitle": "Cosa chiedono buyer e assistenti AI su ColleagueAI.",
    "faqLead": "Risposte dirette su CAI Score, deployment, allineamento EU AI Act e differenza tra trust layer e piattaforma di gestione agenti."
  },
  "pl": {
    "language": "Język",
    "choose": "Wybierz swoją ścieżkę",
    "useCase": "Potrzebuję use case dla agenta AI",
    "useCaseDesc": "Przeglądaj pakiety agentów, factsheety, CAI Score i kontrolowaną ścieżkę demo.",
    "governance": "Potrzebuję pewności governance",
    "governanceDesc": "Sprawdź bezpieczeństwo, obsługę danych, governance AI, telemetrię i status launch gate.",
    "partner": "Chcę zostać partnerem",
    "partnerDesc": "Zarejestruj zainteresowanie partnerskie. Akceptacja i prowizje pozostają zależne od umowy.",
    "faqKicker": "Pytania i odpowiedzi",
    "faqTitle": "O co kupujący i asystenci AI pytają w kontekście ColleagueAI.",
    "faqLead": "Bezpośrednie odpowiedzi o CAI Score, wdrożeniu, zgodności kierunkowej z EU AI Act oraz różnicy między warstwą zaufania a platformą zarządzania agentami."
  },
  "pt": {
    "language": "Idioma",
    "choose": "Escolha seu caminho",
    "useCase": "Preciso de um caso de uso de agente IA",
    "useCaseDesc": "Explore agentes empacotados, factsheets, CAI Score e o caminho de demo controlado.",
    "governance": "Preciso de garantia de governança",
    "governanceDesc": "Revise segurança, tratamento de dados, governança de IA, telemetria e status do launch gate.",
    "partner": "Quero ser parceiro",
    "partnerDesc": "Registre interesse como parceiro. Aprovação e elegibilidade de comissão continuam baseadas em contrato.",
    "faqKicker": "Perguntas respondidas",
    "faqTitle": "O que compradores e assistentes de IA perguntam sobre a ColleagueAI.",
    "faqLead": "Respostas diretas sobre CAI Score, implantação, alinhamento ao EU AI Act e como a camada de confiança difere de uma plataforma de gestão de agentes."
  }
};

function exists(file) { return fs.existsSync(file); }
function read(file) { return exists(file) ? fs.readFileSync(file, "utf8") : ""; }
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  console.log("[global-language] wrote", file);
}
function replaceAll(value, from, to) { return value.split(from).join(to); }
function pageUrl(locale, page) { return canonicalPath(locale, page); }

function hreflangBlock(page, currentLocale) {
  const links = ["<!-- cai-global-hreflang:start -->"];
  links.push('<link rel="alternate" hreflang="x-default" href="' + SITE + canonicalPath("en", page) + '" />');
  for (const locale of LOCALES) {
    links.push('<link rel="alternate" hreflang="' + locale + '" href="' + SITE + pageUrl(locale, page) + '" />');
  }
  links.push('<link rel="canonical" href="' + SITE + canonicalPath(currentLocale || "en", page) + '" />');
  links.push("<!-- cai-global-hreflang:end -->");
  return links.join("\n");
}

function removeHreflang(html) {
  return html.replace(/<!-- cai-global-hreflang:start -->[\s\S]*?<!-- cai-global-hreflang:end -->\n?/g, "");
}
function insertHreflang(html, page, currentLocale) {
  html = removeHreflang(html);
  if (!html.includes("</head>")) return html;
  return html.replace("</head>", hreflangBlock(page, currentLocale) + "\n</head>");
}

function localizePathLinks(html, locale) {
  return html.replace(/href="\/(agents|trust|partners|privacy|terms)(#[^"]*)?"/g, (m, page, hash = "") => {
    return 'href="' + canonicalPath(locale, page) + (hash || "") + '"';
  });
}
function setHtmlPage(html, page) {
  if (/<html[^>]*\sdata-cai-page="/i.test(html)) {
    return html.replace(/(<html[^>]*\s)data-cai-page="[^"]*"/i, '$1data-cai-page="' + page + '"');
  }
  return html.replace(/<html/i, '<html data-cai-page="' + page + '"');
}
function setHtmlLang(html, locale) {
  if (/<html[^>]*lang="/i.test(html)) {
    return html.replace(/<html([^>]*)lang="[^"]*"/i, '<html$1lang="' + locale + '"');
  }
  return html.replace(/<html/i, '<html lang="' + locale + '"');
}
function patchAgentLocalizedText(html, locale) {
  const t = UI[locale] || UI.en;
  const replacements = [
    ["Choose your path", t.choose],
    ["I need an AI agent use case", t.useCase],
    ["Browse packaged agents, factsheets, CAI Score, and the controlled demo path.", t.useCaseDesc],
    ["I need governance assurance", t.governance],
    ["Review security, data handling, AI governance, telemetry, and launch gate status.", t.governanceDesc],
    ["I want to partner", t.partner],
    ["Register partner interest. Approval and commission eligibility remain agreement-based.", t.partnerDesc],
    ["Questions, answered", t.faqKicker],
    ["QUESTIONS, ANSWERED", t.faqKicker.toUpperCase()],
    ["What buyers and AI assistants ask about Colleague AI.", t.faqTitle],
    ["What buyers and AI assistants ask about ColleagueAI.", t.faqTitle],
    ["Direct answers on the CAI Score, deployment, EU AI Act alignment, and how the trust layer differs from an agent management platform.", t.faqLead]
  ];
  for (const [from, to] of replacements) html = replaceAll(html, from, to);
  if (locale === "de") {
    const deFixes = [
      ["Znáte každý nástroj AI a každého agenta, který je v organizaci používán?", "Kennen Sie jedes KI-Tool und jeden Agenten, der in Ihrer Organisation genutzt wird?"],
      ["Žádný centrální inventář", "Kein zentrales Inventar"],
      ["Přibližná představa, udržovaná ad hoc", "Ungefähre Übersicht, ad hoc gepflegt"],
      ["U některých, neformálně", "Bei einigen, informell"],
      ["Vývojáři", "Entwickler"],
      ["Analyzuje bezpečnostní", "Analysiert Sicherheits"],
      ["bezpečnostní defekty", "Sicherheitsdefekte"],
      ["závažnosti", "Schweregrad"]
    ];
    for (const [from, to] of deFixes) html = replaceAll(html, from, to);
  }
  return html;
}

function pageSource(page) {
  const root = "public/" + page + ".html";
  if (!exists(root)) throw new Error("Missing root page: " + root);
  return read(root);
}
function writeLocalizedPage(page, locale, baseHtml) {
  let html = baseHtml;
  html = setHtmlLang(html, locale);
  html = setHtmlPage(html, page);
  html = localizePathLinks(html, locale);
  // agents canonical/hreflang are owned by generate-locale-pages.mjs (pretty slugs); only strip any stale block here.
  html = page === "agents" ? removeHreflang(html) : insertHreflang(html, page, locale);
  if (page === "agents") html = patchAgentLocalizedText(html, locale);
  write("public/" + locale + "/" + page + ".html", html);
  write("public/" + locale + "/" + page + "/index.html", html);
  if (exists("dist")) {
    write("dist/" + locale + "/" + page + ".html", html);
    write("dist/" + locale + "/" + page + "/index.html", html);
  }
}
function patchRootPage(page) {
  const file = "public/" + page + ".html";
  if (!exists(file)) return;
  let html = read(file);
  html = setHtmlPage(html, page);
  html = page === "agents" ? removeHreflang(html) : insertHreflang(html, page, null);
  write(file, html);
  if (exists("dist/" + page + ".html")) {
    let dist = read("dist/" + page + ".html");
    dist = page === "agents" ? removeHreflang(dist) : insertHreflang(dist, page, null);
    write("dist/" + page + ".html", dist);
  }
}
function updateSitemap() {
  const files = ["public/sitemap.xml", "dist/sitemap.xml"].filter(exists);
  const routes = [];
  for (const page of PAGES) {
    if (page === "agents") continue; // agents sitemap entries owned by generate-locale-pages.mjs (pretty slugs)
    routes.push("/" + page);
    for (const locale of LOCALES) { if (locale === "en") continue; routes.push(pageUrl(locale, page)); }
  }
  for (const file of files) {
    let xml = read(file);
    if (!xml.includes('xmlns:xhtml=')) {
      xml = xml.replace("<urlset", '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    }
    const existing = new Set([...xml.matchAll(/<loc>https:\/\/www\.colleagueai\.ai([^<]*)<\/loc>/g)].map(m => m[1]));
    let add = "";
    for (const route of routes) {
      if (existing.has(route)) continue;
      add += "  <url>\n";
      add += "    <loc>" + SITE + route + "</loc>\n";
      add += "  </url>\n";
    }
    if (add) xml = xml.replace("</urlset>", add + "</urlset>");
    write(file, xml);
  }
}

for (const page of PAGES) {
  patchRootPage(page);
  const base = pageSource(page);
  for (const locale of LOCALES) {
    if (page === "agents") {
      const localized = "public/" + locale + "/agents.html";
      writeLocalizedPage(page, locale, exists(localized) ? read(localized) : base);
    } else {
      writeLocalizedPage(page, locale, base);
    }
  }
}
updateSitemap();
console.log("Global language pages and same-page language switcher generated.");
