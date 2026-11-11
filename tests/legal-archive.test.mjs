/**
 * tests/legal-archive.test.mjs - an accepted agreement can always be produced word for word (PR D).
 *
 * - every archived version is still in the repository, unedited (its fingerprint is unchanged);
 * - each live legal page matches the fingerprint of the version the order confirmation names, so a page cannot be
 *   edited without a new version;
 * - an amendment adds a version and keeps the earlier one (drill on in-memory files, nothing is published);
 * - the order confirmation shows each version with its fingerprint, links only the English texts that are recorded,
 *   says the Microsoft platform is billed separately, and offers no certification.
 * Usage: node --test tests/legal-archive.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import {
  legalBody, legalText, legalFingerprint, planArchive, checkArchive, pageFile, archivePath, versionSlug, legalDocumentRecords,
} from '../lib/legalArchive.js';
import { renderAcceptancePage, legalDocuments } from '../lib/acceptance.js';

const ROOT = new URL('..', import.meta.url);
const read = (p) => (existsSync(new URL(p, ROOT)) ? readFileSync(new URL(p, ROOT), 'utf8') : undefined);
const LEGAL = JSON.parse(read('config/legal.json'));
const MANIFEST = JSON.parse(read('legal/archive/manifest.json'));

function repoFiles() {
  const files = {};
  for (const e of MANIFEST.entries) files[e.path] = read(e.path);
  for (const d of Object.values(LEGAL.documents)) files[pageFile(d)] = read(pageFile(d));
  return files;
}

test('the archive, config/legal.json and the live legal pages agree', () => {
  assert.deepEqual(checkArchive({ legal: LEGAL, manifest: MANIFEST, files: repoFiles() }), []);
});

test('every document a buyer accepts has a version, a fingerprint and an archived copy', () => {
  for (const [k, d] of Object.entries(LEGAL.documents)) {
    assert.match(d.sha256, /^[0-9a-f]{64}$/, k);
    assert.equal(d.archive, archivePath(k, d.version));
    assert.ok(read(d.archive), `${d.archive} exists`);
  }
  assert.deepEqual(legalDocuments(), legalDocumentRecords(LEGAL));
});

test('an archived copy that is edited, removed or listed twice is reported', () => {
  const [first] = MANIFEST.entries;
  const edited = { ...repoFiles(), [first.path]: repoFiles()[first.path].replace('</h2>', ' amended</h2>') };
  assert.match(checkArchive({ legal: LEGAL, manifest: MANIFEST, files: edited }).join('\n'), /was edited/);
  const removed = { ...repoFiles(), [first.path]: undefined };
  assert.match(checkArchive({ legal: LEGAL, manifest: MANIFEST, files: removed }).join('\n'), /is missing/);
  const twice = { ...MANIFEST, entries: [...MANIFEST.entries, first] };
  assert.match(checkArchive({ legal: LEGAL, manifest: twice, files: repoFiles() }).join('\n'), /listed twice/);
});

test('a page edited without a new version is caught; a menu or footer change is not an amendment', () => {
  const d = LEGAL.documents.terms;
  const page = read(pageFile(d));
  const wordChanged = { ...repoFiles(), [pageFile(d)]: page.replace('<h2>8. Termination</h2><p>', '<h2>8. Termination</h2><p>Changed. ') };
  assert.match(checkArchive({ legal: LEGAL, manifest: MANIFEST, files: wordChanged }).join('\n'), /changed but its version is still/);
  const chrome = { ...repoFiles(), [pageFile(d)]: page.replace('<footer>', '<footer><a href="/new">New link</a> ').replace('← Agent Catalogue', '← Catalogue') };
  assert.deepEqual(checkArchive({ legal: LEGAL, manifest: MANIFEST, files: chrome }), []);
});

test('amendment drill: a new version is archived beside the old one; the same version with new words is refused', () => {
  const d = LEGAL.documents.terms;
  const page = read(pageFile(d));
  const amended = page.replace('Last updated: 13 June 2026', 'Last updated: 1 January 2027').replace('<h2>10. Contact</h2>', '<h2>10. Notices</h2>');
  // same version, new words: refused
  const sameVersion = planArchive({ legal: LEGAL, manifest: MANIFEST, pages: { ...Object.fromEntries(Object.entries(LEGAL.documents).map(([k, x]) => [k, read(pageFile(x))])), terms: amended } });
  assert.equal(sameVersion.refuse.length, 1);
  assert.match(sameVersion.refuse[0].reason, /already archived with different text/);
  // new version: one addition, the old entry untouched
  const legal2 = { ...LEGAL, documents: { ...LEGAL.documents, terms: { ...d, version: '2027-01-01', pageMarker: 'Last updated: 1 January 2027' } } };
  const pages2 = { ...Object.fromEntries(Object.entries(LEGAL.documents).map(([k, x]) => [k, read(pageFile(x))])), terms: amended };
  const plan = planArchive({ legal: legal2, manifest: MANIFEST, pages: pages2, archivedAt: '2027-01-01T00:00:00Z' });
  assert.deepEqual(plan.refuse, []);
  assert.equal(plan.add.length, 1);
  assert.equal(plan.add[0].path, 'legal/archive/terms/2027-01-01.html');
  assert.notEqual(plan.add[0].sha256, d.sha256);
  const manifest2 = { entries: [...MANIFEST.entries, { document: 'terms', version: '2027-01-01', sha256: plan.add[0].sha256, path: plan.add[0].path }] };
  legal2.documents.terms = { ...legal2.documents.terms, sha256: plan.add[0].sha256, archive: plan.add[0].path };
  const files2 = { ...repoFiles(), [pageFile(d)]: amended, [plan.add[0].path]: plan.add[0].content };
  assert.deepEqual(checkArchive({ legal: legal2, manifest: manifest2, files: files2 }), [], 'the old version is still archived and still verifies');
  assert.ok(manifest2.entries.some((e) => e.document === 'terms' && e.version === '2026-06-13'));
});

test('text extraction: the agreement only, words not markup', () => {
  const html = '<main><nav>Menu</nav><h1>T</h1><p>A &amp; B<!-- x --></p>\n\n<p>C</p><footer>F</footer></main>';
  assert.equal(legalBody(html), '<h1>T</h1><p>A &amp; B<!-- x --></p>\n\n<p>C</p>');
  assert.equal(legalText(legalBody(html)), 'T A & B C');
  assert.equal(legalFingerprint(html), legalFingerprint('<h1>T</h1> <p>A &amp; B</p><p>C</p>'));
  assert.equal(versionSlug('1.0 (2026-07-09)'), '1.0-2026-07-09');
});

test('the order confirmation shows each version with its fingerprint and links only the recorded English texts', () => {
  const html = renderAcceptancePage({ productName: 'Contract Intelligence & Register', tier: 'L4', priceCents: 1490000, currency: 'usd', method: 'card', values: {}, hidden: {} });
  for (const d of Object.values(LEGAL.documents)) {
    assert.ok(html.includes(`href="${d.path}"`), d.path);
    assert.ok(html.includes(`(version ${d.version} &middot; fingerprint <code>${d.sha256.slice(0, 12)}</code>)`), d.title);
  }
  for (const l of LEGAL.translations.locales) assert.ok(!new RegExp(`href="/${l}/(terms|license|refund|privacy)"`).test(html), `no ${l} legal link`);
  assert.match(html, /the English texts, and your order record names those versions/);
  assert.match(html, /runs on your own Microsoft licences and capacity/);
  assert.match(html, /Microsoft bills that usage to you, not ColleagueAI, and it is not included in this price/);
  assert.ok(!/certified by|independently (certified|audited)|accredited/i.test(html), 'no certification or audit claim');
  assert.match(html, /perpetual licence only/);
  assert.match(html, /Seller: Colleague AI s\.r\.o\., Školská 1736\/12[^<]*IČO\) 29540852, registered at Městský soud v Praze, C 448176/);
});

test('the localized legal pages are recorded as out of sync and are never offered as the accepted text', () => {
  assert.equal(LEGAL.translations.acceptedLanguage, 'en');
  assert.ok(['out_of_sync', 'in_sync'].includes(LEGAL.translations.status));
  if (LEGAL.translations.status === 'out_of_sync') {
    // The known difference: the localized Terms still say licence rights end on termination; English says a paid
    // perpetual licence survives. When counsel approves the texts and the translations are redone, set in_sync.
    assert.ok(read('public/terms.html').includes('perpetual agent-package licence survives termination'));
    assert.ok(read('public/cs/terms.html').includes('licenční práva poté zanikají'), 'cs Terms still carry the old termination clause; if fixed, update config/legal.json translations');
  }
});
