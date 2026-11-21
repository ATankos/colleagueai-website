/**
 * tests/release-gates.test.mjs - config/release-gates.json, the manual release gates that
 * scripts/release/certify-release.mjs prints beside the gates it checks itself, stays well-formed and honest:
 * one of four statuses, a PASS names its evidence, anything else says what blocks it, ids are unique, and the gate
 * list belongs to the release that config/products.json publishes. The certifier itself runs (no bundle, no suites)
 * and never upgrades a manual gate.
 *
 * Usage: node --test tests/release-gates.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GATES = JSON.parse(readFileSync(new URL('../config/release-gates.json', import.meta.url), 'utf8'));
const RELEASE = JSON.parse(readFileSync(new URL('../config/products.json', import.meta.url), 'utf8'))['contract-intelligence-and-register'].release;
const STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'REQUIRES FOUNDER APPROVAL'];

test('every manual gate has a known status, an area, and the evidence or blocker that justifies it', () => {
  assert.equal(GATES.release, RELEASE.version, 'the gate list is for the published release');
  const ids = GATES.gates.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const g of GATES.gates) {
    assert.ok(STATUSES.includes(g.status), `${g.id}: ${g.status}`);
    assert.ok(['product', 'commercial', 'legal', 'tax', 'operations', 'security'].includes(g.area), `${g.id}: area`);
    assert.ok(g.title && g.title.length > 10, `${g.id}: title`);
    if (g.status === 'PASS' || g.status === 'FAIL') assert.ok(g.evidence && g.evidence.length > 20, `${g.id}: a ${g.status} names its evidence`);
    else assert.ok(g.blockedBy && g.blockedBy.length > 20, `${g.id}: says what blocks it`);
  }
});

test('approvals that only the founder, counsel or accountant can give are never marked PASS here', () => {
  for (const id of ['L-LEGAL-TEXTS', 'L-IP', 'T-TAX-POLICY', 'O-PROD-CONFIG']) {
    const g = GATES.gates.find((x) => x.id === id);
    assert.ok(g, id);
    assert.notEqual(g.status, 'PASS', `${id} cannot be passed by an engineering change`);
  }
});

test('the certifier runs without a bundle and reports manual gates exactly as recorded', () => {
  const run = spawnSync(process.execPath, ['scripts/release/certify-release.mjs', '--skip-suites', '--json'], { cwd: ROOT, encoding: 'utf8' });
  const out = JSON.parse(run.stdout);
  assert.equal(out.package, RELEASE.package);
  assert.equal(out.results.find((r) => r.id === 'PKG-*').status, 'BLOCKED', 'no bundle: package gates are blocked, not passed');
  for (const g of GATES.gates) assert.equal(out.results.find((r) => r.id === g.id).status, g.status, g.id);
  assert.equal(run.status, 0, 'only automated FAILs change the exit code');
});
