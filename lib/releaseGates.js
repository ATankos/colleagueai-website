/**
 * lib/releaseGates.js - the rule every release gate decision must meet (moved unchanged from
 * scripts/release/validate-product.mjs so the run-time sale gate in lib/availability.js applies the same rule).
 */
export const APPROVER_ROLES = ['founder', 'accountant', 'counsel'];
export const ISO = /^\d{4}-\d{2}-\d{2}/;

/**
 * Every release gate records its decision. An engineering PASS/FAIL names who recorded it, when and in which commit.
 * A gate that needs a person (requiredApprover) is PASS only with that person's written approval recorded (by, role,
 * at, reference), the role among the required ones, and every evidence-manifest record of the gate verified.
 */
export function gateDecisionErrors(gates, manifest) {
  const errors = [];
  for (const g of gates?.gates || []) {
    if (['PASS', 'FAIL'].includes(g.status) && !g.requiredApprover) {
      const d = g.decision || {};
      if (!d.recordedBy || !ISO.test(String(d.recordedAt || '')) || !/^[0-9a-f]{7,40}$/.test(String(d.recordCommit || ''))) errors.push(`${g.id}: ${g.status} without decision {recordedBy, recordedAt, recordCommit}`);
    }
    if (g.requiredApprover) {
      if (!Array.isArray(g.requiredApprover) || !g.requiredApprover.every((r) => APPROVER_ROLES.includes(r))) errors.push(`${g.id}: requiredApprover must list founder, accountant or counsel`);
      const a = g.approval || {};
      const approved = a.by && APPROVER_ROLES.includes(a.role) && ISO.test(String(a.at || '')) && a.reference;
      if (g.status === 'PASS') {
        if (!approved) errors.push(`${g.id}: PASS without the written approval {by, role, at, reference}`);
        else if (!g.requiredApprover.includes(a.role)) errors.push(`${g.id}: approved by a ${a.role}, needs ${g.requiredApprover.join(' or ')}`);
        const open = (manifest?.records || []).filter((r) => r.gate === g.id && r.status !== 'verified').map((r) => r.id);
        if (open.length) errors.push(`${g.id}: PASS while its evidence is not verified: ${open.join(', ')}`);
      } else if (approved) errors.push(`${g.id}: approval recorded but status is ${g.status}`);
    }
  }
  return errors;
}

