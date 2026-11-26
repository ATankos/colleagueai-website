/**
 * lib/availability.js - agent availability framework.
 *
 * Single source per fact, extending the existing commercial-product framework (docs/commercial-framework):
 *   config/agents/<slug>.json  sale.goDecision - the founder's written GO, the ONLY commercial approval, now
 *                              version-specific: {approvedBy, date, reference, release, expiresAt?, revokedAt?};
 *                              sale.earlyAccess - same shape, the only early-access approval.
 *   config/products.json       releases and saleApproved (unchanged).
 *   config/availability.json   catalogue lifecycle for all 36 agents (lifecycle, technical readiness, certification,
 *                              target vs verified CAI level, requested public status, release blockers). No approvals.
 *
 * Fail closed. A commercial sale needs ALL of: a product record with a current release, saleApproved === true,
 * release.status 'released', a valid GO decision FOR THIS RELEASE VERSION in config/agents/<slug>.json, a sellable
 * lifecycle and a tier other than L5. Early access needs a valid sale.earlyAccess for this release version.
 * Missing, unreadable, incomplete, expired, revoked, future-dated, other-version or inconsistent records leave the
 * agent "Coming soon". Technical approval on its own never changes the public status.
 *
 * On top of the approvals, releaseEvidenceErrors() checks the release evidence the existing framework already keeps
 * (release record, release gates and their decisions, launch scope, IP instrument, release blockers) for THIS release
 * version and package; any gap refuses.
 *
 * Every sale gate reads commercialSaleAllowed(): lib/products.js (live checkout and paid-session fulfilment, which
 * covers stale Payment Links and replayed webhooks), so api/checkout.js and api/webhook.js. The frontend only mirrors it.
 */
import { readFileSync } from 'node:fs';
import REGISTRY from '../config/availability.json' with { type: 'json' };
import PRODUCTS from '../config/products.json' with { type: 'json' };
import LAUNCH_SCOPE from '../config/launch-scope.json' with { type: 'json' };
import EVIDENCE from '../config/evidence-manifest.json' with { type: 'json' };
import { gateDecisionErrors, MANDATORY_GATES, MANDATORY_PRODUCT_GATES } from './releaseGates.js';

/* The commercial product records (config/agents/<slug>.json), read on demand and cached. A record that is missing
   or unreadable in a deployment yields no approval (fail closed); vercel.json includes config/agents in functions. */
const AGENT_CACHE = new Map();
export function agentRecord(slug) {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(String(slug))) return null;
  if (!AGENT_CACHE.has(slug)) {
    let rec = null;
    try { rec = JSON.parse(readFileSync(new URL(`../config/agents/${slug}.json`, import.meta.url), 'utf8')); } catch { rec = null; }
    AGENT_CACHE.set(slug, rec);
  }
  return AGENT_CACHE.get(slug);
}
/** A repository JSON file named by an agent record (release.record, release.gates); relative paths only. */
const REPO_JSON_CACHE = new Map();
export function repoJson(rel) {
  if (typeof rel !== 'string' || !/^[A-Za-z0-9._/-]+\.json$/.test(rel) || rel.includes('..') || rel.startsWith('/')) return null;
  if (!REPO_JSON_CACHE.has(rel)) {
    // Only the two places release evidence lives are readable, each through a literal path prefix so the
    // deployment's file tracer bundles them into the functions (no other repository file can be read).
    let url = null; let m;
    if ((m = rel.match(/^config\/([a-z0-9-]+)\.json$/))) url = new URL(`../config/${m[1]}.json`, import.meta.url);
    else if ((m = rel.match(/^scripts\/cai-release\/([0-9.]+)\/release-candidate\.json$/))) url = new URL(`../scripts/cai-release/${m[1]}/release-candidate.json`, import.meta.url);
    let v = null;
    if (url) { try { v = JSON.parse(readFileSync(url, 'utf8')); } catch { v = null; } }
    REPO_JSON_CACHE.set(rel, v);
  }
  return REPO_JSON_CACHE.get(rel);
}
/** Tests only: place a document in the read cache (production never calls this). */
export function primeRepoJson(rel, value) { REPO_JSON_CACHE.set(rel, value); }
/* Everything the gates read from the repository. Tests pass their own. */
const defaultAgents = { get: (slug) => agentRecord(slug), json: repoJson, scope: LAUNCH_SCOPE, evidence: EVIDENCE };
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Release evidence for ONE exact release and package, fail closed. Returns the list of reasons the release is not
 * eligible (empty = eligible). Mode 'sale' needs everything; 'early-access' needs validated technical readiness.
 * Existence is not enough: each record must name this release version, and the release record must describe this
 * exact package (file, SHA-256, size, bundle revision, status) as config/products.json does.
 */
