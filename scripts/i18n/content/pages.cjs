const { assertLocaleMap } = require("./utils.cjs");

const pages = assertLocaleMap("pages", {
  en: {
    trust: {
      title: "Trust Center | ColleagueAI",
      eyebrow: "Trust Center",
      h1: "The evidence, in one place.",
    },
    partners: {
      title: "Partners | ColleagueAI",
      eyebrow: "Partner Pilot Programme",
      h1: "Apply to partner. Bring governed AI to your clients.",
    },
  },
  cs: {
    trust: {
      title: "Centrum duvery | ColleagueAI",
      eyebrow: "Centrum duvery",
      h1: "Dukazy na jednom miste.",
    },
    partners: {
      title: "Partneri | ColleagueAI",
      eyebrow: "Partnersky pilotni program",
      h1: "Pridejte se jako partner. Prinesete klientum rizene AI agenty.",
    },
  },
  de: {
    trust: {
      title: "Vertrauenszentrum | ColleagueAI",
      eyebrow: "Vertrauenszentrum",
      h1: "Die Nachweise an einem Ort.",
    },
    partners: {
      title: "Partner | ColleagueAI",
      eyebrow: "Partner-Pilotprogramm",
      h1: "Als Partner bewerben. Governed AI zu Ihren Kunden bringen.",
    },
  },
  fr: {
    trust: {
      title: "Centre de confiance | ColleagueAI",
      eyebrow: "Centre de confiance",
      h1: "Les preuves au meme endroit.",
    },
    partners: {
      title: "Partenaires | ColleagueAI",
      eyebrow: "Programme pilote partenaires",
      h1: "Devenir partenaire. Apporter une IA gouvernee a vos clients.",
    },
  },
  es: {
    trust: {
      title: "Centro de confianza | ColleagueAI",
      eyebrow: "Centro de confianza",
      h1: "Las evidencias en un solo lugar.",
    },
    partners: {
      title: "Partners | ColleagueAI",
      eyebrow: "Programa piloto de partners",
      h1: "Solicita ser partner. Lleva IA gobernada a tus clientes.",
    },
  },
  it: {
    trust: {
      title: "Centro fiducia | ColleagueAI",
      eyebrow: "Centro fiducia",
      h1: "Le evidenze in un unico posto.",
    },
    partners: {
      title: "Partner | ColleagueAI",
      eyebrow: "Programma pilota partner",
      h1: "Candidati come partner. Porta AI governata ai tuoi clienti.",
    },
  },
  pl: {
    trust: {
      title: "Centrum zaufania | ColleagueAI",
      eyebrow: "Centrum zaufania",
      h1: "Dowody w jednym miejscu.",
    },
    partners: {
      title: "Partnerzy | ColleagueAI",
      eyebrow: "Program pilotazowy dla partnerow",
      h1: "Zglos sie jako partner. Dostarczaj klientom nadzorowana AI.",
    },
  },
  pt: {
    trust: {
      title: "Centro de confianca | ColleagueAI",
      eyebrow: "Centro de confianca",
      h1: "As evidencias em um so lugar.",
    },
    partners: {
      title: "Parceiros | ColleagueAI",
      eyebrow: "Programa piloto de parceiros",
      h1: "Candidate-se como parceiro. Leve IA governada aos seus clientes.",
    },
  },
});

module.exports = {
  pages,
};
