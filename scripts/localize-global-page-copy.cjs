const fs = require("fs");

const locales = ["cs","de","fr","es","it","pl","pt"];
const translations = {
  "cs": {
    "Choose your path": "Vyberte si cestu",
    "I need an AI agent use case": "Potřebuji use case pro AI agenta",
    "Browse packaged agents, factsheets, CAI Score, and the controlled demo path.": "Procházejte balíčky agentů, factsheety, CAI Score a kontrolovanou demo cestu.",
    "I need governance assurance": "Potřebuji jistotu governance",
    "Review security, data handling, AI governance, telemetry, and launch gate status.": "Zkontrolujte bezpečnost, nakládání s daty, AI governance, telemetrii a stav launch gate.",
    "I want to partner": "Chci se stát partnerem",
    "Register partner interest. Approval and commission eligibility remain agreement-based.": "Zaregistrujte partnerský zájem. Schválení a nárok na provizi zůstávají závislé na smlouvě.",
    "Partner interest, not automatic affiliate approval": "Partnerský zájem, ne automatické affiliate schválení",
    "Use this page to register interest and generate an initial partner reference. Approval, commission eligibility, attribution rules, and payment terms remain subject to the partner agreement and manual review.": "Tuto stránku použijte k registraci zájmu a vytvoření úvodní partnerské reference. Schválení, nárok na provizi, pravidla atribuce a platební podmínky zůstávají předmětem partnerské smlouvy a ruční kontroly.",
    "Register interest": "Registrovat zájem",
    "Review agent packages": "Prohlédnout balíčky agentů",
    "Review trust architecture": "Prohlédnout trust architekturu",
    "Checkout gate": "Checkout gate",
    "Book a call": "Domluvit schůzku",
    "Live tryout": "Vyzkoušet živě",
    "Philosophy": "Filozofie",
    "Catalogue": "Katalog",
    "Classification": "Klasifikace",
    "Deployment": "Nasazení",
    "Maturity": "Vyspělost"
  },
  "de": {
    "Choose your path": "Wählen Sie Ihren Weg",
    "I need an AI agent use case": "Ich brauche einen KI-Agenten-Use-Case",
    "Browse packaged agents, factsheets, CAI Score, and the controlled demo path.": "Durchsuchen Sie Agentenpakete, Factsheets, CAI Score und den kontrollierten Demo-Pfad.",
    "I need governance assurance": "Ich brauche Governance-Sicherheit",
    "Review security, data handling, AI governance, telemetry, and launch gate status.": "Prüfen Sie Sicherheit, Datenverarbeitung, KI-Governance, Telemetrie und Launch-Gate-Status.",
    "I want to partner": "Ich möchte Partner werden",
    "Register partner interest. Approval and commission eligibility remain agreement-based.": "Registrieren Sie Partnerinteresse. Freigabe und Provisionsfähigkeit bleiben vertragsabhängig.",
    "Partner interest, not automatic affiliate approval": "Partnerinteresse, keine automatische Affiliate-Freigabe",
    "Use this page to register interest and generate an initial partner reference. Approval, commission eligibility, attribution rules, and payment terms remain subject to the partner agreement and manual review.": "Nutzen Sie diese Seite, um Interesse zu registrieren und eine erste Partnerreferenz zu erzeugen. Freigabe, Provisionsfähigkeit, Attributionsregeln und Zahlungsbedingungen bleiben der Partnervereinbarung und manuellen Prüfung vorbehalten.",
    "Register interest": "Interesse registrieren",
    "Review agent packages": "Agentenpakete prüfen",
    "Review trust architecture": "Trust-Architektur prüfen",
    "Checkout gate": "Checkout-Gate",
    "Book a call": "Termin vereinbaren",
    "Live tryout": "Live ausprobieren",
    "Philosophy": "Philosophie",
    "Catalogue": "Katalog",
    "Classification": "Einordnung",
    "Deployment": "Bereitstellung",
    "Maturity": "Reifegrad"
  },
  "fr": {
    "Choose your path": "Choisissez votre parcours",
    "I need an AI agent use case": "J’ai besoin d’un cas d’usage agent IA",
    "Browse packaged agents, factsheets, CAI Score, and the controlled demo path.": "Parcourez les agents packagés, les fiches, le CAI Score et le parcours de démo contrôlé.",
    "I need governance assurance": "J’ai besoin d’assurance gouvernance",
    "Review security, data handling, AI governance, telemetry, and launch gate status.": "Examinez sécurité, traitement des données, gouvernance IA, télémétrie et statut du launch gate.",
    "I want to partner": "Je veux devenir partenaire",
    "Register partner interest. Approval and commission eligibility remain agreement-based.": "Enregistrez un intérêt partenaire. L’approbation et l’éligibilité aux commissions restent contractuelles.",
    "Partner interest, not automatic affiliate approval": "Intérêt partenaire, pas d’approbation affiliate automatique",
    "Use this page to register interest and generate an initial partner reference. Approval, commission eligibility, attribution rules, and payment terms remain subject to the partner agreement and manual review.": "Utilisez cette page pour enregistrer un intérêt et générer une première référence partenaire. L’approbation, l’éligibilité aux commissions, les règles d’attribution et les conditions de paiement restent soumises au contrat partenaire et à une revue manuelle.",
    "Register interest": "Enregistrer l’intérêt",
    "Review agent packages": "Voir les packages agents",
    "Review trust architecture": "Voir l’architecture de confiance",
    "Checkout gate": "Gate de paiement",
    "Book a call": "Planifier un appel",
    "Live tryout": "Essai en direct",
    "Philosophy": "Philosophie",
    "Catalogue": "Catalogue",
    "Classification": "Classification",
    "Deployment": "Déploiement",
    "Maturity": "Maturité"
  },
  "es": {
    "Choose your path": "Elige tu camino",
    "I need an AI agent use case": "Necesito un caso de uso de agente IA",
    "Browse packaged agents, factsheets, CAI Score, and the controlled demo path.": "Explora agentes empaquetados, fichas, CAI Score y el recorrido de demo controlado.",
    "I need governance assurance": "Necesito garantía de gobernanza",
    "Review security, data handling, AI governance, telemetry, and launch gate status.": "Revisa seguridad, manejo de datos, gobernanza de IA, telemetría y estado del launch gate.",
    "I want to partner": "Quiero ser partner",
    "Register partner interest. Approval and commission eligibility remain agreement-based.": "Registra interés como partner. La aprobación y elegibilidad de comisión siguen sujetas a acuerdo.",
    "Partner interest, not automatic affiliate approval": "Interés de partner, no aprobación automática de afiliado",
    "Use this page to register interest and generate an initial partner reference. Approval, commission eligibility, attribution rules, and payment terms remain subject to the partner agreement and manual review.": "Usa esta página para registrar interés y generar una referencia inicial de partner. La aprobación, elegibilidad de comisión, reglas de atribución y condiciones de pago siguen sujetas al acuerdo de partner y revisión manual.",
    "Register interest": "Registrar interés",
    "Review agent packages": "Revisar paquetes de agentes",
    "Review trust architecture": "Revisar arquitectura de confianza",
    "Checkout gate": "Gate de checkout",
    "Book a call": "Reservar llamada",
    "Live tryout": "Probar en vivo",
    "Philosophy": "Filosofía",
    "Catalogue": "Catálogo",
    "Classification": "Clasificación",
    "Deployment": "Despliegue",
    "Maturity": "Madurez"
  },
  "it": {
    "Choose your path": "Scegli il tuo percorso",
    "I need an AI agent use case": "Mi serve un caso d’uso per un agente AI",
    "Browse packaged agents, factsheets, CAI Score, and the controlled demo path.": "Esplora agenti pacchettizzati, schede, CAI Score e percorso demo controllato.",
    "I need governance assurance": "Mi serve assurance di governance",
    "Review security, data handling, AI governance, telemetry, and launch gate status.": "Rivedi sicurezza, gestione dati, governance AI, telemetria e stato del launch gate.",
    "I want to partner": "Voglio diventare partner",
    "Register partner interest. Approval and commission eligibility remain agreement-based.": "Registra interesse partner. Approvazione e idoneità alle commissioni restano basate su accordo.",
    "Partner interest, not automatic affiliate approval": "Interesse partner, non approvazione affiliate automatica",
    "Use this page to register interest and generate an initial partner reference. Approval, commission eligibility, attribution rules, and payment terms remain subject to the partner agreement and manual review.": "Usa questa pagina per registrare interesse e generare un primo riferimento partner. Approvazione, idoneità alle commissioni, regole di attribuzione e termini di pagamento restano soggetti all’accordo partner e a revisione manuale.",
    "Register interest": "Registra interesse",
    "Review agent packages": "Rivedi pacchetti agenti",
    "Review trust architecture": "Rivedi architettura trust",
    "Checkout gate": "Gate di checkout",
    "Book a call": "Prenota una call",
    "Live tryout": "Prova live",
    "Philosophy": "Filosofia",
    "Catalogue": "Catalogo",
    "Classification": "Classificazione",
    "Deployment": "Deployment",
    "Maturity": "Maturità"
  },
  "pl": {
    "Choose your path": "Wybierz swoją ścieżkę",
    "I need an AI agent use case": "Potrzebuję use case dla agenta AI",
    "Browse packaged agents, factsheets, CAI Score, and the controlled demo path.": "Przeglądaj pakiety agentów, factsheety, CAI Score i kontrolowaną ścieżkę demo.",
    "I need governance assurance": "Potrzebuję pewności governance",
    "Review security, data handling, AI governance, telemetry, and launch gate status.": "Sprawdź bezpieczeństwo, obsługę danych, governance AI, telemetrię i status launch gate.",
    "I want to partner": "Chcę zostać partnerem",
    "Register partner interest. Approval and commission eligibility remain agreement-based.": "Zarejestruj zainteresowanie partnerskie. Akceptacja i prowizje pozostają zależne od umowy.",
    "Partner interest, not automatic affiliate approval": "Zainteresowanie partnerskie, nie automatyczna akceptacja affiliate",
    "Use this page to register interest and generate an initial partner reference. Approval, commission eligibility, attribution rules, and payment terms remain subject to the partner agreement and manual review.": "Użyj tej strony, aby zarejestrować zainteresowanie i wygenerować wstępną referencję partnerską. Akceptacja, kwalifikowalność prowizji, zasady atrybucji i warunki płatności pozostają zależne od umowy partnerskiej i ręcznej weryfikacji.",
    "Register interest": "Zarejestruj zainteresowanie",
    "Review agent packages": "Przejrzyj pakiety agentów",
    "Review trust architecture": "Przejrzyj architekturę zaufania",
    "Checkout gate": "Gate checkout",
    "Book a call": "Umów rozmowę",
    "Live tryout": "Wypróbuj na żywo",
    "Philosophy": "Filozofia",
    "Catalogue": "Katalog",
    "Classification": "Klasyfikacja",
    "Deployment": "Wdrożenie",
    "Maturity": "Dojrzałość"
  },
  "pt": {
    "Choose your path": "Escolha seu caminho",
    "I need an AI agent use case": "Preciso de um caso de uso de agente IA",
    "Browse packaged agents, factsheets, CAI Score, and the controlled demo path.": "Explore agentes empacotados, factsheets, CAI Score e o caminho de demo controlado.",
    "I need governance assurance": "Preciso de garantia de governança",
    "Review security, data handling, AI governance, telemetry, and launch gate status.": "Revise segurança, tratamento de dados, governança de IA, telemetria e status do launch gate.",
    "I want to partner": "Quero ser parceiro",
    "Register partner interest. Approval and commission eligibility remain agreement-based.": "Registre interesse como parceiro. Aprovação e elegibilidade de comissão continuam baseadas em contrato.",
    "Partner interest, not automatic affiliate approval": "Interesse de parceiro, não aprovação automática de afiliado",
    "Use this page to register interest and generate an initial partner reference. Approval, commission eligibility, attribution rules, and payment terms remain subject to the partner agreement and manual review.": "Use esta página para registrar interesse e gerar uma referência inicial de parceiro. Aprovação, elegibilidade de comissão, regras de atribuição e termos de pagamento continuam sujeitos ao acordo de parceiro e revisão manual.",
    "Register interest": "Registrar interesse",
    "Review agent packages": "Revisar pacotes de agentes",
    "Review trust architecture": "Revisar arquitetura de confiança",
    "Checkout gate": "Gate de checkout",
    "Book a call": "Agendar chamada",
    "Live tryout": "Teste ao vivo",
    "Philosophy": "Filosofia",
    "Catalogue": "Catálogo",
    "Classification": "Classificação",
    "Deployment": "Implantação",
    "Maturity": "Maturidade"
  }
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + "/" + entry.name;
    if (entry.isDirectory()) out.push(...walk(p));
    if (entry.isFile() && p.endsWith(".html")) out.push(p);
  }
  return out;
}

function replaceAll(value, from, to) {
  return value.split(from).join(to);
}

for (const root of ["public", "dist"]) {
  for (const locale of locales) {
    const dict = translations[locale];
    const files = walk(root + "/" + locale);
    for (const file of files) {
      let html = fs.readFileSync(file, "utf8");
      const before = html;
      for (const [from, to] of Object.entries(dict)) {
        html = replaceAll(html, from, to);
      }
      if (html !== before) {
        fs.writeFileSync(file, html, "utf8");
        console.log("[localize-global-copy] patched", file);
      }
    }
  }
}
