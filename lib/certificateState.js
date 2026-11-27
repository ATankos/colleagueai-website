/**
 * lib/certificateState.js - the four-axis certificate state of Continuous Certification v1.0
 * (docs/continuous-certification/cc-v1.0-programme-specification.md §2.1; MCL control CAI-D17-03).
 *
 * The core logic:
 *   A certificate record holds four SEPARATE states, each changed by a different actor:
 *     1. subscription      payment events (Stripe webhook)        active | past_due | cancelled | lapsed | disputed
 *     2. release currency  ColleagueAI's certified releases       current | superseded | withdrawn | not-certified
 *     3. decision          the D17 procedure (reviewer + founder) valid | suspended | revoked | discontinued
 *     4. deployment        the customer's own report              not-reported | reported (never verified by us)
 *
 *   "Colleague AI Certified — Active" is shown ONLY when 1 = active and in term, 2 = current and 3 = valid.
 *   A paid subscription alone never produces that claim. Everything fails closed: an unknown product, a version
 *   that was never certified, a malformed decision or a missing term all read as "not active".
 *
 * Pure functions only: no I/O, so the rules are testable on their own and the public endpoint cannot drift from them.
 * Nothing here touches the perpetual licence or download access (lib/releaseAccess.js decides those).
 */
import { productReleases, compareVersions } from './products.js';

/** Stored subscription statuses. subscriptionState() can also return 'disputed' (an open payment dispute, cert.paymentHold). */
export const SUBSCRIPTION_STATES = Object.freeze(['active', 'past_due', 'cancelled', 'lapsed']);
export const CURRENCY_STATES = Object.freeze(['current', 'superseded', 'withdrawn', 'not-certified']);
export const DECISION_STATES = Object.freeze(['valid', 'suspended', 'revoked', 'discontinued']);
/** Public reason categories for an adverse decision. Free text never leaves the record. */
export const DECISION_REASONS = Object.freeze([
  'critical-vulnerability-unmitigated', 'critical-regression-failed', 'mark-misused',
  'evidence-falsified', 'non-conformity-unfixable', 'package-discontinued', 'programme-discontinued',
]);
/** Decisions that can never be undone. A revoked certificate stays revoked; a new certificate is a new record. */
export const TERMINAL_DECISIONS = Object.freeze(['revoked', 'discontinued']);

const ISO = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

/**
 * Axis 1: subscription. "active" requires a PRESENT, valid and unexpired paid-through date: a record marked active
 * with no term, an unreadable term or an ended term reads as "lapsed" (Stripe can be late, and a claim must never
 * rest on a term nobody recorded).
 */
export function subscriptionState(cert, now = Date.now()) {
  const s = cert?.status;
  if (!SUBSCRIPTION_STATES.includes(s)) return 'lapsed';
  // An open payment dispute suspends the claim while it is unresolved. It is a PAYMENT fact (axis 1): it is set and cleared
  // only by dispute events, never by a decision-maker, and it never creates, changes or lifts a decision (axis 3).
  if (cert.paymentHold?.state === 'disputed' && (s === 'active' || s === 'past_due')) return 'disputed';
  if (s !== 'active') return s;
  const until = typeof cert.validUntil === 'string' ? Date.parse(cert.validUntil) : NaN;
  return Number.isFinite(until) && until >= now ? 'active' : 'lapsed';
}

/** The certified releases of a product, oldest first: releases with a recorded certifiedAt and not withdrawn. */
export function certifiedReleases(product) {
  return productReleases(product).filter((r) => ISO(r.certifiedAt) && !r.withdrawnAt);
}

/** The current certified release of a product (highest certified, non-withdrawn version), or null. */
export function currentCertifiedRelease(product) {
  const list = certifiedReleases(product);
  return list.length ? list[list.length - 1] : null;
}

/**
 * Axis 2: release currency of the version this certificate covers.
 *   current       it is the product's current certified release
 *   superseded    it was certified, and a newer certified release exists
 *   withdrawn     it was certified and has since been withdrawn
 *   not-certified the version was never certified (or the product or version is unknown): fail closed
 */
export function releaseCurrency(cert, product) {
  const version = cert?.certifiedVersion;
  if (!version || !product) return 'not-certified';
  const record = productReleases(product).find((r) => r.version === version);
  if (!record || !ISO(record.certifiedAt)) return 'not-certified';
  if (record.withdrawnAt) return 'withdrawn';
  const current = currentCertifiedRelease(product);
  if (!current) return 'not-certified';
  return compareVersions(version, current.version) === 0 ? 'current' : 'superseded';
}

/** Axis 3: decision. No decision on record means no adverse decision has been taken: "valid". Anything malformed fails closed. */
export function decisionState(cert) {
  const d = cert?.decision;
  if (d === undefined || d === null) return 'valid';
  return DECISION_STATES.includes(d?.state) ? d.state : 'suspended';
}

