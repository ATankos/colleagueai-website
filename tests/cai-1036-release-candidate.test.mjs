/**
 * tests/cai-1036-release-candidate.test.mjs - release 1.0.3.6 of CAI-L4-CI-001: the bundle record, its documents,
 * config/products.json and the download rules agree.
 *
 * - scripts/cai-release/1.0.3.6/release-candidate.json names the bundle and managed-solution checksums that the
 *   SHA256SUMS file of its bundle revision records (SHA256SUMS-1.0.3.6.txt for revision 1, SHA256SUMS-1.0.3.6-r<N>.txt
 *   after), and those are the checksums of the committed sources.
 * - A bundle revision never overwrites a delivered one: each later revision has its own file name, and the earlier
 *   revisions stay listed under previousBundles with their recorded checksums (revision 1: 69b30676…, delivered to
 *   the test orders of 20 and 21 Nov 2026). LICENSE.txt names the release and revision it ships in.
 * - The bundle documents (MANIFEST template, START-HERE, INSTALL) name release 1.0.3.6 and its managed file, never
 *   call AI-extracted excerpts verbatim quotes, and tell the installer to turn Daily recompute on before go-live.
 * - config/products.json is either still on 1.0.3.4 or exactly this record, with 1.0.3.4 and 1.0.3.2 kept as previous
 *   releases; saleApproved stays false either way.
 * - Buyers of 1.0.3.2, 1.0.3.3 and 1.0.3.4 are offered 1.0.3.6 as the corrective release (lib/releaseAccess.js); a
 *   buyer of 1.0.3.4 can download 1.0.3.4 and 1.0.3.6 and nothing else; without a licence nothing is offered.
 *
 * Usage: node --test tests/cai-1036-release-candidate.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productReleases, compareVersions } from '../lib/products.js';
import { releaseForBoughtVersion, releasesAvailable } from '../lib/releaseAccess.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const CAND = JSON.parse(read('scripts/cai-release/1.0.3.6/release-candidate.json'));
const sumsOf = (file) => Object.fromEntries(read(file).trim().split('\n').map((l) => l.split(/\s+/)).map(([h, n]) => [n, h]));
const REV = CAND.bundleRevision ?? 1;
const BUNDLE_NAME = REV === 1 ? 'CAI-L4-CI-001_1.0.3.6' : `CAI-L4-CI-001_1.0.3.6-r${REV}`;
const SUMS = sumsOf(`docs/cai-l4-ci-001/bundle/SHA256SUMS-1.0.3.6${REV === 1 ? '' : `-r${REV}`}.txt`);
const PRODUCTS = JSON.parse(read('config/products.json'));
const SLUG = 'contract-intelligence-and-register';
const REAL = PRODUCTS[SLUG];
const { managedSolution, _comment, ...RECORD } = CAND;

test('the release record carries the checksums the bundle records', () => {
  assert.equal(CAND.version, '1.0.3.6');
  assert.equal(CAND.status, 'controlled-test');
  assert.equal(CAND.package, `${BUNDLE_NAME}.zip`);
  assert.equal(SUMS[CAND.package], CAND.sha256, 'bundle zip sha256');
  assert.equal(SUMS[managedSolution.file], managedSolution.sha256, 'managed solution sha256');
  assert.equal(managedSolution.sha256, 'cca6f657831a09d35e680a6cdc5be4eba329072ae918d76c1c2c8fa9dedad0f8', 'the package exported from CAI-LAB and tenant-tested');
  for (const h of Object.values(SUMS)) assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(CAND.bytes) && CAND.bytes > 100000, 'bundle size is recorded for the download size check');
  assert.deepEqual(CAND.correctiveFor, ['1.0.3.2', '1.0.3.3', '1.0.3.4']);
});

test('the recorded checksums are those of the committed bundle sources (rebuild the bundle after any change)', () => {
  assert.equal(SUMS['INSTALL.md'], sha('docs/cai-l4-ci-001/INSTALL.md'), 'INSTALL.md changed: run build_bundle_1036.sh and update the checksums');
  assert.equal(SUMS['START-HERE.md'], sha('docs/cai-l4-ci-001/bundle/START-HERE.md'));
  assert.equal(SUMS['LICENSE.txt'], sha('docs/cai-l4-ci-001/bundle/LICENSE.txt'));
  assert.equal(SUMS['deploymentSettings.template.json'], sha('docs/cai-l4-ci-001/bundle/deploymentSettings.template.json'));
  assert.equal(SUMS['check-cai-install-readiness.mjs'], sha('scripts/check-cai-install-readiness.mjs'));
});

test('bundle documents name release 1.0.3.6, its managed file and every bundle file', () => {
  const manifest = JSON.parse(read('docs/cai-l4-ci-001/bundle/MANIFEST.template.json'));
  assert.equal(manifest.release, '1.0.3.6');
  assert.equal(manifest.solution.version, '1.0.3.6');
  assert.equal(manifest.solution.file, managedSolution.file);
  assert.equal(manifest.bundleRevision, REV, 'MANIFEST template and release record name the same bundle revision');
  const files = manifest.files.map((f) => f.name).concat('MANIFEST.json');
  assert.deepEqual(Object.keys(SUMS).filter((n) => n !== CAND.package).sort(), [...files].sort(), 'SHA256SUMS lists every bundle file');
  const start = read('docs/cai-l4-ci-001/bundle/START-HERE.md');
  const install = read('docs/cai-l4-ci-001/INSTALL.md');
  for (const [name, text] of [['START-HERE', start], ['INSTALL', install]]) {
    assert.match(text, /\*\*Release\*\* 1\.0\.3\.6/, `${name} header`);
    assert.ok(text.includes(managedSolution.file), `${name} names the managed file`);
    assert.ok(!/CAIContractIntelligence_1_0_3_[2345]_managed\.zip/.test(text), `${name} names no earlier managed file`);
    assert.match(text, new RegExp(`\\*\\*Bundle revision\\*\\* ${REV}\\b`), `${name} names bundle revision ${REV}`);
    assert.ok(text.includes(`${BUNDLE_NAME}.zip`), `${name} names the bundle file the buyer downloads`);
    const otherNames = [...text.matchAll(/CAI-L4-CI-001_1\.0\.3\.6(?:-r\d+)?\.zip/g)].map((m) => m[0]).filter((n) => n !== `${BUNDLE_NAME}.zip`);
    assert.deepEqual(otherNames, [], `${name} names no other revision's bundle file`);
  }
  assert.match(install, /--expect-version 1\.0\.3\.6/);
});

test('no bundle document calls AI-extracted text verbatim, quoted evidence or a source quote (F-UX-1)', () => {
  const docs = {
    INSTALL: read('docs/cai-l4-ci-001/INSTALL.md').replace(/^<!--[\s\S]*?-->/, ''), // the header comment names the old label
    'START-HERE': read('docs/cai-l4-ci-001/bundle/START-HERE.md'),
    MANIFEST: read('docs/cai-l4-ci-001/bundle/MANIFEST.template.json'),
    DOSSIER: read('scripts/cai-release/1.0.3.6/build_dossier.py').replace(/^[\s\S]*?"""[\s\S]*?"""/, ''),
  };
  for (const [name, text] of Object.entries(docs)) {
    for (const bad of [/verbatim/i, /quoted evidence/i, /source quote/i, /values match the evidence/i, /values and quotes/i, /Cited extraction/]) {
      assert.ok(!bad.test(text), `${name}: ${bad}`);
    }
  }
  assert.match(docs.INSTALL, /AI-extracted excerpts \(unverified - compare them with the original document\)/);
  assert.match(docs.INSTALL, /Approve - I checked these values in the original document/);
  assert.match(docs['START-HERE'], /extracted by AI and not verified against the document/);
});

test('INSTALL and START-HERE require Daily recompute On for go-live; the readiness check defaults to on', () => {
  const install = read('docs/cai-l4-ci-001/INSTALL.md');
  assert.match(install, /\*\*When you go live, Daily recompute must be On\.\*\*/);
  assert.match(install, /Go-live: Daily recompute/);
  assert.match(read('docs/cai-l4-ci-001/bundle/START-HERE.md'), /turn it on before go-live/);
  const check = read('scripts/check-cai-install-readiness.mjs');
  assert.match(check, /opt\('--daily-recompute', 'on'\)/, 'without the option the check requires all seven flows On');
  // The bundle builder refuses a package whose flows were exported Off (check C8).
  assert.match(read('scripts/cai-release/1.0.3.6/build_bundle_1036.sh'), /check-cai-solution-package\.mjs" "\$work\/unpacked" --expect-version 1\.0\.3\.6/);
});