export function releaseEvidenceErrors(slug, mode = 'sale', registry = REGISTRY, products = PRODUCTS, ctx = defaultAgents) {
  const errs = [];
  const r = recordFor(slug, registry); const p = productOf(slug, products); const R = releaseOf(slug, products);
  if (!r) return ['no catalogue lifecycle record'];
  if (!p || !R) return ['no product record or current release'];
  if (!HEX64.test(R.sha256 || '') || !(Number(R.bytes) > 0) || !R.package) errs.push('release: package file, SHA-256 or size missing');
  // Release blockers: missing or malformed means blocked, never "no blockers".
  if (!Array.isArray(r.releaseBlockers)) errs.push('releaseBlockers missing or not a list (treated as blocked)');
  else if (mode === 'sale' && r.releaseBlockers.length) errs.push(`${r.releaseBlockers.length} open release blocker(s)`);
  if (mode === 'sale') {
    if (r.technicalReadiness !== 'technically-approved') errs.push(`technicalReadiness is ${r.technicalReadiness}`);
    if (r.certification !== 'internally-certified') errs.push(`certification is ${r.certification}`);
  } else if (!['release-candidate', 'technically-approved'].includes(r.technicalReadiness)) errs.push(`technicalReadiness is ${r.technicalReadiness}`);
  const A = ctx.get(slug);
  if (!A) return [...errs, 'no commercial product record (config/agents)'];
  const rc = ctx.json(A.release?.record);
  if (!rc) errs.push('release record missing or unreadable');
  else for (const k of ['version', 'package', 'sha256', 'bytes', 'bundleRevision', 'status'])
    if (rc[k] !== R[k]) errs.push(`release record ${k} does not match release ${R.version}`);
  const g = ctx.json(A.release?.gates);
  if (!g) errs.push('release gates missing or unreadable');
  else {
    if (g.release !== R.version) errs.push(`release gates are for ${g.release}, not ${R.version}`);
    const decisionErrs = gateDecisionErrors(g, ctx.evidence);
    if (decisionErrs.length) errs.push(`gate decisions invalid: ${decisionErrs.length}`);
    const needed = (g.gates || []).filter((x) => mode === 'sale' || x.area === 'product');
    const open = needed.filter((x) => x.status !== 'PASS').map((x) => x.id);
    if (!needed.length) errs.push('no release gates recorded');
    if (open.length) errs.push(`gates not PASS: ${open.join(', ')}`);
    // The mandatory set must be present: a gates file that drops a gate is incomplete, never "one gate fewer".
    const present = new Set((g.gates || []).map((x) => x.id));
    const missing = (mode === 'sale' ? MANDATORY_GATES : MANDATORY_PRODUCT_GATES).filter((id) => !present.has(id));
    if (missing.length) errs.push(`mandatory gates missing: ${missing.join(', ')}`);
  }
  if (mode === 'sale') {
    const sc = ctx.scope?.products?.[slug];
    if (!(sc && sc.sku === p.sku && sc.release === R.version && (sc.bundleRevision ?? 1) === (R.bundleRevision ?? 1))) errs.push('launch scope does not name this SKU, release and bundle revision');
    if (!(A.ip?.status === 'executed' && HEX64.test(A.ip?.evidenceSha256 || ''))) errs.push('IP instrument not executed with recorded evidence');
  }
  return errs;
}

export const LIFECYCLE = ['concept', 'planned', 'in-development', 'in-testing', 'release-candidate', 'certification-review',
  'technically-approved', 'commercially-approved', 'generally-available', 'suspended', 'deprecated', 'withdrawn'];
