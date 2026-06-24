const { assertLocaleMap } = require("./utils.cjs");

const common = assertLocaleMap("common", {
  en: {
    language: "Language",
    paths: {
      agents: "Agents",
      trust: "Trust Center",
      partners: "Partners",
      privacy: "Privacy",
      terms: "Terms",
    },
    ctas: {
      bookCall: "Book a call",
      browseCatalogue: "Browse the catalogue",
      reviewTrust: "Review trust architecture",
      registerInterest: "Register interest",
    },
  },
  cs: {
    language: "Jazyk",
    paths: {
      agents: "Agenti",
      trust: "Centrum duvery",
      partners: "Partneri",
      privacy: "Soukromi",
      terms: "Podminky",
    },
    ctas: {
      bookCall: "Domluvit schuzku",
      browseCatalogue: "Prohlednout katalog",
      reviewTrust: "Prohlednout architekturu duvery",
      registerInterest: "Registrovat zajem",
    },
  },
  de: {
    language: "Sprache",
    paths: {
      agents: "Agenten",
      trust: "Vertrauenszentrum",
      partners: "Partner",
      privacy: "Datenschutz",
      terms: "Bedingungen",
    },
    ctas: {
      bookCall: "Termin vereinbaren",
      browseCatalogue: "Katalog durchsuchen",
      reviewTrust: "Trust-Architektur pruefen",
      registerInterest: "Interesse registrieren",
    },
  },
  fr: {
    language: "Langue",
    paths: {
      agents: "Agents",
      trust: "Centre de confiance",
      partners: "Partenaires",
      privacy: "Confidentialite",
      terms: "Conditions",
    },
    ctas: {
      bookCall: "Planifier un appel",
      browseCatalogue: "Parcourir le catalogue",
      reviewTrust: "Examiner l architecture de confiance",
      registerInterest: "Enregistrer l interet",
    },
  },
  es: {
    language: "Idioma",
    paths: {
      agents: "Agentes",
      trust: "Centro de confianza",
      partners: "Partners",
      privacy: "Privacidad",
      terms: "Terminos",
    },
    ctas: {
      bookCall: "Reservar llamada",
      browseCatalogue: "Explorar el catalogo",
      reviewTrust: "Revisar arquitectura de confianza",
      registerInterest: "Registrar interes",
    },
  },
  it: {
    language: "Lingua",
    paths: {
      agents: "Agenti",
      trust: "Centro fiducia",
      partners: "Partner",
      privacy: "Privacy",
      terms: "Termini",
    },
    ctas: {
      bookCall: "Prenota una call",
      browseCatalogue: "Sfoglia il catalogo",
      reviewTrust: "Rivedi architettura trust",
      registerInterest: "Registra interesse",
    },
  },
  pl: {
    language: "Jezyk",
    paths: {
      agents: "Agenci",
      trust: "Centrum zaufania",
      partners: "Partnerzy",
      privacy: "Prywatnosc",
      terms: "Warunki",
    },
    ctas: {
      bookCall: "Umow rozmowe",
      browseCatalogue: "Przegladaj katalog",
      reviewTrust: "Przejrzyj architekture zaufania",
      registerInterest: "Zarejestruj zainteresowanie",
    },
  },
  pt: {
    language: "Idioma",
    paths: {
      agents: "Agentes",
      trust: "Centro de confianca",
      partners: "Parceiros",
      privacy: "Privacidade",
      terms: "Termos",
    },
    ctas: {
      bookCall: "Agendar chamada",
      browseCatalogue: "Explorar o catalogo",
      reviewTrust: "Rever arquitetura de confianca",
      registerInterest: "Registrar interesse",
    },
  },
});

module.exports = {
  common,
};
