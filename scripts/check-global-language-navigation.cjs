const fs = require("fs");
const { SUPPORTED_LOCALE_CODES: LOCALES, GLOBAL_PAGES: PAGES, canonicalPath } = require("./i18n/config.cjs");

const SITE = "https://www.colleagueai.ai";
const failures = [];
const exists = (f) => fs.existsSync(f);
const read = (f) => (exists(f) ? fs.readFileSync(f, "utf8") : "");

function checkPage(file, page) {
  const html = read(file);
  if (!html) { failures.push({ file, issue: "missing localized page" }); return; }
  // exactly one consolidated visible selector
  if (!html.includes('id="langsel"')) failures.push({ file, issue: "missing single language selector (#langsel)" });
  // legacy duplicate switchers must be gone
  if (html.includes('id="cai-global-language-switcher"')) failures.push({ file, issue: "legacy generated nav switcher still present" });
  if (html.includes('id="cai-language-guide"')) failures.push({ file, issue: "legacy language-guide panel still present" });
  // single URL-locale controller present
  if (!html.includes('id="cai-url-locale-controller"')) failures.push({ file, issue: "missing url-locale controller" });
  // hreflang alternates use the canonical (translated) URL for every locale
  for (const target of LOCALES) {
    const needle = 'hreflang="' + target + '" href="' + SITE + canonicalPath(target, page) + '"';
    if (!html.includes(needle)) failures.push({ file, issue: "missing/incorrect hreflang alternate", expected: needle });
  }
}

for (const page of PAGES) {
  checkPage("public/" + page + ".html", page);
  for (const locale of LOCALES) {
    checkPage("public/" + locale + "/" + page + ".html", page);
    checkPage("public/" + locale + "/" + page + "/index.html", page);
  }
}

const sitemap = read("public/sitemap.xml");
for (const page of PAGES) {
  for (const locale of LOCALES) {
    const loc = SITE + canonicalPath(locale, page);
    if (!sitemap.includes(loc)) failures.push({ file: "public/sitemap.xml", issue: "missing localized sitemap route", expected: loc });
  }
}

if (failures.length) {
  console.error("Global language navigation check failed:");
  console.table(failures.slice(0, 40));
  console.error("total failures:", failures.length);
  process.exit(1);
}
console.log("Global language navigation check passed.");
