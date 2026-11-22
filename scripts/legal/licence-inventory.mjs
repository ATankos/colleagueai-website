#!/usr/bin/env node
/**
 * scripts/legal/licence-inventory.mjs - the third-party open-source packages the website and its payment and
 * delivery functions ship with, and their licences, from package-lock.json (production packages only; build and
 * test tools are not distributed).
 *
 *   node scripts/legal/licence-inventory.mjs           rewrite docs/legal/third-party-licences.md
 *   node scripts/legal/licence-inventory.mjs --json    print the inventory as JSON
 *
 * tests/licence-inventory.test.mjs checks that every production
 * package carries a licence on the permissive list below and that every direct dependency is in the document.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const PERMISSIVE = ['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0', 'Zlib'];

/** True when an SPDX expression is permissive: every licence in an AND, or at least one in an OR, is on the list. */
export function isPermissive(expr) {
  const e = String(expr || '').trim().replace(/^\(|\)$/g, '');
  if (!e) return false;
  if (/ AND /.test(e)) return e.split(/ AND /).every(isPermissive);
  if (/ OR /.test(e)) return e.split(/ OR /).some(isPermissive);
  return PERMISSIVE.includes(e);
}

const ROOT = new URL('../../', import.meta.url);

/** Production packages from a package-lock.json (v2/v3): [{ name, version, license, direct }]. */
export function productionPackages(lock, pkg) {
  const direct = new Set(Object.keys(pkg.dependencies || {}));
  const seen = new Map();
  for (const [path, e] of Object.entries(lock.packages || {})) {
    if (!path || e.dev || e.devOptional || e.link) continue;
    const name = e.name || path.replace(/^.*node_modules\//, '');
    const key = `${name}@${e.version}`;
    if (!seen.has(key)) seen.set(key, { name, version: e.version, license: e.license || 'UNKNOWN', direct: direct.has(name) && path === `node_modules/${name}` });
  }
  return [...seen.values()].sort((a, b) => (b.direct - a.direct) || a.name.localeCompare(b.name));
}

function render(list, generatedAt) {
  const counts = {};
  for (const p of list) counts[p.license] = (counts[p.license] || 0) + 1;
  const rows = list.map((p) => `| ${p.name} | ${p.version} | ${p.license} | ${p.direct ? 'direct' : 'transitive'} |`).join('\n');
  return `# Third-party licences

Generated ${generatedAt} from \`package-lock.json\` by \`node scripts/legal/licence-inventory.mjs\`. Regenerate after dependency changes.

This lists the open-source packages that ship with the website and its server functions (checkout, webhook, delivery). Build and test tools are not distributed and are not listed. **${list.length} packages:** ${Object.entries(counts).map(([l, n]) => `${l} ${n}`).join(', ')}. All are permissive licences; none is copyleft. \`tests/licence-inventory.test.mjs\` fails if a production package arrives under any other licence, or under none.

Permissive licences still carry conditions, chiefly keeping the copyright and licence notice with copies of the code. The website ships these packages bundled or as server dependencies and does not redistribute them to customers as source. Whether a notices file must be published with the site is a question for counsel (see the counsel pack).

## Delivered to customers: CAI-L4-CI-001 1.0.3.6 bundle revision 3

Reviewed 2026-11-22 from the delivered file \`CAI-L4-CI-001_1.0.3.6-r3.zip\` (SHA-256 \`37a047c1…e051d\`). None of the npm packages below is in it.

| Item in the bundle | Origin | Licence / basis |
| --- | --- | --- |
| \`CAIContractIntelligence_1_0_3_6_managed.zip\`: agent, topics, instructions, 7 flows, 4 tables, 1 role, 9 environment variable definitions | Colleague AI (IP Instrument A, Schedule A) | Software & Agent Licence |
| Microsoft connectors the flows call: Dataverse (\`shared_commondataserviceforapps\`), SharePoint (\`shared_sharepointonline\`), Teams (\`shared_teams\`) | Microsoft; referenced, not contained | the customer's Microsoft agreement |
| \`START-HERE\`, \`INSTALL\`, \`LICENSE.txt\`, \`MANIFEST.json\`, \`SHA256SUMS.txt\`, \`deploymentSettings.template.json\`, \`DOSSIER.pdf\` | Colleague AI | Software & Agent Licence |
| \`check-cai-install-readiness.mjs\` (no imports beyond Node.js built-ins) | Colleague AI | Software & Agent Licence |
| Fonts embedded as subsets in the PDFs: DejaVu Sans, DejaVu Sans Bold, DejaVu Sans Mono | DejaVu fonts | Bitstream Vera / DejaVu licence (embedding in documents permitted) |
| Fonts embedded as subsets in \`INSTALL.pdf\` and \`START-HERE.pdf\`: Inter Regular, Bold, Italic | Inter (Rasmus Andersson) | SIL Open Font License 1.1 (embedding in documents permitted; the fonts themselves are not redistributed) |

This review says what the bundle contains and under which terms. It is not an IP clearance: the company's own rights depend on IP Instrument A (\`docs/legal/ip/\`).

## Not covered by this list

- **The agent packages sold to customers.** These are not npm packages and are reviewed separately above, under "Delivered to customers: CAI-L4-CI-001 1.0.3.6 bundle revision 3".
- **Microsoft services the packages run on** (Power Platform, Dataverse, Copilot Studio, and any AI capabilities a package uses). The customer licenses these from Microsoft under Microsoft's terms and pays Microsoft for their use; they are not supplied or resold by Colleague AI.
- **Online services the website uses**: Stripe (payments, tax ID verification, invoices when enabled), Vercel (hosting and file storage), Upstash (key-value records), Sentry (error reports) and the analytics named in the Privacy Policy. These are services under their providers' terms, not licensed code.
- **Fonts embedded in the order documents** (\`lib/fonts/\`): DejaVu Sans and DejaVu Sans Bold, under the Bitstream Vera Fonts licence (permissive; embedding subsets in documents is expressly permitted; the licence text is kept beside the files as \`lib/fonts/LICENSE_DEJAVU\`). Subsets of them are embedded in every licence agreement confirmation, invoice and credit-note PDF.

## Packages

| Package | Version | Licence | Dependency |
| --- | --- | --- | --- |
${rows}
`;
}

const isMain = process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url;
if (isMain) {
  const lock = JSON.parse(readFileSync(new URL('package-lock.json', ROOT), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));
  const list = productionPackages(lock, pkg);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(list, null, 2));
  } else {
    writeFileSync(new URL('docs/legal/third-party-licences.md', ROOT), render(list, new Date().toISOString().slice(0, 10)));
    console.log(`docs/legal/third-party-licences.md: ${list.length} production packages`);
  }
}
