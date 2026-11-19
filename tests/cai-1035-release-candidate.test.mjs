/**
 * tests/cai-1035-release-candidate.test.mjs - the 1.0.3.5 bundle is consistent with its documentation and would be
 * delivered correctly by the commercial download path, without being published.
 *
 * - scripts/cai-release/1.0.3.5/release-candidate.json (the future "release" entry of config/products.json) names the
 *   bundle and managed-solution checksums that docs/cai-l4-ci-001/bundle/SHA256SUMS-1.0.3.5.txt records.
 * - The bundle documents (MANIFEST template, START-HERE, INSTALL) all name release 1.0.3.5 and its managed file.
 * - config/products.json is unchanged until the release is approved: the current release stays 1.0.3.4 (or, once
 *   switched, exactly the candidate) and saleApproved stays false.
 * - Applied to the real product record, the candidate is a valid release record: its package name passes the file
 *   rule, the download allow-list includes it, and buyers of 1.0.3.2, 1.0.3.3 and 1.0.3.4 are offered 1.0.3.5 as the
 *   corrective release of what they bought (lib/releaseAccess.js), while nobody gets it through a later purchase rule.
 *
 * Usage: node --test tests/cai-1035-release-candidate.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productReleases, compareVersions } from '../lib/products.js';
import { releaseForBoughtVersion, releasesAvailable } from '../lib/releaseAccess.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CAND = JSON.parse(read('scripts/cai-release/1.0.3.5/release-candidate.json'));
const SUMS = Object.fromEntries(read('docs/cai-l4-ci-001/bundle/SHA256SUMS-1.0.3.5.txt').trim().split('\n')
  .map((l) => l.split(/\s+/)).map(([h, n]) => [n, h]));
const PRODUCTS = JSON.parse(read('config/products.json'));
const SLUG = 'contract-intelligence-and-register';
const REAL = PRODUCTS[SLUG];

test('candidate checksums are the ones the bundle records', () => {
  assert.equal(CAND.version, '1.0.3.5');
  assert.equal(CAND.package, 'CAI-L4-CI-001_1.0.3.5.zip');
  assert.equal(SUMS[CAND.package], CAND.sha256, 'bundle zip sha256');
  assert.equal(SUMS[CAND.managedSolution.file], CAND.managedSolution.sha256, 'managed solution sha256');
  for (const h of Object.values(SUMS)) assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(CAND.bytes) && CAND.bytes > 100000, 'bundle size is recorded for the download size check');
  assert.deepEqual(CAND.correctiveFor, ['1.0.3.2', '1.0.3.3', '1.0.3.4']);
});

test('bundle documents name release 1.0.3.5 and its managed file', () => {
  const manifest = JSON.parse(read('docs/cai-l4-ci-001/bundle/MANIFEST.template.json'));
  assert.equal(manifest.release, '1.0.3.5');
  assert.equal(manifest.solution.version, '1.0.3.5');
  assert.equal(manifest.solution.file, CAND.managedSolution.file);
  assert.ok(manifest.files.some((f) => f.name === CAND.managedSolution.file));
  const files = manifest.files.map((f) => f.name).concat('MANIFEST.json');
  assert.deepEqual(Object.keys(SUMS).filter((n) => n !== CAND.package).sort(), [...files].sort(), 'SHA256SUMS lists every bundle file');
  const start = read('docs/cai-l4-ci-001/bundle/START-HERE.md');
  const install = read('docs/cai-l4-ci-001/INSTALL.md');
  for (const [name, text] of [['START-HERE', start], ['INSTALL', install]]) {
    assert.match(text, /\*\*Release\*\* 1\.0\.3\.5/, `${name} header`);
    assert.ok(text.includes(CAND.managedSolution.file), `${name} names the managed file`);
    assert.ok(!text.includes('CAIContractIntelligence_1_0_3_4_managed.zip'), `${name} no longer names the 1.0.3.4 file`);
  }
  assert.match(install, /## 9b\. When something fails/);
  assert.match(install, /--expect-version 1\.0\.3\.5/);
});

test('config/products.json is not switched to an unapproved release; sale stays closed', () => {
  assert.equal(REAL.saleApproved, false);
  assert.ok(['1.0.3.4', CAND.version].includes(REAL.release.version), REAL.release.version);
  if (REAL.release.version === CAND.version) {
    for (const k of ['package', 'sha256', 'bytes']) assert.equal(REAL.release[k], CAND[k], k);
  }
});

test('download path: the candidate is a valid release of the real product and replaces earlier releases as their correction', () => {
  const { managedSolution, _comment, ...record } = CAND;
  const next = { ...REAL, release: { ...record, releasedAt: '2026-11-20T00:00:00Z' },
    previousReleases: [...(REAL.previousReleases || []), REAL.release].filter((r) => r.version !== CAND.version) };
  const versions = productReleases(next).map((r) => r.version);
  assert.deepEqual(versions, [...versions].sort(compareVersions));
  assert.equal(versions[versions.length - 1], '1.0.3.5', 'the candidate is the newest release');
  assert.ok(versions.includes('1.0.3.4') && versions.includes('1.0.3.2'), 'earlier releases stay listed');
  for (const bought of ['1.0.3.2', '1.0.3.3', '1.0.3.4']) {
    assert.equal(releaseForBoughtVersion(next, bought)?.version, '1.0.3.5', `a ${bought} purchase is offered 1.0.3.5`);
  }
  // A buyer of 1.0.3.4 (recorded per purchase) may download both 1.0.3.4 and its correction 1.0.3.5, nothing else.
  const ent = { slugs: [SLUG], sessionSlugs: { cs_a: [SLUG] }, sessionReleases: { cs_a: { [SLUG]: '1.0.3.4' } } };
  assert.deepEqual(releasesAvailable({ product: next, entitlement: ent, slug: SLUG }).map((r) => r.version), ['1.0.3.4', '1.0.3.5']);
  // No licence, no download.
  assert.deepEqual(releasesAvailable({ product: next, entitlement: { slugs: [] }, slug: SLUG }), []);
});

test('the recorded checksums are those of the committed bundle sources (rebuild the bundle after any change)', async () => {
  const { createHash } = await import('node:crypto');
  const sha = (p) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
  assert.equal(SUMS['INSTALL.md'], sha('docs/cai-l4-ci-001/INSTALL.md'), 'INSTALL.md changed: run build_bundle_1035.sh and update the checksums');
  assert.equal(SUMS['START-HERE.md'], sha('docs/cai-l4-ci-001/bundle/START-HERE.md'));
  assert.equal(SUMS['LICENSE.txt'], sha('docs/cai-l4-ci-001/bundle/LICENSE.txt'));
  assert.equal(SUMS['deploymentSettings.template.json'], sha('docs/cai-l4-ci-001/bundle/deploymentSettings.template.json'));
  assert.equal(SUMS['check-cai-install-readiness.mjs'], sha('scripts/check-cai-install-readiness.mjs'));
});

test('the 1.0.3.5 dossier makes none of the retired data-hosting claims (F-DOC-1, F-DOC-2)', () => {
  const src = read('scripts/cai-release/1.0.3.5/build_dossier.py');
  for (const phrase of ['governance-layer metadata', 'governance layer metadata', 'audit metadata', 'hosts only the governance', 'governance control plane']) {
    assert.ok(!src.includes(phrase), phrase);
  }
  assert.match(src, /hosts none of the agents/);
  assert.match(src, /RELEASE = '1\.0\.3\.5'/);
});
