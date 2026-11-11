/**
 * lib/legalArchive.js - which exact text a buyer accepted, provable after the page has changed.
 *
 * config/legal.json names the version of each agreement the order confirmation shows. That alone proves which label
 * was accepted, not which words: a page edited without a version bump would silently change what every earlier
 * buyer "accepted". So each version also has
 *   - a fingerprint: SHA-256 of the agreement's text (the page from its <h1> to its footer, tags stripped and
 *     whitespace collapsed, so a changed menu or footer link does not change it, and any changed word does), and
 *   - an archived copy in legal/archive/<document>/<version>.html, listed in legal/archive/manifest.json.
 * The acceptance record stores version, fingerprint and archive path per document (lib/acceptance.js), so any
 * order can be matched to the words in the repository, whatever the live page says later.
 *
 * The archive is append-only. scripts/legal/archive-legal.mjs adds a version once and refuses to store different
 * text under a version that is already archived; tests/legal-archive.test.mjs fails if an archived copy is edited,
 * if a live page no longer matches the fingerprint of its current version, or if a version is listed twice. An
 * amendment therefore needs a new version, and the earlier version stays in the archive for the buyers who
 * accepted it. Nothing here publishes a text: only the pages already live are archived.
 */
import { createHash } from 'node:crypto';

/** The agreement itself: from the page's <h1> up to its <footer> (or the end of <main>). */
export function legalBody(html) {
  const s = String(html ?? '');
  const start = s.search(/<h1[\s>]/i);
  if (start < 0) return '';
  const rest = s.slice(start);
  const end = rest.search(/<footer[\s>]|<\/main>/i);
  return end < 0 ? rest : rest.slice(0, end);
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&middot;': '·', '&rarr;': '→' };

/** The words of an HTML fragment: comments and tags removed, common entities decoded, whitespace collapsed. */
export function legalText(fragment) {
  return String(fragment ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp|middot|rarr);/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
}

export const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

/** Fingerprint of the agreement on a page (or in an archived copy). */
export function legalFingerprint(html) {
  return sha256(legalText(legalBody(html)));
}

/** File-safe form of a version label: "1.0 (2026-07-09)" -> "1.0-2026-07-09". */
export function versionSlug(version) {
  return String(version).replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
}

export const archivePath = (key, version) => `legal/archive/${key}/${versionSlug(version)}.html`;

/** The public page file (relative to the repository root) that holds a document. */
export const pageFile = (doc) => `public/${doc.path === '/license' ? 'license' : doc.path.replace(/^\//, '')}.html`;

/** The archived copy: a short provenance comment, then the agreement exactly as it appears on the page. */
export function archiveDocument({ key, doc, html, archivedAt }) {
  const body = legalBody(html);
  const fingerprint = sha256(legalText(body));
  const header = `<!-- ${doc.title} | document "${key}" | version ${doc.version} | sha256 ${fingerprint} | archived ${archivedAt} from ${pageFile(doc)}.\n` +
    `     Archived copy of the text buyers accepted under this version. Do not edit: an amendment is a new version. -->\n`;
  return { fingerprint, path: archivePath(key, doc.version), content: header + body.trimEnd() + '\n' };
}

/**
 * What the archive script should do for the current config/legal.json: for each document, either nothing (archived,
 * same text), add a new archived version, or refuse (the version is archived with different text). Pure: the caller
 * reads the pages and writes the files.
 */
export function planArchive({ legal, manifest, pages, archivedAt = new Date().toISOString() }) {
  const entries = manifest?.entries ?? [];
  const add = [];
  const refuse = [];
  for (const [key, doc] of Object.entries(legal.documents)) {
    const html = pages[key];
    if (typeof html !== 'string' || !legalBody(html)) { refuse.push({ key, version: doc.version, reason: 'page has no agreement text (<h1> missing)' }); continue; }
    const out = archiveDocument({ key, doc, html, archivedAt });
    const existing = entries.find((e) => e.document === key && e.version === doc.version);
    if (existing) {
      if (existing.sha256 !== out.fingerprint) {
        refuse.push({ key, version: doc.version, reason: `version ${doc.version} is already archived with different text; an amendment needs a new version in config/legal.json` });
      }
      continue;
    }
    add.push({ key, version: doc.version, title: doc.title, sha256: out.fingerprint, path: out.path, content: out.content, archivedAt, source: pageFile(doc) });
  }
  return { add, refuse };
}

/**
 * Everything that must hold between config/legal.json, the manifest, the archived copies and the live pages.
 * Returns a list of problems (empty when consistent). `files` maps a repository path to its content (or undefined).
 */
export function checkArchive({ legal, manifest, files }) {
  const problems = [];
  const entries = manifest?.entries ?? [];
  const seen = new Set();
  for (const e of entries) {
    const id = `${e.document}@${e.version}`;
    if (seen.has(id)) problems.push(`${id} is listed twice in legal/archive/manifest.json`);
    seen.add(id);
    const copy = files[e.path];
    if (typeof copy !== 'string') { problems.push(`${id}: archived copy ${e.path} is missing`); continue; }
    if (legalFingerprint(copy) !== e.sha256) problems.push(`${id}: archived copy ${e.path} was edited (fingerprint changed); archived versions never change`);
  }
  for (const [key, doc] of Object.entries(legal.documents)) {
    const entry = entries.find((e) => e.document === key && e.version === doc.version);
    if (!entry) { problems.push(`${key}@${doc.version} is not archived; run node scripts/legal/archive-legal.mjs`); continue; }
    if (doc.sha256 !== entry.sha256) problems.push(`${key}: config/legal.json sha256 does not match the archive for version ${doc.version}`);
    if (doc.archive !== entry.path) problems.push(`${key}: config/legal.json archive path does not match the manifest`);
    const page = files[pageFile(doc)];
    if (typeof page !== 'string') { problems.push(`${key}: ${pageFile(doc)} is missing`); continue; }
    if (legalFingerprint(page) !== entry.sha256) {
      problems.push(`${key}: the text of ${pageFile(doc)} changed but its version is still ${doc.version}; an amendment needs counsel's approval and a new version, and the old version stays archived`);
    }
  }
  return problems;
}

/**
 * The per-document evidence stored on an acceptance record and an order: { terms: { version, sha256, archive }, ... }.
 * Read from config/legal.json, which the archive test keeps equal to the manifest and the live pages.
 */
export function legalDocumentRecords(legal) {
  return Object.fromEntries(Object.entries(legal.documents).map(([k, d]) => [k, { version: d.version, sha256: d.sha256 ?? null, archive: d.archive ?? null }]));
}
