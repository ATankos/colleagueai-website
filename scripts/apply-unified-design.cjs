"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

const cssName =
  "colleagueai-design-system.css";

const jsName =
  "colleagueai-design-system.js";

if (!fs.existsSync(distDir)) {
  throw new Error(
    `Build output not found: ${distDir}`
  );
}

for (const fileName of [cssName, jsName]) {
  const source =
    path.join(publicDir, fileName);

  const target =
    path.join(distDir, fileName);

  if (!fs.existsSync(source)) {
    throw new Error(
      `Missing design asset: ${source}`
    );
  }

  fs.copyFileSync(source, target);
}

function walk(directory) {
  return fs
    .readdirSync(
      directory,
      { withFileTypes: true }
    )
    .flatMap((entry) => {
      const fullPath =
        path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return walk(fullPath);
      }

      return [fullPath];
    });
}

function repairEncoding(html) {
  const replacements = [
    [
      new RegExp(
        "\\u00e2\\u201e\\u00a2",
        "g"
      ),
      "\u2122"
    ],
    [
      new RegExp(
        "\\u00e2\\u20ac\\u2122",
        "g"
      ),
      "\u2019"
    ],
    [
      new RegExp(
        "\\u00e2\\u20ac\\u0153",
        "g"
      ),
      "\u201c"
    ],
    [
      new RegExp(
        "\\u00e2\\u20ac\\u009d",
        "g"
      ),
      "\u201d"
    ],
    [
      new RegExp(
        "\\u00e2\\u20ac\\u201c",
        "g"
      ),
      "\u2013"
    ],
    [
      new RegExp(
        "\\u00e2\\u20ac\\u201d",
        "g"
      ),
      "\u2014"
    ],
    [
      new RegExp(
        "\\u00c2\\u00a9",
        "g"
      ),
      "\u00a9"
    ],
    [
      new RegExp(
        "\\u00c2\\u00ae",
        "g"
      ),
      "\u00ae"
    ],
    [
      new RegExp(
        "\\u00c2\\u00b7",
        "g"
      ),
      "\u00b7"
    ]
  ];

  for (
    const [pattern, replacement]
    of replacements
  ) {
    html = html.replace(
      pattern,
      replacement
    );
  }

  return html;
}

const cssTag =
  `<link id="cai-unified-design-css" rel="stylesheet" href="/${cssName}">`;

const jsTag =
  `<script id="cai-unified-design-js" src="/${jsName}" defer></script>`;

let changed = 0;

const htmlFiles = walk(distDir)
  .filter((file) => {
    return file
      .toLowerCase()
      .endsWith(".html");
  });

for (const htmlFile of htmlFiles) {
  let html = fs.readFileSync(
    htmlFile,
    "utf8"
  );

  html = repairEncoding(html)
    .replace(
      /<link[^>]+(?:colleagueai-mobile-fix|colleagueai-responsive-fix|colleagueai-design-system)[^>]*>\s*/gi,
      ""
    )
    .replace(
      /<script[^>]+(?:colleagueai-mobile-fix|colleagueai-responsive-fix|colleagueai-design-system)[^>]*><\/script>\s*/gi,
      ""
    );

  if (!/<meta\s+charset=/i.test(html)) {
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(
        /<head([^>]*)>/i,
        `<head$1>\n<meta charset="utf-8">`
      );
    } else {
      html =
        `<head><meta charset="utf-8"></head>\n${html}`;
    }
  }

  if (/<\/head\s*>/i.test(html)) {
    html = html.replace(
      /<\/head\s*>/i,
      `${cssTag}\n</head>`
    );
  } else if (/<body[^>]*>/i.test(html)) {
    html = html.replace(
      /<body([^>]*)>/i,
      `${cssTag}\n<body$1>`
    );
  } else {
    html = `${cssTag}\n${html}`;
  }

  if (/<\/body\s*>/i.test(html)) {
    html = html.replace(
      /<\/body\s*>/i,
      `${jsTag}\n</body>`
    );
  } else if (/<\/html\s*>/i.test(html)) {
    html = html.replace(
      /<\/html\s*>/i,
      `${jsTag}\n</html>`
    );
  } else {
    html = `${html}\n${jsTag}\n`;
  }

  fs.writeFileSync(
    htmlFile,
    html,
    "utf8"
  );

  changed += 1;
}

if (changed === 0) {
  throw new Error(
    "No generated HTML files were found."
  );
}

console.log(
  `Unified design injected into ${changed} HTML files.`
);