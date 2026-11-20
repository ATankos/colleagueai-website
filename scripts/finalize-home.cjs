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
      cs: { title: "Zarezervovat si demo | Colleague AI", desc: "Rezervujte si 30minutové vedené vyhodnocení Contract Intelligence &amp; Register na vzorových smlouvách v testovacím tenantu, s kontrolním krokem a registrem na obrazovce.",
            h1: "Rezervovat demo", p: "30minutové vedené vyhodnocení Contract Intelligence &amp; Register na vzorových smlouvách v testovacím tenantu, s kontrolním krokem a registrem na obrazovce. Rezervační formulář vyžaduje JavaScript; pokud se nezobrazí, napište nám e-mail se svou společností, tím, co chcete vidět, a preferovaným termínem.",
            browse: "Prohlédnout katalog", agents: "/cs/agenti" },
      de: { title: "Demo buchen | Colleague AI", desc: "Buchen Sie eine 30-minütige begleitete Bewertung von Contract Intelligence &amp; Register an Beispielverträgen in einem Test-Tenant, mit Prüfschritt und Register auf dem Bildschirm.",
            h1: "Demo buchen", p: "Eine 30-minütige begleitete Bewertung von Contract Intelligence &amp; Register an Beispielverträgen in einem Test-Tenant, mit Prüfschritt und Register auf dem Bildschirm. Das Buchungsformular benötigt JavaScript; erscheint es nicht, senden Sie uns eine E-Mail mit Ihrem Unternehmen, dem, was Sie sehen möchten, und einem Wunschtermin.",
            browse: "Katalog ansehen", agents: "/de/agenten" },
      fr: { title: "Réserver une démo | Colleague AI", desc: "Réservez une évaluation guidée de 30 minutes de Contract Intelligence &amp; Register sur des contrats d’exemple dans un tenant de test, avec l’étape de vérification et le registre à l’écran.",
            h1: "Réserver une démo", p: "Une évaluation guidée de 30 minutes de Contract Intelligence &amp; Register sur des contrats d’exemple dans un tenant de test, avec l’étape de vérification et le registre à l’écran. Le formulaire de réservation nécessite JavaScript ; s’il n’apparaît pas, écrivez-nous avec votre entreprise, ce que vous souhaitez voir et un créneau souhaité.",
            browse: "Parcourir le catalogue", agents: "/fr/agents" },
      es: { title: "Reservar una demo | Colleague AI", desc: "Reserve una evaluación guiada de 30 minutos de Contract Intelligence &amp; Register con contratos de ejemplo en un tenant de prueba, con el paso de revisión y el registro en pantalla.",
            h1: "Reservar una demo", p: "Una evaluación guiada de 30 minutos de Contract Intelligence &amp; Register con contratos de ejemplo en un tenant de prueba, con el paso de revisión y el registro en pantalla. El formulario de reserva necesita JavaScript; si no aparece, escríbanos indicando su empresa, lo que quiere ver y un horario preferido.",
            browse: "Ver el catálogo", agents: "/es/agentes" },
      it: { title: "Prenota una demo | Colleague AI", desc: "Prenota una valutazione guidata di 30 minuti di Contract Intelligence &amp; Register su contratti di esempio in un tenant di test, con il passaggio di revisione e il registro sullo schermo.",
            h1: "Prenota una demo", p: "Una valutazione guidata di 30 minuti di Contract Intelligence &amp; Register su contratti di esempio in un tenant di test, con il passaggio di revisione e il registro sullo schermo. Il modulo di prenotazione richiede JavaScript; se non compare, scrivici indicando la tua azienda, cosa vorresti vedere e un orario preferito.",
            browse: "Sfoglia il catalogo", agents: "/it/agenti" },
      pl: { title: "Zarezerwuj demo | Colleague AI", desc: "Umów 30-minutową ocenę z przewodnikiem Contract Intelligence &amp; Register na przykładowych umowach w testowym tenancie, z krokiem weryfikacji i rejestrem na ekranie.",
            h1: "Zarezerwuj demo", p: "30-minutowa ocena z przewodnikiem Contract Intelligence &amp; Register na przykładowych umowach w testowym tenancie, z krokiem weryfikacji i rejestrem na ekranie. Formularz rezerwacji wymaga JavaScript; jeśli się nie pojawi, napisz do nas e-mail z nazwą firmy, tym, co chcesz zobaczyć, i preferowanym terminem.",
            browse: "Przeglądaj katalog", agents: "/pl/agenci" },
      pt: { title: "Marcar uma demo | Colleague AI", desc: "Marque uma avaliação guiada de 30 minutos do Contract Intelligence &amp; Register com contratos de exemplo num tenant de teste, com o passo de revisão e o registo no ecrã.",
            h1: "Marcar uma demo", p: "Uma avaliação guiada de 30 minutos do Contract Intelligence &amp; Register com contratos de exemplo num tenant de teste, com o passo de revisão e o registo no ecrã. O formulário de marcação precisa de JavaScript; se não aparecer, escreva-nos indicando a sua empresa, o que gostaria de ver e um horário preferido.",
            browse: "Ver o catálogo", agents: "/pt/agentes" },
    };
    const EN_TITLE = "Book a Demo | Colleague AI";
    const EN_DESC = "Book a 30-minute guided evaluation of Contract Intelligence &amp; Register on sample contracts in a test tenant, with the review step and the register on screen.";
    const EN_H1 = ">Book a demo</h1>";
    const EN_P = "A 30-minute guided evaluation of Contract Intelligence &amp; Register on sample contracts in a test tenant, with the review step and the register on screen. The booking form needs JavaScript to load; if it does not appear, email us with your company, what you would like to see and a preferred time.";
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
const ensureFinalHomeContrast = (html) => {
  const link = '<link rel="stylesheet" href="/home-a11y.css">';
  if (html.includes(link)) return html;
  if (!/<\/head>/i.test(html)) throw new Error("[finalize-home] homepage missing </head>");
  // cai-final-home-contrast-link
  return html.replace(/<\/head>/i, link + "\n</head>");
};

