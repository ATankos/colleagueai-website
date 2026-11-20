#!/usr/bin/env node
/**
 * scripts/legal/publish-archive.mjs - publish every archived agreement version as a page a buyer can open.
 *
 * The acceptance record, the order and the licence agreement confirmation PDF name each accepted document by version,
 * SHA-256 and archived copy (legal/archive/<document>/<version>.html). A buyer must be able to read that exact text
 * later, after the live page has moved on to a newer version. This script writes one page per manifest entry to
 *
 *   public/legal/archive/<document>/<version>.html      ->  https://www.colleagueai.ai/legal/archive/<document>/<version>.html
 *
 * The page wraps the archived fragment unchanged (a header before the <h1>, a footer after the text), so its
 * fingerprint (lib/legalArchive.js legalFingerprint) is the SHA-256 printed on the order documents, and a buyer or an
 * auditor can recompute it. Idempotent: run it after scripts/legal/archive-legal.mjs and in the build;
 * tests/legal-archive.test.mjs checks that every manifest entry has its page and that the fingerprint matches.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { legalFingerprint, versionSlug } from '../../lib/legalArchive.js';

const ROOT = new URL('../../', import.meta.url);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function publishedPath(entry) {
  return `public/legal/archive/${entry.document}/${versionSlug(entry.version)}.html`;
}

export function publishedUrlPath(entry) {
  return `/legal/archive/${entry.document}/${versionSlug(entry.version)}.html`;
}

export function renderArchivePage(entry, fragment) {
  const body = fragment.replace(/^\s*<!--[\s\S]*?-->\s*/, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow">
<title>${esc(entry.title)} - version ${esc(entry.version)} (archived) | ColleagueAI</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/order.css">
</head>
<body>
<header class="o-nav"><div class="o-wrap"><a class="o-logo" href="/" aria-label="ColleagueAI"><span class="o-logo-text">Colleague<span class="ai">AI</span></span></a></div></header>
<main class="o-wrap o-accept">
<p class="o-eyebrow">Archived agreement text</p>
<p class="o-small">This is the <b>${esc(entry.title)}</b>, version <b>${esc(entry.version)}</b>, exactly as buyers accepted it under that version. SHA-256 of the agreement text: <code>${esc(entry.sha256)}</code>. Archived ${esc(String(entry.archivedAt).slice(0, 10))}. It is kept unchanged; the current version is at <a href="/${entry.document === 'licence' ? 'license' : entry.document}">/${entry.document === 'licence' ? 'license' : entry.document}</a>.</p>
<article class="o-card o-text">
${body.trim()}
</article>
</main>
<footer class="o-foot"><div class="o-wrap"><span>&copy; Colleague AI s.r.o., Praha &middot; archived copy, not the current version</span></div></footer>
</body>
</html>
`;
}

export function publishArchive({ root = ROOT, write = true } = {}) {
  const manifest = JSON.parse(readFileSync(new URL('legal/archive/manifest.json', root), 'utf8'));
  const out = [];
  for (const entry of manifest.entries) {
    const fragment = readFileSync(new URL(entry.path, root), 'utf8');
    const page = renderArchivePage(entry, fragment);
    const fp = legalFingerprint(page);
    if (fp !== entry.sha256) throw new Error(`${entry.document}@${entry.version}: published page fingerprint ${fp} differs from the archive ${entry.sha256}`);
    const path = publishedPath(entry);
    if (write) {
      const file = new URL(path, root);
      mkdirSync(dirname(file.pathname), { recursive: true });
      writeFileSync(file, page);
    }
    out.push({ document: entry.document, version: entry.version, path, url: publishedUrlPath(entry), sha256: entry.sha256 });
  }
  return out;
}

const isMain = process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url;
if (isMain) {
  for (const p of publishArchive()) console.log(`${p.path}  ${p.sha256.slice(0, 12)}`);
}
