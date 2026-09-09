const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SITE = "https://www.colleagueai.ai";

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "scripts", "authority", "authority-pages.json"),
    "utf8"
  )
);

const DEFAULT = manifest.defaultLocale;

function pagePath(locale, key) {
  const page = manifest.pages[key];

  if (!page) {
    throw new Error("Unknown authority page: " + key);
  }

  const slug = page.slugs[locale];

  if (!slug) {
    throw new Error(
      "Missing slug for " + key + " / " + locale
    );
  }

  if (locale === DEFAULT) {
    return "/insights/" + slug;
  }

  return "/" + locale + "/insights/" + slug;
}

function alternates(key) {
  const lines = [];

  lines.push(
    '    <xhtml:link rel="alternate" hreflang="x-default" href="' +
      SITE +
      pagePath(DEFAULT, key) +
      '"/>'
  );

  for (const locale of manifest.locales) {
    lines.push(
      '    <xhtml:link rel="alternate" hreflang="' +
        locale +
        '" href="' +
        SITE +
        pagePath(locale, key) +
        '"/>'
    );
  }

  return lines.join("\n");
}

function block(locale, key) {
  const loc = SITE + pagePath(locale, key);

  return [
    "  <url>",
    "    <loc>" + loc + "</loc>",
    alternates(key),
    "    <changefreq>monthly</changefreq>",
    "    <priority>0.8</priority>",
    "  </url>"
  ].join("\n");
}

function removeExistingAuthorityBlocks(xml) {
  const URL_BLOCK = /<url>[\s\S]*?<\/url>/g;

  return xml.replace(URL_BLOCK, (block) => {
    const match = block.match(/<loc>([^<]+)<\/loc>/);

    if (!match) {
      return block;
    }

    const loc = match[1].trim();

    const isAuthority =
      /^https:\/\/www\.colleagueai\.ai\/(?:[a-z]{2}\/)?insights\/[^/]+$/.test(loc);

    return isAuthority ? "" : block;
  });
}

function updateSitemap(file) {
  if (!fs.existsSync(file)) {
    console.log(
      "[authority-sitemap] skip missing " +
        path.relative(ROOT, file)
    );
    return;
  }

  let xml = fs.readFileSync(file, "utf8");

  if (!xml.includes("<urlset")) {
    throw new Error(
      "Invalid sitemap, missing <urlset>: " + file
    );
  }

  if (!xml.includes("</urlset>")) {
    throw new Error(
      "Invalid sitemap, missing </urlset>: " + file
    );
  }

  if (!xml.includes('xmlns:xhtml=')) {
    throw new Error(
      "Sitemap missing xhtml namespace: " + file
    );
  }

  xml = removeExistingAuthorityBlocks(xml);

  const blocks = [];

  for (const key of Object.keys(manifest.pages)) {
    for (const locale of manifest.locales) {
      blocks.push(block(locale, key));
    }
  }

  xml = xml.replace(
    "</urlset>",
    "\n" + blocks.join("\n") + "\n</urlset>"
  );

  fs.writeFileSync(file, xml, "utf8");

  console.log(
    "[authority-sitemap] " +
      path.relative(ROOT, file) +
      ": added " +
      blocks.length +
      " authority URLs"
  );
}

for (const rel of [
  "public/sitemap.xml",
  "dist/sitemap.xml"
]) {
  updateSitemap(path.join(ROOT, rel));
}