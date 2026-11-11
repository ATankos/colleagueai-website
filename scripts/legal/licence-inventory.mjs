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

export const PERMISSIVE = ['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0'];

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

## Not covered by this list

- **The agent packages sold to customers** (Power Platform managed solutions such as \`CAI-L4-CI-001\`). They are built from Microsoft Power Platform components by Colleague AI and are delivered as a managed solution; this inventory does not inspect them. Their own dependency review is part of the counsel and audit packs.
- **Microsoft services the packages run on** (Power Platform, Dataverse, Copilot Studio, and any AI capabilities a package uses). The customer licenses these from Microsoft under Microsoft's terms and pays Microsoft for their use; they are not supplied or resold by Colleague AI.
- **Online services the website uses**: Stripe (payments, tax ID verification, invoices when enabled), Vercel (hosting and file storage), Upstash (key-value records), Sentry (error reports) and the analytics named in the Privacy Policy. These are services under their providers' terms, not licensed code.

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
