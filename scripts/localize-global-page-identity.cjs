const fs = require("fs");
const { SUPPORTED_LOCALE_CODES } = require("./i18n/config.cjs");
const path = require("path");

const LOCALES = SUPPORTED_LOCALE_CODES.filter((locale) => locale !== "en");
const ROOTS = ["public", "dist"];

const IDENTITY = {
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
    trustTitle: "Vertrauenszentrum - Nachweise fuer KI-Governance, Architektur und Sicherheit | Colleague AI",
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
    trustTitle: "Centro di fiducia - evidenze di governance AI, architettura e sicurezza | Colleague AI",
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

const COPY = {
  cs: {
    "Choose your path": "Vyberte si cestu",
    "I need an AI agent use case": "Potrebuji use case pro AI agenta",
    "I need governance assurance": "Potrebuji jistotu governance",
    "I want to partner": "Chci se stat partnerem",
    "Trust Center": "Centrum duvery",
    "Privacy Policy": "Zasady ochrany osobnich udaju",
    "Terms of Service": "Podminky sluzby",
    "Book a call": "Domluvit schuzku",
    "Browse the catalogue": "Prohlednout katalog",
    "Review trust architecture": "Prohlednout architekturu duvery",
    "Security model": "Bezpecnostni model",
    "Data handling": "Nakladani s daty",
    "AI governance": "Sprava AI",
    "Telemetry and privacy": "Telemetrie a soukromi",
    "Launch gate": "Launch gate",
    "Checkout gate": "Kontrola checkoutu",
    "Live tryout": "Vyzkouset zive",
    "Earn": "Vydelavat",
    "FIRST-PARTY INTERACTIVE PROOF": "INTERAKTIVNI DUKAZ PRVNI STRANY",
    "See how a governed agent": "Podivejte se, jak rizeny agent",
    "Partner Pilot Programme": "Partnersky pilotni program",
    "Apply to partner": "Pozadejte o partnerstvi",
    "Bring governed AI to your clients": "Prineste svym klientum rizenou AI",
    "Approved partners can refer": "Schvaleni partneri mohou doporucovat",
    "Approved partners can refer, resell, or help deploy ColleagueAI agent packages. Commercial terms, attribution, and payout process are confirmed during partner onboarding.": "Schvaleni partneri mohou doporucovat, prodavat nebo pomahat nasazovat balicky agentu ColleagueAI. Obchodni podminky, atribuce a vyplatni proces se potvrzuji behem partnerskeho onboardingu.",
    "Register partner interest": "Registrovat partnersky zajem",
    "OF EVERY AGENT SALE YOU REFER": "Z KAZDEHO PRODEJE AGENTA, KTERY DOPORUCITE",
    "Approved partner access after review": "Partnersky pristup po schvaleni",
    "30-day attribution window per visitor": "30denni atribucni okno na navstevnika",
    "Applies to every agent in the catalogue": "Plati pro kazdeho agenta v katalogu",
    "Tracking activated after commercial setup": "Sledovani se aktivuje po obchodnim nastaveni",
    "Payout terms confirmed during onboarding": "Vyplatni podminky se potvrzuji pri onboardingu",
    "HOW IT WORKS": "JAK TO FUNGUJE",
    "Three steps": "Tri kroky",
    "Three steps. Approved partner process.": "Tri kroky. Proces schvaleneho partnera.",
    "Register interest": "Registrovat zajem",
    "Enter your name and email. Your unique partner code is derived cryptographically from your email — deterministic, so you can always regenerate the same link.": "Zadejte jmeno a email. Vas unikatni partnersky kod se kryptograficky odvozuje z emailu - deterministicky, takze stejny odkaz muzete kdykoli znovu vygenerovat.",
    "30 SECONDS": "30 SEKUND",
    "Share it": "Sdilet odkaz",
    "Send the link to clients, embed it in proposals, add it to your website. Anyone who clicks and buys within 30 days is credited to you — automatically, through approved commercial setup.": "Poslete odkaz klientum, vlozte jej do nabidek nebo na web. Kazdy, kdo klikne a nakoupi do 30 dnu, je automaticky prirazen vam pres schvalene obchodni nastaveni.",
    "30-DAY WINDOW": "30DENNI OKNO",
    "When they buy any agent through your link, you earn 20% of the sale. No caps, no tiers that reduce your rate. Every sale is on record. Payouts go monthly.": "Kdyz pres vas odkaz koupi jakehokoli agenta, ziskate 20 % z prodeje. Bez limitu a bez urovni, ktere snizuji sazbu. Kazdy prodej je evidovan. Vyplaty probiha mesicne.",
    "PAID MONTHLY": "VYPLACENO MESICNE"
  },
  de: {
    "Choose your path": "Waehlen Sie Ihren Weg",
    "I need an AI agent use case": "Ich brauche einen KI-Agenten-Use-Case",
    "I need governance assurance": "Ich brauche Governance-Sicherheit",
    "I want to partner": "Ich moechte Partner werden",
    "Trust Center": "Vertrauenszentrum",
    "Privacy Policy": "Datenschutzerklaerung",
    "Terms of Service": "Nutzungsbedingungen",
    "Book a call": "Termin vereinbaren",
    "Browse the catalogue": "Katalog ansehen",
    "Review trust architecture": "Vertrauensarchitektur pruefen",
    "Security model": "Sicherheitsmodell",
    "Data handling": "Datenverarbeitung",
    "AI governance": "KI-Governance",
    "Telemetry and privacy": "Telemetrie und Datenschutz",
    "Launch gate": "Launch-Gate",
    "Checkout gate": "Checkout-Gate",
    "Live tryout": "Live ausprobieren",
    "Earn": "Verdienen",
    "FIRST-PARTY INTERACTIVE PROOF": "INTERAKTIVER FIRST-PARTY-NACHWEIS",
    "See how a governed agent": "Sehen Sie, wie ein gesteuerter Agent",
    "Partner Pilot Programme": "Partner-Pilotprogramm",
    "Apply to partner": "Als Partner bewerben",
    "Bring governed AI to your clients": "Bringen Sie gesteuerte KI zu Ihren Kunden",
    "Approved partners can refer": "Freigegebene Partner koennen empfehlen",
    "Approved partners can refer, resell, or help deploy ColleagueAI agent packages. Commercial terms, attribution, and payout process are confirmed during partner onboarding.": "Freigegebene Partner koennen ColleagueAI-Agentenpakete empfehlen, weiterverkaufen oder bei der Einfuehrung unterstuetzen. Kommerzielle Bedingungen, Attribution und Auszahlungsprozess werden im Partner-Onboarding bestaetigt.",
    "Register partner interest": "Partnerinteresse registrieren",
    "OF EVERY AGENT SALE YOU REFER": "VON JEDEM AGENTENVERKAUF, DEN SIE VERMITTELN",
    "Approved partner access after review": "Partnerzugang nach Pruefung",
    "30-day attribution window per visitor": "30-Tage-Attributionsfenster pro Besucher",
    "Applies to every agent in the catalogue": "Gilt fuer jeden Agenten im Katalog",
    "Tracking activated after commercial setup": "Tracking nach kommerziellem Setup aktiviert",
    "Payout terms confirmed during onboarding": "Auszahlungsbedingungen im Onboarding bestaetigt",
    "HOW IT WORKS": "SO FUNKTIONIERT ES",
    "Three steps": "Drei Schritte",
    "Three steps. Approved partner process.": "Drei Schritte. Freigegebener Partnerprozess.",
    "Register interest": "Interesse registrieren",
    "30 SECONDS": "30 SEKUNDEN",
    "Share it": "Teilen",
    "30-DAY WINDOW": "30-TAGE-FENSTER",
    "When they buy any agent through your link, you earn 20% of the sale. No caps, no tiers that reduce your rate. Every sale is on record. Payouts go monthly.": "Wenn ein Kunde ueber Ihren Link einen Agenten kauft, erhalten Sie 20 % des Verkaufs. Keine Deckelung, keine Stufen, die Ihre Rate reduzieren. Jeder Verkauf wird erfasst. Auszahlungen erfolgen monatlich.",
    "PAID MONTHLY": "MONATLICHE AUSZAHLUNG"
  },
  fr: {
    "Choose your path": "Choisissez votre parcours",
    "I need an AI agent use case": "J'ai besoin d'un cas d'usage d'agent IA",
    "I need governance assurance": "J'ai besoin d'assurance de gouvernance",
    "I want to partner": "Je veux devenir partenaire",
    "Trust Center": "Centre de confiance",
    "Privacy Policy": "Politique de confidentialite",
    "Terms of Service": "Conditions d'utilisation",
    "Book a call": "Planifier un appel",
    "Browse the catalogue": "Parcourir le catalogue",
    "Review trust architecture": "Examiner l'architecture de confiance",
    "Security model": "Modele de securite",
    "Data handling": "Traitement des donnees",
    "AI governance": "Gouvernance IA",
    "Telemetry and privacy": "Telemetrie et confidentialite",
    "Launch gate": "Gate de lancement",
    "Checkout gate": "Gate de paiement",
    "Live tryout": "Essai en direct",
    "Earn": "Gagner",
    "FIRST-PARTY INTERACTIVE PROOF": "PREUVE INTERACTIVE FIRST-PARTY",
    "See how a governed agent": "Voyez comment un agent gouverne",
    "Partner Pilot Programme": "Programme pilote partenaires",
    "Apply to partner": "Demander un partenariat",
    "Bring governed AI to your clients": "Apportez une IA gouvernee a vos clients",
    "Approved partners can refer": "Les partenaires approuves peuvent recommander",
    "Register partner interest": "Enregistrer un interet partenaire",
    "HOW IT WORKS": "COMMENT CELA FONCTIONNE",
    "Three steps": "Trois etapes",
    "Three steps. Approved partner process.": "Trois etapes. Processus partenaire approuve.",
    "Register interest": "Enregistrer l'interet",
    "30 SECONDS": "30 SECONDES",
    "Share it": "Partager",
    "30-DAY WINDOW": "FENETRE DE 30 JOURS",
    "PAID MONTHLY": "PAYE MENSUELLEMENT"
  },
  es: {
    "Choose your path": "Elige tu camino",
    "I need an AI agent use case": "Necesito un caso de uso de agente de IA",
    "I need governance assurance": "Necesito garantia de gobernanza",
    "I want to partner": "Quiero ser partner",
    "Trust Center": "Centro de confianza",
    "Privacy Policy": "Politica de privacidad",
    "Terms of Service": "Terminos de servicio",
    "Book a call": "Reservar llamada",
    "Browse the catalogue": "Ver el catalogo",
    "Review trust architecture": "Revisar arquitectura de confianza",
    "Security model": "Modelo de seguridad",
    "Data handling": "Tratamiento de datos",
    "AI governance": "Gobernanza de IA",
    "Telemetry and privacy": "Telemetria y privacidad",
    "Launch gate": "Gate de lanzamiento",
    "Checkout gate": "Gate de checkout",
    "Live tryout": "Probar en vivo",
    "Earn": "Gana",
    "FIRST-PARTY INTERACTIVE PROOF": "PRUEBA INTERACTIVA FIRST-PARTY",
    "See how a governed agent": "Mira como un agente gobernado",
    "Partner Pilot Programme": "Programa piloto de partners",
    "Apply to partner": "Solicitar ser partner",
    "Bring governed AI to your clients": "Lleva IA gobernada a tus clientes",
    "Approved partners can refer": "Los partners aprobados pueden referir",
    "Approved partners can refer, resell, or help deploy ColleagueAI agent packages. Commercial terms, attribution, and payout process are confirmed during partner onboarding.": "Los partners aprobados pueden referir, revender o ayudar a desplegar paquetes de agentes ColleagueAI. Los terminos comerciales, la atribucion y el proceso de pago se confirman durante el onboarding de partner.",
    "Register partner interest": "Registrar interes de partner",
    "OF EVERY AGENT SALE YOU REFER": "DE CADA VENTA DE AGENTE QUE REFIERAS",
    "Approved partner access after review": "Acceso de partner aprobado tras revision",
    "30-day attribution window per visitor": "Ventana de atribucion de 30 dias por visitante",
    "Applies to every agent in the catalogue": "Aplica a cada agente del catalogo",
    "Tracking activated after commercial setup": "Tracking activado tras configuracion comercial",
    "Payout terms confirmed during onboarding": "Terminos de pago confirmados durante onboarding",
    "HOW IT WORKS": "COMO FUNCIONA",
    "Three steps": "Tres pasos",
    "Three steps. Approved partner process.": "Tres pasos. Proceso de partner aprobado.",
    "Register interest": "Registrar interes",
    "Enter your name and email. Your unique partner code is derived cryptographically from your email — deterministic, so you can always regenerate the same link.": "Introduce tu nombre y email. Tu codigo unico de partner se deriva criptograficamente de tu email, de forma deterministica, para que siempre puedas regenerar el mismo enlace.",
    "30 SECONDS": "30 SEGUNDOS",
    "Share it": "Compartelo",
    "Send the link to clients, embed it in proposals, add it to your website. Anyone who clicks and buys within 30 days is credited to you — automatically, through approved commercial setup.": "Envia el enlace a clientes, incluyelo en propuestas o agregalo a tu web. Quien haga clic y compre dentro de 30 dias se te atribuye automaticamente mediante configuracion comercial aprobada.",
    "30-DAY WINDOW": "VENTANA DE 30 DIAS",
    "When they buy any agent through your link, you earn 20% of the sale. No caps, no tiers that reduce your rate. Every sale is on record. Payouts go monthly.": "Cuando compran cualquier agente a traves de tu enlace, ganas el 20 % de la venta. Sin limites ni niveles que reduzcan tu porcentaje. Cada venta queda registrada. Los pagos son mensuales.",
    "PAID MONTHLY": "PAGO MENSUAL"
  },
  it: {
    "Choose your path": "Scegli il tuo percorso",
    "I need an AI agent use case": "Ho bisogno di un caso d'uso per un agente AI",
    "I need governance assurance": "Ho bisogno di garanzie di governance",
    "I want to partner": "Voglio diventare partner",
    "Trust Center": "Centro di fiducia",
    "Privacy Policy": "Informativa sulla privacy",
    "Terms of Service": "Termini di servizio",
    "Book a call": "Prenota una call",
    "Browse the catalogue": "Sfoglia il catalogo",
    "Review trust architecture": "Rivedi architettura trust",
    "Security model": "Modello di sicurezza",
    "Data handling": "Gestione dei dati",
    "AI governance": "Governance AI",
    "Telemetry and privacy": "Telemetria e privacy",
    "Launch gate": "Gate di lancio",
    "Checkout gate": "Gate di checkout",
    "Live tryout": "Prova live",
    "Earn": "Guadagna",
    "FIRST-PARTY INTERACTIVE PROOF": "PROVA INTERATTIVA FIRST-PARTY",
    "See how a governed agent": "Scopri come un agente governato",
    "Partner Pilot Programme": "Programma pilota partner",
    "Apply to partner": "Candidati come partner",
    "Bring governed AI to your clients": "Porta l'AI governata ai tuoi clienti",
    "Approved partners can refer": "I partner approvati possono referenziare",
    "Register partner interest": "Registra interesse partner",
    "HOW IT WORKS": "COME FUNZIONA",
    "Three steps": "Tre passaggi",
    "Three steps. Approved partner process.": "Tre passaggi. Processo partner approvato.",
    "Register interest": "Registra interesse",
    "30 SECONDS": "30 SECONDI",
    "Share it": "Condividilo",
    "30-DAY WINDOW": "FINESTRA DI 30 GIORNI",
    "PAID MONTHLY": "PAGATO MENSILMENTE"
  },
  pl: {
    "Choose your path": "Wybierz swoja sciezke",
    "I need an AI agent use case": "Potrzebuje przypadku uzycia agenta AI",
    "I need governance assurance": "Potrzebuje pewnosci governance",
    "I want to partner": "Chce zostac partnerem",
    "Trust Center": "Centrum zaufania",
    "Privacy Policy": "Polityka prywatnosci",
    "Terms of Service": "Warunki korzystania z uslugi",
    "Book a call": "Umow rozmowe",
    "Browse the catalogue": "Przejrzyj katalog",
    "Review trust architecture": "Przejrzyj architekture zaufania",
    "Security model": "Model bezpieczenstwa",
    "Data handling": "Obsluga danych",
    "AI governance": "Governance AI",
    "Telemetry and privacy": "Telemetria i prywatnosc",
    "Launch gate": "Gate uruchomienia",
    "Checkout gate": "Gate checkout",
    "Live tryout": "Wyprobuj na zywo",
    "Earn": "Zarabiaj",
    "FIRST-PARTY INTERACTIVE PROOF": "INTERAKTYWNY DOWOD FIRST-PARTY",
    "See how a governed agent": "Zobacz, jak zarzadzany agent",
    "Partner Pilot Programme": "Pilotazowy program partnerski",
    "Apply to partner": "Zglos chec partnerstwa",
    "Bring governed AI to your clients": "Dostarczaj klientom zarzadzana AI",
    "Approved partners can refer": "Zatwierdzeni partnerzy moga polecac",
    "Register partner interest": "Zarejestruj zainteresowanie partnerskie",
    "HOW IT WORKS": "JAK TO DZIALA",
    "Three steps": "Trzy kroki",
    "Three steps. Approved partner process.": "Trzy kroki. Proces zatwierdzonego partnera.",
    "Register interest": "Zarejestruj zainteresowanie",
    "30 SECONDS": "30 SEKUND",
    "Share it": "Udostepnij",
    "30-DAY WINDOW": "OKNO 30 DNI",
    "PAID MONTHLY": "PLATNE MIESIECZNIE"
  },
  pt: {
    "Choose your path": "Escolha o seu caminho",
    "I need an AI agent use case": "Preciso de um caso de uso de agente de IA",
    "I need governance assurance": "Preciso de garantia de governanca",
    "I want to partner": "Quero ser parceiro",
    "Trust Center": "Centro de confianca",
    "Privacy Policy": "Politica de privacidade",
    "Terms of Service": "Termos de servico",
    "Book a call": "Agendar chamada",
    "Browse the catalogue": "Ver catalogo",
    "Review trust architecture": "Revisar arquitetura de confianca",
    "Security model": "Modelo de seguranca",
    "Data handling": "Tratamento de dados",
    "AI governance": "Governanca de IA",
    "Telemetry and privacy": "Telemetria e privacidade",
    "Launch gate": "Gate de lancamento",
    "Checkout gate": "Gate de checkout",
    "Live tryout": "Teste ao vivo",
    "Earn": "Ganhar",
    "FIRST-PARTY INTERACTIVE PROOF": "PROVA INTERATIVA FIRST-PARTY",
    "See how a governed agent": "Veja como um agente governado",
    "Partner Pilot Programme": "Programa piloto de parceiros",
    "Apply to partner": "Candidate-se como parceiro",
    "Bring governed AI to your clients": "Leve IA governada aos seus clientes",
    "Approved partners can refer": "Parceiros aprovados podem indicar",
    "Register partner interest": "Registrar interesse de parceiro",
    "HOW IT WORKS": "COMO FUNCIONA",
    "Three steps": "Tres etapas",
    "Three steps. Approved partner process.": "Tres etapas. Processo de parceiro aprovado.",
    "Register interest": "Registrar interesse",
    "30 SECONDS": "30 SEGUNDOS",
    "Share it": "Compartilhar",
    "30-DAY WINDOW": "JANELA DE 30 DIAS",
    "PAID MONTHLY": "PAGO MENSALMENTE"
  }
};

const MARKETING_ROUTES = new Set(["agents", "partners", "trust"]);
const LEGAL_ROUTES = new Set(["privacy", "terms"]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.isFile() && full.endsWith(".html")) out.push(full);
  }
  return out;
}

