/**
 * scripts/sync-availability.mjs - write the public availability of every agent into the storefront pages.
 *
 * Source of truth: config/availability.json, read through lib/availability.js (which narrows each status to
 * what the recorded approvals support). This rewrites, in every agents page that carries the markers:
 *   CAI_AVAIL     slug -> public status (coming-soon | early-access | available | temporarily-unavailable | discontinued)
 *   CAI_SELLABLE  slugs whose commercial sale is authorised (the buy path may open only for these)
 *   CAI_TESTABLE  slugs with a released package, which a Preview deployment may open for a TEST purchase
 *                 (scripts/enable-checkout-preview.cjs flips CAI_PREVIEW_SALE in dist/ on Preview only)
 * and the localized status labels. The server never trusts any of it: lib/availability.js and lib/products.js
 * refuse a live sale on their own. Run with --check to fail (exit 1) when a page has drifted.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVAILABILITY, publicStatus, commercialSaleAllowed, permittedActions, PUBLIC_LABELS } from '../lib/availability.js';
import PRODUCTS from '../config/products.json' with { type: 'json' };

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');

const slugs = Object.keys(AVAILABILITY.agents).sort();
const avail = Object.fromEntries(slugs.map((s) => [s, publicStatus(s)]));
const sellable = slugs.filter((s) => commercialSaleAllowed(s));
const testable = Object.keys(PRODUCTS).filter((k) => !k.startsWith('_') && PRODUCTS[k]?.release);

export function clientBlock() {
  return '/* public availability per agent, generated from config/availability.json by scripts/sync-availability.mjs */' +
    'function caiAvailOf(s){var a=/*CAI_AVAIL*/' + JSON.stringify(avail) + '/*/CAI_AVAIL*/;' +
    'return Object.prototype.hasOwnProperty.call(a,s)?a[s]:"coming-soon";}' +
    'function caiSaleOpen(s,on){var ok=/*CAI_SELLABLE*/' + JSON.stringify(sellable) + '/*/CAI_SELLABLE*/,' +
    't=/*CAI_TESTABLE*/' + JSON.stringify(testable) + '/*/CAI_TESTABLE*/;' +
    'return on===true&&(ok.indexOf(s)>-1||(t.indexOf(s)>-1&&/*CAI_PREVIEW_SALE*/false));}' +
    'function caiStatusFor(s){var L=' + JSON.stringify(PUBLIC_LABELS) + ',' +
    'l=String(document.documentElement.lang||"en").slice(0,2),t=L[l]||L.en;return t[caiAvailOf(s)]||t["coming-soon"];}';
}

// From the comment that introduces the block (old or new wording) to the end of caiStatusFor.
const BLOCK_RE = /\/\* (?:release status per agent|public availability per agent)[^*]*\*\/function caiAvailOf\(s\)\{[\s\S]*?function caiStatusFor\(s\)\{[\s\S]*?return t\[(?:a\[s\]\|\|"concept"\]|caiAvailOf\(s\)\]\|\|t\["coming-soon"\]);\}/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, 'public')).filter((f) => readFileSync(f, 'utf8').includes('function caiAvailOf('));
const block = clientBlock();
let changed = 0; const drift = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!BLOCK_RE.test(src)) { drift.push(f + ' (block not found)'); continue; }
  const next = src.replace(BLOCK_RE, () => block);
  if (next !== src) {
    if (CHECK) drift.push(f); else { writeFileSync(f, next); changed++; }
  }
}
// The agent inventory (docs/launch/agent-availability-inventory.csv) is generated from the same registry.
export function inventoryCsv() {
  const q = (v) => { const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = ['agent_id', 'name', 'target_cai_level', 'verified_cai_score', 'lifecycle', 'technical_readiness', 'certification', 'commercial_approval', 'early_access_approval', 'public_availability', 'permitted_customer_actions', 'release_blockers'];
  const rows = slugs.map((s) => { const r = AVAILABILITY.agents[s]; return [s, r.name, r.cai.targetLevel, r.cai.verifiedScore ?? 'not assessed', r.lifecycle, r.technicalReadiness, r.certification,
    r.commercialApproval.status, r.earlyAccessApproval.status, publicStatus(s), permittedActions(s), r.releaseBlockers]; });
  return [cols.join(','), ...rows.map((r) => r.map(q).join(','))].join('\n') + '\n';
}
const INV = join(ROOT, 'docs/launch/agent-availability-inventory.csv');
const inv = inventoryCsv();
let invCurrent = ''; try { invCurrent = readFileSync(INV, 'utf8'); } catch { /* first run */ }
if (inv !== invCurrent) { if (CHECK) drift.push(INV); else { writeFileSync(INV, inv); changed++; } }

if (CHECK) {
  if (drift.length) { console.error('[sync-availability] drifted:\n  ' + drift.join('\n  ')); process.exit(1); }
  console.log(`[sync-availability] ${files.length} page(s) in sync`);
} else {
  if (drift.length) { console.error('[sync-availability] could not update:\n  ' + drift.join('\n  ')); process.exit(1); }
  console.log(`[sync-availability] ${changed} of ${files.length} page(s) updated; ${sellable.length} agent(s) on sale`);
}
