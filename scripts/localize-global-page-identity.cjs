const fs = require("fs");
const { SUPPORTED_LOCALE_CODES } = require("./i18n/config.cjs");
const path = require("path");

const LOCALES = SUPPORTED_LOCALE_CODES.filter((locale) => locale !== "en");
const ROOTS = ["public", "dist"];

const IDENTITY = {
  cs: {
    trustTitle: "Důvěra, governance a bezpečnost | ColleagueAI",
    trustH1: "Důkazy na jednom místě.",
    partnersTitle: "Partnerský program | ColleagueAI",
    partnerApply: "Požádejte o partnerství.",
    partnerBring: "Přineste svým klientům řízenou AI.",
    privacy: "Zásady ochrany osobních údajů",
    terms: "Podmínky služby"
  },
  de: {
    trustTitle: "Vertrauen, Governance und Sicherheit | ColleagueAI",
    trustH1: "Die Nachweise an einem Ort.",
    partnersTitle: "Partnerprogramm | ColleagueAI",
    partnerApply: "Als Partner bewerben.",
    partnerBring: "Bringen Sie gesteuerte KI zu Ihren Kunden.",
    privacy: "Datenschutzerklärung",
    terms: "Nutzungsbedingungen"
  },
  fr: {
    trustTitle: "Confiance, gouvernance et sécurité | ColleagueAI",
    trustH1: "Les preuves, au même endroit.",
    partnersTitle: "Programme partenaires | ColleagueAI",
    partnerApply: "Demander un partenariat.",
    partnerBring: "Apportez une IA gouvernée à vos clients.",
    privacy: "Politique de confidentialité",
    terms: "Conditions d'utilisation"
  },
  es: {
    trustTitle: "Confianza, gobernanza y seguridad | ColleagueAI",
    trustH1: "La evidencia, en un solo lugar.",
    partnersTitle: "Programa de partners | ColleagueAI",
    partnerApply: "Solicitar ser partner.",
    partnerBring: "Lleva IA gobernada a tus clientes.",
    privacy: "Política de privacidad",
    terms: "Términos de servicio"
  },
  it: {
    trustTitle: "Fiducia, governance e sicurezza | ColleagueAI",
    trustH1: "Le evidenze, in un unico posto.",
    partnersTitle: "Programma partner | ColleagueAI",
    partnerApply: "Candidati come partner.",
    partnerBring: "Porta l'AI governata ai tuoi clienti.",
    privacy: "Informativa sulla privacy",
    terms: "Termini di servizio"
  },
  pl: {
    trustTitle: "Zaufanie, governance i bezpieczeństwo | ColleagueAI",
    trustH1: "Dowody w jednym miejscu.",
    partnersTitle: "Program partnerski | ColleagueAI",
    partnerApply: "Zglos chec partnerstwa.",
    partnerBring: "Dostarczaj klientom zarzadzana AI.",
    privacy: "Polityka prywatności",
    terms: "Warunki korzystania z usługi"
  },
  pt: {
    trustTitle: "Confiança, governança e segurança | ColleagueAI",
    trustH1: "As evidencias, em um so lugar.",
    partnersTitle: "Programa de parceiros | ColleagueAI",
    partnerApply: "Candidate-se como parceiro.",
    partnerBring: "Leve IA governada aos seus clientes.",
    privacy: "Política de privacidade",
    terms: "Termos de serviço"
  }
};

