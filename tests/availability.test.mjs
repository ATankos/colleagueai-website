/**
 * tests/availability.test.mjs - the agent availability framework (P0, 26 Nov 2026).
 *
 * Holds the lines the brief sets: every commercially unapproved agent shows "Coming soon" everywhere; no direct API
 * call can buy one; the catalogue, the factsheets, the localized pages and the structured data agree; L5 is never
 * sold; technical approval never opens a sale; commercial availability needs a complete, explicit approval record;
 * and the interest registration stores a consented, minimised, de-duplicated record and promises no date.
 *
 * Local fake KV (same shape as tests/demo-booking.test.mjs). No network, no secrets.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AV from '../config/availability.json' with { type: 'json' };
import PR from '../config/products.json' with { type: 'json' };
import { publicStatus, commercialSaleAllowed, permittedActions, registryErrors, approvalValid, agentRecord, releaseEvidenceErrors, PUBLIC, PUBLIC_LABELS } from '../lib/availability.js';
import { approveCommercially } from './helpers/commercial-approval.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SLUGS = Object.keys(AV.agents);
const clone = (x) => structuredClone(x);
const walk = (d, o = []) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, o) : o.push(p); } return o; };
const CI = 'contract-intelligence-and-register';
const VER = PR[CI].release.version;
const APPROVED = { approvedBy: 'Founder', date: '2026-11-26', reference: 'PR #1', release: VER };
/** Clones of both files with CI fully approved for sale (or with the given overrides). */
/** A fake repository for the gate: the config/agents record, its release record, its gates and the launch scope. */
const REL = PR[CI].release;
const GOOD_REC = { version: VER, package: REL.package, sha256: REL.sha256, bytes: REL.bytes, bundleRevision: REL.bundleRevision, status: 'released' };
const PASS_GATE = (id, area = 'product') => ({ id, area, status: 'PASS', decision: { recordedBy: 'engineering', recordedAt: '2026-11-26', recordCommit: 'abcdef1' } });
import { MANDATORY_GATES } from '../lib/releaseGates.js';
const area = (id) => ({ P: 'product', C: 'commercial', L: 'legal', T: 'tax', O: 'operations' }[id[0]]);
const APPROVED_GATE = (id) => ({ id, area: area(id), status: 'PASS', requiredApprover: ['founder'], approval: { by: 'Founder', role: 'founder', at: '2026-11-26', reference: 'PR' } });
const FOUNDER_GATES = new Set(['C-REFUND-PREVIEW', 'L-LEGAL-TEXTS', 'L-IP', 'T-TAX-POLICY', 'O-DPA-SECURITY', 'O-PROD-CONFIG', 'O-REVIEW-CONTROL']);
const GOOD_GATES = { release: VER, gates: MANDATORY_GATES.map((id) => (FOUNDER_GATES.has(id) ? APPROVED_GATE(id) : PASS_GATE(id, area(id)))) };
function agentsWith(sale, { rec = GOOD_REC, gates = GOOD_GATES, ip = { status: 'executed', evidenceSha256: 'a'.repeat(64) }, scope = { products: { [CI]: { sku: PR[CI].sku, release: VER, bundleRevision: REL.bundleRevision } } } } = {}) {
  return {
    get: (s) => (s === CI ? { sale, ip, release: { record: 'rec.json', gates: 'gates.json' } } : null),
    json: (k) => (k === 'rec.json' ? rec : k === 'gates.json' ? gates : null),
    scope, evidence: { records: [] },
  };
}
function approvedWorld({ approval = APPROVED, saleApproved = true, status = 'released', lifecycle = 'commercially-approved', publicStatus: ps = 'available', tier, catalogue = {}, repo = {} } = {}) {
  const r = clone(AV), p = clone(PR);
  Object.assign(r.agents[CI], { lifecycle, publicStatus: ps, technicalReadiness: 'technically-approved', certification: 'internally-certified', releaseBlockers: [] }, catalogue);
  if (tier) r.agents[CI].cai.targetLevel = tier;
  Object.assign(p[CI], { saleApproved }); p[CI].release.status = status;
  return [r, p, agentsWith({ goDecision: approval, earlyAccess: null }, repo)];
}

