"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(relativePath) {
  const fullPath =
    path.join(root, relativePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Required file not found: ${relativePath}`
    );
  }

  return {
    relativePath,
    fullPath,
    content: fs.readFileSync(
      fullPath,
      "utf8"
    ),
  };
}

function write(file, content) {
  fs.writeFileSync(
    file.fullPath,
    content,
    "utf8"
  );

  console.log(
    `[buyer-journey] updated ${file.relativePath}`
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
      /&#39;/gi,
      "'"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function matchingSectionEnd(
  html,
  startIndex
) {
  const open =
    /^<section\b[^>]*>/i.exec(
      html.slice(startIndex)
    );

  if (!open) {
    return -1;
  }

  const tokenExpression =
    /<\/?section\b[^>]*>/gi;

  tokenExpression.lastIndex =
    startIndex;

  let depth = 0;
  let token;

  while (
    (token = tokenExpression.exec(html))
  ) {
    if (
      /^<\/section/i.test(token[0])
    ) {
      depth -= 1;
    } else if (
      !/\/>$/.test(token[0])
    ) {
      depth += 1;
    }

    if (depth === 0) {
      return tokenExpression.lastIndex;
    }
  }

  return -1;
}

function topLevelSections(html) {
  const sections = [];

  const sectionExpression =
    /<section\b[^>]*>/gi;

  let match;

  while (
    (match = sectionExpression.exec(html))
  ) {
    const start = match.index;

    const end =
      matchingSectionEnd(
        html,
        start
      );

    if (end < 0) {
      throw new Error(
        `Unclosed section found near character ${start}`
      );
    }

    const block =
      html.slice(start, end);

    const text =
      stripTags(
        block.slice(0, 5000)
      );

    sections.push({
      start,
      end,
      block,
      text,
    });

    sectionExpression.lastIndex =
      end;
  }

  return sections;
}

function classifyAgentSection(section) {
  const text =
    section.text;

  if (
    /The catalogue/i.test(text) &&
    /36 (?:governed )?agent/i.test(text)
  ) {
    return "catalogue";
  }

  if (
    /How they fit/i.test(text)
  ) {
    return "processes";
  }

  if (
    /What you're buying|What every agent package includes/i
      .test(text)
  ) {
    return "package";
  }

  if (
    /Build your business case/i.test(text)
  ) {
    return "roi";
  }

  if (
    /Deployment & safety/i.test(text)
  ) {
    return "deployment";
  }

  if (
    /Enterprise architecture/i.test(text)
  ) {
    return "architecture";
  }

  if (
    /How audit-ready is your AI/i.test(text)
  ) {
    return "readiness";
  }

  if (
    /Questions, answered/i.test(text)
  ) {
    return "faq";
  }

  if (
    /The philosophy/i.test(text)
  ) {
    return "philosophy";
  }

  if (
    /Why trust us/i.test(text)
  ) {
    return "whyTrust";
  }

  if (
    /The CAI Score/i.test(text) &&
    /Five levels|Five tiers/i.test(text)
  ) {
    return "score";
  }

  return null;
}

function reorderAgentsPage(html) {
  const sections =
    topLevelSections(html);

  const byKind =
    new Map();

  for (const section of sections) {
    const kind =
      classifyAgentSection(section);

    if (
      kind &&
      !byKind.has(kind)
    ) {
      byKind.set(
        kind,
        section
      );
    }
  }

  /*
   * Commercial buyer journey first.
   * Detailed philosophy and score methodology
   * remain intact but move after the core journey.
   */
  const required = [
    "catalogue",
    "processes",
    "package",
    "roi",
    "deployment",
    "readiness",
    "faq",
    "philosophy",
    "whyTrust",
    "score",
  ];

  const missing =
    required.filter(
      (kind) =>
        !byKind.has(kind)
    );

  if (missing.length > 0) {
    throw new Error(
      `Agents sections not found: ${missing.join(", ")}`
    );
  }

  const selectedSections =
    required.map(
      (kind) =>
        byKind.get(kind)
    );

  const insertionIndex =
    Math.min(
      ...selectedSections.map(
        (section) =>
          section.start
      )
    );

  const markers =
    new Map();

  let working =
    html;

  selectedSections.forEach(
    (section, index) => {
      const kind =
        required[index];

      const marker =
        `<!-- CAI-BUYER-JOURNEY-${kind.toUpperCase()} -->`;

      markers.set(
        kind,
        marker
      );

      working =
        working.replace(
          section.block,
          marker
        );
    }
  );

  const markerIndexes =
    Array
      .from(markers.values())
      .map(
        (marker) =>
          working.indexOf(marker)
      )
      .filter(
        (index) =>
          index >= 0
      );

  const safeInsertionIndex =
    markerIndexes.length > 0
      ? Math.min(...markerIndexes)
      : insertionIndex;

  for (
    const marker
    of markers.values()
  ) {
    working =
      working.replace(
        marker,
        ""
      );
  }

  const ordered =
    required
      .map((kind) => {
        const originalBlock =
          byKind.get(kind).block;

        const cleanBlock =
          originalBlock.replace(
            /\sdata-cai-buyer-section=["'][^"']+["']/i,
            ""
          );

        return cleanBlock.replace(
          /<section\b/i,
          `<section data-cai-buyer-section="${kind}"`
        );
      })
      .join("\n");

  return (
    working.slice(
      0,
      safeInsertionIndex
    ) +
    ordered +
    working.slice(
      safeInsertionIndex
    )
  );
}

function moveTrustGuideAfterHero(html) {
  /*
   * Verified public/trust.html structure:
   *
   *   <section id="trust-page-guide">...</section>
   *   <main>
   *     <nav class="crumb">...</nav>
   *     <div class="eyebrow">Trust Center ...</div>
   *     <h1>The evidence, in one place.</h1>
   *     <p>...</p>
   *
   * The hero is not a section. Move the guide by its
   * explicit ID and place it after the hero intro.
   */

  const guideMatch =
    /<section\b[^>]*\bid=["']trust-page-guide["'][^>]*>/i
      .exec(html);

  if (!guideMatch) {
    throw new Error(
      "Trust guide with id=trust-page-guide was not found"
    );
  }

  const guideStart =
    guideMatch.index;

  const guideEnd =
    matchingSectionEnd(
      html,
      guideStart
    );

  if (guideEnd < 0) {
    throw new Error(
      "Trust guide section is not properly closed"
    );
  }

  const guide =
    html.slice(
      guideStart,
      guideEnd
    );

  let working =
    html.slice(
      0,
      guideStart
    ) +
    html.slice(
      guideEnd
    );

  const mainMatch =
    /<main\b[^>]*>/i.exec(
      working
    );

  if (!mainMatch) {
    throw new Error(
      "Trust main element was not found"
    );
  }

  const mainContentStart =
    mainMatch.index +
    mainMatch[0].length;

  const heroMatch =
    /<h1\b[^>]*>\s*The evidence,\s*in one place\.\s*<\/h1>/i
      .exec(
        working.slice(
          mainContentStart
        )
      );

  if (!heroMatch) {
    throw new Error(
      "Verified Trust hero heading was not found"
    );
  }

  const heroEnd =
    mainContentStart +
    heroMatch.index +
    heroMatch[0].length;

  const introMatch =
    /<p\b[^>]*>[\s\S]*?<\/p>/i
      .exec(
        working.slice(
          heroEnd
        )
      );

  if (!introMatch) {
    throw new Error(
      "Trust hero introduction paragraph was not found"
    );
  }

  const insertAt =
    heroEnd +
    introMatch.index +
    introMatch[0].length;

  return (
    working.slice(
      0,
      insertAt
    ) +
    "\n\n" +
    guide +
    "\n\n" +
    working.slice(
      insertAt
    )
  );
}

function patchHome() {
  const file =
    read(
      "public/home.html"
    );

  let html =
    file.content;

  /*
   * The real home source contains the old claim
   * in both document metadata and the visible H1.
   *
   * Verified source H1:
   * <h1>AI agents your auditors<br>will actually <em>sign off</em>.</h1>
   */

  html =
    html.replaceAll(
      "ColleagueAI | Governed AI agents your auditors will sign off",
      "ColleagueAI | Governed AI agents designed for enterprise approval"
    );

  html =
    html.replace(
      /<h1>\s*AI agents your auditors\s*<br\s*\/?>\s*will actually\s*<em>\s*sign off\s*<\/em>\s*\.\s*<\/h1>/i,
      "<h1>Governed AI agents<br>designed for enterprise approval.</h1>"
    );

  /*
   * Fallback for a generated/source variant that
   * removes the emphasis element.
   */

  html =
    html.replace(
      /<h1>\s*AI agents your auditors\s*<br\s*\/?>\s*will actually\s+sign off\s*\.\s*<\/h1>/i,
      "<h1>Governed AI agents<br>designed for enterprise approval.</h1>"
    );

  html =
    html.replace(
      /Most-adopted packages this quarter\./gi,
      "Featured agent packages."
    );

  html =
    html.replace(
      /Most adopted packages this quarter\./gi,
      "Featured agent packages."
    );

  /*
   * Validate the visible body independently from
   * page metadata so title content cannot create a
   * false-positive hero validation failure.
   */

  const visibleHtml =
    html.replace(
      /<head\b[\s\S]*?<\/head>/i,
      " "
    );

  const visibleText =
    stripTags(
      visibleHtml
    );

  if (
    /AI agents your auditors\s+will actually\s+sign off/i
      .test(visibleText)
  ) {
    throw new Error(
      "Visible homepage auditor-approval claim remains after replacement"
    );
  }

  if (
    /Most[- ]adopted packages this quarter/i
      .test(visibleText)
  ) {
    throw new Error(
      "Visible homepage adoption claim remains after replacement"
    );
  }

  if (
    /Governed AI agents your auditors will sign off/i
      .test(html)
  ) {
    throw new Error(
      "Homepage metadata still contains the old auditor-approval claim"
    );
  }

  if (
    !/Governed AI agents designed for enterprise approval/i
      .test(visibleText)
  ) {
    throw new Error(
      "New homepage enterprise-approval hero was not found"
    );
  }

  if (
    !/Featured agent packages/i
      .test(visibleText)
  ) {
    throw new Error(
      "New featured-agent heading was not found"
    );
  }

  write(
    file,
    html
  );
}

function patchAgents() {
  const file =
    read(
      "public/agents.html"
    );

  const updated =
    reorderAgentsPage(
      file.content
    );

  write(
    file,
    updated
  );
}

function patchTrust() {
  const file =
    read(
      "public/trust.html"
    );

  const updated =
    moveTrustGuideAfterHero(
      file.content
    );

  write(
    file,
    updated
  );
}

function patchDesignNavigation() {
  const file =
    read(
      "public/colleagueai-design-system.js"
    );

  let content =
    file.content;

  /*
   * Book a demo is the primary contact action.
   * Remove duplicate Contact from primary navigation.
   */
  content =
    content.replace(
      /\n\s*\{\s*key:\s*"contact",\s*href:\s*`\$\{route\("\/"\)\}#contact`\s*\},?/m,
      ""
    );

  const catalogueLabels = {
    en: "Agents",
    cs: "Agenti",
    de: "Agenten",
    fr: "Agents",
    es: "Agentes",
    it: "Agenti",
    pl: "Agenci",
    pt: "Agentes",
  };

  for (
    const [locale, label]
    of Object.entries(
      catalogueLabels
    )
  ) {
    const localeExpression =
      new RegExp(
        `(\\b${locale}:\\s*\\{[\\s\\S]*?\\bcatalogue:\\s*)"[^"]+"`
      );

    if (
      !localeExpression.test(content)
    ) {
      throw new Error(
        `Navigation label block not found for locale: ${locale}`
      );
    }

    content =
      content.replace(
        localeExpression,
        `$1"${label}"`
      );
  }

  if (
    /key:\s*"contact"/
      .test(content)
  ) {
    throw new Error(
      "Contact still appears in the global primary navigation configuration"
    );
  }

  write(
    file,
    content
  );
}

patchHome();
patchAgents();
patchTrust();
patchDesignNavigation();

console.log(
  "Buyer journey refactor completed."
);