export const TECHNICAL = ['none', 'prototype', 'testing', 'release-candidate', 'technically-approved'];
export const CERTIFICATION = ['none', 'internal-review', 'internally-certified'];
export const PUBLIC = ['coming-soon', 'early-access', 'available', 'temporarily-unavailable', 'discontinued'];
const SELLABLE_LIFECYCLE = new Set(['commercially-approved', 'generally-available']);
const NOT_FOR_SALE_TIERS = new Set(['L5']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/;

export const AVAILABILITY = REGISTRY;

const own = (o, k) => typeof k === 'string' && k && !k.startsWith('_') && o && Object.hasOwn(o, k);
export function recordFor(slug, registry = REGISTRY) { return own(registry.agents, slug) ? registry.agents[slug] : null; }
function productOf(slug, products) { return own(products, slug) ? products[slug] : null; }

/**
 * Is this GO / early-access decision valid for this exact release, now? The existing goDecision shape
 * {approvedBy, date, reference} plus the release version it approves. Expired (expiresAt in the past), revoked
 * (revokedAt set), future-dated, unversioned or other-version decisions are invalid.
 */
export function approvalValid(a, releaseVersion, now = new Date()) {
  if (!a || typeof a !== 'object') return false;
  if (!(typeof a.approvedBy === 'string' && a.approvedBy.trim() && typeof a.reference === 'string' && a.reference.trim())) return false;
  if (!(typeof a.date === 'string' && ISO_DATE.test(a.date) && Date.parse(a.date) <= now.getTime())) return false;
  if (typeof releaseVersion !== 'string' || a.release !== releaseVersion) return false;
  if (a.revokedAt != null) return false;
  if (a.expiresAt != null && !(typeof a.expiresAt === 'string' && Date.parse(a.expiresAt) > now.getTime())) return false;
  return true;
}

function releaseOf(slug, products) { const r = productOf(slug, products)?.release; return r && typeof r.version === 'string' ? r : null; }

function sellable(slug, registry, products, now, agents = defaultAgents) {
  const r = recordFor(slug, registry); const p = productOf(slug, products); const rel = releaseOf(slug, products);
  return Boolean(r && p && rel && p.saleApproved === true && rel.status === 'released' &&
    approvalValid(agents.get(slug)?.sale?.goDecision, rel.version, now) && SELLABLE_LIFECYCLE.has(r.lifecycle) &&
    !NOT_FOR_SALE_TIERS.has(r.cai?.targetLevel) && releaseEvidenceErrors(slug, 'sale', registry, products, agents).length === 0);
}

function earlyAccess(slug, registry, products, now, agents = defaultAgents) {
  const r = recordFor(slug, registry); const rel = releaseOf(slug, products);
  return Boolean(r && rel && approvalValid(agents.get(slug)?.sale?.earlyAccess, rel.version, now) && !NOT_FOR_SALE_TIERS.has(r.cai?.targetLevel) &&
    !['suspended', 'deprecated', 'withdrawn'].includes(r.lifecycle) &&
    releaseEvidenceErrors(slug, 'early-access', registry, products, agents).length === 0);
}

/** The status customers see: the requested status, narrowed to what the approvals support. */
export function publicStatus(slug, registry = REGISTRY, products = PRODUCTS, now = new Date(), agents = defaultAgents) {
  const r = recordFor(slug, registry);
  if (!r) return 'coming-soon';
  if (r.lifecycle === 'withdrawn' || r.lifecycle === 'deprecated') return 'discontinued';
  if (r.lifecycle === 'suspended') return 'temporarily-unavailable';
  const want = PUBLIC.includes(r.publicStatus) ? r.publicStatus : 'coming-soon';
  if (want === 'available') return sellable(slug, registry, products, now, agents) ? 'available' : 'coming-soon';
  if (want === 'early-access') return earlyAccess(slug, registry, products, now, agents) ? 'early-access' : 'coming-soon';
  if (want === 'discontinued' || want === 'temporarily-unavailable') return want;
  return 'coming-soon';
}

/** May this agent be sold for real money? Default-deny on any doubt. */
export function commercialSaleAllowed(slug, registry = REGISTRY, products = PRODUCTS, now = new Date(), agents = defaultAgents) {
  return sellable(slug, registry, products, now, agents) && publicStatus(slug, registry, products, now, agents) === 'available';
}

/** What a customer may do with this agent today. */
export function permittedActions(slug, registry = REGISTRY, products = PRODUCTS, now = new Date(), agents = defaultAgents) {
  const p = publicStatus(slug, registry, products, now, agents);
  const base = ['view-factsheet', 'download-dossier', 'request-demo'];
  if (p === 'discontinued') return ['view-factsheet'];
  if (commercialSaleAllowed(slug, registry, products, now, agents)) return [...base, 'purchase-licence'];
  return [...base, 'register-interest'];
}

/** Structural and consistency errors across the three records, for tests and the release validator. */
export function registryErrors(registry = REGISTRY, products = PRODUCTS, now = new Date(), agents = defaultAgents) {
  const errs = [];
  for (const [slug, r] of Object.entries(registry.agents || {})) {
    if (!LIFECYCLE.includes(r.lifecycle)) errs.push(`${slug}: unknown lifecycle ${r.lifecycle}`);
    if (!TECHNICAL.includes(r.technicalReadiness)) errs.push(`${slug}: unknown technicalReadiness ${r.technicalReadiness}`);
    if (!CERTIFICATION.includes(r.certification)) errs.push(`${slug}: unknown certification ${r.certification}`);
    if (!PUBLIC.includes(r.publicStatus)) errs.push(`${slug}: unknown publicStatus ${r.publicStatus}`);
    if (!/^L[1-5]$/.test(r.cai?.targetLevel || '')) errs.push(`${slug}: cai.targetLevel missing`);
    if (r.cai?.verifiedScore != null && !r.cai.verifiedEvidence) errs.push(`${slug}: a verified CAI Score needs verifiedEvidence`);
    if ('commercialApproval' in r || 'earlyAccessApproval' in r || 'goDecision' in r) errs.push(`${slug}: approvals belong in config/agents/${slug}.json sale, not here`);
    const shown = publicStatus(slug, registry, products, now, agents);
    if (!['withdrawn', 'deprecated', 'suspended'].includes(r.lifecycle) && r.publicStatus !== shown)
      errs.push(`${slug}: publicStatus ${r.publicStatus} is not supported by the approvals (shows ${shown})`);
    if (SELLABLE_LIFECYCLE.has(r.lifecycle) && !sellable(slug, registry, products, now, agents)) errs.push(`${slug}: lifecycle ${r.lifecycle} without a valid GO decision for its release`);
  }
  for (const [slug, p] of Object.entries(products || {})) {
    if (slug.startsWith('_')) continue;
    if (!recordFor(slug, registry)) errs.push(`${slug}: product without a catalogue lifecycle record`);
    const go = agents.get(slug)?.sale?.goDecision;
    const ok = approvalValid(go, p.release?.version, now);
    if (p.saleApproved === true && !ok) errs.push(`${slug}: saleApproved without a valid GO decision for release ${p.release?.version}`);
    if (go && !ok) errs.push(`${slug}: sale.goDecision recorded but not valid for release ${p.release?.version} (fails closed)`);
    if (ok && p.saleApproved !== true) errs.push(`${slug}: GO decision recorded but saleApproved is not true`);
  }
  return errs;
}

/** Labels customers see, per locale. */
export const PUBLIC_LABELS = {
  en: { 'coming-soon': 'Coming soon', 'early-access': 'Early access', available: 'Available', 'temporarily-unavailable': 'Temporarily unavailable', discontinued: 'Discontinued' },
  cs: { 'coming-soon': 'Připravujeme', 'early-access': 'Předběžný přístup', available: 'Dostupné', 'temporarily-unavailable': 'Dočasně nedostupné', discontinued: 'Ukončeno' },
  de: { 'coming-soon': 'Demnächst', 'early-access': 'Early Access', available: 'Verfügbar', 'temporarily-unavailable': 'Vorübergehend nicht verfügbar', discontinued: 'Eingestellt' },
  fr: { 'coming-soon': 'Bientôt disponible', 'early-access': 'Accès anticipé', available: 'Disponible', 'temporarily-unavailable': 'Temporairement indisponible', discontinued: 'Abandonné' },
  es: { 'coming-soon': 'Próximamente', 'early-access': 'Acceso anticipado', available: 'Disponible', 'temporarily-unavailable': 'No disponible temporalmente', discontinued: 'Descatalogado' },
  it: { 'coming-soon': 'Prossimamente', 'early-access': 'Accesso anticipato', available: 'Disponibile', 'temporarily-unavailable': 'Temporaneamente non disponibile', discontinued: 'Dismesso' },
  pl: { 'coming-soon': 'Wkrótce', 'early-access': 'Wczesny dostęp', available: 'Dostępny', 'temporarily-unavailable': 'Tymczasowo niedostępny', discontinued: 'Wycofany' },
  pt: { 'coming-soon': 'Em breve', 'early-access': 'Acesso antecipado', available: 'Disponível', 'temporarily-unavailable': 'Temporariamente indisponível', discontinued: 'Descontinuado' },
};