const COPY = {
  cs: {
    "Choose your path": "Vyberte si cestu",
    "I need an AI agent use case": "Potřebuji use case pro AI agenta",
    "I need governance assurance": "Potřebuji jistotu governance",
    "I want to partner": "Chci se stát partnerem",
    "Trust Center": "Centrum důvěry",
    "Privacy Policy": "Zásady ochrany osobních údajů",
    "Terms of Service": "Podmínky služby",
    "Book a call": "Domluvit schůzku",
    "Browse the catalogue": "Prohlédnout katalog",
    "Review trust architecture": "Prohlédnout architekturu důvěry",
    "Security model": "Bezpečnostní model",
    "Data handling": "Nakládání s daty",
    "AI governance": "Správa AI",
    "Telemetry and privacy": "Telemetrie a soukromí",
    "Launch gate": "Launch gate",
    "Checkout gate": "Kontrola checkoutu",
    "Live tryout": "Vyzkoušet živě",
    "Earn": "Vydělávat",
    "FIRST-PARTY INTERACTIVE PROOF": "INTERAKTIVNÍ DŮKAZ PRVNÍ STRANY",
    "See how a governed agent": "Podívejte se, jak řízený agent",
    "Partner Pilot Programme": "Partnerský pilotní program",
    "Apply to partner": "Požádejte o partnerství",
    "Bring governed AI to your clients": "Prineste svym klientum rizenou AI",
    "Approved partners can refer": "Schválení partneři mohou doporučovat",
    "Approved partners can refer, resell, or help deploy ColleagueAI agent packages. Commercial terms, attribution, and payout process are confirmed during partner onboarding.": "Schválení partneři mohou doporučovat, prodávat nebo pomáhat nasazovat balíčky agentů ColleagueAI. Obchodní podmínky, atribuce a výplatní proces se potvrzují během partnerského onboardingu.",
    "Register partner interest": "Registrovat partnerský zájem",
    "OF EVERY AGENT SALE YOU REFER": "Z KAŽDÉHO PRODEJE AGENTA, KTERÝ DOPORUČÍTE",
    "Approved partner access after review": "Partnerský přístup po schválení",
    "30-day attribution window per visitor": "30denní atribuční okno na návštěvníka",
    "Applies to every agent in the catalogue": "Platí pro každého agenta v katalogu",
    "Tracking activated after commercial setup": "Sledování se aktivuje po obchodním nastavení",
    "Payout terms confirmed during onboarding": "Výplatní podmínky se potvrzují při onboardingu",
    "HOW IT WORKS": "JAK TO FUNGUJE",
    "Three steps": "Tři kroky",
    "Three steps. Approved partner process.": "Tři kroky. Proces schváleného partnera.",
    "Register interest": "Registrovat zájem",
    "Enter your name and email. Your unique partner code is derived cryptographically from your email, deterministic, so you can always regenerate the same link.": "Zadejte jméno a e-mail. Váš unikátní partnerský kód se kryptograficky odvozuje z e-mailu, deterministicky, takže stejný odkaz můžete kdykoli znovu vygenerovat.",
    "30 SECONDS": "30 SEKUND",
    "Share it": "Sdílet odkaz",
    "Send the link to clients, embed it in proposals, add it to your website. Anyone who clicks and buys within 30 days is credited to you, automatically, through approved commercial setup.": "Pošlete odkaz klientům, vložte jej do nabídek nebo na web. Každý, kdo klikne a nakoupí do 30 dnů, je automaticky přiřazen vám přes schválené obchodní nastavení.",
    "30-DAY WINDOW": "30DENNÍ OKNO",
    "When they buy any agent through your link, you earn 20% of the sale. No caps, no tiers that reduce your rate. Every sale is on record. Payouts go monthly.": "Když přes váš odkaz koupí jakéhokoli agenta, získáte 20 % z prodeje. Bez limitů a bez úrovní, které snižují sazbu. Každý prodej je evidován. Výplaty probíhají měsíčně.",
    "PAID MONTHLY": "VYPLÁCENO MĚSÍČNĚ"
  },
  de: {
    "Choose your path": "Wählen Sie Ihren Weg",
    "I need an AI agent use case": "Ich brauche einen KI-Agenten-Use-Case",
    "I need governance assurance": "Ich brauche Governance-Sicherheit",
    "I want to partner": "Ich möchte Partner werden",
    "Trust Center": "Vertrauenszentrum",
    "Privacy Policy": "Datenschutzerklärung",
    "Terms of Service": "Nutzungsbedingungen",
    "Book a call": "Termin vereinbaren",
    "Browse the catalogue": "Katalog ansehen",
    "Review trust architecture": "Vertrauensarchitektur prüfen",
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
    "Approved partners can refer": "Freigegebene Partner können empfehlen",
    "Approved partners can refer, resell, or help deploy ColleagueAI agent packages. Commercial terms, attribution, and payout process are confirmed during partner onboarding.": "Freigegebene Partner können ColleagueAI-Agentenpakete empfehlen, weiterverkaufen oder bei der Einführung unterstützen. Kommerzielle Bedingungen, Attribution und Auszahlungsprozess werden im Partner-Onboarding bestätigt.",
    "Register partner interest": "Partnerinteresse registrieren",
    "OF EVERY AGENT SALE YOU REFER": "VON JEDEM AGENTENVERKAUF, DEN SIE VERMITTELN",
    "Approved partner access after review": "Partnerzugang nach Prüfung",
    "30-day attribution window per visitor": "30-Tage-Attributionsfenster pro Besucher",
    "Applies to every agent in the catalogue": "Gilt für jeden Agenten im Katalog",
    "Tracking activated after commercial setup": "Tracking nach kommerziellem Setup aktiviert",
    "Payout terms confirmed during onboarding": "Auszahlungsbedingungen im Onboarding bestätigt",
    "HOW IT WORKS": "SO FUNKTIONIERT ES",
    "Three steps": "Drei Schritte",
    "Three steps. Approved partner process.": "Drei Schritte. Freigegebener Partnerprozess.",
    "Register interest": "Interesse registrieren",
    "30 SECONDS": "30 SEKUNDEN",
    "Share it": "Teilen",
    "30-DAY WINDOW": "30-TAGE-FENSTER",
    "When they buy any agent through your link, you earn 20% of the sale. No caps, no tiers that reduce your rate. Every sale is on record. Payouts go monthly.": "Wenn ein Kunde über Ihren Link einen Agenten kauft, erhalten Sie 20 % des Verkaufs. Keine Deckelung, keine Stufen, die Ihre Rate reduzieren. Jeder Verkauf wird erfasst. Auszahlungen erfolgen monatlich.",
    "PAID MONTHLY": "MONATLICHE AUSZAHLUNG"
  },
  fr: {
    "Choose your path": "Choisissez votre parcours",
    "I need an AI agent use case": "J'ai besoin d'un cas d'usage d'agent IA",
    "I need governance assurance": "J'ai besoin d'assurance de gouvernance",
    "I want to partner": "Je veux devenir partenaire",
    "Trust Center": "Centre de confiance",
    "Privacy Policy": "Politique de confidentialité",
    "Terms of Service": "Conditions d'utilisation",
    "Book a call": "Planifier un appel",
    "Browse the catalogue": "Parcourir le catalogue",
    "Review trust architecture": "Examiner l'architecture de confiance",
    "Security model": "Modèle de sécurité",
    "Data handling": "Traitement des données",
    "AI governance": "Gouvernance IA",
    "Telemetry and privacy": "Télémétrie et confidentialité",
    "Launch gate": "Gate de lancement",
    "Checkout gate": "Gate de paiement",
    "Live tryout": "Essai en direct",
    "Earn": "Gagner",
    "FIRST-PARTY INTERACTIVE PROOF": "PREUVE INTERACTIVE FIRST-PARTY",
    "See how a governed agent": "Voyez comment un agent gouverné",
    "Partner Pilot Programme": "Programme pilote partenaires",
    "Apply to partner": "Demander un partenariat",
    "Bring governed AI to your clients": "Apportez une IA gouvernée à vos clients",
    "Approved partners can refer": "Les partenaires approuvés peuvent recommander",
    "Register partner interest": "Enregistrer un intérêt partenaire",
    "HOW IT WORKS": "COMMENT CELA FONCTIONNE",
    "Three steps": "Trois étapes",
    "Three steps. Approved partner process.": "Trois étapes. Processus partenaire approuvé.",
    "Register interest": "Enregistrer l'intérêt",
    "30 SECONDS": "30 SECONDES",
    "Share it": "Partager",
    "30-DAY WINDOW": "FENÊTRE DE 30 JOURS",
    "PAID MONTHLY": "PAYÉ MENSUELLEMENT"
  },
  es: {
    "Choose your path": "Elige tu camino",
    "I need an AI agent use case": "Necesito un caso de uso de agente de IA",
    "I need governance assurance": "Necesito garantía de gobernanza",
    "I want to partner": "Quiero ser partner",
    "Trust Center": "Centro de confianza",
    "Privacy Policy": "Política de privacidad",
    "Terms of Service": "Términos de servicio",
    "Book a call": "Reservar llamada",
    "Browse the catalogue": "Ver el catálogo",
    "Review trust architecture": "Revisar arquitectura de confianza",
    "Security model": "Modelo de seguridad",
    "Data handling": "Tratamiento de datos",
    "AI governance": "Gobernanza de IA",
    "Telemetry and privacy": "Telemetría y privacidad",
    "Launch gate": "Gate de lanzamiento",
    "Checkout gate": "Gate de checkout",
    "Live tryout": "Probar en vivo",
    "Earn": "Gana",
    "FIRST-PARTY INTERACTIVE PROOF": "PRUEBA INTERACTIVA FIRST-PARTY",
    "See how a governed agent": "Mira cómo un agente gobernado",
    "Partner Pilot Programme": "Programa piloto de partners",
    "Apply to partner": "Solicitar ser partner",
    "Bring governed AI to your clients": "Lleva IA gobernada a tus clientes",
    "Approved partners can refer": "Los partners aprobados pueden referir",
    "Approved partners can refer, resell, or help deploy ColleagueAI agent packages. Commercial terms, attribution, and payout process are confirmed during partner onboarding.": "Los partners aprobados pueden referir, revender o ayudar a desplegar paquetes de agentes ColleagueAI. Los términos comerciales, la atribución y el proceso de pago se confirman durante el onboarding de partner.",
    "Register partner interest": "Registrar interés de partner",
    "OF EVERY AGENT SALE YOU REFER": "DE CADA VENTA DE AGENTE QUE REFIERAS",
    "Approved partner access after review": "Acceso de partner aprobado tras revisión",
    "30-day attribution window per visitor": "Ventana de atribución de 30 días por visitante",
    "Applies to every agent in the catalogue": "Aplica a cada agente del catálogo",
    "Tracking activated after commercial setup": "Tracking activado tras configuración comercial",
    "Payout terms confirmed during onboarding": "Términos de pago confirmados durante onboarding",
    "HOW IT WORKS": "CÓMO FUNCIONA",
    "Three steps": "Tres pasos",
    "Three steps. Approved partner process.": "Tres pasos. Proceso de partner aprobado.",
    "Register interest": "Registrar interés",
    "Enter your name and email. Your unique partner code is derived cryptographically from your email, deterministic, so you can always regenerate the same link.": "Introduce tu nombre y email. Tu código único de partner se deriva criptográficamente de tu email, de forma determinista, para que siempre puedas regenerar el mismo enlace.",
    "30 SECONDS": "30 SEGUNDOS",
    "Share it": "Compártelo",
    "Send the link to clients, embed it in proposals, add it to your website. Anyone who clicks and buys within 30 days is credited to you, automatically, through approved commercial setup.": "Envía el enlace a clientes, inclúyelo en propuestas o agrégalo a tu web. Quien haga clic y compre dentro de 30 días se te atribuye automáticamente mediante configuración comercial aprobada.",
    "30-DAY WINDOW": "VENTANA DE 30 DÍAS",
    "When they buy any agent through your link, you earn 20% of the sale. No caps, no tiers that reduce your rate. Every sale is on record. Payouts go monthly.": "Cuando compran cualquier agente a través de tu enlace, ganas el 20 % de la venta. Sin límites ni niveles que reduzcan tu porcentaje. Cada venta queda registrada. Los pagos son mensuales.",
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
    "Choose your path": "Wybierz swoją ścieżkę",
    "I need an AI agent use case": "Potrzebuję przypadku użycia agenta AI",
    "I need governance assurance": "Potrzebuję pewności governance",
    "I want to partner": "Chcę zostać partnerem",
    "Trust Center": "Centrum zaufania",
    "Privacy Policy": "Polityka prywatności",
    "Terms of Service": "Warunki korzystania z usługi",
    "Book a call": "Umów rozmowę",
    "Browse the catalogue": "Przejrzyj katalog",
    "Review trust architecture": "Przejrzyj architekturę zaufania",
    "Security model": "Model bezpieczeństwa",
    "Data handling": "Obsługa danych",
    "AI governance": "Governance AI",
    "Telemetry and privacy": "Telemetria i prywatność",
    "Launch gate": "Gate uruchomienia",
    "Checkout gate": "Gate checkout",
    "Live tryout": "Wypróbuj na żywo",
    "Earn": "Zarabiaj",
    "FIRST-PARTY INTERACTIVE PROOF": "INTERAKTYWNY DOWÓD FIRST-PARTY",
    "See how a governed agent": "Zobacz, jak zarządzany agent",
    "Partner Pilot Programme": "Pilotażowy program partnerski",
    "Apply to partner": "Zgłoś chęć partnerstwa",
    "Bring governed AI to your clients": "Dostarczaj klientom zarządzaną AI",
    "Approved partners can refer": "Zatwierdzeni partnerzy mogą polecać",
    "Register partner interest": "Zarejestruj zainteresowanie partnerskie",
    "HOW IT WORKS": "JAK TO DZIAŁA",
    "Three steps": "Trzy kroki",
    "Three steps. Approved partner process.": "Trzy kroki. Proces zatwierdzonego partnera.",
    "Register interest": "Zarejestruj zainteresowanie",
    "30 SECONDS": "30 SEKUND",
    "Share it": "Udostępnij",
    "30-DAY WINDOW": "OKNO 30 DNI",
    "PAID MONTHLY": "PŁATNE MIESIĘCZNIE"
  },
  pt: {
    "Choose your path": "Escolha o seu caminho",
    "I need an AI agent use case": "Preciso de um caso de uso de agente de IA",
    "I need governance assurance": "Preciso de garantia de governança",
    "I want to partner": "Quero ser parceiro",
    "Trust Center": "Centro de confiança",
    "Privacy Policy": "Política de privacidade",
    "Terms of Service": "Termos de serviço",
    "Book a call": "Agendar chamada",
    "Browse the catalogue": "Ver catálogo",
    "Review trust architecture": "Revisar arquitetura de confiança",
    "Security model": "Modelo de segurança",
    "Data handling": "Tratamento de dados",
    "AI governance": "Governança de IA",
    "Telemetry and privacy": "Telemetria e privacidade",
    "Launch gate": "Gate de lançamento",
    "Checkout gate": "Gate de checkout",
    "Live tryout": "Teste ao vivo",
    "Earn": "Ganhar",
    "FIRST-PARTY INTERACTIVE PROOF": "PROVA INTERATIVA FIRST-PARTY",
    "See how a governed agent": "Veja como um agente governado",
    "Partner Pilot Programme": "Programa piloto de parceiros",
    "Apply to partner": "Candidate-se como parceiro",
    "Bring governed AI to your clients": "Leve IA governada aos seus clientes",
    "Approved partners can refer": "Parceiros aprovados podem indicar",
    "Register partner interest": "Registar interesse de parceiro",
    "HOW IT WORKS": "CÓMO FUNCIONA",
    "Three steps": "Três etapas",
    "Three steps. Approved partner process.": "Três etapas. Processo de parceiro aprovado.",
    "Register interest": "Registar interesse",
    "30 SECONDS": "30 SEGUNDOS",
    "Share it": "Compartilhar",
    "30-DAY WINDOW": "JANELA DE 30 DIAS",
    "PAID MONTHLY": "PAGO MENSALMENTE"
  }
};