/** Axis 4: deployment, as the customer reported it. ColleagueAI never verifies it, and it never affects the claim. */
export function deploymentState(cert) {
  const v = cert?.deployment?.versionInUse;
  return typeof v === 'string' && /^\d+(\.\d+){0,3}$/.test(v)
    ? { state: 'reported', versionInUse: v, reportedAt: ISO(cert.deployment.reportedAt), verifiedByColleagueAI: false }
    : { state: 'not-reported', verifiedByColleagueAI: false };
}

/** All four axes plus the single derived claim. */
export function certificateState(cert, product, now = Date.now()) {
  const subscription = subscriptionState(cert, now);
  const currency = releaseCurrency(cert, product);
  const decision = decisionState(cert);
  const current = currentCertifiedRelease(product);
  const active = subscription === 'active' && currency === 'current' && decision === 'valid';
  return {
    active,
    subscription,
    releaseCurrency: currency,
    decision,
    decisionReason: decision !== 'valid' && DECISION_REASONS.includes(cert?.decision?.reason) ? cert.decision.reason : null,
    currentCertifiedRelease: current ? current.version : null,
    deployment: deploymentState(cert),
    label: stateLabel({ active, subscription, currency, decision, current: current?.version ?? null }),
  };
}

/** One honest sentence for the verification page. The order matters: the most serious state speaks first. */
export function stateLabel({ active, subscription, currency, decision, current }) {
  if (active) return 'Colleague AI Certified — Active';
  if (decision === 'revoked') return 'Revoked — not certified';
  if (decision === 'discontinued') return 'Discontinued — certified at release, not current';
  if (decision === 'suspended') return 'Suspended — not currently certified';
  if (subscription === 'disputed') return 'Payment dispute open — not currently active';
  if (currency === 'withdrawn') return 'Release withdrawn — not currently certified';
  if (currency === 'not-certified') return 'Not a certified release';
  if (subscription === 'past_due') return 'Payment overdue — not currently active';
  if (subscription !== 'active') return 'Certified at release, not current';
  if (currency === 'superseded') return `Superseded — current certified release is ${current}`;
  return 'Not currently active';
}

/** The roles whose joint decision the D17 procedure requires (spec D17: founder and qualified independent reviewer). */
export const DECIDER_ROLES = Object.freeze(['FC', 'IR']);

/**
 * CAI-AUD-003: who took a decision. A decision names exactly one active FC and one active IR from the decider
 * register, as opaque ids, and they must be different people. Returns null when acceptable, else a reason code.
 * `register` is { people: [{ id, role, from?, until? }] }; an empty or missing register refuses every decision.
 */
export function deciderError(deciders, register, now = Date.now()) {
  const people = Array.isArray(register?.people) ? register.people : [];
  if (!Array.isArray(deciders) || deciders.length !== DECIDER_ROLES.length) return 'deciders-required';
  const seen = new Set();
  for (const role of DECIDER_ROLES) {
    const d = deciders.find((x) => x && x.role === role);
    if (!d || typeof d.id !== 'string' || !d.id) return 'deciders-required';
    const person = people.find((p) => p.id === d.id && p.role === role);
    if (!person) return 'decider-not-registered';
    const from = person.from ? Date.parse(person.from) : -Infinity;
    const until = person.until ? Date.parse(person.until) : Infinity;
    if (!(from <= now && now < until)) return 'decider-not-active';
    seen.add(d.id);
  }
  return seen.size === DECIDER_ROLES.length ? null : 'deciders-must-differ';
}

/** The label stored beside the ids, in the form older records used ("FC+IR"). */
export const deciderLabel = (deciders) => DECIDER_ROLES.filter((r) => (deciders || []).some((d) => d?.role === r)).join('+');

/**
 * Validate a decision change before it is written. Returns null when allowed, else a reason code.
 * Rules: a terminal decision never changes; an adverse decision needs a public reason category and a reference;
 * reinstatement ("valid") is only possible from "suspended" and needs a reference AND an identified decision-maker
 * (it used to skip that check, so a reinstatement could be recorded by nobody). With `opts.register` the decision
 * must also name registered, active deciders (deciderError); the database layer always passes the register.
 */
export function decisionChangeError(cert, next, opts = {}) {
  const from = decisionState(cert);
  if (!DECISION_STATES.includes(next?.state)) return 'unknown-state';
  if (TERMINAL_DECISIONS.includes(from)) return 'terminal';
  if (next.state === from) return 'no-change';
  if (next.state === 'valid') {
    if (from !== 'suspended' || !next.reference) return 'reinstate-needs-suspension-and-reference';
  } else {
    if (!DECISION_REASONS.includes(next.reason)) return 'reason-required';
    if (!next.reference || typeof next.reference !== 'string') return 'reference-required';
  }
  if (opts.register !== undefined) return deciderError(next.deciders, opts.register, opts.now ?? Date.now());
  if (!next.decidedBy || typeof next.decidedBy !== 'string') return 'decided-by-required';
  return null;
}
