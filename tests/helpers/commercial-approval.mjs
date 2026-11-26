/**
 * tests/helpers/commercial-approval.mjs - approve one agent commercially for the duration of a test.
 * Mutates the shared config/availability.json module object (the same object lib/availability.js reads) and
 * restores it afterwards, so a test can reach the gates that come after the commercial-approval gate.
 */
import { AVAILABILITY } from '../../lib/availability.js';

export function approveCommercially(slug) {
  const rec = AVAILABILITY.agents[slug];
  const saved = structuredClone(rec);
  Object.assign(rec, {
    lifecycle: 'commercially-approved', publicStatus: 'available',
    commercialApproval: { status: 'approved', approvedBy: 'TEST FOUNDER', approvedAt: '2026-11-26', reference: 'TEST PR' },
  });
  return () => { for (const k of Object.keys(rec)) delete rec[k]; Object.assign(rec, saved); };
}

export async function withCommercialApproval(slug, fn) {
  const restore = approveCommercially(slug);
  try { return await fn(); } finally { restore(); }
}
