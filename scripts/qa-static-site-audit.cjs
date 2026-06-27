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
  const visible = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");

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

  const languageHrefCount = locales.reduce((sum, locale) => {
    const re = new RegExp(`href=["'][^"']*\\/${locale}(\\/|["'#?])`, "gi");
    return sum + (html.match(re) || []).length;
  }, 0);

  if (languageHrefCount > 30) {
    errors.push(`${file}: possible duplicated language links (${languageHrefCount})`);
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
