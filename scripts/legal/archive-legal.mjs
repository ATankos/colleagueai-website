#!/usr/bin/env node
/**
 * scripts/legal/archive-legal.mjs - archive the agreement versions named in config/legal.json (lib/legalArchive.js).
 *
 *   node scripts/legal/archive-legal.mjs           add any version not yet archived, record its fingerprint
 *   node scripts/legal/archive-legal.mjs --check   change nothing; exit 1 if anything is inconsistent
 *
 * Run it in the same change that publishes a new, counsel-approved version of an agreement (after bumping its
 * version and pageMarker in config/legal.json). It never overwrites: a version already archived with different
 * text is refused, and earlier versions are kept for the buyers who accepted them.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { planArchive, checkArchive, pageFile } from '../../lib/legalArchive.js';

const ROOT = new URL('../../', import.meta.url);
const at = (p) => new URL(p, ROOT);
const read = (p) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8') : undefined);
const MANIFEST = 'legal/archive/manifest.json';

const legal = JSON.parse(read('config/legal.json'));
const manifest = read(MANIFEST) ? JSON.parse(read(MANIFEST)) : { _comment: '', entries: [] };
const pages = Object.fromEntries(Object.entries(legal.documents).map(([k, d]) => [k, read(pageFile(d))]));

function filesFor(m) {
  const files = {};
  for (const e of m.entries) files[e.path] = read(e.path);
  for (const d of Object.values(legal.documents)) files[pageFile(d)] = read(pageFile(d));
  return files;
}

if (process.argv.includes('--check')) {
  const problems = checkArchive({ legal, manifest, files: filesFor(manifest) });
  for (const p of problems) console.error(`legal archive: ${p}`);
  console.log(problems.length ? `legal archive: ${problems.length} problem(s)` : 'legal archive: consistent');
  process.exit(problems.length ? 1 : 0);
}

const { add, refuse } = planArchive({ legal, manifest, pages });
if (refuse.length) {
  for (const r of refuse) console.error(`refused ${r.key}@${r.version}: ${r.reason}`);
  process.exit(1);
}
for (const a of add) {
  mkdirSync(dirname(at(a.path).pathname), { recursive: true });
  writeFileSync(at(a.path), a.content, { flag: 'wx' });
  manifest.entries.push({ document: a.key, title: a.title, version: a.version, sha256: a.sha256, path: a.path, source: a.source, archivedAt: a.archivedAt });
  legal.documents[a.key].sha256 = a.sha256;
  legal.documents[a.key].archive = a.path;
  console.log(`archived ${a.key}@${a.version} -> ${a.path} (sha256 ${a.sha256.slice(0, 16)}…)`);
}
manifest._comment = 'Append-only list of every agreement version buyers could accept, with the SHA-256 of its text and its archived copy. Written by scripts/legal/archive-legal.mjs; checked by tests/legal-archive.test.mjs. Never edit or remove an entry: an amendment is a new version.';
mkdirSync(dirname(at(MANIFEST).pathname), { recursive: true });
writeFileSync(at(MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(at('config/legal.json'), JSON.stringify(legal, null, 2) + '\n');
if (!add.length) console.log('legal archive: nothing new to archive');
