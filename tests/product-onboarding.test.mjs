// The commercial product framework (docs/commercial-framework/README.md): every product in config/products.json is
// fully onboarded, and no product can be approved for sale without its evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContext, validateProduct, validateAll } from '../scripts/release/validate-product.mjs';

const ctx = loadContext();
const SLUGS = Object.keys(ctx.products).filter((k) => k !== '_comment');
const clone = (o) => JSON.parse(JSON.stringify(o));
const withProducts = (fn) => { const c = { ...ctx, products: clone(ctx.products) }; fn(c.products); return c; };
const withRecord = (slug, fn) => { const r = clone(ctx.agentRecord(slug)); fn(r); return { ...ctx, agentRecord: (s) => (s === slug ? r : ctx.agentRecord(s)) }; };

test('every product record is fully onboarded (agent record, release record, docs, factsheet, pricing agree)', () => {
  for (const r of validateAll({ ctx })) assert.deepEqual(r.onboarding, [], `${r.slug}:\n  ${r.onboarding.join('\n  ')}`);
});

test('a product approved for sale passes every for-sale check (release, scope, IP, gates, GO decision)', () => {
  for (const slug of SLUGS.filter((s) => ctx.products[s].saleApproved)) {
    const r = validateProduct(slug, { ctx });
    assert.deepEqual(r.sale, [], `${slug} is saleApproved but:\n  ${r.sale.join('\n  ')}`);
  }
});

test('approving a sale without evidence is caught', () => {
  const slug = SLUGS[0];
  const c = withProducts((x) => { x[slug].saleApproved = true; x[slug].release.status = 'released'; });
  const r = validateProduct(slug, { ctx: { ...c, agentRecord: (s) => { const a = clone(ctx.agentRecord(s)); a.ip.status = 'unsigned'; a.ip.evidenceSha256 = null; a.sale.goDecision = null; return a; } } });
  assert.ok(r.sale.some((m) => /IP/.test(m)), 'unsigned IP must block');
  assert.ok(r.sale.some((m) => /GO decision/.test(m)), 'missing GO decision must block');
});

test('omissions and contradictions in a product record are reported', () => {
  const slug = SLUGS[0];
  assert.ok(validateProduct(slug, { ctx: { ...ctx, agentRecord: () => null } }).onboarding.some((m) => /config\/agents/.test(m)));
  assert.ok(validateProduct(slug, { ctx: withRecord(slug, (r) => { r.exclusions = []; }) }).onboarding.some((m) => /exclusions/.test(m)));
  assert.ok(validateProduct(slug, { ctx: withRecord(slug, (r) => { r.support.months = 12; }) }).onboarding.some((m) => /support/.test(m)));
  assert.ok(validateProduct(slug, { ctx: withRecord(slug, (r) => { r.managedSolution.sha256 = 'f'.repeat(64); }) }).onboarding.some((m) => /managed solution hash/.test(m)));
  assert.ok(validateProduct(slug, { ctx: withProducts((x) => { x[slug].release.bytes = 1; }) }).onboarding.some((m) => /bytes/.test(m)));
  assert.ok(validateProduct(slug, { ctx: withProducts((x) => { x[slug].sku = 'CAI-X'; }) }).onboarding.some((m) => /sku/.test(m)));
});

test('the template is unfilled and would fail as a record', () => {
  const t = JSON.parse(readFileSync(new URL('../config/agents/_template.json', import.meta.url), 'utf8'));
  const slug = SLUGS[0];
  const r = validateProduct(slug, { ctx: { ...ctx, agentRecord: () => ({ ...t, slug, sku: ctx.products[slug].sku }) } });
  assert.ok(r.onboarding.length >= 5, 'placeholders must not count as filled');
});
