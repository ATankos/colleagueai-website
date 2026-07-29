/* generate-pricing-pages.cjs — render the localized /pricing routes from the
   English source page (public/pricing.html) plus the reviewed pricing dictionary.
   Navigation labels, localized slugs and the footer are reused verbatim from each
   locale's existing home page, so translations already reviewed stay authoritative. */
const fs = require("fs");
const path = require("path");
const { DEFAULT_LOCALE, SUPPORTED_LOCALE_CODES, canonicalPath } = require("./i18n/config.cjs");
const DICT = require("./i18n/pricing-content.json");

const SITE = "https://www.colleagueai.ai";
const SRC = "public/pricing.html";
const KEYS = Object.keys(DICT).sort((a, b) => b.length - a.length); // longest first: no partial clobbering

function read(f) { return fs.readFileSync(f, "utf8"); }
function write(f, c) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, c, "utf8");
  // mirror into the build output when it exists, so `npm run build` ships the same pages
  if (f.startsWith("public/") && fs.existsSync("dist")) {
    const d = "dist/" + f.slice("public/".length);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.writeFileSync(d, c, "utf8");
  }
}
function tr(s, loc) { const e = DICT[s]; return (e && e[loc]) || s; }

function translate(html, loc) {
  for (const en of KEYS) {
    const t = DICT[en][loc];
    if (!t || t === en) continue;
    html = html.split(">" + en + "<").join(">" + t + "<");
    html = html.split('"' + en + '"').join('"' + t + '"');
  }
  return html;
}

