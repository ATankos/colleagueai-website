/**
 * tests/cai-1035-release-candidate.test.mjs - the 1.0.3.5 build record stays intact and is never published.
 *
 * 1.0.3.5 was built and tenant-tested on 19 Nov 2026 and superseded before release by 1.0.3.6 (finding F-UX-1: its
 * review card called AI-extracted excerpts "verbatim quotes"). It was never uploaded to Blob and never listed in
 * config/products.json. The bundle documents now describe 1.0.3.6 (tests/cai-1036-release-candidate.test.mjs).
 *
 * - scripts/cai-release/1.0.3.5/release-candidate.json still names the checksums that
 *   docs/cai-l4-ci-001/bundle/SHA256SUMS-1.0.3.5.txt records (the record of what was built and tested).
 * - It is marked superseded-internal, and config/products.json never lists 1.0.3.5, as release or previous release.
 * - The 1.0.3.5 dossier generator keeps the corrected data-hosting wording (F-DOC-1, F-DOC-2).
 *
 * Usage: node --test tests/cai-1035-release-candidate.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CAND = JSON.parse(read('scripts/cai-release/1.0.3.5/release-candidate.json'));
const SUMS = Object.fromEntries(read('docs/cai-l4-ci-001/bundle/SHA256SUMS-1.0.3.5.txt').trim().split('\n')
  .map((l) => l.split(/\s+/)).map(([h, n]) => [n, h]));
const REAL = JSON.parse(read('config/products.json'))['contract-intelligence-and-register'];

test('the 1.0.3.5 record keeps the checksums of what was built and tested', () => {
  assert.equal(CAND.version, '1.0.3.5');
  assert.equal(CAND.package, 'CAI-L4-CI-001_1.0.3.5.zip');
  assert.equal(SUMS[CAND.package], CAND.sha256, 'bundle zip sha256');
  assert.equal(SUMS[CAND.managedSolution.file], CAND.managedSolution.sha256, 'managed solution sha256');
  assert.equal(CAND.managedSolution.sha256, '6d5fc02417609ec57799a92594aa1c34960563703fef8fc325649d133f24fe80');
  for (const h of Object.values(SUMS)) assert.match(h, /^[0-9a-f]{64}$/);
});

test('1.0.3.5 is marked superseded and is never published', () => {
  assert.equal(CAND.status, 'superseded-internal');
  assert.equal(CAND.releasedAt, null);
  assert.match(CAND._comment, /SUPERSEDED before release by 1\.0\.3\.6/);
  const listed = [REAL.release, ...(REAL.previousReleases || [])].map((r) => r.version);
  assert.ok(!listed.includes('1.0.3.5'), `config/products.json lists ${listed.join(', ')}`);
  assert.equal(REAL.saleApproved, false);
});

test('the 1.0.3.5 dossier makes none of the retired data-hosting claims (F-DOC-1, F-DOC-2)', () => {
  const src = read('scripts/cai-release/1.0.3.5/build_dossier.py');
  for (const phrase of ['governance-layer metadata', 'governance layer metadata', 'audit metadata', 'hosts only the governance', 'governance control plane']) {
    assert.ok(!src.includes(phrase), phrase);
  }
  assert.match(src, /hosts none of the agents/);
  assert.match(src, /RELEASE = '1\.0\.3\.5'/);
});