// ---------- fake KV ----------
const store = new Map(); const lists = new Map();
const kvServer = http.createServer((req, res) => {
  const [, cmd, ...rest] = req.url.split('/').map(decodeURIComponent);
  switch (cmd) {
    case 'SET': if (rest.includes('NX') && store.has(rest[0])) return res.end(JSON.stringify({ result: null })); if (rest.includes('XX') && !store.has(rest[0])) return res.end(JSON.stringify({ result: null })); store.set(rest[0], rest[1]); return res.end(JSON.stringify({ result: 'OK' }));
    case 'LREM': { const l = (lists.get(rest[0]) ?? []).filter((x) => x !== rest[2]); lists.set(rest[0], l); return res.end(JSON.stringify({ result: 1 })); }
    case 'GET': return res.end(JSON.stringify({ result: store.get(rest[0]) ?? null }));
    case 'DEL': store.delete(rest[0]); return res.end(JSON.stringify({ result: 1 }));
    case 'EXPIRE': return res.end(JSON.stringify({ result: 1 }));
    case 'INCR': { const n = (Number(store.get(rest[0])) || 0) + 1; store.set(rest[0], n); return res.end(JSON.stringify({ result: n })); }
    case 'LPUSH': { const l = lists.get(rest[0]) ?? []; l.unshift(rest[1]); lists.set(rest[0], l); return res.end(JSON.stringify({ result: l.length })); }
    case 'LRANGE': { const l = lists.get(rest[0]) ?? []; return res.end(JSON.stringify({ result: l.slice(Number(rest[1]), Number(rest[2]) + 1) })); }
    default: return res.end(JSON.stringify({ result: null }));
  }
});
let interest, checkout;
before(async () => {
  await new Promise((r) => kvServer.listen(0, r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  delete process.env.RESEND_API_KEY; delete process.env.DEMO_NOTIFY_EMAIL;
  process.env.INTEREST_COLLECTION_ENABLED = 'true'; // each Gate B test below sets its own state
  ({ default: interest } = await import('../api/interest.js'));
  ({ default: checkout } = await import('../api/checkout.js'));
});
after(() => kvServer.close());
beforeEach(() => { store.clear(); lists.clear(); });
const resDouble = () => { const r = { statusCode: 200, headers: {} }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = r.send = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.redirect = (c, u) => { r.statusCode = c; r.headers.location = u; return r; }; return r; };
const post = async (body, { query = {}, ip = '198.51.100.7' } = {}) => { const r = resDouble(); await interest({ method: 'POST', body, query, headers: { 'x-forwarded-for': ip }, socket: {} }, r); return r; };
const VALID = { agent: 'onboarding-agent', email: 'it.lead@example.com', company: 'Example s.r.o.', useCase: 'Onboard new starters across three sites with a governed checklist and HR hand-offs.', techEnvironment: 'copilot-studio', timeframe: '3-6-months', industry: 'manufacturing', consent: true, startedAt: Date.now() - 60000 };

// ---------- 1. registry ----------
test('registry: 36 agents, consistent, every one Coming soon, none commercially available; evidence preserved', () => {
  assert.equal(SLUGS.length, 36);
  assert.deepEqual(registryErrors(), []);
  for (const s of SLUGS) {
    assert.equal(publicStatus(s), 'coming-soon', s);
    assert.equal(commercialSaleAllowed(s), false, s);
    assert.ok(permittedActions(s).includes('register-interest') && !permittedActions(s).includes('purchase-licence'), s);
    assert.ok(!('commercialApproval' in AV.agents[s]) && !('goDecision' in AV.agents[s]), `${s}: approvals live only in config/agents/<slug>.json`);
  }
  // Contract Intelligence keeps its technical maturity, releases and evidence; it is still Coming soon.
  assert.equal(AV.agents[CI].lifecycle, 'technically-approved');
  assert.equal(PR[CI].release.version, '1.0.3.6');
  assert.deepEqual(PR[CI].previousReleases.map((r) => r.version), ['1.0.3.2', '1.0.3.4']);
  assert.equal(PR[CI].release.status, 'controlled-test');
  assert.equal(PR[CI].saleApproved, false);
  assert.equal(agentRecord(CI).sale.goDecision, null, 'no GO decision recorded');
  assert.equal(publicStatus(CI), 'coming-soon');
});

test('a fully approved world opens the sale; this proves the tests below fail for the right reason', () => {
  const [r, p, a] = approvedWorld();
  assert.deepEqual(registryErrors(r, p, new Date(), a), []);
  assert.equal(commercialSaleAllowed(CI, r, p, new Date(), a), true);
  assert.equal(publicStatus(CI, r, p, new Date(), a), 'available');
});

test('fail closed: missing, incomplete, expired, revoked, future-dated or other-version approvals never open a sale', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  const bad = {
    missing: null,
    noApprover: { ...APPROVED, approvedBy: '' },
    noReference: { ...APPROVED, reference: ' ' },
    badDate: { ...APPROVED, date: 'soon' },
    future: { ...APPROVED, date: '2027-01-01' },
    otherVersion: { ...APPROVED, release: '1.0.3.4' },
    noVersion: { ...APPROVED, release: undefined },
    expired: { ...APPROVED, expiresAt: '2026-11-30' },
    revoked: { ...APPROVED, revokedAt: '2026-11-28' },
  };
  for (const [name, ap] of Object.entries(bad)) {
    assert.equal(approvalValid(ap, VER, now), false, name);
    const [r, p, a] = approvedWorld({ approval: ap });
    assert.equal(commercialSaleAllowed(CI, r, p, now, a), false, name);
    assert.equal(publicStatus(CI, r, p, now, a), 'coming-soon', name);
    assert.ok(registryErrors(r, p, now, a).length > 0, `${name}: inconsistency is reported`);
  }
  assert.equal(approvalValid({ ...APPROVED, expiresAt: '2027-06-01' }, VER, now), true, 'an unexpired approval stays valid');
});

test('fail closed: each record alone is not enough (saleApproved, approval, release status, lifecycle)', () => {
  for (const o of [{ saleApproved: false }, { status: 'controlled-test' }, { lifecycle: 'technically-approved' }, { lifecycle: 'release-candidate' }]) {
    const [r, p, a] = approvedWorld(o);
    assert.equal(commercialSaleAllowed(CI, r, p, new Date(), a), false, JSON.stringify(o));
    assert.equal(publicStatus(CI, r, p, new Date(), a), 'coming-soon', JSON.stringify(o));
  }
  const r = clone(AV); r.agents['onboarding-agent'].publicStatus = 'available'; r.agents['onboarding-agent'].lifecycle = 'generally-available';
  assert.equal(commercialSaleAllowed('onboarding-agent', r), false, 'no product record, no sale');
});

test('fail closed: release evidence must exist AND apply to this exact release and package', () => {
  const bad = {
    'blockers missing': { catalogue: { releaseBlockers: undefined } },
    'blockers not a list': { catalogue: { releaseBlockers: 'none' } },
    'open blocker': { catalogue: { releaseBlockers: ['counsel sign-off'] } },
    'not technically approved': { catalogue: { technicalReadiness: 'release-candidate' } },
    'not certified': { catalogue: { certification: 'internal-review' } },
    'no release record': { repo: { rec: null } },
    'record for another version': { repo: { rec: { ...GOOD_REC, version: '1.0.3.4' } } },
    'record for another package': { repo: { rec: { ...GOOD_REC, sha256: 'b'.repeat(64) } } },
    'record for another revision': { repo: { rec: { ...GOOD_REC, bundleRevision: 2 } } },
    'no gates': { repo: { gates: null } },
    'gates for another version': { repo: { gates: { ...GOOD_GATES, release: '1.0.3.4' } } },
    'empty gates': { repo: { gates: { release: VER, gates: [] } } },
    'a mandatory gate dropped from the file': { repo: { gates: { ...GOOD_GATES, gates: GOOD_GATES.gates.filter((x) => x.id !== 'L-IP') } } },
    'a mandatory product gate dropped': { repo: { gates: { ...GOOD_GATES, gates: GOOD_GATES.gates.filter((x) => x.id !== 'P-ISOLATION') } } },
    'a gate not PASS': { repo: { gates: { release: VER, gates: [...GOOD_GATES.gates, { id: 'L-IP', area: 'legal', status: 'REQUIRES FOUNDER APPROVAL', requiredApprover: ['founder'] }] } } },
    'PASS without a decision': { repo: { gates: { release: VER, gates: [{ id: 'P-X', area: 'product', status: 'PASS' }] } } },
    'PASS without the founder approval': { repo: { gates: { release: VER, gates: [{ id: 'L-IP', area: 'legal', status: 'PASS', requiredApprover: ['founder'] }] } } },
    'outside the launch scope': { repo: { scope: { products: {} } } },
    'IP not executed': { repo: { ip: { status: 'unsigned' } } },
  };
  for (const [name, o] of Object.entries(bad)) {
    const [r, p, a] = approvedWorld(o);
    assert.equal(commercialSaleAllowed(CI, r, p, new Date(), a), false, name);
    assert.equal(publicStatus(CI, r, p, new Date(), a), 'coming-soon', name);
  }
  // The real repository: Contract Intelligence 1.0.3.6 is refused for documented, specific reasons.
  const why = releaseEvidenceErrors(CI);
  assert.ok(why.some((e) => e.includes('open release blocker')) && why.some((e) => e.includes('gates not PASS')) && why.some((e) => e.includes('IP instrument')), why.join('; '));
  assert.ok(!why.some((e) => e.includes('does not match')), 'the real release record matches release 1.0.3.6 and its package');
});

test('early access: independent version-specific approval AND validated technical readiness', () => {
  const n = new Date(); const EA = { ...APPROVED };
  const world = (catalogue, repo) => { const [r, p] = approvedWorld({ catalogue: { publicStatus: 'early-access', lifecycle: 'technically-approved', ...catalogue } }); return [r, p, agentsWith({ goDecision: null, earlyAccess: EA }, repo)]; };
  let [r, p, a] = world({});
  assert.equal(publicStatus(CI, r, p, n, a), 'early-access');
  for (const [name, c, repo] of [['in development', { technicalReadiness: 'prototype' }], ['blockers missing', { releaseBlockers: undefined }],
    ['product gate open', {}, { gates: { release: VER, gates: GOOD_GATES.gates.map((x) => (x.id === 'P-WORKFLOW-CLEAN' ? { id: x.id, area: 'product', status: 'BLOCKED', blockedBy: 'test' } : x)) } }],
    ['mandatory product gate missing', {}, { gates: { release: VER, gates: GOOD_GATES.gates.filter((x) => x.id !== 'P-UNINSTALL') } }],
    ['gates for another version', {}, { gates: { ...GOOD_GATES, release: '1.0.3.4' } }], ['package mismatch', {}, { rec: { ...GOOD_REC, sha256: 'c'.repeat(64) } }]]) {
    [r, p, a] = world(c, repo);
    assert.equal(publicStatus(CI, r, p, n, a), 'coming-soon', name);
  }
  // A commercial gate still open does not block early access; it does block a sale.
  [r, p, a] = world({}, { gates: { release: VER, gates: GOOD_GATES.gates.map((x) => (x.id === 'T-TAX-POLICY' ? { id: 'T-TAX-POLICY', area: 'tax', status: 'REQUIRES FOUNDER APPROVAL', requiredApprover: ['founder'] } : x)) } });
  assert.equal(publicStatus(CI, r, p, n, a), 'early-access');
  assert.equal(commercialSaleAllowed(CI, r, p, n, a), false);
  // The real repository today: P-WORKFLOW-CLEAN is BLOCKED, so early access could not open even with an approval.
  assert.ok(releaseEvidenceErrors(CI, 'early-access').some((e) => e.includes('P-WORKFLOW-CLEAN')));
});

test('technical approval never activates a commercial sale or early access', () => {
  const r = clone(AV);
  Object.assign(r.agents[CI], { lifecycle: 'technically-approved', technicalReadiness: 'technically-approved', certification: 'internally-certified', publicStatus: 'available' });
  assert.equal(publicStatus(CI, r), 'coming-soon');
  assert.equal(commercialSaleAllowed(CI, r), false);
  r.agents[CI].publicStatus = 'early-access';
  assert.equal(publicStatus(CI, r), 'coming-soon');
});

test('release evidence is read only from config/ and scripts/cai-release/<version>/release-candidate.json', async () => {
  const { repoJson } = await import('../lib/availability.js');
  assert.ok(repoJson('config/release-gates.json')); assert.ok(repoJson('scripts/cai-release/1.0.3.6/release-candidate.json'));
  for (const bad of ['package.json', '../package.json', '/etc/passwd.json', 'config/../package.json', 'scripts/cai-release/1.0.3.6/flows/x.json', 'api/x.json']) assert.equal(repoJson(bad), null, bad);
});

test('mandatory gate set: the real gates file carries every mandatory gate; revoked early access never opens', () => {
  const real = JSON.parse(readFileSync(join(ROOT, 'config/release-gates.json'), 'utf8'));
  const ids = new Set(real.gates.map((g) => g.id));
  assert.deepEqual(MANDATORY_GATES.filter((id) => !ids.has(id)), [], 'config/release-gates.json lacks a mandatory gate');
  assert.ok(!releaseEvidenceErrors(CI).some((e) => e.includes('mandatory gates missing')));
  for (const ea of [{ ...APPROVED, revokedAt: '2026-11-26' }, { ...APPROVED, revokedAt: '2026-11-26', expiresAt: '2099-01-01' }, { ...APPROVED, status: 'revoked', revokedAt: '2026-11-26' }]) {
    const [r, p] = approvedWorld({ catalogue: { publicStatus: 'early-access', lifecycle: 'technically-approved' } });
    assert.equal(publicStatus(CI, r, p, new Date(), agentsWith({ earlyAccess: ea })), 'coming-soon', JSON.stringify(ea));
  }
});

test('early access needs its own valid, version-specific approval and is not a sale', () => {
  const [r, p] = approvedWorld({ catalogue: { publicStatus: 'early-access', lifecycle: 'technically-approved' } }); const n = new Date();
  assert.equal(publicStatus(CI, r, p, n, agentsWith({ earlyAccess: null })), 'coming-soon');
  assert.equal(publicStatus(CI, r, p, n, agentsWith({ earlyAccess: { ...APPROVED, release: '1.0.3.4' } })), 'coming-soon', 'an approval for another version');
  assert.equal(publicStatus(CI, r, p, n, agentsWith({ earlyAccess: { ...APPROVED, revokedAt: '2026-11-27' } })), 'coming-soon', 'a revoked approval');
  assert.equal(publicStatus(CI, r, p, n, agentsWith({ earlyAccess: { ...APPROVED, expiresAt: '2026-11-26' } })), 'coming-soon', 'an expired approval');
  assert.equal(publicStatus(CI, r, p, n, agentsWith({ goDecision: { ...APPROVED } })), 'coming-soon', 'a GO decision is not an early-access approval');
  assert.equal(publicStatus(CI, r, p, n, agentsWith({ earlyAccess: { ...APPROVED } })), 'early-access');
  assert.equal(commercialSaleAllowed(CI, r, p, n, agentsWith({ earlyAccess: { ...APPROVED } })), false, 'early access is not a sale');
});

test('L5 is never available and never sold, even with every approval recorded', () => {
  const [r, p, a] = approvedWorld({ tier: 'L5' });
  assert.equal(commercialSaleAllowed(CI, r, p, new Date(), a), false);
  assert.notEqual(publicStatus(CI, r, p, new Date(), a), 'available');
  const tiers = JSON.parse(readFileSync(join(ROOT, 'api/checkout.js'), 'utf8').match(/const SLUG_TIER = (\{[\s\S]*?\});/)[1]);
  assert.ok(!Object.values(tiers).includes('L5'), 'no catalogue agent is sold at L5');
  assert.match(readFileSync(join(ROOT, 'api/checkout.js'), 'utf8'), /tier === 'L5'\) return res\.status\(409\)/);
});

