const fs = require("fs");

const LOCALES = ["en", "cs", "de", "fr", "es", "it", "pl", "pt"];
const PAGES = ["agents", "trust", "partners", "privacy", "terms"];
const failures = [];

function exists(file) {
  return fs.existsSync(file);
}

function read(file) {
  return exists(file) ? fs.readFileSync(file, "utf8") : "";
}

function filesFor(page, locale) {
  if (!locale) return ["public/" + page + ".html"].filter(exists);
  return [
    "public/" + locale + "/" + page + ".html",
    "public/" + locale + "/" + page + "/index.html"
  ].filter(exists);
}

function checkFile(file) {
  const html = read(file);
  if (!html.includes('id="cai-url-locale-controller"')) {
    failures.push({ file, issue: "missing URL locale controller" });
  }
  if (!html.includes('id="cai-url-locale-controller-css"')) {
    failures.push({ file, issue: "missing URL locale cleanup CSS" });
  }
  // single-system invariants (URL is the only source of truth)
  if (html.includes('"colleagueai_locale"')) {
    failures.push({ file, issue: "legacy multi-key localStorage controller present" });
  }
  if (html.includes("location.assign(routeFor(")) {
    failures.push({ file, issue: "legacy global click hijack present" });
  }
  if (!html.includes('localStorage.setItem("cai-lang"')) {
    failures.push({ file, issue: "missing single write-only cai-lang key" });
  }
}

for (const page of PAGES) {
  filesFor(page, "").forEach(checkFile);
  for (const locale of LOCALES) filesFor(page, locale).forEach(checkFile);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!String(pkg.scripts.build || "").includes("node scripts/enforce-url-locale-controller.cjs")) {
  failures.push({ file: "package.json", issue: "build does not enforce URL locale controller" });
}
if (String(pkg.scripts["check:url-locale"] || "") !== "node scripts/check-url-locale-controller.cjs") {
  failures.push({ file: "package.json", issue: "missing check:url-locale script" });
}
if (!String(pkg.scripts.check || "").includes("npm run check:url-locale")) {
  failures.push({ file: "package.json", issue: "check does not include URL locale check" });
}

if (failures.length) {
  console.error("URL locale controller check failed:");
  console.table(failures);
  process.exit(1);
}

console.log("URL locale controller check passed.");
