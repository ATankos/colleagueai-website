#!/usr/bin/env node
// Static acceptance check for an UNPACKED Dataverse solution of CAI-L4-CI-001
// (Contract Intelligence & Register). It only reads files.
//
//   node scripts/check-cai-solution-package.mjs <unpacked-solution-dir> [--expect-version 1.0.3.2]
//
// Unpack the managed zip first, for example with `pac solution unpack --zipfile <file> --folder <dir>`.
// This script is not part of CI: the solution is built outside this repository, so there is nothing
// here for CI to check. Checks C1 to C8 below are the acceptance checks for a rebuilt package.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

let dir = null;
let expectVersion = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--expect-version') {
    expectVersion = argv[i + 1] || null;
    i += 1;
  } else if (!argv[i].startsWith('--') && dir === null) {
    dir = argv[i];
  }
}

if (!dir || !existsSync(join(dir, 'solution.xml'))) {
  console.error('Usage: node scripts/check-cai-solution-package.mjs <unpacked-solution-dir> [--expect-version X.Y.Z.W]');
  console.error('The folder must contain solution.xml (an unpacked solution, not the zip).');
  process.exit(2);
}

// The role CAI Contract Reader must declare exactly this. Platform reads are the basics every role carries.
const ROLE_NAME = 'CAI Contract Reader';
const ROLE_ALLOWED = new Map([
  ['prvReadcai_Contract', 'Basic'],
  ['prvReadcai_FieldEvidence', 'Basic'],
  ['prvReadPluginAssembly', 'Global'],
  ['prvReadPluginType', 'Global'],
  ['prvReadSdkMessage', 'Global'],
  ['prvReadSdkMessageProcessingStep', 'Global'],
  ['prvReadSdkMessageProcessingStepImage', 'Global'],
  ['prvReadSharePointData', 'Global'],
  ['prvReadSharePointDocument', 'Global'],
]);

const read = (p) => readFileSync(join(dir, p), 'utf8');

