const fs = require("fs");

const LOCALES = ["en","cs","de","fr","es","it","pl","pt"];
const PAGES = ["agents","trust","partners","privacy","terms"];
const AGENTS_SLUG = { en:"agents", cs:"agenti", de:"agenten", fr:"agents", es:"agentes", it:"agenti", pl:"agenci", pt:"agentes" };
const failures = [];

function exists(file) { return fs.existsSync(file); }
function read(file) { return exists(file) ? fs.readFileSync(file, "utf8") : ""; }

for (const page of PAGES) {
  const root = "public/" + page + ".html";
  const rootHtml = read(root);
  if (!rootHtml.includes('id="cai-global-language-switcher"')) {
    failures.push({ file: root, issue: "missing global language switcher" });
  }
  for (const locale of LOCALES) {
    const files = ["public/" + locale + "/" + page + ".html", "public/" + locale + "/" + page + "/index.html"];
    for (const file of files) {
      const html = read(file);
      if (!html) {
        failures.push({ file, issue: "missing localized page" });
        continue;
      }
      if (!html.includes('id="cai-global-language-switcher"')) {
        failures.push({ file, issue: "missing global language switcher" });
      }
      for (const targetLocale of LOCALES) {
        const link = "/" + targetLocale + "/" + page;
        if (!html.includes(link)) failures.push({ file, issue: "missing same-page language link", expected: link });
      }
      if (page !== "agents" && LOCALES.every(l => html.includes("/" + l + "/agents"))) {
        failures.push({ file, issue: "language switcher appears to send all locales to /agents" });
      }
    }
  }
}

const sitemap = read("public/sitemap.xml");
for (const page of PAGES) {
  for (const locale of LOCALES) {
    const slug = page === "agents" ? AGENTS_SLUG[locale] : page;
    const loc = "https://www.colleagueai.ai/" + locale + "/" + slug;
    if (!sitemap.includes(loc)) failures.push({ file: "public/sitemap.xml", issue: "missing localized sitemap route", expected: loc });
  }
}

if (failures.length) {
  console.error("Global language navigation check failed:");
  console.table(failures);
  process.exit(1);
}
console.log("Global language navigation check passed.");