const AUDIT_MARKER_COPY = {
  cs: {
    trust: {
      "Agent Catalogue": "Katalog agentů",
      "Trust Center": "Centrum důvěry",
      "The evidence, in one place.": "Důkazy na jednom místě.",
      "In a category built on trust": "V kategorii založené na důvěře",
      "The CAI Score methodology": "Metodika CAI Score",
      "Architecture: where agents run, where data lives": "Architektura: kde agenti běží a kde zůstávají data",
      "Subprocessors": "Subdodavatelé zpracování",
      "Security practices": "Bezpečnostní postupy",
      "Pilot programme": "Pilotní program",
      "Book a pilot conversation": "Domluvit pilotní rozhovor"
    },
    partners: {
      "Approved partners can refer": "Schválení partneři mohou doporučovat",
      "Three steps. Approved partner process.": "Tři kroky. Schválený partnerský proces.",
      "Enter your name and email": "Zadejte své jméno a e-mail",
      "When they buy any agent through your link": "Když koupí agenta přes váš odkaz",
      "Common questions, direct answers.": "Časté otázky, přímé odpovědi.",
      "Ready to bring enterprise AI": "Připraveni přinést podnikovou AI"
    }
  },
  de: {
    trust: {
      "Agent Catalogue": "Agenten-Katalog",
      "Trust Center": "Vertrauenszentrum",
      "The evidence, in one place.": "Die Nachweise an einem Ort.",
      "In a category built on trust": "In einer Kategorie, die auf Vertrauen basiert",
      "The CAI Score methodology": "Methodik des CAI Score",
      "Architecture: where agents run, where data lives": "Architektur: wo Agenten laufen und wo Daten verbleiben",
      "Subprocessors": "Unterauftragsverarbeiter",
      "Security practices": "Sicherheitspraktiken",
      "Pilot programme": "Pilotprogramm",
      "Book a pilot conversation": "Pilotgespräch buchen"
    },
    partners: {
      "Approved partners can refer": "Genehmigte Partner können empfehlen",
      "Three steps. Approved partner process.": "Drei Schritte. Genehmigter Partnerprozess.",
      "Enter your name and email": "Geben Sie Ihren Namen und Ihre E-Mail ein",
      "When they buy any agent through your link": "Wenn sie einen Agenten über Ihren Link kaufen",
      "Common questions, direct answers.": "Häufige Fragen, klare Antworten.",
      "Ready to bring enterprise AI": "Bereit, Enterprise-KI zu bringen"
    }
  },
  fr: {
    trust: {
      "Agent Catalogue": "Catalogue d'agents",
      "Trust Center": "Centre de confiance",
      "The evidence, in one place.": "Les preuves, au même endroit.",
      "In a category built on trust": "Dans une catégorie fondée sur la confiance",
      "The CAI Score methodology": "Méthodologie du CAI Score",
      "Architecture: where agents run, where data lives": "Architecture : où les agents s'exécutent et où les données restent",
      "Subprocessors": "Sous-traitants",
      "Security practices": "Pratiques de sécurité",
      "Pilot programme": "Programme pilote",
      "Book a pilot conversation": "Planifier un entretien pilote"
    },
    partners: {
      "Approved partners can refer": "Les partenaires approuvés peuvent recommander",
      "Three steps. Approved partner process.": "Trois étapes. Processus partenaire approuvé.",
      "Enter your name and email": "Saisissez votre nom et votre e-mail",
      "When they buy any agent through your link": "Quand ils achètent un agent via votre lien",
      "Common questions, direct answers.": "Questions fréquentes, réponses directes.",
      "Ready to bring enterprise AI": "Prêt à apporter l'IA d'entreprise"
    }
  },
  es: {
    trust: {
      "Agent Catalogue": "Catálogo de agentes",
      "Trust Center": "Centro de confianza",
      "The evidence, in one place.": "La evidencia, en un solo lugar.",
      "In a category built on trust": "En una categoría basada en la confianza",
      "The CAI Score methodology": "Metodología del CAI Score",
      "Architecture: where agents run, where data lives": "Arquitectura: dónde se ejecutan los agentes y dónde viven los datos",
      "Subprocessors": "Subprocesadores",
      "Security practices": "Prácticas de seguridad",
      "Pilot programme": "Programa piloto",
      "Book a pilot conversation": "Reservar una conversación piloto"
    },
    partners: {
      "Approved partners can refer": "Los partners aprobados pueden recomendar",
      "Three steps. Approved partner process.": "Tres pasos. Proceso de partner aprobado.",
      "Enter your name and email": "Introduce tu nombre y correo",
      "When they buy any agent through your link": "Cuando compran un agente mediante tu enlace",
      "Common questions, direct answers.": "Preguntas frecuentes, respuestas directas.",
      "Ready to bring enterprise AI": "Listo para llevar IA empresarial"
    }
  },
  it: {
    trust: {
      "Agent Catalogue": "Catalogo agenti",
      "Trust Center": "Centro fiducia",
      "The evidence, in one place.": "Le evidenze, in un unico posto.",
      "In a category built on trust": "In una categoria fondata sulla fiducia",
      "The CAI Score methodology": "Metodologia del CAI Score",
      "Architecture: where agents run, where data lives": "Architettura: dove girano gli agenti e dove restano i dati",
      "Subprocessors": "Subresponsabili",
      "Security practices": "Pratiche di sicurezza",
      "Pilot programme": "Programma pilota",
      "Book a pilot conversation": "Prenotare una conversazione pilota"
    },
    partners: {
      "Approved partners can refer": "I partner approvati possono segnalare",
      "Three steps. Approved partner process.": "Tre passaggi. Processo partner approvato.",
      "Enter your name and email": "Inserisci nome ed e-mail",
      "When they buy any agent through your link": "Quando acquistano un agente tramite il tuo link",
      "Common questions, direct answers.": "Domande frequenti, risposte dirette.",
      "Ready to bring enterprise AI": "Pronto a portare AI enterprise"
    }
  },
  pl: {
    trust: {
      "Agent Catalogue": "Katalog agentów",
      "Trust Center": "Centrum zaufania",
      "The evidence, in one place.": "Dowody w jednym miejscu.",
      "In a category built on trust": "W kategorii opartej na zaufaniu",
      "The CAI Score methodology": "Metodyka CAI Score",
      "Architecture: where agents run, where data lives": "Architektura: gdzie działają agenci i gdzie pozostają dane",
      "Subprocessors": "Podwykonawcy przetwarzania",
      "Security practices": "Praktyki bezpieczeństwa",
      "Pilot programme": "Program pilotażowy",
      "Book a pilot conversation": "Umów rozmowę pilotażową"
    },
    partners: {
      "Approved partners can refer": "Zatwierdzeni partnerzy mogą polecać",
      "Three steps. Approved partner process.": "Trzy kroki. Zatwierdzony proces partnerski.",
      "Enter your name and email": "Podaj imię i e-mail",
      "When they buy any agent through your link": "Gdy kupią agenta przez Twój link",
      "Common questions, direct answers.": "Częste pytania, bezpośrednie odpowiedzi.",
      "Ready to bring enterprise AI": "Gotowe, aby wdrażać AI enterprise"
    }
  },
  pt: {
    trust: {
      "Agent Catalogue": "Catálogo de agentes",
      "Trust Center": "Centro de confiança",
      "The evidence, in one place.": "As evidências, num só lugar.",
      "In a category built on trust": "Numa categoria baseada na confiança",
      "The CAI Score methodology": "Metodologia do CAI Score",
      "Architecture: where agents run, where data lives": "Arquitetura: onde os agentes executam e onde os dados permanecem",
      "Subprocessors": "Subprocessadores",
      "Security practices": "Práticas de segurança",
      "Pilot programme": "Programa piloto",
      "Book a pilot conversation": "Marcar uma conversa piloto"
    },
    partners: {
      "Approved partners can refer": "Parceiros aprovados podem recomendar",
      "Three steps. Approved partner process.": "Três passos. Processo de parceiro aprovado.",
      "Enter your name and email": "Introduza o seu nome e e-mail",
      "When they buy any agent through your link": "Quando compram um agente através do seu link",
      "Common questions, direct answers.": "Perguntas frequentes, respostas diretas.",
      "Ready to bring enterprise AI": "Pronto para levar IA empresarial"
    }
  }
};

