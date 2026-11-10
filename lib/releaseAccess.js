/**
 * lib/releaseAccess.js - which release of a product a buyer may download (version-specific entitlements).
 *
 * The rule (owner brief 10 Nov 2026, certification gate G9):
 *   - A perpetual licence covers the release that was bought. That release stays downloadable for as long as the
 *     licence stands, whatever is published later. It is never taken back, except by a refund or a lost dispute of
 *     that purchase (revokeEntitlement), which is unchanged.
 *   - A LATER release is not included in the perpetual licence. It is available only through Continuous
 *     Certification: every release while the subscription is current, and, after it ends, every release published
 *     on or before the last day that was paid for. A certification whose payment was refunded covers nothing.
 *   - Nothing here touches software already installed by the customer: this decides downloads only. There is no
 *     remote disabling and no tenant activation.
 *
 * Every function is pure: the caller passes the product record, the buyer's entitlement record, the certification
 * record and the time, so the policy can be tested on synthetic releases without changing config/products.json.
 *
 * Entitlement fields read (lib/db.js):
 *   slugs              the products the buyer holds a licence for (a refund removes the product here)
 *   sessionSlugs       purchase (Stripe session) -> products it paid for
 *   sessionReleases    purchase -> { product: release version bought }   (recorded from this change on)
 *   revokedSessionIds  refunded or charged-back purchases
 * A purchase recorded before sessionReleases existed counts as the product's legacyEntitlementVersion
 * (config/products.json), or, if none is set, as its earliest listed release. "*" is an operator grant: the current release.
 */
import { slugFamily, productReleases, compareVersions } from './products.js';

/** True when the entitlement holds a licence for this product (any slug of its family, or the operator grant "*"). */
export function holdsLicence(entitlement, slug) {
  const held = Array.isArray(entitlement?.slugs) ? entitlement.slugs : [];
  return held.includes('*') || slugFamily(slug).some((s) => held.includes(s));
}

/** The release version a purchase recorded before version pinning is treated as having bought. */
export function legacyVersion(product) {
  const releases = productReleases(product);
  const set = product?.legacyEntitlementVersion;
  if (typeof set === 'string' && releases.some((r) => r.version === set)) return set;
  return releases[0]?.version ?? null;
}

/** The release versions this buyer bought (not refunded), oldest first. Empty when they hold no licence. */
export function purchasedVersions(entitlement, slug, product) {
  if (!holdsLicence(entitlement, slug)) return [];
  const family = slugFamily(slug);
  const releases = productReleases(product);
  const current = product?.release?.version ?? releases[releases.length - 1]?.version ?? null;
  const held = entitlement.slugs || [];
  const revoked = new Set(entitlement.revokedSessionIds || []);
  const versions = new Set();

  const paying = Object.entries(entitlement.sessionSlugs || {})
    .filter(([sid, list]) => !revoked.has(sid) && (list || []).some((s) => family.includes(s)));
  for (const [sid] of paying) {
    const bought = family.map((s) => entitlement.sessionReleases?.[sid]?.[s]).find(Boolean);
    const v = bought ?? legacyVersion(product);
    if (v) versions.add(v);
  }
  // A licence with no purchase that vouches for it: a record written before sessionSlugs existed (legacy), or the
  // operator grant "*". The legacy record gets the legacy version; "*" gets the current release.
  if (!paying.length) {
    if (family.some((s) => held.includes(s))) { const v = legacyVersion(product); if (v) versions.add(v); }
    else if (held.includes('*') && current) versions.add(current);
  }
  return [...versions].sort(compareVersions);
}

/**
 * What a certification record covers at `now`:
 *   { kind: 'all' }                 subscription current: every release
 *   { kind: 'until', until: ms }    ended, past due or out of term: releases published on or before the paid-through day
 *   { kind: 'none' }                no certificate, or one whose payment was refunded
 */
export function certificationCoverage(cert, now = Date.now()) {
  if (!cert) return { kind: 'none' };
  if (cert.lapseReason === 'refunded') return { kind: 'none' };
  const until = cert.validUntil ? new Date(cert.validUntil).getTime() : NaN;
  if (cert.status === 'active' && (!cert.validUntil || until >= now)) return { kind: 'all' };
  return Number.isFinite(until) ? { kind: 'until', until } : { kind: 'none' };
}

/**
 * The release records this buyer may download, oldest first: the releases they bought, plus those their
 * certification covers. Nothing at all without a licence for the product: certification is never sold alone.
 */
export function releasesAvailable({ product, entitlement, slug, certification = null, now = Date.now() }) {
  if (!holdsLicence(entitlement, slug)) return [];
  const releases = productReleases(product);
  const bought = new Set(purchasedVersions(entitlement, slug, product));
  const cover = certificationCoverage(certification, now);
  return releases.filter((r) => {
    if (bought.has(r.version)) return true;
    if (cover.kind === 'all') return true;
    if (cover.kind === 'until') {
      const at = r.releasedAt ? new Date(r.releasedAt).getTime() : NaN;
      return Number.isFinite(at) && at <= cover.until;
    }
    return false;
  });
}

/** The newest release this buyer may download, or null. */
export function releaseToDeliver(args) {
  const list = releasesAvailable(args);
  return list.length ? list[list.length - 1] : null;
}

/** The release a checkout session bought: the version checkout recorded in its metadata when that release is
 *  still listed, else the product's current release (a Payment Link, or a session created before metadata.release). */
export function releaseVersionForSession(session, product) {
  const releases = productReleases(product);
  const named = session?.metadata?.release;
  if (typeof named === 'string' && releases.some((r) => r.version === named)) return named;
  return product?.release?.version ?? null;
}