// Pull reviewed nav labels / localized hrefs / footer out of the locale's home page.
function homeBits(loc) {
  const file = loc === DEFAULT_LOCALE ? "public/home.html" : "public/" + loc + "/home.html";
  const html = read(file);
  const nav = html.match(/<nav class="links">([\s\S]*?)<\/nav>/);
  const foot = html.match(/<footer>[\s\S]*?<\/footer>/);
  if (!nav || !foot) throw new Error("cannot read nav/footer from " + file);
  const cta = nav[1].match(/<a class="cta" href="([^"]+)">([^<]+)<\/a>/);
  const links = [...nav[1].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
    .map((m) => ({ href: m[1], label: m[2] }))
    .filter((l) => !/#/.test(l.href) && l.href !== cta[1]);

  // Resolve each entry by route, never by position: the home nav gains and loses
  // items over time (adding /pricing to it used to shift every lookup by one).
  const at = (page) => {
    const want = canonicalPath(loc, page);
    return links.find((l) => l.href === want || l.href === want + "/");
  };
  const known = new Set(["agents", "pricing", "trust", "partners"].map((p) => canonicalPath(loc, p)));
  const contact = links.find((l) => !known.has(l.href.replace(/\/$/, "")));
  const need = { catalogue: at("agents"), trust: at("trust"), partners: at("partners") };
  for (const [k, v] of Object.entries(need)) {
    if (!v) throw new Error(`${file}: could not resolve the ${k} nav link by route`);
  }
  return {
    catalogue: need.catalogue,
    trust: need.trust,
    partners: need.partners,
    contact: contact || { href: canonicalPath(loc, "partners"), label: "Contact" },
    cta: { href: cta[1], label: cta[2] },
    footer: foot[0]
  };
}

function buildNav(b, loc) {
  const p = canonicalPath(loc, "pricing");
  const item = (l) => '<a href="' + l.href + '">' + l.label + "</a>";
  return {
    links:
      item(b.catalogue) +
      '<a href="' + p + '" aria-current="page">' + tr("Pricing", loc) + "</a>" +
      item(b.trust) + item(b.partners) + item(b.contact) + "\n" +
      '<select class="lang" id="langsel" aria-label="Language"></select>\n' +
      '<a class="cta" href="' + b.cta.href + '">' + b.cta.label + "</a>\n" +
      '<button class="burger" id="burger" aria-label="Menu" aria-expanded="false" aria-controls="mnav"><span></span><span></span><span></span></button>\n',
    mnav:
      item(b.catalogue) +
      '<a href="' + p + '">' + tr("Pricing", loc) + "</a>" +
      item(b.trust) + item(b.partners) + item(b.contact) +
      '<a href="' + b.cta.href + '">' + b.cta.label + "</a>"
  };
}

function render(loc) {
  let html = read(SRC);
  const b = homeBits(loc);
  const nav = buildNav(b, loc);
  const url = SITE + canonicalPath(loc, "pricing");

  if (loc !== DEFAULT_LOCALE) html = translate(html, loc);

  // localized internal links (longest paths first so /agents does not eat /agents#x)
  const map = {
    "/agents": b.catalogue.href,
    "/trust": b.trust.href,
    "/partners": b.partners.href,
    "/contact": b.contact.href,
    "/demo": b.cta.href,
    "/pricing": canonicalPath(loc, "pricing")
  };
  for (const [from, to] of Object.entries(map)) {
    if (from === to) continue;
    html = html.split('href="' + from + '"').join('href="' + to + '"');
  }

  // Attribute-order-proof: earlier build steps rewrite this tag to
  // <html data-cai-page="pricing" lang="en">, which an exact-match regex misses,
  // leaving every localized page declaring lang="en".
  html = html.replace(/<html\b([^>]*)>/, (m, attrs) =>
    "<html" + attrs.replace(/\s*lang="[^"]*"/g, "") + ' lang="' + loc + '">');
  // Exactly one canonical, pointing at this locale's route. The global-language
  // step also emits one (for the English URL), so strip all and re-add ours.
  html = html.replace(/[ \t]*<link rel="canonical"[^>]*>\r?\n?/g, "");
  html = html.replace("</head>", '<link rel="canonical" href="' + url + '">\n</head>');
  html = html.replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + url + '">');
  html = html.replace(/<nav class="links" aria-label="Main">[\s\S]*?<\/nav>/, '<nav class="links" aria-label="Main">\n' + nav.links + "</nav>");
  html = html.replace(/<nav class="mnav" id="mnav" aria-label="Mobile">[\s\S]*?<\/nav>/, '<nav class="mnav" id="mnav" aria-label="Mobile">' + nav.mnav + "</nav>");
  html = html.replace(/<footer>[\s\S]*?<\/footer>/, b.footer);
  return html;
}

let count = 0;
for (const loc of SUPPORTED_LOCALE_CODES) {
  const html = render(loc);
  const slug = canonicalPath(loc, "pricing").replace(/^\//, "").split("/").pop();
  const dir = loc === DEFAULT_LOCALE ? "public" : "public/" + loc;
  if (loc === DEFAULT_LOCALE) write("public/pricing.html", html);
  else { write(dir + "/pricing.html", html); write(dir + "/pricing/index.html", html); }
  // every locale also gets the /<locale>/ mirror the navigation checker validates
  write("public/" + loc + "/pricing.html", html);
  write("public/" + loc + "/pricing/index.html", html);
  count += 2;
  // pretty localized slugs (/cs/cenik ...) are served by vercel.json rewrites,
  // matching how every other localized page in this repo is routed.
  void slug;
}

// sitemap: add the canonical pricing route for every locale
const smFile = "public/sitemap.xml";
if (fs.existsSync(smFile)) {
  let xml = read(smFile);
  let add = "";
  for (const loc of SUPPORTED_LOCALE_CODES) {
    const loc_url = SITE + canonicalPath(loc, "pricing");
    if (!xml.includes("<loc>" + loc_url + "</loc>")) add += "  <url>\n    <loc>" + loc_url + "</loc>\n  </url>\n";
  }
  if (add) { xml = xml.replace("</urlset>", add + "</urlset>"); write(smFile, xml); }
}
console.log("Pricing pages generated:", count, "files");