const MARKETING_ROUTES = new Set(["agents", "partners", "trust"]);
const LEGAL_ROUTES = new Set(["privacy", "terms", "license", "imprint", "partner-agreement"]);

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

const LEGAL_TITLES = {
  cs: { license: "Softwarová a agentní licence", imprint: "Právní informace", partnerAgreement: "Smlouva o partnerském programu" },
  de: { license: "Software- und Agentenlizenz", imprint: "Impressum", partnerAgreement: "Partnerprogramm-Vereinbarung" },
  fr: { license: "Licence logicielle et d’agent", imprint: "Mentions légales", partnerAgreement: "Accord de programme partenaire" },
  es: { license: "Licencia de software y de agente", imprint: "Aviso legal", partnerAgreement: "Acuerdo del programa de partners" },
  it: { license: "Licenza software e agente", imprint: "Note legali", partnerAgreement: "Accordo del programma partner" },
  pl: { license: "Licencja na oprogramowanie i agenta", imprint: "Informacje prawne", partnerAgreement: "Umowa programu partnerskiego" },
  pt: { license: "Licença de software e de agente", imprint: "Informação legal", partnerAgreement: "Acordo do programa de parceiros" },
};

function patchIdentity(html, locale, route) {
  const t = IDENTITY[locale];
  const lt = LEGAL_TITLES[locale];
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

  if (lt && route === "license") {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${lt.license} | Colleague AI</title>`);
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${lt.license}</h1>`);
  }

  if (lt && route === "imprint") {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${lt.imprint} | Colleague AI</title>`);
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${lt.imprint}</h1>`);
  }

  if (lt && route === "partner-agreement") {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${lt.partnerAgreement} | Colleague AI</title>`);
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${lt.partnerAgreement}</h1>`);
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

      const routeAuditCopy = AUDIT_MARKER_COPY[locale] && AUDIT_MARKER_COPY[locale][route];
      if (routeAuditCopy) {
        html = applyDictionary(html, routeAuditCopy);
      }

      if (html !== before) {
        fs.writeFileSync(file, html);
        console.log(`[sitewide-i18n] patched ${file}`);
      }
    }
  }
}

console.log("Site-wide visible-copy localization applied.");
