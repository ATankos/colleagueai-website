/**
 * tests/helpers/commercial-approval.mjs - approve one release commercially for the duration of a test.
 * Writes the GO decision where production keeps it (config/agents/<slug>.json sale.goDecision, version-specific,
 * on the cached record lib/availability.js reads), sets release.status 'released' and the catalogue lifecycle,
 * and restores everything afterwards. saleApproved is left to the caller: the records must agree.
 */
import { AVAILABILITY, agentRecord } from '../../lib/availability.js';
import PRODUCTS from '../../config/products.json' with { type: 'json' };

export function approveCommercially(slug) {
  const cat = AVAILABILITY.agents[slug]; const savedCat = structuredClone(cat);
  const rel = PRODUCTS[slug]?.release; const savedStatus = rel?.status;
  const agent = agentRecord(slug); const savedSale = agent ? structuredClone(agent.sale) : null;
  Object.assign(cat, { lifecycle: 'commercially-approved', publicStatus: 'available' });
  if (rel) rel.status = 'released';
  if (agent && rel) agent.sale = { ...agent.sale, goDecision: { approvedBy: 'TEST FOUNDER', date: '2026-11-26', reference: 'TEST PR', release: rel.version } };
  return () => {
    for (const k of Object.keys(cat)) delete cat[k]; Object.assign(cat, savedCat);
    if (rel) rel.status = savedStatus;
    if (agent) agent.sale = savedSale;
  };
}

export async function withCommercialApproval(slug, fn) {
  const restore = approveCommercially(slug);
  try { return await fn(); } finally { restore(); }
}
