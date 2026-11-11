/**
 * tests/licence-inventory.test.mjs - production dependencies stay under permissive licences, and the published
 * inventory (docs/legal/third-party-licences.md) names every direct dependency (PR D).
 *
 * Version bumps do not fail this test; a new direct dependency, or any production package under a copyleft,
 * unknown or missing licence, does. Regenerate the document with node scripts/legal/licence-inventory.mjs.
 * Usage: node --test tests/licence-inventory.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { productionPackages, PERMISSIVE } from '../scripts/legal/licence-inventory.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const LOCK = JSON.parse(read('package-lock.json'));
const PKG = JSON.parse(read('package.json'));
const DOC = read('docs/legal/third-party-licences.md');

test('every production package carries a permissive licence', () => {
  const list = productionPackages(LOCK, PKG);
  assert.ok(list.length >= Object.keys(PKG.dependencies).length);
  const other = list.filter((p) => !PERMISSIVE.includes(p.license)).map((p) => `${p.name}@${p.version}: ${p.license}`);
  assert.deepEqual(other, [], 'production packages outside the permissive list need counsel review before they ship');
});

test('build and test tools are not counted as shipped packages', () => {
  const names = new Set(productionPackages(LOCK, PKG).map((p) => p.name));
  for (const dev of Object.keys(PKG.devDependencies || {})) {
    const alsoProd = Object.prototype.hasOwnProperty.call(PKG.dependencies, dev);
    if (!alsoProd) assert.ok(!names.has(dev) || !LOCK.packages[`node_modules/${dev}`]?.dev, `${dev} is a dev tool`);
  }
});

test('the published inventory names every direct dependency', () => {
  for (const name of Object.keys(PKG.dependencies)) assert.ok(DOC.includes(`| ${name} |`), `${name} missing from docs/legal/third-party-licences.md`);
});