test('config/products.json: 1.0.3.6 is the release or not yet switched; earlier releases are kept; sale stays closed', () => {
  assert.equal(REAL.saleApproved, false);
  assert.ok(['1.0.3.4', CAND.version].includes(REAL.release.version), REAL.release.version);
  if (REAL.release.version === CAND.version) {
    assert.deepEqual(REAL.release, RECORD, 'the release entry is exactly the candidate record');
    const prev = Object.fromEntries((REAL.previousReleases || []).map((r) => [r.version, r]));
    assert.ok(prev['1.0.3.2'] && prev['1.0.3.4'], '1.0.3.2 and 1.0.3.4 stay listed: the download endpoint still accepts the version bought, pages offer 1.0.3.6');
    assert.equal(prev['1.0.3.4'].sha256, '9de421b3b270315b061ac3be4d1a8dd2665059d358d7c451e1558bf97b792efa');
    assert.ok(!prev['1.0.3.5'], '1.0.3.5 was never released');
  }
});

test('download path: 1.0.3.6 is the newest release and the correction for every earlier purchase', () => {
  const product = REAL.release.version === CAND.version ? REAL : {
    ...REAL, release: RECORD, previousReleases: [...(REAL.previousReleases || []), REAL.release],
  };
  const versions = productReleases(product).map((r) => r.version);
  assert.deepEqual(versions, [...versions].sort(compareVersions));
  assert.equal(versions[versions.length - 1], '1.0.3.6');
  assert.ok(versions.includes('1.0.3.4') && versions.includes('1.0.3.2'), 'earlier releases stay listed');
  for (const bought of ['1.0.3.2', '1.0.3.3', '1.0.3.4']) {
    assert.equal(releaseForBoughtVersion(product, bought)?.version, '1.0.3.6', `a ${bought} purchase is offered 1.0.3.6`);
  }
  const ent = { slugs: [SLUG], sessionSlugs: { cs_a: [SLUG] }, sessionReleases: { cs_a: { [SLUG]: '1.0.3.4' } } };
  assert.deepEqual(releasesAvailable({ product, entitlement: ent, slug: SLUG }).map((r) => r.version), ['1.0.3.4', '1.0.3.6']);
  assert.deepEqual(releasesAvailable({ product, entitlement: { slugs: [] }, slug: SLUG }), []);
});

