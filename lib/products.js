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

export function productFor(slug) {
  if (typeof slug !== 'string' || !slug || slug.startsWith('_')) return null;
  return Object.prototype.hasOwnProperty.call(PRODUCTS, slug) ? PRODUCTS[slug] : null;
}

/** The release file a buyer of this slug receives, or null when the slug has no released package. */
export function packageFile(slug) {
  const file = productFor(slug)?.release?.package;
  return typeof file === 'string' && FILE_RE.test(file) ? file : null;
}

/** Files the download endpoint may serve for this slug. */
export function allowedFilesFor(slug) {
  const pkg = packageFile(slug);
  return pkg ? [...BASE_FILES, pkg] : BASE_FILES.slice();
}

export function isLiveKey(key) {
  return /^(sk|rk)_live_/.test(String(key || ''));
}

/** True when a live-mode key would sell a product whose release is not approved for sale. */
export function liveSaleBlocked(slug, key) {
  const p = productFor(slug);
  return Boolean(p) && isLiveKey(key) && p.saleApproved !== true;
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
