// Structure of the canonical CAI Master Control Library (docs/continuous-certification/cai-master-control-library-v1.0.json).
// It guards the programme's own rules, so a later edit cannot quietly break them:
// 18 domains; one class per control; mandatory security and statutory duties never limited to subscribers; customer
// duties never presented as something ColleagueAI certifies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mcl = JSON.parse(readFileSync(new URL('../docs/continuous-certification/cai-master-control-library-v1.0.json', import.meta.url), 'utf8'));
const DIMS = ['PC', 'SC', 'DA', 'OC'];
const CLASSES = ['M', 'L', 'S', 'C'];

test('MCL has exactly 18 domains with unique ids D01–D18', () => {
  assert.deepEqual(mcl.domains.map((d) => d.id), Array.from({ length: 18 }, (_, i) => `D${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(Object.keys(mcl.dimensions).sort(), [...DIMS].sort());
  assert.deepEqual(Object.keys(mcl.obligations).sort(), [...CLASSES].sort());
});

test('every control is complete, unique and refers to known domains, dimensions, classes, roles and phases', () => {
  const ids = new Set();
  for (const c of mcl.controls) {
    assert.match(c.id, /^CAI-D\d{2}-\d{2}$/);
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`); ids.add(c.id);
    assert.equal(c.id.slice(4, 7), c.domain, c.id);
    assert.ok(mcl.domains.some((d) => d.id === c.domain), c.id);
    for (const k of ['title', 'requirement', 'evidence', 'trigger', 'method']) assert.ok(String(c[k] || '').trim(), `${c.id} ${k}`);
    assert.ok(c.dimensions.length && c.dimensions.every((d) => DIMS.includes(d)), c.id);
    assert.ok(CLASSES.includes(c.obligation), c.id);
    assert.ok(mcl.roles[c.accountable] && mcl.roles[c.responsible], c.id);
    assert.ok(mcl.phases[c.phase], c.id);
    assert.ok(['central', 'per-package'].includes(c.reuse), c.id);
    assert.ok(['existing', 'new'].includes(c.status), c.id);
  }
});

test('every domain has at least three controls and at least one product-certification control', () => {
  for (const d of mcl.domains) {
    const cs = mcl.controls.filter((c) => c.domain === d.id);
    assert.ok(cs.length >= 3, d.id);
    assert.ok(cs.some((c) => c.dimensions.includes('PC') || c.dimensions.includes('SC')), d.id);
  }
});

test('security, incident and statutory remediation duties are never subscription-only', () => {
  const mustBeForAll = mcl.controls.filter((c) => ['D07', 'D08'].includes(c.domain) || /statutory|vulnerab|security fix|CRA/i.test(c.title + ' ' + c.requirement));
  assert.ok(mustBeForAll.length >= 8);
  for (const c of mustBeForAll) {
    if (c.obligation === 'C') continue; // a customer's own legal duty, e.g. deployer incident reporting
    assert.ok(['M', 'L'].includes(c.obligation), `${c.id} must be M or L, not ${c.obligation}`);
  }
});

test('subscription benefits are only subscription-coverage controls, and customer duties are never certified', () => {
  for (const c of mcl.controls) {
    if (c.obligation === 'S') assert.deepEqual(c.dimensions, ['SC'], `${c.id}: an S control belongs to SC only`);
    if (c.obligation === 'C') {
      assert.equal(c.accountable, 'CUST', c.id);
      assert.ok(!c.dimensions.includes('PC') && !c.dimensions.includes('SC'), `${c.id}: a customer duty is not part of a certificate`);
    }
  }
});

test('no control requires access to a customer environment', () => {
  for (const c of mcl.controls) {
    assert.doesNotMatch(c.requirement, /\b(remote access|access (to|into) the customer'?s? (tenant|environment)|install(s)? into the customer)/i, c.id);
  }
});