function routeFor(file) {
  const parts = file.split(path.sep);
  const localeIndex = parts.findIndex((part) => LOCALES.includes(part));
  if (localeIndex === -1) return "";
  const next = parts[localeIndex + 1] || "";
  return next.replace(/\.html$/i, "");
}

function replaceAll(html, from, to) {
  return html.split(from).join(to);
}

function applyDictionary(html, dict) {
  const entries = Object.entries(dict).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of entries) html = replaceAll(html, from, to);
  return html;
}

function patchIdentity(html, locale, route) {
  const t = IDENTITY[locale];
  if (!t) return html;

  if (route === "trust") {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t.trustTitle}</title>`);
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${t.trustH1}</h1>`);
  }

  if (route === "partners") {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t.partnersTitle}</title>`);
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${t.partnerApply} <span>${t.partnerBring}</span></h1>`);
  }

  if (route === "privacy") {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t.privacy} | Colleague AI</title>`);
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${t.privacy}</h1>`);
  }

  if (route === "terms") {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t.terms} | Colleague AI</title>`);
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${t.terms}</h1>`);
  }

  return html;
}

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;

  for (const locale of LOCALES) {
    const rootDir = path.join(root, locale);
    const dict = COPY[locale] || {};
    const legalSafeDict = Object.fromEntries(
      ["Trust Center", "Privacy Policy", "Terms of Service", "Book a call"].map((key) => [key, dict[key]]).filter(([, value]) => value)
    );

    for (const file of walk(rootDir)) {
      const route = routeFor(file);
      let html = fs.readFileSync(file, "utf8");
      const before = html;

      html = patchIdentity(html, locale, route);

      if (MARKETING_ROUTES.has(route)) {
        html = applyDictionary(html, dict);
      } else if (LEGAL_ROUTES.has(route)) {
        html = applyDictionary(html, legalSafeDict);
      }

      if (html !== before) {
        fs.writeFileSync(file, html);
        console.log(`[sitewide-i18n] patched ${file}`);
      }
    }
  }
}

console.log("Site-wide visible-copy localization applied.");
