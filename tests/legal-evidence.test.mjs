// IP rights and the evidence behind them: an unsigned instrument, a missing fingerprint or an unverified record can
// never make a product sellable, student works stay excluded, and rights evidence never bypasses the other gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadContext, validateProduct, evidenceManifestErrors } from '../scripts/release/validate-product.mjs';

const ctx = loadContext();
const SLUG = 'contract-intelligence-and-register';
const clone = (o) => JSON.parse(JSON.stringify(o));
const HASH = 'b'.repeat(64);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function variant({ ip, evidence, gates, products } = {}) {
  const rec = clone(ctx.agentRecord(SLUG)); if (ip) Object.assign(rec.ip, ip);
  const ev = clone(ctx.evidence); if (evidence) evidence(ev);
  const c = { ...ctx, evidence: ev, products: products ?? ctx.products, agentRecord: (s) => (s === SLUG ? rec : ctx.agentRecord(s)) };
  if (gates) c.readJson = (p) => (p === rec.release.gates ? gates(clone(ctx.readJson(p))) : ctx.readJson(p));
  return c;
}
const verifyInstrument = (ev) => Object.assign(ev.records.find((r) => r.id === 'ip-instrument-a'), { status: 'verified', sha256: HASH, date: '2026-12-01' });

test('as committed: the instrument is unsigned, has no fingerprint, and its evidence record is pending', () => {
  const rec = ctx.agentRecord(SLUG);
  assert.equal(rec.ip.status, 'unsigned');
  assert.equal(rec.ip.evidenceSha256, null);
  assert.equal(ctx.evidence.records.find((r) => r.id === 'ip-instrument-a').status, 'pending');
  const r = validateProduct(SLUG, { ctx, forSale: true });
  assert.ok(r.sale.some((m) => /IP: instrument not executed/.test(m)));
  assert.equal(JSON.parse(read('config/release-gates.json')).gates.find((g) => g.id === 'L-IP').status, 'REQUIRES FOUNDER APPROVAL');
});

test('"executed" without a verified evidence record of the same SHA-256 is refused', () => {
  for (const c of [
    variant({ ip: { status: 'executed', evidenceSha256: null } }),
    variant({ ip: { status: 'executed', evidenceSha256: HASH } }),
    variant({ ip: { status: 'executed', evidenceSha256: HASH }, evidence: (ev) => Object.assign(ev.records.find((r) => r.id === 'ip-instrument-a'), { status: 'received', sha256: HASH }) }),
    variant({ ip: { status: 'executed', evidenceSha256: HASH }, evidence: (ev) => Object.assign(ev.records.find((r) => r.id === 'ip-instrument-a'), { status: 'verified', sha256: 'c'.repeat(64) }) }),
  ]) assert.ok(validateProduct(SLUG, { ctx: c }).onboarding.some((m) => /executed" without a verified ip_instrument/.test(m)));
  assert.ok(validateProduct(SLUG, { ctx: variant({ ip: { status: 'unsigned', evidenceSha256: HASH } }) }).onboarding.some((m) => /unsigned instrument has no evidence fingerprint/.test(m)));
  const ok = variant({ ip: { status: 'executed', evidenceSha256: HASH }, evidence: verifyInstrument });
  assert.deepEqual(validateProduct(SLUG, { ctx: ok }).onboarding, []);
});

test('verified rights evidence does not bypass the other gates or the GO decision', () => {
  const c = variant({ ip: { status: 'executed', evidenceSha256: HASH }, evidence: verifyInstrument });
  const r = validateProduct(SLUG, { ctx: c, forSale: true });
  assert.ok(!r.sale.some((m) => /IP: instrument/.test(m)), 'the IP check itself passes');
  assert.ok(r.sale.some((m) => /gates not PASS: .*L-IP/.test(m)), 'the L-IP gate still needs its own PASS');
  assert.ok(r.sale.some((m) => /T-TAX-POLICY/.test(m)), 'the tax gate is unaffected');
  assert.ok(r.sale.some((m) => /GO decision/.test(m)));
});

test('a product cannot be sellable while its rights gate is incomplete, even with every other gate passed', () => {
  const c = variant({ ip: { status: 'executed', evidenceSha256: HASH }, evidence: verifyInstrument,
    gates: (g) => { for (const x of g.gates) x.status = x.id === 'L-IP' ? 'REQUIRES FOUNDER APPROVAL' : 'PASS'; return g; } });
  const r = validateProduct(SLUG, { ctx: c, forSale: true });
  assert.ok(r.sale.some((m) => /gates not PASS: L-IP/.test(m)));
});

test('IFSA student products are restricted: no product record can pass, in any mode', () => {
  const products = clone(ctx.products);
  for (const w of ctx.restricted.works) {
    products[w.slug] = { ...clone(products[SLUG]), name: w.name, saleApproved: true };
    const r = validateProduct(w.slug, { ctx: { ...ctx, products } });
    assert.ok(r.onboarding.some((m) => /restricted work/.test(m)), w.slug);
  }
  const names = ctx.restricted.works.map((w) => w.slug);
  for (const s of ['operations-procedures-assistant', 'service-review-pack-builder']) assert.ok(names.includes(s), s);
  for (const s of names) assert.ok(!Object.hasOwn(ctx.products, s), `${s} has a product record`);
  const schedule = read('docs/legal/ip/schedule-a.md');
  for (const n of ['Operations Procedures Assistant', 'Service Review Pack Builder']) assert.match(schedule, new RegExp(`\\*\\*${n}\\*\\*.*no rights chain documented`));
});

test('the evidence manifest is a redacted index: no personal data fields, private references, fingerprints when verified', () => {
  assert.deepEqual(evidenceManifestErrors(ctx.evidence), []);
  const bad = clone(ctx.evidence);
  bad.records.push({ id: 'x', type: 'ip_instrument', subject: 'company', status: 'verified', sha256: null, storageRef: 'private:x', dateOfBirth: '1990-01-01' });
  bad.records.push({ id: 'y', type: 'nonsense', status: 'done', storageRef: 'https://drive.example/file' });
  const e = evidenceManifestErrors(bad).join('\n');
  for (const m of ['needs its SHA-256', 'looks like personal data', 'unknown type', 'unknown status', 'storageRef must be']) assert.match(e, new RegExp(m));
});

test('the instruments are marked unsigned and carry no personal data of the signatories', () => {
  for (const f of readdirSync(new URL('../docs/legal/ip/', import.meta.url))) {
    const s = read('docs/legal/ip/' + f);
    assert.doesNotMatch(s, /\b\d{1,2}\.\s?\d{1,2}\.\s?(19|20)\d{2}\b(?! *[-–])(?=[^|\n]*nar)/, `${f}: a birth date`);
    if (/^instrument-a\./.test(f)) {
      assert.match(s, /UNSIGNED|NEPODEPSÁNO/);
      assert.match(s, /\[(on the signed copy only|jen na podepsaném vyhotovení)\]/);
    }
  }
  const cs = read('docs/legal/ip/instrument-a.cs.md'); const en = read('docs/legal/ip/instrument-a.en.md');
  const heads = (t) => [...t.matchAll(/^## (\d+)\./gm)].map((m) => m[1]);
  assert.deepEqual(heads(cs), heads(en), 'both language versions have the same clause numbering');
  assert.equal(heads(cs).length, 22);
});
