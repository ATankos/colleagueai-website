const fs = require("fs");
const path = require("path");

const file = path.resolve(
  process.cwd(),
  "scripts/authority/authority-pages.json"
);

const data = JSON.parse(fs.readFileSync(file, "utf8"));

const REQUIRED_LOCALES = [
  "en",
  "cs",
  "de",
  "fr",
  "es",
  "it",
  "pl",
  "pt"
];

const REQUIRED_PAGES = [
  "ai-agent-governance-framework",
  "human-oversight-ai-agents",
  "enterprise-ai-agents-microsoft"
];

const failures = [];

if (data.defaultLocale !== "en") {
  failures.push("defaultLocale must be en");
}

for (const locale of REQUIRED_LOCALES) {
  if (!data.locales.includes(locale)) {
    failures.push("missing locale: " + locale);
  }
}

for (const key of REQUIRED_PAGES) {
  const page = data.pages[key];

  if (!page) {
    failures.push("missing page: " + key);
    continue;
  }

  if (page.section !== "insights") {
    failures.push(key + ": section must be insights");
  }

  for (const locale of REQUIRED_LOCALES) {
    const slug = page.slugs && page.slugs[locale];
    const identity = page.identity && page.identity[locale];

    if (!slug) {
      failures.push(key + ": missing slug for " + locale);
    }

    if (!identity) {
      failures.push(key + ": missing identity for " + locale);
      continue;
    }

    for (const field of ["title", "h1", "description"]) {
      if (!identity[field] || !identity[field].trim()) {
        failures.push(
          key + ": missing " + field + " for " + locale
        );
      }
    }
  }

  const links = page.authorityLinks || [];

  for (const required of [
    "/score",
    "/trust",
    "/certified",
    "/agents"
  ]) {
    if (!links.includes(required)) {
      failures.push(
        key + ": missing authority link " + required
      );
    }
  }
}

if (failures.length) {
  console.error("");
  console.error("Authority manifest validation FAILED:");
  for (const failure of failures) {
    console.error(" - " + failure);
  }
  process.exitCode = 1;
} else {
  console.log(
    "PASS: Authority manifest has 3 pages x 8 locales."
  );
}