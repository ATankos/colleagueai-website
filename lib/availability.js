/**
 * lib/availability.js - agent availability framework (config/availability.json).
 *
 * Four attributes are kept apart and never inferred from each other:
 *   lifecycle            internal state (concept ... generally-available, suspended, deprecated, withdrawn)
 *   technicalReadiness   none | prototype | testing | release-candidate | technically-approved
 *   certification        none | internal-review | internally-certified  (the CAI level is a TARGET until verifiedScore is set)
 *   commercialApproval   an explicit record: status "approved" + approvedBy + approvedAt + reference
 *
 * The public status shown to customers is derived here and can only be NARROWER than the record asks for:
 *   available           needs a complete commercial approval record AND lifecycle commercially-approved/generally-available
 *   early-access        needs a complete early-access approval record (separate from technical approval)
 *   anything else       falls back to coming-soon (or temporarily-unavailable / discontinued when the lifecycle says so)
 * Technical approval on its own never opens a sale. L5 is never sold.
 *
 * Every sale and delivery gate reads commercialSaleAllowed(): lib/products.js (live checkout, fulfilment,
 * package delivery) and api/checkout.js. The frontend only mirrors it.
 */
import REGISTRY from '../config/availability.json' with { type: 'json' };

export const LIFECYCLE = ['concept', 'planned', 'in-development', 'in-testing', 'release-candidate', 'certification-review',
  'technically-approved', 'commercially-approved', 'generally-available', 'suspended', 'deprecated', 'withdrawn'];
export const TECHNICAL = ['none', 'prototype', 'testing', 'release-candidate', 'technically-approved'];
export const CERTIFICATION = ['none', 'internal-review', 'internally-certified'];
export const PUBLIC = ['coming-soon', 'early-access', 'available', 'temporarily-unavailable', 'discontinued'];
const SELLABLE_LIFECYCLE = new Set(['commercially-approved', 'generally-available']);
const NOT_FOR_SALE_TIERS = new Set(['L5']);

export const AVAILABILITY = REGISTRY;

/** Own records only; a slug like "constructor" must not resolve through Object.prototype. */
export function recordFor(slug, registry = REGISTRY) {
  if (typeof slug !== 'string' || !slug || slug.startsWith('_')) return null;
  return Object.hasOwn(registry.agents || {}, slug) ? registry.agents[slug] : null;
}

/** An approval counts only when every field is filled: status approved, who, when (a real date) and a reference. */
export function approvalComplete(a) {
  return Boolean(a && a.status === 'approved' && typeof a.approvedBy === 'string' && a.approvedBy.trim() &&
    typeof a.approvedAt === 'string' && !Number.isNaN(Date.parse(a.approvedAt)) &&
    typeof a.reference === 'string' && a.reference.trim());
}

/** The status customers see: the requested publicStatus, narrowed to what the record can support. */
export function publicStatus(slug, registry = REGISTRY) {
  const r = recordFor(slug, registry);
  if (!r) return 'coming-soon';
  if (r.lifecycle === 'withdrawn' || r.lifecycle === 'deprecated') return 'discontinued';
  if (r.lifecycle === 'suspended') return 'temporarily-unavailable';
  const want = PUBLIC.includes(r.publicStatus) ? r.publicStatus : 'coming-soon';
  if (want === 'available') return sellable(r) ? 'available' : 'coming-soon';
  if (want === 'early-access') return approvalComplete(r.earlyAccessApproval) && !NOT_FOR_SALE_TIERS.has(r.cai?.targetLevel) ? 'early-access' : 'coming-soon';
  if (want === 'discontinued' || want === 'temporarily-unavailable') return want;
  return 'coming-soon';
}

function sellable(r) {
  return approvalComplete(r.commercialApproval) && SELLABLE_LIFECYCLE.has(r.lifecycle) && !NOT_FOR_SALE_TIERS.has(r.cai?.targetLevel);
}

/**
 * May this agent be sold, licensed, entitled or delivered for real money? Default-deny: unknown slug, L5,
 * a missing or incomplete commercial approval record, or a public status other than available / early-access
 * all refuse. saleApproved, the tax policy and the checkout kill switch remain separate, additional gates.
 */
export function commercialSaleAllowed(slug, registry = REGISTRY) {
  const r = recordFor(slug, registry);
  if (!r || !sellable(r)) return false;
  const p = publicStatus(slug, registry);
  return p === 'available' || p === 'early-access';
}

/** What a customer may do with this agent today. */
export function permittedActions(slug, registry = REGISTRY) {
  const p = publicStatus(slug, registry);
  const base = ['view-factsheet', 'download-dossier', 'request-demo'];
  if (p === 'coming-soon' || p === 'temporarily-unavailable') return [...base, 'register-interest'];
  if (p === 'discontinued') return ['view-factsheet'];
  return commercialSaleAllowed(slug, registry) ? [...base, 'purchase-licence'] : [...base, 'register-interest'];
}

/** Structural errors in a registry, for tests and the release validator. */
export function registryErrors(registry = REGISTRY) {
  const errs = [];
  for (const [slug, r] of Object.entries(registry.agents || {})) {
    if (!LIFECYCLE.includes(r.lifecycle)) errs.push(`${slug}: unknown lifecycle ${r.lifecycle}`);
    if (!TECHNICAL.includes(r.technicalReadiness)) errs.push(`${slug}: unknown technicalReadiness ${r.technicalReadiness}`);
    if (!CERTIFICATION.includes(r.certification)) errs.push(`${slug}: unknown certification ${r.certification}`);
    if (!PUBLIC.includes(r.publicStatus)) errs.push(`${slug}: unknown publicStatus ${r.publicStatus}`);
    if (!/^L[1-5]$/.test(r.cai?.targetLevel || '')) errs.push(`${slug}: cai.targetLevel missing`);
    if (r.cai?.verifiedScore != null && !r.cai.verifiedEvidence) errs.push(`${slug}: a verified CAI Score needs verifiedEvidence`);
    if (r.publicStatus !== publicStatus(slug, registry) && !['withdrawn', 'deprecated', 'suspended'].includes(r.lifecycle))
      errs.push(`${slug}: publicStatus ${r.publicStatus} is not supported by its approvals (would show ${publicStatus(slug, registry)})`);
    for (const k of ['commercialApproval', 'earlyAccessApproval']) {
      const a = r[k];
      if (!a || !['not-approved', 'approved', 'revoked'].includes(a.status)) errs.push(`${slug}: ${k}.status invalid`);
      else if (a.status === 'approved' && !approvalComplete(a)) errs.push(`${slug}: ${k} approved without approvedBy, approvedAt and reference`);
    }
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
