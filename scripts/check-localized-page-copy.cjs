const fs = require("fs");

const locales = ["cs","de","fr","es","it","pl","pt"];
const leakTokens = [
  "TRUST PAGE GUIDE",
  "Use this page to review the operating model behind ColleagueAI",
  "Security model",
  "Data handling",
  "AI governance",
  "Telemetry and privacy",
  "Launch gate",
  "Partner interest",
  "Choose your path",
  "I need an AI agent use case",
  "I need governance assurance",
  "I want to partner",
  "Partner interest, not automatic affiliate approval",
  "Use this page to register interest",
  "Register interest",
  "Review agent packages",
  "Review trust architecture"
];
const failures = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + "/" + entry.name;
    if (entry.isDirectory()) out.push(...walk(p));
    if (entry.isFile() && p.endsWith(".html")) out.push(p);
  }
  return out;
}

for (const locale of locales) {
  const files = walk("public/" + locale);
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    for (const token of leakTokens) {
      if (html.includes(token)) failures.push({ locale, file, token });
    }
  }
}

if (failures.length) {
  console.error("Localized page copy leakage detected:");
  console.table(failures);
  process.exit(1);
}

console.log("Localized page copy check passed.");
