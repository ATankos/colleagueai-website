#!/usr/bin/env node
/**
 * scripts/release/validate-product.mjs - checks that a sellable agent has everything the shared commercial platform
 * needs, and nothing contradicts across files.
 *
 *   node scripts/release/validate-product.mjs [<slug> ...] [--for-sale] [--json]
 *
 * No slug: every product in config/products.json. Two levels:
 *   ONBOARDED  (always) the records exist, agree with each other and point at files that exist: products.json entry,
 *              pricing tier, package list, factsheet facts and running costs, config/agents/<slug>.json with every
 *              field filled, release record (same package, hash, size, revision, solution hash), SHA256SUMS file,
 *              install guide, dossier PDF, gate list, automated tests.
 *   FOR SALE   (when saleApproved is true, or with --for-sale) additionally: release status 'released', launch scope
 *              entry for this release and revision, IP instrument executed with its evidence hash, no student work
 *              without a covering instrument, every gate PASS, and a recorded GO decision.
 * Exit 1 when any product has an error at the level that applies to it. Reads files only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEX64 = /^[0-9a-f]{64}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER = /<[^>]+>/;

function filled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '' && !PLACEHOLDER.test(v);
  if (Array.isArray(v)) return v.length > 0 && v.every(filled);
  if (typeof v === 'object') return Object.values(v).every((x) => x === null || filled(x));
  return true;
}

export function loadContext(root = ROOT) {
  const rj = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const agentsHtml = readFileSync(join(root, 'public/agents.html'), 'utf8');
  const generator = readFileSync(join(root, 'scripts/generate-agent-pages.mjs'), 'utf8');
  return {
    products: rj('config/products.json'), pricing: rj('config/pricing.json'), packages: rj('config/packages.json'),
    scope: rj('config/launch-scope.json'), agentsHtml, generator,
    evidence: existsSync(join(root, 'config/evidence-manifest.json')) ? rj('config/evidence-manifest.json') : { records: [] },
    restricted: existsSync(join(root, 'config/restricted-works.json')) ? rj('config/restricted-works.json') : { works: [] },
    agentRecord: (slug) => (existsSync(join(root, `config/agents/${slug}.json`)) ? rj(`config/agents/${slug}.json`) : null),
    readJson: rj, exists: (p) => typeof p === 'string' && p.length > 0 && existsSync(join(root, p.split('#')[0])),
  };
}

export function validateProduct(slug, { forSale = false, ctx = loadContext() } = {}) {
  const onboarding = []; const sale = [];
  const P = ctx.products[slug];
  if (!P || slug === '_comment') return { slug, onboarding: [`${slug}: no record in config/products.json`], sale: [], level: 'none' };
  const R = P.release || {};
  const A = ctx.agentRecord(slug);
  const need = (cond, msg) => { if (!cond) onboarding.push(msg); };

  // a restricted work (e.g. IFSA student products) cannot be a product until its rights chain is verified
  const rw = (ctx.restricted.works || []).find((w) => w.slug === slug);
  if (rw) {
    const ev = (ctx.evidence.records || []).find((r) => r.id === rw.evidenceId);
    need(rw.status === 'cleared' && ev?.type === 'rights_chain' && ev.status === 'verified' && HEX64.test(ev.sha256 || ''),
      `restricted work (config/restricted-works.json): no verified rights chain - missing: ${(rw.missing || []).join('; ')}`);
  }

  // products.json + shared configuration
  need(filled(P.name), 'products.json: name');
  need(/^CAI-L[1-5]-[A-Z]{2,4}-\d{3}$/.test(P.sku || ''), `products.json: sku "${P.sku}" is not CAI-L<n>-<XX>-<NNN>`);
  need(P.tier && P.sku?.startsWith(`CAI-${P.tier}-`), 'products.json: tier does not match the SKU');
  need(ctx.pricing.tiers?.[P.tier]?.oneTimeCents > 0, `pricing.json: no price for tier ${P.tier}`);
  need(typeof P.saleApproved === 'boolean', 'products.json: saleApproved must be true or false');
  need(filled(R.version) && filled(R.status), 'products.json: release.version / release.status');
  const rev = R.bundleRevision > 1 ? `-r${R.bundleRevision}` : '';
  need(R.package === `${P.sku}_${R.version}${rev}.zip`, `products.json: package "${R.package}" is not ${P.sku}_${R.version}${rev}.zip`);
  need(HEX64.test(R.sha256 || ''), 'products.json: release.sha256 (64 hex)');
  need(R.bytes > 0, 'products.json: release.bytes');
  need((ctx.packages.agents?.[slug] || []).length > 0, 'packages.json: no installable package listed');
  need(ctx.agentsHtml.includes(`"${slug}":{"en"`), 'public/agents.html: no PRODUCT_FACTS entry (factsheet facts)');
  need(SLUG_RE.test(slug) && (ctx.generator.includes(`'${slug}': '`) || ctx.generator.includes(`'${slug}':'`)), 'scripts/generate-agent-pages.mjs: no RUNTIME (Microsoft running costs) entry');

  // per-agent commercial record
  if (!A) {
    onboarding.push(`config/agents/${slug}.json missing (copy config/agents/_template.json)`);
  } else {
    need(A.schema === 'cai-commercial-product/1', 'agent record: schema');
    need(A.slug === slug && A.sku === P.sku, 'agent record: slug/sku differ from products.json');
    for (const k of ['category', 'capabilities', 'useCases', 'exclusions', 'managedSolution', 'microsoft', 'tenant', 'support', 'knownLimitations', 'documentation', 'release', 'tests'])
      need(filled(A[k]), `agent record: ${k} incomplete`);
    need(HEX64.test(A.managedSolution?.sha256 || ''), 'agent record: managedSolution.sha256');
    need(A.managedSolution?.version === R.version, 'agent record: managedSolution.version differs from the release');
    need(A.support?.months >= 24 && A.support?.securitySupportMonths >= 24 && A.support?.correctiveReleases === true,
      'agent record: support below the Licence §5 baseline (24 months, corrective releases, security support)');
    for (const [k, p] of Object.entries(A.documentation || {})) need(ctx.exists(p), `agent record: documentation.${k} ${p} not found`);
    need(ctx.exists(A.knownLimitations), 'agent record: knownLimitations file not found');
    for (const k of ['record', 'gates', 'certifier']) need(ctx.exists(A.release?.[k]), `agent record: release.${k} not found`);
    for (const t of A.tests?.automated || []) need(ctx.exists(t), `agent record: test ${t} not found`);
    need(filled(A.ip?.instrument) && filled(A.ip?.contributors) && filled(A.ip?.studentWork) && ['unsigned', 'executed'].includes(A.ip?.status),
      'agent record: ip (instrument, contributors, studentWork, status unsigned|executed)');
    // 'executed' is a claim about a signed document: it needs a verified evidence record with the same fingerprint
    if (A.ip?.status === 'executed') {
      const ev = (ctx.evidence.records || []).find((r) => r.type === 'ip_instrument' && [slug, 'company'].includes(r.subject) && r.status === 'verified' && r.sha256 === A.ip.evidenceSha256);
      need(HEX64.test(A.ip.evidenceSha256 || '') && ev, 'agent record: ip.status "executed" without a verified ip_instrument record of the same SHA-256 in config/evidence-manifest.json');
    }
    need(A.ip?.status !== 'unsigned' || A.ip?.evidenceSha256 == null, 'agent record: an unsigned instrument has no evidence fingerprint');

    // release record agrees with products.json
    if (ctx.exists(A.release?.record)) {
      const rc = ctx.readJson(A.release.record);
      for (const k of ['version', 'package', 'sha256', 'bytes', 'bundleRevision', 'status'])
        need(rc[k] === R[k], `release record: ${k} ${JSON.stringify(rc[k])} ≠ products.json ${JSON.stringify(R[k])}`);
      need(rc.managedSolution?.sha256 === A.managedSolution?.sha256, 'release record: managed solution hash differs from the agent record');
    }
    if (ctx.exists(A.documentation?.sha256sums)) {
      const sums = readFileSyncSafe(ctx, A.documentation.sha256sums);
      need(sums.includes(A.managedSolution?.file || '\u0000'), 'SHA256SUMS: managed solution not listed');
    }

    // for sale
    if (forSale || P.saleApproved) {
      const s = (cond, msg) => { if (!cond) sale.push(msg); };
      s(R.status === 'released', `release.status is "${R.status}", not "released"`);
      const sc = ctx.scope.products?.[slug];
      s(sc && sc.sku === P.sku && sc.release === R.version && (sc.bundleRevision ?? 1) === (R.bundleRevision ?? 1),
        'launch-scope.json: no entry for this SKU, release and bundle revision');
      s(A.ip?.status === 'executed' && HEX64.test(A.ip?.evidenceSha256 || ''), 'IP: instrument not executed or its evidence hash not recorded');
      s(/^none/i.test(A.ip?.studentWork || '') || A.ip?.status === 'executed', 'IP: student work without an executed instrument');
      if (ctx.exists(A.release?.gates)) {
        const g = ctx.readJson(A.release.gates);
        const open = (g.gates || []).filter((x) => x.status !== 'PASS').map((x) => `${x.id} (${x.status})`);
        s(open.length === 0, `gates not PASS: ${open.join(', ')}`);
      }
      const go = A.sale?.goDecision;
      s(go && filled(go.approvedBy) && filled(go.date) && filled(go.reference), 'no recorded GO decision (sale.goDecision: approvedBy, date, reference)');
    }
  }
  const level = onboarding.length ? 'incomplete' : sale.length ? 'onboarded' : (forSale || P.saleApproved ? 'sale-ready' : 'onboarded');
  return { slug, onboarding, sale, level };
}

const EVIDENCE_TYPES = ['ip_instrument', 'ip_schedule', 'ip_declaration', 'rights_chain', 'corporate_extract', 'corporate_record',
  'tax_registration', 'accountant_advice', 'third_party_review', 'release_record', 'package_fingerprint', 'customer_licence_version'];
const EVIDENCE_STATUS = ['pending', 'received', 'verified', 'superseded'];
const PII_KEYS = /birth|address|residence|personal|idnumber|passport|signature(?!s?Ref)|iban|account/i;

/** The public evidence manifest stays an index: known types and statuses, private references, no personal data. */
export function evidenceManifestErrors(manifest) {
  const errors = [];
  const ids = new Set();
  for (const [i, r] of (manifest?.records || []).entries()) {
    const at = `evidence[${i}] ${r?.id || ''}`;
    if (!r?.id || ids.has(r.id)) errors.push(`${at}: missing or duplicate id`); ids.add(r?.id);
    if (!EVIDENCE_TYPES.includes(r?.type)) errors.push(`${at}: unknown type ${r?.type}`);
    if (!EVIDENCE_STATUS.includes(r?.status)) errors.push(`${at}: unknown status ${r?.status}`);
    if (!/^(private|repo):\S+$/.test(r?.storageRef || '')) errors.push(`${at}: storageRef must be a private: or repo: reference`);
    if (r?.status === 'verified' && String(r.storageRef).startsWith('private:') && !HEX64.test(r.sha256 || '')) errors.push(`${at}: verified private evidence needs its SHA-256`);
    if (r?.sha256 != null && !HEX64.test(r.sha256)) errors.push(`${at}: sha256 must be 64 hex or null`);
    for (const k of Object.keys(r || {})) if (PII_KEYS.test(k)) errors.push(`${at}: field "${k}" looks like personal data; keep it in the private original`);
  }
  return errors;
}

function readFileSyncSafe(ctx, p) { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } }

export function validateAll({ slugs, forSale = false, ctx = loadContext() } = {}) {
  const list = slugs?.length ? slugs : Object.keys(ctx.products).filter((k) => k !== '_comment');
  return list.map((s) => validateProduct(s, { forSale, ctx }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const forSale = args.includes('--for-sale');
  const results = validateAll({ slugs: args.filter((a) => !a.startsWith('--')), forSale });
  if (args.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else for (const r of results) {
    console.log(`${r.slug}: ${r.level.toUpperCase()}`);
    for (const m of r.onboarding) console.log(`  ✗ onboarding: ${m}`);
    for (const m of r.sale) console.log(`  ✗ for sale:   ${m}`);
  }
  const ctxAll = loadContext();
  const products = ctxAll.products;
  const evErr = evidenceManifestErrors(ctxAll.evidence);
  for (const e of evErr) console.log(`  ✗ evidence manifest: ${e}`);
  const failed = evErr.length > 0 || results.some((r) => r.onboarding.length || ((forSale || products[r.slug]?.saleApproved) && r.sale.length));
  process.exit(failed ? 1 : 0);
}
