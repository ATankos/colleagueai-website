const fs = require("fs");
const path = require("path");
const { SUPPORTED_LOCALE_CODES, MARKETING_PAGES } = require("./i18n/config.cjs");

const markers = [
  "In a category built on trust",
  "The CAI Score methodology",
  "Architecture: where agents run",
  "Subprocessors",
  "Security practices",
  "Pilot programme",
  "Approved partners can refer",
  "Three steps. Approved partner process.",
  "Enter your name and email",
  "When they buy any agent through your link",
  "Common questions, direct answers.",
  "Ready to bring enterprise AI"
];

function read(file) {
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
}

const failures = [];

for (const page of MARKETING_PAGES) {
  for (const locale of SUPPORTED_LOCALE_CODES.filter((code) => code !== "en")) {
    for (const file of [
      path.join("public", locale, page + ".html"),
      path.join("public", locale, page, "index.html")
    ]) {
      const html = read(file);

      if (!html) {
        failures.push(file + ": missing localized marketing page");
        continue;
      }

      const found = markers.filter((marker) => html.includes(marker));

      if (found.length) {
        failures.push(file + ": English body markers remain: " + found.join(" | "));
      }
    }
  }
}

if (failures.length) {
  console.error("Marketing language architecture audit failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Marketing language architecture audit passed.");
