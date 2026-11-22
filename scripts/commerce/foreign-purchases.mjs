#!/usr/bin/env node
/**
 * scripts/commerce/foreign-purchases.mjs - read-only report on the foreign-supplier purchase register.
 *
 *   node scripts/commerce/foreign-purchases.mjs <path to private register .json> [--json]
 *
 * The register is a JSON array of records shaped like docs/commerce/templates/foreign-purchase.template.json. It holds
 * accounting data, so it is kept in the company's private storage, never in this repository; the script refuses a path
 * inside the repository. It prints, per invoice, what is missing, the flags and the candidate months; it never
 * computes or declares a tax amount (lib/purchaseVat.js).
 */
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessRegister } from '../../lib/purchaseVat.js';

const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('usage: foreign-purchases.mjs <private register.json> [--json]'); process.exit(2); }
const abs = realpathSync(resolve(file));
const rel = relative(ROOT, abs);
if (!rel.startsWith('..') && !isAbsolute(rel)) { console.error('refused: the register holds accounting data and must not be inside the repository'); process.exit(2); }
const report = assessRegister(JSON.parse(readFileSync(abs, 'utf8')));
if (flags.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  for (const r of report.rows) {
    console.log(`${r.id} · ${r.supplier}: ${r.status.toUpperCase()}${r.candidateMonths.length ? ` · candidate months ${r.candidateMonths.join(', ')}` : ''}`);
    for (const m of r.missing) console.log(`  missing: ${m}`);
    for (const f of r.flags) console.log(`  flag: ${f}`);
    if (r.decision) console.log(`  accountant: ${r.decision.treatment}${r.decision.period ? ` (${r.decision.period})` : ''}, ${r.decision.decidedBy}, ${r.decision.reference}`);
  }
  console.log(`\n${report.decided} decided, ${report.open} open for the accountant.`);
}
process.exit(report.open ? 1 : 0);
