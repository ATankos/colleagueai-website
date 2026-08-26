const fs = require("fs");
const path = require("path");

const roots = ["dist", "public"];
const locales = ["en", "cs", "de", "fr", "es", "it", "pl", "pt"];
const pages = ["agents", "trust", "partners", "privacy", "terms"];

const badPatterns = [
  /Ã/g,
  /Â/g,
  /�/g,
  /\/sk\//gi,
  /Slovenčina|Slovencina|Slovak/gi,
  /\bTODO\b|\bFIXME\b/g,
  /lorem ipsum/gi,
  /\[object Object\]/g,
  /undefined/g
];

function exists(file) {
  return fs.existsSync(file);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function checkFile(file, errors) {
  if (!exists(file)) {
    errors.push(`Missing file: ${file}`);
    return;
  }

  const html = read(file);

  // audit visible content only — script/style internals are code, not copy
  const visible = html
    .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, " ");

  for (const pattern of badPatterns) {
    const matches = visible.match(pattern);
    if (matches) {
      errors.push(`${file}: found bad pattern ${pattern} (${matches.length})`);
    }
  }

  const langMatch = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
  if (!langMatch) {
    errors.push(`${file}: missing html lang`);
  }

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch || titleMatch[1].trim().length < 5) {
    errors.push(`${file}: missing or weak title`);
  }

  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count < 1) {
    errors.push(`${file}: missing h1`);
  }

  // What this guard is for: a language switcher rendered more than once. What it
  // used to count: every anchor whose href carried ANY locale prefix, the page's
  // own included. On /pl/agents that is 38 links to /pl/... — the page's ordinary
  // navigation, and the more correctly it is localized the closer it creeps to
  // the limit. Measured across the built site, foreign-locale anchors are zero
  // everywhere; the number that kept rising was never switcher duplication.
  //
  // So count only links that leave the page's own language. A switcher offers
  // every other locale, so one copy is (locales - 1) foreign links; the limit
  // below tolerates a header and a footer copy and catches a third.
  // (Today the switcher is a <select>, which has no anchors at all — this guard
  // fires only if one is ever rendered as links again.)
  const own = locales.find((l) => file.split(path.sep).includes(l)) || "en";
  const anchorsOnly = html.replace(/<link\b[^>]*>/gi, "");
  const foreignLanguageHrefs = locales.reduce((sum, locale) => {
    if (locale === own) return sum;
    const re = new RegExp(`href=["'][^"']*\\/${locale}(\\/|["'#?])`, "gi");
    return sum + (anchorsOnly.match(re) || []).length;
  }, 0);

  const LIMIT = 2 * (locales.length - 1);
  if (foreignLanguageHrefs > LIMIT) {
    errors.push(`${file}: possible duplicated language switcher (${foreignLanguageHrefs} links to other languages, limit ${LIMIT})`);
  }
}

const errors = [];

for (const root of roots) {
  if (!exists(root)) continue;

  for (const page of pages) {
    checkFile(path.join(root, `${page}.html`), errors);
  }

  for (const locale of locales) {
    for (const page of pages) {
      const fileA = locale === "en"
        ? path.join(root, "en", `${page}.html`)
        : path.join(root, locale, `${page}.html`);

      const fileB = locale === "en"
        ? path.join(root, "en", page, "index.html")
        : path.join(root, locale, page, "index.html");

      if (exists(fileA)) checkFile(fileA, errors);
      if (exists(fileB)) checkFile(fileB, errors);

      if (!exists(fileA) && !exists(fileB)) {
        errors.push(`Missing localized page: ${root}/${locale}/${page}`);
      }
    }
  }
}

if (errors.length) {
  console.error("\nStatic QA failed:");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}

console.log("Static QA passed");
