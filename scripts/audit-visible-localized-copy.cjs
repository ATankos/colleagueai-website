const fs = require("fs");

const LOCALES = ["cs","de","fr","es","it","pl","pt"];
const DISALLOWED = [
  "FIRST-PARTY INTERACTIVE PROOF",
  "See how a governed agent turns",
  "This static walkthrough uses",
  "No third-party demo platform",
  "Sample case",
  "Detect the exception",
  "The agent identifies that the payment",
  "Evidence generated",
  "Variance amount and source record IDs",
  "Timestamped exception classification",
  "CAI L3 handling requirement",
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

function stripNonVisible(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

for (const locale of LOCALES) {
  for (const file of walk("public/" + locale)) {
    const visible = stripNonVisible(fs.readFileSync(file, "utf8"));
    for (const token of DISALLOWED) {
      if (visible.includes(token)) failures.push({ locale, file, token });
    }
  }
}

if (failures.length) {
  console.error("Visible localized copy audit failed:");
  console.table(failures);
  process.exit(1);
}

console.log("Visible localized copy audit passed.");