function* walk(d) {
  for (const name of readdirSync(d)) {
    const full = join(d, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (st.size < 5_000_000) yield full;
  }
}

const results = [];
const check = (id, title, ok, detail) => results.push({ id, title, ok, detail });

const solutionXml = read('solution.xml');
const customizations = existsSync(join(dir, 'customizations.xml')) ? read('customizations.xml') : '';

// C1 version
const version = (solutionXml.match(/<Version>([^<]+)<\/Version>/) || [])[1] || '';
check('C1', 'Solution version' + (expectVersion ? ` is ${expectVersion}` : ' is present'),
  Boolean(version) && (!expectVersion || version === expectVersion), `found "${version}"`);

// C2 description is current: names this version, is not a leftover release-candidate note
const manifest = (solutionXml.match(/<SolutionManifest>[\s\S]*?<\/SolutionManifest>/) || [''])[0];
const descBlock = (manifest.match(/<Descriptions>([\s\S]*?)<\/Descriptions>/) || [])[1] || '';
const description = (descBlock.match(/description="([^"]*)"/) || [])[1] || '';
const stale = /release candidate|not for publication|\bT7\b/i.test(description);
check('C2', 'Solution description is current (names the version, no release-candidate or "T7 open" leftovers)',
  Boolean(description) && !stale && description.includes(version), `"${description.slice(0, 140)}"`);

// C3 no approval component (nothing in the product uses approvals)
const approvalDir = join(dir, 'approvalprocesses');
const approvals = existsSync(approvalDir) ? readdirSync(approvalDir) : [];
check('C3', 'No approval component in the package', approvals.length === 0, approvals.length ? `found ${approvals.join(', ')}` : 'none');

// C4 every environment variable has a default or is required at import (no value may be silently blank)
const varsDir = join(dir, 'environmentvariabledefinitions');
const blankAllowed = [];
if (existsSync(varsDir)) {
  for (const name of readdirSync(varsDir)) {
    const f = join(varsDir, name, 'environmentvariabledefinition.xml');
    if (!existsSync(f)) continue;
    const xml = readFileSync(f, 'utf8');
    const hasDefault = /<defaultvalue>[^<]+<\/defaultvalue>/.test(xml);
    const required = /<isrequired>1<\/isrequired>/.test(xml);
    if (!hasDefault && !required) blankAllowed.push(name);
  }
}
check('C4', 'Every environment variable has a default or is required at import', blankAllowed.length === 0,
  blankAllowed.length ? `can be left blank: ${blankAllowed.join(', ')}` : 'all covered');

// C5 role declares exactly the allowed privileges (contract data read-only)
const roleBlocks = customizations.match(/<Role [\s\S]*?<\/Role>/g) || [];
const role = roleBlocks.find((r) => r.includes(`name="${ROLE_NAME}"`));
if (!role) {
  check('C5', `Role "${ROLE_NAME}" is declared`, false, 'role not found in customizations.xml');
} else {
  const declared = new Map();
  for (const m of role.matchAll(/<RolePrivilege name="([^"]+)" level="([^"]+)"/g)) declared.set(m[1], m[2]);
  const extra = [...declared].filter(([n, l]) => ROLE_ALLOWED.get(n) !== l).map(([n, l]) => `${n}:${l}`);
  const missing = [...ROLE_ALLOWED.keys()].filter((n) => !declared.has(n));
  check('C5', `Role "${ROLE_NAME}" declares exactly ${ROLE_ALLOWED.size} read privileges`,
    extra.length === 0 && missing.length === 0 && declared.size === ROLE_ALLOWED.size,
    `declared ${declared.size}; unexpected: ${extra.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}`);
}

// C6 no e-mail address embedded anywhere (ignores the OData "@odata.bind" keys)
const emailRe = /[A-Za-z0-9._%+-]+@(?!odata\.)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const withEmail = [];
for (const f of walk(dir)) {
  const text = readFileSync(f, 'utf8');
  if (text.includes('\u0000')) continue;
  if (emailRe.test(text)) withEmail.push(relative(dir, f));
  emailRe.lastIndex = 0;
}
check('C6', 'No e-mail address embedded in the package', withEmail.length === 0, withEmail.length ? `in ${withEmail.join(', ')}` : 'none');

// C7 every declared connection reference is used by a flow, topic or bot
const refs = [...customizations.matchAll(/connectionreferencelogicalname="([^"]+)"/g)].map((m) => m[1]);
const usable = ['Workflows', 'botcomponents', 'bots'].filter((d) => existsSync(join(dir, d)));
const corpus = usable.flatMap((d) => [...walk(join(dir, d))]).map((f) => readFileSync(f, 'utf8')).join('\n');
const unused = refs.filter((r) => !corpus.includes(r));
check('C7', 'Every declared connection reference is used', refs.length > 0 && unused.length === 0,
  `${refs.length} declared; unused: ${unused.join(', ') || 'none'}`);

// C8 every cloud flow is exported Activated (a flow exported as draft stays Off after import)
const flows = [...customizations.matchAll(/<Workflow [^>]*Name="([^"]+)"[\s\S]*?<\/Workflow>/g)]
  .filter((m) => /<Category>5<\/Category>/.test(m[0]));
const notActive = flows.filter((m) => !(/<StateCode>1<\/StateCode>/.test(m[0]) && /<StatusCode>2<\/StatusCode>/.test(m[0]))).map((m) => m[1]);
check('C8', 'Every cloud flow is exported Activated', flows.length > 0 && notActive.length === 0,
  `${flows.length} flows; not activated: ${notActive.join(', ') || 'none'}`);

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.title}\n     ${r.detail}`);
}
console.log(`\n${results.length - failed} of ${results.length} checks passed (solution version ${version || 'unknown'}).`);
process.exit(failed ? 1 : 0);