test('the 1.0.3.6 dossier keeps the corrected data-hosting wording (F-DOC-1, F-DOC-2)', () => {
  const src = read('scripts/cai-release/1.0.3.6/build_dossier.py');
  for (const phrase of ['governance-layer metadata', 'governance layer metadata', 'audit metadata', 'hosts only the governance', 'governance control plane']) {
    assert.ok(!src.includes(phrase), phrase);
  }
  assert.match(src, /hosts none of the agents/);
  assert.match(src, /RELEASE = '1\.0\.3\.6'/);
});

test('LICENSE.txt names the release and bundle revision it ships in', () => {
  const first = read('docs/cai-l4-ci-001/bundle/LICENSE.txt').split('\n')[0];
  assert.match(first, /\(SKU CAI-L4-CI-001\), release 1\.0\.3\.6\b/);
  if (REV > 1) assert.ok(first.includes(`bundle revision ${REV}`), first);
  assert.ok(!/release 1\.0\.3\.[0-5]\b/.test(first), 'no earlier release number (the 1.0.3.6 revision-1 defect)');
});

test('earlier bundle revisions stay on record and are never overwritten', () => {
  const history = CAND.previousBundles ?? [];
  assert.equal(history.length, REV - 1, 'one record per earlier revision');
  history.forEach((b, i) => {
    assert.equal(b.bundleRevision, i + 1);
    assert.match(b.sha256, /^[0-9a-f]{64}$/);
    assert.notEqual(b.package, CAND.package, 'each revision has its own file name');
    assert.notEqual(b.sha256, CAND.sha256);
  });
  if (REV > 1) {
    const r1 = history[0];
    assert.deepEqual([r1.package, r1.sha256, r1.bytes],
      ['CAI-L4-CI-001_1.0.3.6.zip', '69b3067694fdb27952f66addae17b45836dddfd3965bae6f5e6fe2bdd25dbd50', 368718], 'delivered revision 1');
    // the revision-1 checksum file is history: still present and unchanged in what it says about the delivered bundle
    assert.equal(sumsOf('docs/cai-l4-ci-001/bundle/SHA256SUMS-1.0.3.6.txt')[r1.package], r1.sha256);
  }
});

test('the bundle builder gives revision 2 and later their own file name and keeps revision 1 on the historical name', () => {
  const src = read('scripts/cai-release/build-bundle.py');
  assert.match(src, /NAME = f'CAI-L4-CI-001_\{RELEASE\}' if _rev == 1 else f'CAI-L4-CI-001_\{RELEASE\}-r\{_rev\}'/);
});
