const fs = require("fs");
const path = require("path");

const ROOTS = ["public", "dist"];
const LOCALIZED_LOCALES = ["cs", "de", "fr", "es", "it", "pl", "pt"];

const TRUST_GOVERNANCE_COPY = {
  cs: {
    "Governance": "Řízení a dohled",
    "Governance evidence": "Důkazy pro řízení a dohled",
    "Governance from day one": "Řízení a dohled od prvního dne",
    "Built for governance": "Navrženo pro řízení a dohled",
    "Governance-ready": "Připraveno pro řízení a dohled",
    "governance review": "kontrolu řízení a dohledu",
    "governance and legal review": "řízení, dohled a právní kontrolu",
    "designed to support governance and legal review": "navrženo pro podporu řízení, dohledu a právní kontroly",
    "designed to support governance/legal review": "navrženo pro podporu řízení, dohledu a právní kontroly"
  },
  de: {
    "Governance": "Governance",
    "Governance evidence": "Governance-Nachweise",
    "Governance from day one": "Governance ab dem ersten Tag",
    "Built for governance": "Für Governance entwickelt",
    "Governance-ready": "Governance-fähig",
    "governance review": "Governance-Prüfung",
    "governance and legal review": "Governance- und Rechtsprüfung",
    "designed to support governance and legal review": "entwickelt zur Unterstützung von Governance- und Rechtsprüfungen",
    "designed to support governance/legal review": "entwickelt zur Unterstützung von Governance- und Rechtsprüfungen"
  },
  fr: {
    "Governance": "Gouvernance",
    "Governance evidence": "Preuves de gouvernance",
    "Governance from day one": "Gouvernance dès le premier jour",
    "Built for governance": "Conçu pour la gouvernance",
    "Governance-ready": "Prêt pour la gouvernance",
    "governance review": "revue de gouvernance",
    "governance and legal review": "revue de gouvernance et juridique",
    "designed to support governance and legal review": "conçu pour soutenir la revue de gouvernance et juridique",
    "designed to support governance/legal review": "conçu pour soutenir la revue de gouvernance et juridique"
  },
  es: {
    "Governance": "Gobernanza",
    "Governance evidence": "Evidencia de gobernanza",
    "Governance from day one": "Gobernanza desde el primer día",
    "Built for governance": "Creado para la gobernanza",
    "Governance-ready": "Preparado para gobernanza",
    "governance review": "revisión de gobernanza",
    "governance and legal review": "revisión de gobernanza y legal",
    "designed to support governance and legal review": "diseñado para apoyar la revisión de gobernanza y legal",
    "designed to support governance/legal review": "diseñado para apoyar la revisión de gobernanza y legal"
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
    "Governance": "Nadzór i ład organizacyjny",
    "Governance evidence": "Dowody dla nadzoru",
    "Governance from day one": "Nadzór od pierwszego dnia",
    "Built for governance": "Zaprojektowane pod nadzór",
    "Governance-ready": "Gotowe do nadzoru",
    "governance review": "przegląd nadzoru",
    "governance and legal review": "przegląd nadzoru i prawny",
    "designed to support governance and legal review": "zaprojektowane tak, aby wspierać przegląd nadzoru i prawny",
    "designed to support governance/legal review": "zaprojektowane tak, aby wspierać przegląd nadzoru i prawny"
  },
  pt: {
    "Governance": "Governança",
    "Governance evidence": "Evidências de governança",
    "Governance from day one": "Governança desde o primeiro dia",
    "Built for governance": "Criado para governança",
    "Governance-ready": "Pronto para governança",
    "governance review": "revisão de governança",
    "governance and legal review": "revisão de governança e legal",
    "designed to support governance and legal review": "concebido para apoiar a revisão de governança e legal",
    "designed to support governance/legal review": "concebido para apoiar a revisão de governança e legal"
  }
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function isHtml(file) {
  return file.endsWith(".html");
}

function isTrust(file) {
  const normalized = file.replaceAll("\\", "/");
  return normalized.endsWith("/trust.html") || normalized.endsWith("/trust/index.html");
}

function localeFromFile(file) {
  const normalized = file.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return LOCALIZED_LOCALES.find((locale) => parts.includes(locale)) || "";
}

function replaceAllLiteral(value, from, to) {
  return value.split(from).join(to);
}

function removeGeneratedLanguageSwitcher(html) {
  html = html.replace(/\n*<style id="cai-global-language-css">[\s\S]*?<\/style>\s*/g, "\n");
  html = html.replace(/\n*<nav id="cai-global-language-switcher"[\s\S]*?<\/nav>\s*/g, "\n");
  return html.replace(/\n{3,}/g, "\n\n");
}

const FINAL_LOCALE_FIXES = {
  cs: {
    "v Centrum důvěry": "v Centru důvěry",
    "dodavatelů Správa AI": "dodavatelů nástrojů pro správu AI"
  }
};

function applyFinalLocaleFixes(html, locale) {
  const dictionary = FINAL_LOCALE_FIXES[locale];
  if (!dictionary) return html;
  for (const [from, to] of Object.entries(dictionary)) {
    html = replaceAllLiteral(html, from, to);
  }
  return html;
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
    if (locale) {
      after = applyFinalLocaleFixes(after, locale);
    }

    after = after.replace(/\n{3,}/g, "\n\n");

    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      changed += 1;
    }
  }
}

console.log("[final-i18n-page-polish] patched", changed, "files");
