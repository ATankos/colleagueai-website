/* finalize-home.cjs — make the homepage the root document.
   Vite builds the demo SPA as index.html; Vercel serves filesystem matches
   before rewrites, so "/" would show the demo. This step renames the SPA to
   demo.html (served via the /demo rewrite) and installs home.html as index. */
const fs = require("fs");
const path = require("path");
const dist = path.resolve("dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  const idx = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  // Detect the SPA structurally (react mount + module bundle), never by copy text.
  // This previously keyed off the string "Live Demo"; when that wording changed,
  // demo.html stopped being written and /demo 404'd across the whole site.
  const isSpa = idx.includes('id="root"') && /<script[^>]+type="module"[^>]*src="/.test(idx);
  if (isSpa) {
    fs.writeFileSync(path.join(dist, "demo.html"), idx);

    // Localized demo shells: /cs/demo … /pt/demo used to serve the English shell
    // byte-for-byte (lang="en", English title, canonical pointing at /demo). React
    // localizes after hydration, but crawlers and no-JS visitors saw English. Each
    // locale now gets its own shell with translated head + fallback; the same SPA
    // bundle hydrates it. Strings mirror src/Demo.jsx (title2 / desc / title).
    const DEMO_L10N = {
      cs: { title: "Zarezervovat si demo | Colleague AI", desc: "Naplánujte si personalizovanou ukázku řízeného enterprise AI agenta: 30minutová ukázka na workflow, které si vyberete, s auditní stopou na obrazovce.",
            h1: "Rezervovat demo", p: "30minutová ukázka řízeného agenta na workflow, které si vyberete, s auditní stopou na obrazovce. Rezervační formulář vyžaduje JavaScript; pokud se nezobrazí, napište nám e-mail se svou společností, agentem, o kterého máte zájem, a preferovaným termínem.",
            browse: "Prohlédnout katalog", agents: "/cs/agenti" },
      de: { title: "Demo buchen | Colleague AI", desc: "Vereinbaren Sie eine personalisierte Demo überwachter Enterprise-AI-Agenten: eine 30-minütige Präsentation zu einem Workflow Ihrer Wahl, mit dem Audit-Trail auf dem Bildschirm.",
            h1: "Demo buchen", p: "Eine 30-minütige Präsentation eines überwachten Agenten zu einem Workflow Ihrer Wahl, mit dem Audit-Trail auf dem Bildschirm. Das Buchungsformular benötigt JavaScript; erscheint es nicht, senden Sie uns eine E-Mail mit Ihrem Unternehmen, dem gewünschten Agenten und einem Wunschtermin.",
            browse: "Katalog ansehen", agents: "/de/agenten" },
      fr: { title: "Réserver une démo | Colleague AI", desc: "Planifiez une démonstration personnalisée des agents IA gouvernés : 30 minutes sur un workflow de votre choix, avec la piste d’audit à l’écran.",
            h1: "Réserver une démo", p: "Une démonstration de 30 minutes d’un agent gouverné sur un workflow de votre choix, avec la piste d’audit à l’écran. Le formulaire de réservation nécessite JavaScript ; s’il n’apparaît pas, écrivez-nous avec votre entreprise, l’agent qui vous intéresse et un créneau souhaité.",
            browse: "Parcourir le catalogue", agents: "/fr/agents" },
      es: { title: "Reservar una demo | Colleague AI", desc: "Programe una demostración personalizada de agentes IA gobernados: 30 minutos sobre un flujo de trabajo que usted elija, con el registro de auditoría en pantalla.",
            h1: "Reservar una demo", p: "Una demostración de 30 minutos de un agente gobernado sobre un flujo de trabajo que usted elija, con el registro de auditoría en pantalla. El formulario de reserva necesita JavaScript; si no aparece, escríbanos indicando su empresa, el agente que le interesa y un horario preferido.",
            browse: "Ver el catálogo", agents: "/es/agentes" },
      it: { title: "Prenota una demo | Colleague AI", desc: "Pianifica una demo personalizzata di agenti IA governati: 30 minuti su un workflow a tua scelta, con la traccia di audit sullo schermo.",
            h1: "Prenota una demo", p: "Una demo di 30 minuti di un agente governato su un workflow a tua scelta, con la traccia di audit sullo schermo. Il modulo di prenotazione richiede JavaScript; se non compare, scrivici indicando la tua azienda, l’agente che ti interessa e un orario preferito.",
            browse: "Sfoglia il catalogo", agents: "/it/agenti" },
      pl: { title: "Zarezerwuj demo | Colleague AI", desc: "Umów spersonalizowane demo nadzorowanych agentów AI: 30-minutowa prezentacja na wybranym przez Ciebie workflow, ze śladem audytowym na ekranie.",
            h1: "Zarezerwuj demo", p: "30-minutowa prezentacja nadzorowanego agenta na wybranym przez Ciebie workflow, ze śladem audytowym na ekranie. Formularz rezerwacji wymaga JavaScript; jeśli się nie pojawi, napisz do nas e-mail z nazwą firmy, interesującym Cię agentem i preferowanym terminem.",
            browse: "Przeglądaj katalog", agents: "/pl/agenci" },
      pt: { title: "Marcar uma demo | Colleague AI", desc: "Agende uma demonstração personalizada de agentes de IA governados: 30 minutos sobre um workflow à sua escolha, com a trilha de auditoria no ecrã.",
            h1: "Marcar uma demo", p: "Uma demonstração de 30 minutos de um agente governado sobre um workflow à sua escolha, com a trilha de auditoria no ecrã. O formulário de marcação precisa de JavaScript; se não aparecer, escreva-nos indicando a sua empresa, o agente que lhe interessa e um horário preferido.",
            browse: "Ver o catálogo", agents: "/pt/agentes" },
    };
    const EN_TITLE = "Book a Demo | Colleague AI";
    const EN_DESC = "Schedule a personalized demo of governed enterprise AI agents: a 30-minute walkthrough on a workflow you choose, with the audit trail on screen.";
    const EN_H1 = ">Book a demo</h1>";
    const EN_P = "A 30-minute walkthrough of a governed agent on a workflow you choose, with the audit trail on screen. The booking form needs JavaScript to load; if it does not appear, email us with your company, the agent you are interested in and a preferred time.";
    const EN_BROWSE = '<a href="/agents" style="color:#C65D3A;font-weight:600;">Browse the catalogue</a>';
    for (const [loc, t] of Object.entries(DEMO_L10N)) {
      let page = idx
        .replace('<html lang="en">', `<html lang="${loc}">`)
        .split(EN_TITLE).join(t.title)
        .split(EN_DESC).join(t.desc)
        .replace('<link rel="canonical" href="https://www.colleagueai.ai/demo" />', `<link rel="canonical" href="https://www.colleagueai.ai/${loc}/demo" />`)
        .replace('<meta property="og:url" content="https://www.colleagueai.ai/demo" />', `<meta property="og:url" content="https://www.colleagueai.ai/${loc}/demo" />`)
        .replace(EN_H1, `>${t.h1}</h1>`)
        .replace(EN_P, t.p)
        .replace(EN_BROWSE, `<a href="${t.agents}" style="color:#C65D3A;font-weight:600;">${t.browse}</a>`);
      fs.mkdirSync(path.join(dist, loc), { recursive: true });
      fs.writeFileSync(path.join(dist, loc, "demo.html"), page);
    }
    console.log("[finalize-home] localized demo shells written for", Object.keys(DEMO_L10N).join(", "));
  }
}
// The home masters carry an unpublished founder-section draft inside an HTML comment.
// Comments never render, but crawlers and audits read them; ship the pages without any.
const stripComments = (html) => {
  let previous;
  let current = html;
  do {
    previous = current;
    current = current.replace(/<!--[\s\S]*?-->/g, "");
  } while (current !== previous);
  return current;
};
const installHome = (src, dest) => {
  const clean = stripComments(fs.readFileSync(src, "utf8"));
  fs.writeFileSync(src, clean, "utf8");   // the home.html copy in dist is reachable as a static file too
  fs.writeFileSync(dest, clean, "utf8");
};
if (fs.existsSync(path.join(dist, "home.html"))) {
  installHome(path.join(dist, "home.html"), path.join(dist, "index.html"));
}
for (const loc of ["cs", "de", "fr", "es", "it", "pl", "pt"]) {
  if (fs.existsSync(path.join(dist, loc, "home.html"))) {
    installHome(path.join(dist, loc, "home.html"), path.join(dist, loc, "index.html"));
  }
}
console.log("[finalize-home] homepage installed at / and /cs; demo SPA at /demo.html");
