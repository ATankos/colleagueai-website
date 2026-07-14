"use strict";

const fs = require("fs");
const path = require("path");

const root =
  process.cwd();

function read(relativePath) {
  const fullPath =
    path.join(
      root,
      relativePath
    );

  if (
    !fs.existsSync(fullPath)
  ) {
    throw new Error(
      `Required generated file not found: ${relativePath}`
    );
  }

  return fs.readFileSync(
    fullPath,
    "utf8"
  );
}

function stripTags(value) {
  return String(value)
    .replace(
      /<script\b[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(
      /<style\b[\s\S]*?<\/style>/gi,
      " "
    )
    .replace(
      /<[^>]+>/g,
      " "
    )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

const home =
  read(
    "dist/home.html"
  );

const agents =
  read(
    "dist/agents.html"
  );

const trust =
  read(
    "dist/trust.html"
  );

const design =
  read(
    "public/colleagueai-design-system.js"
  );

const homeText =
  stripTags(home);

const agentsText =
  stripTags(agents);

const trustText =
  stripTags(trust);

const errors = [];

if (
  /AI agents your auditors\s+will actually sign off/i
    .test(homeText)
) {
  errors.push(
    "Homepage still contains the auditor sign-off claim"
  );
}

if (
  /Most-adopted packages this quarter/i
    .test(homeText)
) {
  errors.push(
    "Homepage still contains the unsupported adoption claim"
  );
}

const expectedAgentOrder = [
  "catalogue",
  "processes",
  "package",
  "roi",
  "deployment",
  "readiness",
  "faq",
  "philosophy",
  "whyTrust",
  "score"
];

const actualAgentOrder =
  Array.from(
    agents.matchAll(
      /<section\b[^>]*\bdata-cai-buyer-section=["']([^"']+)["']/gi
    )
  )
    .map(
      (match) => match[1]
    );

if (
  actualAgentOrder.length !==
  expectedAgentOrder.length
) {
  errors.push(
    `Agents structural section count is wrong. Expected ${expectedAgentOrder.length}, found ${actualAgentOrder.length}. Actual order: ${actualAgentOrder.join(" -> ")}`
  );
} else {
  for (
    let index = 0;
    index < expectedAgentOrder.length;
    index += 1
  ) {
    if (
      actualAgentOrder[index] !==
      expectedAgentOrder[index]
    ) {
      errors.push(
        `Agents structural order mismatch at position ${index + 1}. Expected ${expectedAgentOrder[index]}, found ${actualAgentOrder[index]}. Actual order: ${actualAgentOrder.join(" -> ")}`
      );

      break;
    }
  }
}

const trustHero =
  trustText.indexOf(
    "Trust Center"
  );

const trustGuide =
  trustText.indexOf(
    "Trust page guide"
  );

if (
  trustHero < 0 ||
  trustGuide < 0
) {
  errors.push(
    "Trust hero or guide text is missing"
  );
} else if (
  trustGuide <
  trustHero
) {
  errors.push(
    "Trust guide still appears before the Trust hero"
  );
}

if (
  /key:\s*"contact"/
    .test(design)
) {
  errors.push(
    "Contact still appears in global primary navigation"
  );
}

const routes =
  JSON.parse(
    read(
      "i18n.routes.json"
    )
  );

for (
  const locale
  of routes.locales
) {
  const slug =
    routes
      .slugs
      .agents[locale];

  const candidates =
    locale === routes.defaultLocale
      ? [
          `dist/${slug}.html`,
          `dist/${slug}/index.html`,
        ]
      : [
          `dist/${locale}/${slug}.html`,
          `dist/${locale}/${slug}/index.html`,
          `dist/${locale}/agents.html`,
          `dist/${locale}/agents/index.html`,
        ];

  const found =
    candidates.some(
      (relativePath) =>
        fs.existsSync(
          path.join(
            root,
            relativePath
          )
        )
    );

  if (
    !found
  ) {
    errors.push(
      `Generated agents route missing for locale: ${locale}`
    );
  }
}

if (
  errors.length > 0
) {
  console.error(
    errors.join("\n")
  );

  process.exit(1);
}

console.log(
  "Buyer journey validation passed."
);