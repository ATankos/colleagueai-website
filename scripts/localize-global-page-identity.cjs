const fs = require("fs");
const path = require("path");

const LOCALES = ["cs", "de", "fr", "es", "it", "pl", "pt"];
const ROOTS = ["public", "dist"];

const I18N = {
  cs: {
    trustTitle: "Centrum duvery - dukazy AI governance, architektura a bezpecnost | Colleague AI",
    trustH1: "Dukazy na jednom miste.",
    partnersTitle: "Partnersky pilotni program - partnerstvi pro rizene AI agenty | ColleagueAI",
    partnerApply: "Pozadejte o partnerstvi.",
    partnerBring: "Prineste svym klientum rizenou AI.",
    privacy: "Zasady ochrany osobnich udaju",
    terms: "Podminky sluzby"
  },
  de: {
    trustTitle: "Trust Center - Nachweise fuer KI-Governance, Architektur und Sicherheit | Colleague AI",
    trustH1: "Die Nachweise an einem Ort.",
    partnersTitle: "Partner-Pilotprogramm - Partnerschaften fuer gesteuerte KI-Agenten | ColleagueAI",
    partnerApply: "Als Partner bewerben.",
    partnerBring: "Bringen Sie gesteuerte KI zu Ihren Kunden.",
    privacy: "Datenschutzerklaerung",
    terms: "Nutzungsbedingungen"
  },
  fr: {
    trustTitle: "Centre de confiance - preuves de gouvernance IA, architecture et securite | Colleague AI",
    trustH1: "Les preuves, au meme endroit.",
    partnersTitle: "Programme pilote partenaires - partenariats d'agents IA gouvernes | ColleagueAI",
    partnerApply: "Demander un partenariat.",
    partnerBring: "Apportez une IA gouvernee a vos clients.",
    privacy: "Politique de confidentialite",
    terms: "Conditions d'utilisation"
  },
  es: {
    trustTitle: "Centro de confianza - evidencia de gobernanza de IA, arquitectura y seguridad | Colleague AI",
    trustH1: "La evidencia, en un solo lugar.",
    partnersTitle: "Programa piloto de partners - alianzas para agentes de IA gobernados | ColleagueAI",
    partnerApply: "Solicitar ser partner.",
    partnerBring: "Lleva IA gobernada a tus clientes.",
    privacy: "Politica de privacidad",
    terms: "Terminos de servicio"
  },
  it: {
    trustTitle: "Trust Center - evidenze di governance AI, architettura e sicurezza | Colleague AI",
    trustH1: "Le evidenze, in un unico posto.",
    partnersTitle: "Programma pilota partner - partnership per agenti AI governati | ColleagueAI",
    partnerApply: "Candidati come partner.",
    partnerBring: "Porta l'AI governata ai tuoi clienti.",
    privacy: "Informativa sulla privacy",
    terms: "Termini di servizio"
  },
  pl: {
    trustTitle: "Centrum zaufania - dowody governance AI, architektura i bezpieczenstwo | Colleague AI",
    trustH1: "Dowody w jednym miejscu.",
    partnersTitle: "Pilotazowy program partnerski - partnerstwa dla zarzadzanych agentow AI | ColleagueAI",
    partnerApply: "Zglos chec partnerstwa.",
    partnerBring: "Dostarczaj klientom zarzadzana AI.",
    privacy: "Polityka prywatnosci",
    terms: "Warunki korzystania z uslugi"
  },
  pt: {
    trustTitle: "Centro de confianca - evidencias de governanca de IA, arquitetura e seguranca | Colleague AI",
    trustH1: "As evidencias, em um so lugar.",
    partnersTitle: "Programa piloto de parceiros - parcerias para agentes de IA governados | ColleagueAI",
    partnerApply: "Candidate-se como parceiro.",
    partnerBring: "Leve IA governada aos seus clientes.",
    privacy: "Politica de privacidade",
    terms: "Termos de servico"
  }
};

function filesFor(root, locale, page) {
  return [
    path.join(root, locale, `${page}.html`),
    path.join(root, locale, page, "index.html")
  ];
}

function replaceAll(html, from, to) {
  return html.split(from).join(to);
}

function patchFile(file, locale, page) {
  if (!fs.existsSync(file)) return false;

  const t = I18N[locale];
  let html = fs.readFileSync(file, "utf8");
  const before = html;

  if (page === "trust") {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t.trustTitle}</title>`);
    html = replaceAll(html, "The evidence, in one place.", t.trustH1);
  }

  if (page === "partners") {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t.partnersTitle}</title>`);
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${t.partnerApply}<span>${t.partnerBring}</span></h1>`);
    html = replaceAll(html, "Apply to partner.", t.partnerApply);
    html = replaceAll(html, "Bring governed AI to your clients.", t.partnerBring);
  }

  if (page === "privacy") {
    html = html.replace(/<title>Privacy Policy \| Colleague AI<\/title>/i, `<title>${t.privacy} | Colleague AI</title>`);
    html = replaceAll(html, "Privacy Policy", t.privacy);
  }

  if (page === "terms") {
    html = html.replace(/<title>Terms of Service \| Colleague AI<\/title>/i, `<title>${t.terms} | Colleague AI</title>`);
    html = replaceAll(html, "Terms of Service", t.terms);
  }

  if (html !== before) {
    fs.writeFileSync(file, html);
    console.log(`[global-page-identity] patched ${file}`);
    return true;
  }

  return false;
}

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;

  for (const locale of LOCALES) {
    for (const page of ["trust", "partners", "privacy", "terms"]) {
      for (const file of filesFor(root, locale, page)) {
        patchFile(file, locale, page);
      }
    }
  }
}

console.log("Global page identity localization applied.");
