/**
 * tests/helpers/commercial-approval.mjs - make one release fully eligible for sale for the duration of a test.
 * Writes every record the run-time gate checks, where production keeps it, on the shared module objects:
 *   config/agents/<slug>.json   sale.goDecision for this release, ip executed, and test copies of release.record
 *                               and release.gates (all gates PASS with valid decisions, this version and package)
 *   config/products.json        release.status 'released' (saleApproved is left to the caller)
 *   config/availability.json    lifecycle commercially-approved, available, technically approved, internally
 *                               certified, no release blockers
 * and restores everything afterwards.
 */
import { AVAILABILITY, agentRecord, primeRepoJson } from '../../lib/availability.js';
import PRODUCTS from '../../config/products.json' with { type: 'json' };
import { MANDATORY_GATES } from '../../lib/releaseGates.js';

export function approveCommercially(slug) {
  const cat = AVAILABILITY.agents[slug]; const savedCat = structuredClone(cat);
  const rel = PRODUCTS[slug]?.release; const savedStatus = rel?.status;
  const agent = agentRecord(slug); const saved = agent ? structuredClone({ sale: agent.sale, ip: agent.ip, release: agent.release }) : null;
  Object.assign(cat, { lifecycle: 'commercially-approved', publicStatus: 'available', technicalReadiness: 'technically-approved', certification: 'internally-certified', releaseBlockers: [] });
  if (rel) rel.status = 'released';
  if (agent && rel) {
    const recPath = `test/${slug}/release.json`; const gatesPath = `test/${slug}/gates.json`;
    primeRepoJson(recPath, { version: rel.version, package: rel.package, sha256: rel.sha256, bytes: rel.bytes, bundleRevision: rel.bundleRevision, status: 'released' });
    primeRepoJson(gatesPath, { release: rel.version, gates: MANDATORY_GATES.map((id) => ({ id, area: id.startsWith('P-') ? 'product' : 'commercial', status: 'PASS', decision: { recordedBy: 'test', recordedAt: '2026-11-26', recordCommit: 'abcdef1' } })) });
    agent.sale = { ...agent.sale, goDecision: { approvedBy: 'TEST FOUNDER', date: '2026-11-26', reference: 'TEST PR', release: rel.version } };
    agent.ip = { ...agent.ip, status: 'executed', evidenceSha256: 'a'.repeat(64) };
    agent.release = { ...agent.release, record: recPath, gates: gatesPath };
  }
  return () => {
    for (const k of Object.keys(cat)) delete cat[k]; Object.assign(cat, savedCat);
    if (rel) rel.status = savedStatus;
    if (agent) Object.assign(agent, saved);
  };
}

export async function withCommercialApproval(slug, fn) {
  const restore = approveCommercially(slug);
  try { return await fn(); } finally { restore(); }
}
