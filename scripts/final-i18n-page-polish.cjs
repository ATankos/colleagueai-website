const fs = require("fs");
const path = require("path");

const ROOTS = ["public", "dist"];
const LOCALIZED_LOCALES = ["cs", "de", "fr", "es", "it", "pl", "pt"];

const TRUST_GOVERNANCE_COPY = {
  cs: {
    "Governance": "Rizeni a dohled",
    "Governance evidence": "Dukazy pro rizeni a dohled",
    "Governance from day one": "Rizeni a dohled od prvniho dne",
    "Built for governance": "Navrzeno pro rizeni a dohled",
    "Governance-ready": "Pripraveno pro rizeni a dohled",
    "governance review": "kontrolu rizeni a dohledu",
    "governance and legal review": "rizeni, dohled a pravni kontrolu",
    "designed to support governance and legal review": "navrzeno pro podporu rizeni, dohledu a pravni kontroly",
    "designed to support governance/legal review": "navrzeno pro podporu rizeni, dohledu a pravni kontroly"
  },
  de: {
    "Governance": "Governance",
    "Governance evidence": "Governance-Nachweise",
    "Governance from day one": "Governance ab dem ersten Tag",
    "Built for governance": "Fuer Governance entwickelt",
    "Governance-ready": "Governance-faehig",
    "governance review": "Governance-Pruefung",
    "governance and legal review": "Governance- und Rechtspruefung",
    "designed to support governance and legal review": "entwickelt zur Unterstuetzung von Governance- und Rechtspruefungen",
    "designed to support governance/legal review": "entwickelt zur Unterstuetzung von Governance- und Rechtspruefungen"
  },
  fr: {
    "Governance": "Gouvernance",
    "Governance evidence": "Preuves de gouvernance",
    "Governance from day one": "Gouvernance des le premier jour",
    "Built for governance": "Concu pour la gouvernance",
    "Governance-ready": "Pret pour la gouvernance",
    "governance review": "revue de gouvernance",
    "governance and legal review": "revue de gouvernance et juridique",
    "designed to support governance and legal review": "concu pour soutenir la revue de gouvernance et juridique",
    "designed to support governance/legal review": "concu pour soutenir la revue de gouvernance et juridique"
  },
  es: {
    "Governance": "Gobernanza",
    "Governance evidence": "Evidencia de gobernanza",
    "Governance from day one": "Gobernanza desde el primer dia",
    "Built for governance": "Creado para la gobernanza",
    "Governance-ready": "Preparado para gobernanza",
    "governance review": "revision de gobernanza",
    "governance and legal review": "revision de gobernanza y legal",
    "designed to support governance and legal review": "disenado para apoyar la revision de gobernanza y legal",
    "designed to support governance/legal review": "disenado para apoyar la revision de gobernanza y legal"
  },
  it: {
    "Governance": "Governance",
    "Governance evidence": "Evidenze di governance",
    "Governance from day one": "Governance dal primo giorno",
    "Built for governance": "Progettato per la governance",
    "Governance-ready": "Pronto per la governance",
    "governance review": "revisione di governance",
    "governance and legal review": "revisione di governance e legale",
    "designed to support governance and legal review": "progettato per supportare la revisione di governance e legale",
    "designed to support governance/legal review": "progettato per supportare la revisione di governance e legale"
  },
  pl: {
    "Governance": "Nadzor i lad organizacyjny",
    "Governance evidence": "Dowody dla nadzoru",
    "Governance from day one": "Nadzor od pierwszego dnia",
    "Built for governance": "Zaprojektowane pod nadzor",
    "Governance-ready": "Gotowe do nadzoru",
    "governance review": "przeglad nadzoru",
    "governance and legal review": "przeglad nadzoru i prawny",
    "designed to support governance and legal review": "zaprojektowane tak, aby wspierac przeglad nadzoru i prawny",
    "designed to support governance/legal review": "zaprojektowane tak, aby wspierac przeglad nadzoru i prawny"
  },
  pt: {
    "Governance": "Governanca",
    "Governance evidence": "Evidencias de governanca",
    "Governance from day one": "Governanca desde o primeiro dia",
    "Built for governance": "Criado para governanca",
    "Governance-ready": "Pronto para governanca",
    "governance review": "revisao de governanca",
    "governance and legal review": "revisao de governanca e legal",
    "designed to support governance and legal review": "concebido para apoiar a revisao de governanca e legal",
    "designed to support governance/legal review": "concebido para apoiar a revisao de governanca e legal"
  }
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function localeFromFile(file) {
  const normalized = file.replaceAll("\\\\", "/");
  const parts = normalized.split("/");
  for (const locale of LOCALIZED_LOCALES) {
    if (parts.includes(locale)) return locale;
  }
  return "";
}

function isHtml(file) {
  return file.endsWith(".html");
}

function isTrust(file) {
  const normalized = file.replaceAll("\\\\", "/");
  return normalized.endsWith("/trust.html") || normalized.endsWith("/trust/index.html");
}

function replaceAllLiteral(value, from, to) {
  return value.split(from).join(to);
}

function removeGeneratedLanguageSwitcher(html) {
  html = html.replace(/\\n*<style id="cai-global-language-css">[\\s\\S]*?<\\/style>\\s*/g, "\\n");
  html = html.replace(/\\n*<nav id="cai-global-language-switcher"[\\s\\S]*?<\\/nav>\\s*/g, "\\n");
  return html.replace(/\\n{3,}/g, "\\n\\n");
}

function applyTrustGovernanceCopy(html, locale) {
  const dictionary = TRUST_GOVERNANCE_COPY[locale];
  if (!dictionary) return html;

  for (const [from, to] of Object.entries(dictionary)) {
    html = replaceAllLiteral(html, from, to);
  }

  return html;
}

let changed = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (!isHtml(file)) continue;

    const before = fs.readFileSync(file, "utf8");
    let after = before;

    after = removeGeneratedLanguageSwitcher(after);

    const locale = localeFromFile(file);
    if (locale && isTrust(file)) {
      after = applyTrustGovernanceCopy(after, locale);
    }

    after = after.replace(/\\n{3,}/g, "\\n\\n");

    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      changed += 1;
    }
  }
}

console.log("[final-i18n-page-polish] patched", changed, "files");
