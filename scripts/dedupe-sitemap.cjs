#!/usr/bin/env node
/**
 * scripts/dedupe-sitemap.cjs — one <url> block per URL.
 *
 * Six scripts append to the same sitemap during a build. Each has its own idea
 * of what an entry looks like, and the dedupe checks that exist compare whole
 * blocks, so two entries for the same page that differ only by a space before
 * the self-closing slash both survive. The result: 305 <url> blocks for 129
 * URLs, with the eight catalogue pages repeated 23 times each.
 *
 * Rather than teach six generators to agree, this runs last and keeps one block
 * per <loc>. It keeps the richest one — the block carrying the most hreflang
 * alternates — so consolidating never loses locale signals. Ties keep the first.
 *
 * Idempotent: running it on an already-clean sitemap changes nothing.
 */
const fs = require("fs");
const path = require("path");

const FILES = ["public/sitemap.xml", "dist/sitemap.xml"];
const URL_BLOCK = /<url>[\s\S]*?<\/url>/g;
const LOC = /<loc>([^<]+)<\/loc>/;
const ALTERNATE = /<xhtml:link\b/g;

function countAlternates(block) {
  return (block.match(ALTERNATE) || []).length;
}

function dedupe(xml) {
  const blocks = xml.match(URL_BLOCK) || [];
  if (!blocks.length) return { xml, before: 0, after: 0 };

  /** loc -> the best block seen for it, in first-seen order */
  const best = new Map();
  for (const block of blocks) {
    const m = block.match(LOC);
    if (!m) continue;                       // malformed entry: drop rather than duplicate
    const loc = m[1].trim();
    const current = best.get(loc);
    if (!current || countAlternates(block) > countAlternates(current)) {
      best.set(loc, block);
    }
  }

  const kept = [...best.values()];
  // Rebuild the body between <urlset ...> and </urlset>, leaving the header,
  // any namespace declarations and the closing tag exactly as they were.
  const open = xml.indexOf(">", xml.indexOf("<urlset")) + 1;
  const close = xml.lastIndexOf("</urlset>");
  if (open <= 0 || close < 0) return { xml, before: blocks.length, after: blocks.length };

  const body = "\n" + kept.join("\n") + "\n";
  return { xml: xml.slice(0, open) + body + xml.slice(close), before: blocks.length, after: kept.length };
}

let touched = 0;
for (const rel of FILES) {
  const file = path.join(process.cwd(), rel);
  if (!fs.existsSync(file)) continue;

  const original = fs.readFileSync(file, "utf8");
  const { xml, before, after } = dedupe(original);

  if (before === after) {
    console.log(`[sitemap] ${rel}: ${after} urls, already unique`);
    continue;
  }

  // Never let a dedupe lose a URL that was in the file.
  const locsBefore = new Set([...original.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
  const locsAfter = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
  const lost = [...locsBefore].filter((l) => !locsAfter.has(l));
  if (lost.length) {
    console.error(`[sitemap] ${rel}: refusing to write — would drop ${lost.length} url(s), e.g. ${lost[0]}`);
    process.exitCode = 1;
    continue;
  }

  fs.writeFileSync(file, xml, "utf8");
  touched++;
  console.log(`[sitemap] ${rel}: ${before} url blocks -> ${after} (${locsAfter.size} unique urls)`);
}

if (!touched) console.log("[sitemap] nothing to change");