const accessibleHomeMarkup = (html) => {
  let out = html
    // Robust token replacement: tolerate whitespace/case/order changes produced upstream.
    .replace(/--terra:\s*#C65D3A/gi, "--terra:#A94A2C")
    .replace(/--muted:\s*#8A857C/gi, "--muted:#6F6A62");

  // Every homepage needs one main landmark.
  if (!/<main\b/i.test(out)) {
    out = out.replace(/<\/header>/i, "</header>\n\n<main id=\"main\">");
    out = out.replace(/<footer>/i, "</main>\n\n<footer>");
  }

  // Comparison table: explicit column and row headers for assistive technology.
  out = out.replace(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/i, (full, row) => {
    const fixed = row.replace(/<th(?![^>]*\bscope=)/gi, '<th scope="col"');
    return "<thead><tr>" + fixed + "</tr></thead>";
  });
  out = out.replace(/<tbody>([\s\S]*?)<\/tbody>/i, (full, body) => {
    const fixed = body.replace(/<tr>\s*<td>([\s\S]*?)<\/td>/gi, '<tr><th scope="row">$1</th>');
    return "<tbody>" + fixed + "</tbody>";
  });

  out = out
    .replace("th{font-size:13px;background:var(--cream)}", "thead th{font-size:13px;background:var(--cream)}")
    .replace("tr:last-child td{border-bottom:none}", "tbody tr:last-child > *{border-bottom:none}")
    .replace("td:first-child{color:var(--muted);font-size:13px}", 'tbody th[scope="row"]{color:var(--muted);font-size:13px;font-weight:400}');

  if (/--terra:\s*#C65D3A/i.test(out)) throw new Error("[finalize-home] low-contrast --terra token survived");
  if (/--muted:\s*#8A857C/i.test(out)) throw new Error("[finalize-home] low-contrast --muted token survived");
  if ((out.match(/<main\b/gi) || []).length !== 1) throw new Error("[finalize-home] homepage must have exactly one main landmark");

  return ensureFinalHomeContrast(out);
};

const installHome = (src, dest) => {
  const clean = accessibleHomeMarkup(stripComments(fs.readFileSync(src, "utf8")));
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