test('a target CAI level is never presented as a verified score without evidence', () => {
  for (const s of SLUGS) assert.equal(AV.agents[s].cai.verifiedScore, null, s);
  const r = clone(AV); r.agents['onboarding-agent'].cai.verifiedScore = 'L2';
  assert.ok(registryErrors(r).some((e) => e.includes('verifiedEvidence')));
});

// ---------- 2. server-side enforcement ----------
test('no unapproved agent can be bought with a live key through a direct API call, even with the switch open', async () => {
  const keep = { k: process.env.STRIPE_SECRET_KEY, c: process.env.CHECKOUT_ENABLED, v: process.env.VERCEL_ENV };
  process.env.STRIPE_SECRET_KEY = 'sk_live_NOT_A_REAL_KEY'; process.env.CHECKOUT_ENABLED = 'true'; process.env.VERCEL_ENV = 'production';
  try {
    for (const s of SLUGS) {
      for (const q of [{ agent: s }, { agent: s, cert: 'month' }, { agent: s, method: 'bank_transfer' }]) {
        const r = resDouble(); await checkout({ method: 'GET', query: q, headers: { host: 'x' } }, r);
        assert.ok(r.statusCode >= 400 && r.statusCode !== 503, `${s} ${JSON.stringify(q)} -> ${r.statusCode}`);
      }
    }
    // saleApproved=true on the release alone still refuses: the commercial authorisation must agree.
    const products = await import('../lib/products.js');
    const rec = products.productFor('contract-intelligence-and-register'); rec.saleApproved = true;
    try {
      const r = resDouble(); await checkout({ method: 'GET', query: { agent: 'contract-intelligence-and-register' }, headers: { host: 'x' } }, r);
      assert.equal(r.statusCode, 403); assert.equal(r.body.code, 'not_approved_for_sale'); assert.equal(r.body.availability, 'coming-soon');
      assert.ok(products.liveFulfilmentWithheld({ livemode: true, payment_status: 'paid', amount_total: 100, metadata: { agent_slug: 'contract-intelligence-and-register' } }), 'a paid live session (e.g. a payment link) is withheld: no licence, no entitlement');
    } finally { rec.saleApproved = false; }
    assert.equal(products.packageDeliverable('contract-intelligence-and-register'), false, 'as committed, no production package download');
  } finally {
    for (const [k, v] of [['STRIPE_SECRET_KEY', keep.k], ['CHECKOUT_ENABLED', keep.c], ['VERCEL_ENV', keep.v]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('commercial approval is the only thing that moves the live gate (with saleApproved), and it is reversible', async () => {
  const products = await import('../lib/products.js');
  const s = 'contract-intelligence-and-register'; const rec = products.productFor(s);
  rec.saleApproved = true; const restore = approveCommercially(s);
  try { assert.equal(products.liveSaleBlocked(s, 'sk_live_x'), false); } finally { restore(); rec.saleApproved = false; }
  assert.equal(products.liveSaleBlocked(s, 'sk_live_x'), true);
});

// ---------- 3. pages, localization, structured data ----------
test('every localized agents page carries the same availability map and the label of its language', () => {
  const pages = walk(join(ROOT, 'public')).filter((f) => /[\\/]agents(\.html|[\\/]index\.html)$/.test(f));
  assert.ok(pages.length >= 17, `found ${pages.length}`);
  for (const f of pages) {
    const s = readFileSync(f, 'utf8');
    const m = s.match(/\/\*CAI_AVAIL\*\/(\{.*?\})\/\*\/CAI_AVAIL\*\//); assert.ok(m, f);
    const map = JSON.parse(m[1]);
    for (const slug of SLUGS) assert.equal(map[slug], publicStatus(slug), `${f}: ${slug}`);
    assert.match(s, /\/\*CAI_SELLABLE\*\/\[\]\/\*\/CAI_SELLABLE\*\//, `${f}: nothing is sellable`);
    for (const loc of Object.keys(PUBLIC_LABELS)) assert.ok(s.includes(JSON.stringify(PUBLIC_LABELS[loc]['coming-soon'])), `${f}: ${loc} label`);
    assert.match(s, /intent=interest/, `${f}: catalogue CTAs lead to the interest form`);
    assert.doesNotMatch(s, /Controlled release|one in controlled release/, `${f}: technical wording shown as availability`);
  }
  for (const loc of Object.keys(PUBLIC_LABELS)) assert.deepEqual(Object.keys(PUBLIC_LABELS[loc]).sort(), [...PUBLIC].sort(), loc);
});

test('the interest form has every field in all eight languages', async () => {
  const { IL } = await import('../src/i18n/interestCopy.js');
  const keys = Object.keys(IL.en).sort();
  assert.deepEqual(Object.keys(IL).sort(), ['cs', 'de', 'en', 'es', 'fr', 'it', 'pl', 'pt']);
  for (const [loc, t] of Object.entries(IL)) {
    assert.deepEqual(Object.keys(t).sort(), keys, loc);
    assert.equal(t.status, PUBLIC_LABELS[loc]['coming-soon'], `${loc}: status label matches the catalogue`);
    assert.doesNotMatch(JSON.stringify(t), /\b(will be available|available on|release date is|launch(es|ing) on)\b/i, `${loc}: promises a date`);
  }
});

test('no page tells customers an agent can be bought today, in any language', () => {
  const CLAIMS = /evaluate and buy today|one package you can evaluate and buy|the one you can evaluate and buy|dnes můžete vyhodnotit a koupit|který můžete vyhodnotit a koupit|heute bewerten und kaufen|bewerten und kaufen können|évaluer et acheter aujourd|pouvez évaluer et acheter\.|evaluar y comprar hoy|puede evaluar y comprar\.|valutare e acquistare oggi|potete valutare e acquistare\.|dziś ocenić i kupić|możesz ocenić i kupić\.|avaliar e comprar hoje|pode avaliar e comprar\.|one in controlled release|35 (?:agents )?as concepts/i;
  const files = walk(join(ROOT, 'public')).filter((f) => /\.(html|txt|js)$/.test(f) && !/[\\/]legal[\\/]/.test(f));
  const hits = files.filter((f) => CLAIMS.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map((f) => f.slice(ROOT.length)), []);
});

test('structured data and AI-readable content never present an unapproved agent as on sale', () => {
  const files = walk(join(ROOT, 'public')).filter((f) => /\.(html|txt)$/.test(f) && !/[\\/]legal[\\/]/.test(f));
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /schema\.org\/(InStock|PreOrder|LimitedAvailability|OnlineOnly)/, `${f}: availability offer`);
  }
  const llms = readFileSync(join(ROOT, 'public/llms-full.txt'), 'utf8');
  assert.match(llms, /0 of 36 agents are commercially available today/);
  assert.equal((llms.match(/- Availability: Coming soon/g) || []).length, 36);
  assert.match(llms, /target classification, not a verified CAI Score/);
});

test('built factsheets agree with the catalogue and separate the certification attributes', { skip: !existsSync(join(ROOT, 'dist/agents')) && 'run npm run build first' }, () => {
  for (const s of SLUGS) {
    const f = join(ROOT, 'dist/agents', s + '.html'); if (!existsSync(f)) continue;
    const h = readFileSync(f, 'utf8');
    assert.match(h, new RegExp(`<span class="chip">${PUBLIC_LABELS.en[publicStatus(s)]}</span>`), s);
    for (const label of ['CAI framework classification', 'Verified CAI Score', 'Technical status', 'Commercial release', 'Continuous Certification']) assert.ok(h.includes(`<dt>${label}</dt>`), `${s}: ${label}`);
    assert.match(h, /A target classification, not an achieved certification\./);
    assert.match(h, /Not yet authorised\./);
    assert.doesNotMatch(h, /"offers"/, `${s}: an Offer in structured data`);
    assert.match(h, /intent=interest/, `${s}: register-interest CTA`);
  }
});

test('SEO/GEO: all 36 agents stay discoverable and indexable; HTML is never served stale from cache', { skip: !existsSync(join(ROOT, 'dist/sitemap.xml')) && 'run npm run build first' }, () => {
  const sitemap = readFileSync(join(ROOT, 'dist/sitemap.xml'), 'utf8');
  for (const s of SLUGS) {
    assert.ok(sitemap.includes(`/agents/${s}`), `${s}: in the sitemap`);
    const f = join(ROOT, 'dist/agents', s + '.html');
    if (!existsSync(f)) continue;
    const h = readFileSync(f, 'utf8');
    assert.match(h, /<meta name="robots" content="index, follow/, `${s}: indexable`);
    assert.doesNotMatch(h, /noindex/, `${s}: noindex`);
  }
  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  const page = vercel.headers.find((x) => x.source === '/((?!assets/).*)');
  assert.equal(page.headers.find((x) => x.key.toLowerCase() === 'cache-control').value, 'public, max-age=0, must-revalidate');
});

test('the build refuses to run with drifted pages', () => {
  assert.match(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.build, /^node scripts\/sync-availability\.mjs --check && /);
});

// ---------- 4. interest registration ----------
test('Gate B: interest collection is OFF unless INTEREST_COLLECTION_ENABLED is exactly "true"; nothing is stored', async () => {
  const keep = process.env.INTEREST_COLLECTION_ENABLED;
  try {
    for (const v of [undefined, '', '1', 'TRUE', 'yes', 'false']) {
      if (v === undefined) delete process.env.INTEREST_COLLECTION_ENABLED; else process.env.INTEREST_COLLECTION_ENABLED = v;
      const r = await post(VALID);
      assert.equal(r.statusCode, 503, `flag=${v}`); assert.equal(r.body.code, 'interest_collection_disabled');
      const s = resDouble(); await interest({ method: 'GET', query: { status: '1' }, headers: {}, socket: {} }, s);
      assert.deepEqual(s.body, { enabled: false }); assert.equal(s.headers['Cache-Control'], 'no-store');
    }
    assert.equal(lists.get('lead:index:interest'), undefined, 'no personal data stored while the switch is off');
    assert.ok([...store.keys()].every((k) => !k.startsWith('interest:seen:')), 'no dedupe marker either');
    // The anonymous view counter keeps working and its rate-limit key holds no plain address.
    const v = await post({ agent: 'onboarding-agent' }, { query: { event: 'view' }, ip: '203.0.113.9' });
    assert.equal(v.statusCode, 204);
    assert.ok([...store.keys()].every((k) => !k.includes('203.0.113.9')));
    process.env.INTEREST_COLLECTION_ENABLED = 'true';
    const s = resDouble(); await interest({ method: 'GET', query: { status: '1' }, headers: {}, socket: {} }, s);
    assert.deepEqual(s.body, { enabled: true });
  } finally { process.env.INTEREST_COLLECTION_ENABLED = keep; }
});

test('Gate B: no deployment configuration turns interest collection on', () => {
  const vercel = readFileSync(join(ROOT, 'vercel.json'), 'utf8');
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const envExample = existsSync(join(ROOT, '.env.example')) ? readFileSync(join(ROOT, '.env.example'), 'utf8') : '';
  for (const [name, src] of [['vercel.json', vercel], ['ci.yml', ci], ['.env.example', envExample]]) {
    assert.doesNotMatch(src, /INTEREST_COLLECTION_ENABLED\s*[=:]\s*["']?true/, name);
  }
});

test('interest: a valid registration is stored with consent, minimised fields and a demand count', async () => {
  const r = await post(VALID);
  assert.equal(r.statusCode, 200); assert.equal(r.body.success, true); assert.ok(r.body.id);
  const rec = JSON.parse(store.get(`lead:interest:${r.body.id}`));
  assert.equal(rec.agentSlug, 'onboarding-agent'); assert.equal(rec.availability, 'coming-soon');
  assert.equal(rec.consent.version, 'interest-2026-11-26');
  assert.equal(rec.techEnvironment, 'copilot-studio'); assert.equal(rec.timeframe, '3-6-months');
  assert.ok(!('name' in rec) && !('phone' in rec), 'no name or phone collected');
  assert.ok([...store.keys()].some((k) => /^demand:interest:onboarding-agent:\d{4}-\d{2}$/.test(k)));
  assert.doesNotMatch(JSON.stringify(r.body), /release date|available on/i);
});

test('interest: duplicates within 30 days store nothing new; the dedupe key holds no plain address', async () => {
  await post(VALID);
  const again = await post({ ...VALID, email: 'IT.LEAD@example.com' });
  assert.equal(again.body.duplicate, true);
  assert.equal(lists.get('lead:index:interest').length, 1);
  assert.ok([...store.keys()].every((k) => !k.includes('example.com')));
});

test('interest: consent, required fields, known agent and an open status are all enforced', async () => {
  assert.equal((await post({ ...VALID, consent: false })).body.code, 'consent_required');
  assert.equal((await post({ ...VALID, company: '' })).body.code, 'missing_fields');
  assert.equal((await post({ ...VALID, email: 'minimal@example.com', useCase: '', industry: '', techEnvironment: '', timeframe: '' })).statusCode, 200, 'email, company and consent are the only mandatory fields');
  assert.equal((await post({ ...VALID, email: 'nope' })).body.code, 'invalid_email');
  assert.equal((await post({ ...VALID, agent: 'constructor' })).body.code, 'unknown_agent');
  const rec = PR[CI]; rec.saleApproved = true; const restore = approveCommercially(CI);
  try { assert.equal((await post({ ...VALID, agent: CI })).body.code, 'not_open_for_interest', 'an Available agent is bought, not registered'); }
  finally { restore(); rec.saleApproved = false; }
});

test('interest: spam protection (honeypot, instant submit, rate limit) stores nothing', async () => {
  await post({ ...VALID, website: 'http://spam' });
  await post({ ...VALID, email: 'b@example.com', startedAt: Date.now() });
  assert.equal(lists.get('lead:index:interest'), undefined);
  let last;
  for (let i = 0; i < 10; i++) last = await post({ ...VALID, email: `u${i}@example.com` }, { ip: '192.0.2.50' });
  assert.equal(last.statusCode, 429);
});

test('interest: view beacon counts anonymously and never errors', async () => {
  const r = resDouble();
  await interest({ method: 'POST', body: { agent: 'onboarding-agent' }, query: { event: 'view' }, headers: { 'x-forwarded-for': '198.51.100.7', 'user-agent': 'Mozilla/5.0 Safari/605' }, socket: {} }, r);
  assert.equal(r.statusCode, 204);
  assert.equal(store.get(`demand:view:onboarding-agent:${new Date().toISOString().slice(0, 7)}`), 1);
});

test('demand tiers: engagement, registrations, high intent, qualified and validated intent stay separate', async () => {
  const { buildReport, toCsv, isHighIntent, isQualified } = await import('../scripts/demand-report.mjs');
  const base = { agentSlug: 'onboarding-agent', email: 'x@corp.example', timeframe: '0-3-months', techEnvironment: 'copilot-studio', useCase: 'x'.repeat(40), industry: 'manufacturing' };
  assert.equal(isHighIntent(base), true);
  assert.equal(isQualified(base), false, 'a corporate e-mail and a near timeframe alone are not a qualified lead');
  assert.equal(isHighIntent({ ...base, useCase: '' }), false);
  assert.equal(isQualified({ ...base, salesQualification: { stage: 'qualified' } }), false, 'a qualification needs who and when');
  const q = { ...base, salesQualification: { stage: 'pilot-agreed', by: 'Sales', at: '2026-11-26T10:00:00Z' } };
  const interest = [q, base, base, { ...base, agentSlug: 'sop-generation-agent', timeframe: 'exploring' }];
  const rows = buildReport({ slugs: SLUGS, counters: { view: { 'onboarding-agent': 40, 'people-ops-query-agent': 5000 }, bot: { 'people-ops-query-agent': 900 }, demo: {} }, interest, demos: [] });
  const ob = rows.find((r) => r.agent === 'onboarding-agent'); const po = rows.find((r) => r.agent === 'people-ops-query-agent'); const sop = rows.find((r) => r.agent === 'sop-generation-agent');
  assert.deepEqual([ob.registrations, ob.highIntent, ob.qualified, ob.validatedIntent], [3, 3, 1, 1]);
  assert.equal(ob.rank, 1, 'a validated opportunity outranks heavy anonymous traffic');
  assert.ok(po.demandIndex < ob.demandIndex && po.botViews === 900);
  assert.equal(sop.insufficientData, true); assert.equal(sop.rank, null); assert.equal(sop.demandIndex, null);
  assert.ok(rows.filter((r) => r.insufficientData).every((r) => r.rank === null), 'no ranking on insufficient data');
  assert.doesNotMatch(toCsv(rows), /@/);
});

test('views: bots are counted apart and a visitor counts once per agent per day, without a persistent id', async () => {
  const day = new Date().toISOString().slice(0, 7);
  const view = (ua, ip = '198.51.100.20') => interest({ method: 'POST', body: { agent: 'onboarding-agent' }, query: { event: 'view' }, headers: { 'x-forwarded-for': ip, 'user-agent': ua }, socket: {} }, resDouble());
  const human = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131 Safari/537.36';
  await view(human); await view(human); await view(human, '198.51.100.21'); await view('curl/8.4'); await view('');
  assert.equal(store.get(`demand:view:onboarding-agent:${day}`), 2);
  assert.equal(store.get(`demand:bot:onboarding-agent:${day}`), 2);
  assert.ok([...store.keys()].filter((k) => k.startsWith('demand:seen:')).every((k) => !/198\.51|Mozilla/.test(k)));
});

test('notifications: recorded per registration, idempotent, bounded, and never logged with personal data', async () => {
  const { notifyInterest, retryDue, MAX_ATTEMPTS } = await import('../lib/interestNotify.js');
  const logs = []; const keepLog = console.log; console.log = (...a) => logs.push(a.map(String).join(' '));
  let r;
  try { r = await post({ ...VALID, email: 'notify.me@example.com' }); } finally { console.log = keepLog; }
  const id = r.body.id; const read = () => JSON.parse(store.get(`lead:interest:${id}`));
  assert.equal(read().notification.status, 'not-configured', 'no provider configured: recorded, not silently dropped');
  assert.ok(logs.every((l) => !l.includes('notify.me@example.com') && !l.includes('Example s.r.o.')), 'logs hold no personal data');
  assert.equal(read().marketing.optIn, false, 'marketing is opt-in and separate from the follow-up consent');
  process.env.RESEND_API_KEY = 're_test_dummy'; process.env.DEMO_NOTIFY_EMAIL = 'inbox@example.com';
  try {
    const calls = [];
    const fail = async (u, o) => { calls.push(o); return { ok: false, status: 500, json: async () => ({ message: 'leaks notify.me@example.com' }) }; };
    let n = await notifyInterest(id, { fetchImpl: fail });
    assert.equal(n.status, 'failed'); assert.equal(n.attempts, 1); assert.equal(n.lastError, 'HTTP 500');
    assert.ok(!JSON.stringify(read().notification).includes('notify.me@'), 'provider error bodies are not stored');
    assert.equal(retryDue(read(), Date.now()), false, 'back-off before the next attempt');
    assert.equal(retryDue(read(), Date.now() + 6 * 60 * 1000), true);
    const ok = async (u, o) => { calls.push(o); return { ok: true, status: 200, json: async () => ({ id: 'em_123' }) }; };
    n = await notifyInterest(id, { fetchImpl: ok });
    assert.equal(n.status, 'accepted'); assert.equal(n.providerId, 'em_123'); assert.ok(n.acceptedAt); assert.equal(n.deliveredAt, null, 'acceptance is not delivery');
    assert.equal(calls[1].headers['Idempotency-Key'], `interest-notify/${id}`);
    await notifyInterest(id, { fetchImpl: ok });
    assert.equal(calls.length, 2, 'an accepted notification is never sent again');
    // Bounded: a registration that keeps failing gives up after MAX_ATTEMPTS.
    const r2 = await post({ ...VALID, email: 'second@example.com' });
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await notifyInterest(r2.body.id, { fetchImpl: fail });
    const n2 = JSON.parse(store.get(`lead:interest:${r2.body.id}`)).notification;
    assert.equal(n2.status, 'gave-up'); assert.equal(n2.attempts, MAX_ATTEMPTS);
    // A concurrent run is locked out.
    store.set(`interest:notify-lock:${id}`, '1');
    assert.equal((await notifyInterest(id, { fetchImpl: ok })).status, 'locked');
  } finally { delete process.env.RESEND_API_KEY; delete process.env.DEMO_NOTIFY_EMAIL; }
});

test('operations: qualification needs a named person; deletion removes the records and the duplicate check', async () => {
  const ops = await import('../scripts/interest-ops.mjs');
  const a = await post({ ...VALID, email: 'Delete.Me@example.com' });
  await post({ ...VALID, email: 'delete.me@example.com', agent: 'sop-generation-agent' });
  await assert.rejects(ops.qualify({ id: a.body.id, stage: 'qualified', by: '', apply: true }));
  await assert.rejects(ops.qualify({ id: a.body.id, stage: 'hot', by: 'Sales', apply: true }));
  await ops.qualify({ id: a.body.id, stage: 'purchase-intent', by: 'Sales lead', apply: true });
  assert.equal(JSON.parse(store.get(`lead:interest:${a.body.id}`)).salesQualification.stage, 'purchase-intent');
  const dry = await ops.deleteByEmail({ email: 'DELETE.me@example.com', apply: false });
  assert.equal(dry.matched, 2); assert.equal(dry.deleted, false);
  await ops.deleteByEmail({ email: 'delete.me@example.com', apply: true });
  assert.equal(store.get(`lead:interest:${a.body.id}`), undefined);
  assert.ok(!lists.get('lead:index:interest').includes(a.body.id));
  assert.equal((await post({ ...VALID, email: 'delete.me@example.com' })).body.duplicate, undefined, 'the duplicate check was cleared too');
});
