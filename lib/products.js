/**
 * lib/products.js - purchasable product records (config/products.json).
 *
 * One place that knows, per catalogue slug, the commercial name, the SKU, whether
 * live sales are approved, and which release file a buyer receives. checkout.js,
 * success.js and download.js all read it, so the name on the Stripe receipt, the
 * file on the success page and the file the download endpoint will serve cannot drift.
 */
import PRODUCTS from '../config/products.json' with { type: 'json' };

const BASE_FILES = ['dossier.pdf', 'connect-package.zip'];
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(zip|pdf)$/;

// retired slug -> current slug, from each record's "aliases"
const ALIASES = Object.fromEntries(Object.entries(PRODUCTS)
  .filter(([k, v]) => !k.startsWith('_') && Array.isArray(v?.aliases))
  .flatMap(([k, v]) => v.aliases.map((a) => [a, k])));

/** The current slug for a retired one (after a product rename); any other slug unchanged. */
export function canonicalSlug(slug) {
  return Object.prototype.hasOwnProperty.call(ALIASES, slug) ? ALIASES[slug] : slug;
}

/** The current slug plus every retired slug of the same product. */
export function slugFamily(slug) {
  const canon = canonicalSlug(slug);
  return [canon, ...Object.keys(ALIASES).filter((a) => ALIASES[a] === canon)];
}

export function productFor(slug) {
  if (typeof slug !== 'string' || !slug || slug.startsWith('_')) return null;
  return Object.prototype.hasOwnProperty.call(PRODUCTS, slug) ? PRODUCTS[slug] : null;
}

/** The release file of the CURRENT release of this slug, or null when the slug has no released package. */
export function packageFile(slug) {
  const file = productFor(slug)?.release?.package;
  return typeof file === 'string' && FILE_RE.test(file) ? file : null;
}

/**
 * Every release record of a product that a buyer could be entitled to: the current "release" and the
 * earlier ones kept under "previousReleases", each with a valid version and package name, oldest first.
 * Earlier releases stay listed so that a buyer keeps the version they paid for after a newer one ships
 * (lib/releaseAccess.js decides which of them a given buyer may download).
 */
export function productReleases(product) {
  const list = [...(Array.isArray(product?.previousReleases) ? product.previousReleases : []), product?.release]
    .filter((r) => r && typeof r.version === 'string' && /^\d+(\.\d+){0,3}$/.test(r.version) &&
      typeof r.package === 'string' && FILE_RE.test(r.package));
  const byVersion = new Map();
  for (const r of list) byVersion.set(r.version, r); // the current record wins over a stale copy in the history
  return [...byVersion.values()].sort((a, b) => compareVersions(a.version, b.version));
}

/** The release record of this slug with this exact version, or null. */
export function releaseOfVersion(slug, version) {
  return productReleases(productFor(slug)).find((r) => r.version === version) ?? null;
}

/** The release record whose package file this is, or null when the file is not a release package of the slug. */
export function releaseOfPackage(slug, file) {
  return productReleases(productFor(slug)).find((r) => r.package === file) ?? null;
}

/** Numeric comparison of dotted versions: 1.0.10 is later than 1.0.9. Missing parts count as 0. */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Files the download endpoint may serve for this slug: the dossier, the connect package and every release package. */
export function allowedFilesFor(slug) {
  return [...BASE_FILES, ...productReleases(productFor(slug)).map((r) => r.package)];
}

export function isLiveKey(key) {
  return /^(sk|rk)_live_/.test(String(key || ''));
}

/**
 * True when live-mode money would be taken for a release that is not approved for sale.
 * Default-deny: only a product whose record says saleApproved is true may take live money.
 * A catalogue agent with no record is refused too, and so is a missing or unknown slug.
 * A retired slug is judged as the product it now names.
 */
export function liveSaleRefused(slug, live) {
  const p = productFor(canonicalSlug(slug));
  return live === true && p?.saleApproved !== true;
}

/** True when a live-mode key would sell a product whose release is not approved for sale. */
export function liveSaleBlocked(slug, key) {
  return liveSaleRefused(slug, isLiveKey(key));
}

/**
 * Restoring access after a dispute the merchant won is not a sale. It keeps the narrower rule that
 * applied before default-deny: only a product with a record that is not approved is refused. A buyer
 * of a catalogue agent with no record, whose purchase completed before this rule, keeps their access.
 */
export function liveRestoreRefused(slug, live) {
  const p = productFor(canonicalSlug(slug));
  return live === true && Boolean(p) && p.saleApproved !== true;
}

/**
 * Why a paid Checkout Session must not unlock access, or null when it may. Only live-mode
 * sessions move real money, so only they are gated. The webhook and the success page both
 * call this, so no fulfilment path can grant what checkout itself would refuse.
 * The amount check is deliberately not a price match: Stripe Tax and discounts change
 * amount_total, so it only refuses a session where no money was taken.
 */
export function liveFulfilmentWithheld(session) {
  if (session?.livemode !== true) return null;
  if (liveSaleRefused(session.metadata?.agent_slug, true)) return 'not-approved-for-sale';
  if (session.payment_status !== 'paid' || !(Number(session.amount_total) > 0)) return 'no-payment-taken';
  return null;
}

/**
 * May the release package of this slug be handed out at all?
 * Approved for sale -> yes. Not approved -> only on a deployment that explicitly opts in to
 * test delivery (RELEASE_TEST_DELIVERY=1, set in Vercel's Preview scope only, behind deployment
 * protection). This is enforced at download time, so it holds whichever way the entitlement was
 * created: api/checkout.js, a Stripe Payment Link, the webhook, or a test-card purchase.
 */
export function packageDeliverable(slug) {
  const p = productFor(slug);
  if (!p || !packageFile(slug)) return false;
  return p.saleApproved === true || process.env.RELEASE_TEST_DELIVERY === '1';
}

export function slugsWithProducts() {
  return Object.keys(PRODUCTS).filter((k) => !k.startsWith('_'));
}
