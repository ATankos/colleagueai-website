"use strict";

const fs = require("fs");
const path = require("path");

const distDirectory = path.join(process.cwd(), "dist");

const cssTag =
  '<link id="cai-mobile-fix-css" rel="stylesheet" href="/colleagueai-mobile-fix.css?v=20260713">';

const jsTag =
  '<script id="cai-mobile-fix-js" src="/colleagueai-mobile-fix.js?v=20260713" defer></script>';

const textRepairs = [
  ["â„¢", "™"],
  ["â€™", "’"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["Â©", "©"],
  ["Â®", "®"],
  ["Â·", "·"],
  ["Ã—", "×"],
  ["Â ", " "]
];

function findFiles(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true
  })) {
    const completePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...findFiles(completePath));
    } else {
      files.push(completePath);
    }
  }

  return files;
}

if (!fs.existsSync(distDirectory)) {
  throw new Error(
    "The dist folder does not exist. The production build did not complete."
  );
}

const htmlFiles = findFiles(distDirectory).filter(function (file) {
  return file.toLowerCase().endsWith(".html");
});

if (htmlFiles.length === 0) {
  throw new Error("No HTML files were found in dist.");
}

let changedFiles = 0;

for (const file of htmlFiles) {
  let html = fs.readFileSync(file, "utf8");
  const original = html;

  for (const replacement of textRepairs) {
    html = html.split(replacement[0]).join(replacement[1]);
  }

  if (!html.includes('id="cai-mobile-fix-css"')) {
    if (!/<\/head>/i.test(html)) {
      throw new Error("Missing closing head tag in " + file);
    }

    html = html.replace(
      /<\/head>/i,
      "  " + cssTag + "\n</head>"
    );
  }

  if (!html.includes('id="cai-mobile-fix-js"')) {
    if (!/<\/body>/i.test(html)) {
      throw new Error("Missing closing body tag in " + file);
    }

    html = html.replace(
      /<\/body>/i,
      "  " + jsTag + "\n</body>"
    );
  }

  if (html !== original) {
    fs.writeFileSync(file, html, "utf8");
    changedFiles += 1;
  }
}

console.log(
  "Responsive patch checked " +
  htmlFiles.length +
  " HTML files and updated " +
  changedFiles +
  "."
);