#!/usr/bin/env node
/**
 * scripts/release/certify-release.mjs - one reproducible release certification for CAI-L4-CI-001.
 *
 *   node scripts/release/certify-release.mjs [--bundle <downloaded CAI-L4-CI-001_*.zip>] [--audit] [--skip-suites] [--json]
 *
 * It reports every release gate as PASS / FAIL / BLOCKED / REQUIRES FOUNDER APPROVAL and exits 1 when any gate it
 * checks itself FAILs (manual gates never change the exit code, and are never upgraded by this script).
 *
 * Gates checked here:
 *   PRODUCT   (needs --bundle: the file as a buyer downloads it)
 *     PKG-SHA        the bundle's SHA-256 and size equal config/products.json release.sha256 / bytes
 *     PKG-STRUCTURE  one root folder named after the bundle, no other entries, no path traversal
 *     PKG-SUMS       every entry of the inner SHA256SUMS.txt matches, and every file is listed
 *     PKG-MANIFEST   MANIFEST.json names the SKU, the release, the bundle revision and the managed solution hash
 *     PKG-LICENSE    LICENSE.txt names the release (and the revision when it is 2 or later)
 *     PKG-SOLUTION   the managed solution unpacks and passes scripts/check-cai-solution-package.mjs (C1-C9)
 *     PKG-RECORD     the managed solution hash equals the release candidate record
 *   COMMERCIAL / SECURITY  (node --test suites; Stripe and storage mocked, no network)
 *     checkout + acceptance, webhook (signature, idempotency, retries, refunds, disputes), entitlements and release
 *     access, order record and documents, invoicing, recovery and download tokens, public exposure, rate limits,
 *     KV namespace isolation, release candidate, legal archive, claims, temporary code.
 *   DEPENDENCIES (--audit, needs the npm registry): npm audit reports no high or critical advisory.
 *   MANUAL  config/release-gates.json (tenant, founder, counsel, accountant), printed with their evidence.
 *
 * Needs node and unzip. It reads files only; it calls no service and changes nothing.
 */
import { readFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const bundlePath = opt('--bundle');
const asJson = args.includes('--json');
const skipSuites = args.includes('--skip-suites');
const audit = args.includes('--audit');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PRODUCT = JSON.parse(read('config/products.json'))['contract-intelligence-and-register'];
const REL = PRODUCT.release;
const CAND = JSON.parse(read(`scripts/cai-release/${REL.version}/release-candidate.json`));
const GATES = JSON.parse(read('config/release-gates.json'));
const results = [];
const gate = (id, area, title, ok, evidence) => results.push({ id, area, title, status: ok ? 'PASS' : 'FAIL', evidence });

// ---------- product ----------
if (!bundlePath) {
  results.push({ id: 'PKG-*', area: 'product', title: 'Package checks', status: 'BLOCKED', evidence: 'no --bundle given: pass the downloaded bundle file' });
} else {
  const buf = readFileSync(bundlePath);
  const h = sha(buf);
  gate('PKG-SHA', 'product', 'Bundle SHA-256 and size equal the release record', h === REL.sha256 && buf.length === REL.bytes,
    `${basename(bundlePath)}: ${buf.length} bytes, ${h}; record ${REL.package}: ${REL.bytes} bytes, ${REL.sha256}`);
  const work = mkdtempSync(join(tmpdir(), 'cai-cert-'));
  try {
    const unz = spawnSync('unzip', ['-q', '-o', bundlePath, '-d', work], { encoding: 'utf8' });
    const rootName = REL.package.replace(/\.zip$/, '');
    const roots = readdirSync(work);
    const listing = spawnSync('unzip', ['-Z1', bundlePath], { encoding: 'utf8' }).stdout.trim().split('\n');
    const traversal = listing.some((n) => n.startsWith('/') || n.split('/').includes('..'));
    gate('PKG-STRUCTURE', 'product', 'One root folder named after the bundle; no traversal', unz.status === 0 && roots.length === 1 && roots[0] === rootName && !traversal,
      `root ${JSON.stringify(roots)}, expected ${rootName}; ${listing.length} entries`);
    const dir = join(work, rootName);
    if (existsSync(dir)) {
      const sumsText = readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
      const sums = Object.fromEntries(sumsText.map((l) => l.split(/\s+/)).map(([x, n]) => [n, x]));
      const files = readdirSync(dir).filter((n) => n !== 'SHA256SUMS.txt');
      const bad = files.filter((n) => sums[n] !== sha(readFileSync(join(dir, n))));
      const unlisted = Object.keys(sums).filter((n) => !files.includes(n));
      gate('PKG-SUMS', 'product', 'Inner SHA256SUMS.txt matches every file', bad.length === 0 && unlisted.length === 0,
        `${files.length} files; mismatched ${JSON.stringify(bad)}; listed but missing ${JSON.stringify(unlisted)}`);
      const m = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
      const rev = REL.bundleRevision ?? 1;
      const mOk = m.sku === PRODUCT.sku && m.release === REL.version && (m.bundleRevision ?? 1) === rev &&
        m.solution?.sha256 === CAND.managedSolution.sha256 && m.solution?.version === REL.version;
      gate('PKG-MANIFEST', 'product', 'MANIFEST names SKU, release, bundle revision, solution hash', mOk,
        `sku ${m.sku}, release ${m.release}, revision ${m.bundleRevision}, solution ${m.solution?.version} ${String(m.solution?.sha256).slice(0, 12)}…`);
      const lic = readFileSync(join(dir, 'LICENSE.txt'), 'utf8').split('\n')[0];
      const licOk = lic.includes(`release ${REL.version}`) && (rev === 1 || lic.includes(`bundle revision ${rev}`));
      gate('PKG-LICENSE', 'product', 'LICENSE.txt names the release (and revision)', licOk, lic);
      const solFile = CAND.managedSolution.file;
      const solBuf = readFileSync(join(dir, solFile));
      gate('PKG-RECORD', 'product', 'Managed solution equals the release candidate record', sha(solBuf) === CAND.managedSolution.sha256 && solBuf.length === CAND.managedSolution.bytes,
        `${solFile}: ${solBuf.length} bytes, ${sha(solBuf)}`);
      const sol = join(work, 'solution');
      spawnSync('unzip', ['-q', '-o', join(dir, solFile), '-d', sol]);
      const chk = spawnSync(process.execPath, [join(ROOT, 'scripts/check-cai-solution-package.mjs'), sol, '--expect-version', REL.version], { encoding: 'utf8' });
      const last = (chk.stdout + chk.stderr).trim().split('\n').pop();
      gate('PKG-SOLUTION', 'product', 'Managed solution passes C1-C9', chk.status === 0, last);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------- commercial / security suites ----------
const SUITES = [
  ['C-CHECKOUT', 'commercial', 'Checkout: acceptance before payment, B2B fields, card lane, CSP', ['tests/acceptance.test.mjs', 'tests/stripe-api-compat.test.mjs']],
  ['C-WEBHOOK', 'commercial', 'Webhook: signature, idempotency, retries, refunds, disputes', ['tests/webhook.test.mjs']],
  ['C-ENTITLEMENT', 'commercial', 'Entitlements: one per purchase, concurrency, release access', ['tests/entitlement.test.mjs', 'tests/entitlement-concurrency.test.mjs', 'tests/release-access.test.mjs']],
  ['C-ORDER', 'commercial', 'Order record, purchase journey, fulfilment check', ['tests/order-record.test.mjs', 'tests/purchase-journey.test.mjs', 'tests/fulfilment-check.test.mjs']],
  ['C-DOCUMENTS', 'commercial', 'Agreement and invoice PDFs, credit notes, invoicing', ['tests/order-documents.test.mjs', 'tests/invoicing.test.mjs']],
  ['C-RECOVERY', 'commercial', 'Recovery e-mail and download tokens', ['tests/recover.test.mjs']],
  ['C-RELEASE', 'commercial', 'Release record, products.json, download rules', ['tests/cai-1036-release-candidate.test.mjs', 'tests/product-release.test.mjs']],
  ['S-EXPOSURE', 'security', 'No public unrestricted package or secret exposure', ['tests/public-exposure.test.mjs', 'tests/no-temporary-code.test.mjs']],
  ['S-ABUSE', 'security', 'Rate limits and KV namespace isolation (Preview never touches Production keys)', ['tests/ratelimit.test.mjs', 'tests/kv-namespace.test.mjs']],
  ['L-EVIDENCE', 'legal', 'Accepted versions archived immutably; claims match facts; tax policy guards', ['tests/legal-archive.test.mjs', 'tests/claims-truth.test.mjs', 'tests/tax-policy.test.mjs', 'tests/vat-turnover.test.mjs']],
];
if (skipSuites) {
  results.push({ id: 'SUITES', area: 'commercial', title: 'Automated suites', status: 'BLOCKED', evidence: '--skip-suites' });
} else {
  for (const [id, area, title, files] of SUITES) {
    const present = files.filter((f) => existsSync(join(ROOT, f)));
    const run = spawnSync(process.execPath, ['--test', ...present], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } });
    const out = run.stdout + run.stderr;
    const n = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1] ?? NaN);
    gate(id, area, title, run.status === 0 && n('fail') === 0 && present.length === files.length,
      `${present.join(', ')}: pass ${n('pass')}, fail ${n('fail')}${present.length < files.length ? '; missing suite file' : ''}`);
  }
}

// ---------- dependencies ----------
if (audit) {
  const run = spawnSync('npm', ['audit', '--json'], { cwd: ROOT, encoding: 'utf8' });
  let v;
  try { v = JSON.parse(run.stdout).metadata?.vulnerabilities ?? null; } catch { v = null; }
  if (!v) results.push({ id: 'S-DEPS', area: 'security', title: 'Dependency advisories (npm audit)', status: 'BLOCKED', evidence: 'npm audit gave no report (registry unreachable?)' });
  else gate('S-DEPS', 'security', 'No high or critical dependency advisory (npm audit)', (v.high ?? 0) + (v.critical ?? 0) === 0,
    `critical ${v.critical}, high ${v.high}, moderate ${v.moderate}, low ${v.low}`);
}

// ---------- manual gates ----------
for (const g of GATES.gates) results.push({ id: g.id, area: g.area, title: g.title, status: g.status, evidence: g.evidence ?? g.blockedBy, manual: true });

const failed = results.filter((r) => !r.manual && r.status === 'FAIL');
if (asJson) {
  console.log(JSON.stringify({ release: REL.version, package: REL.package, sha256: REL.sha256, results }, null, 2));
} else {
  console.log(`# Release certification — ${PRODUCT.sku} ${REL.version} (${REL.package})\n`);
  console.log('| Gate | Area | Check | Status | Evidence |\n|---|---|---|---|---|');
  for (const r of results) console.log(`| ${r.id}${r.manual ? ' (manual)' : ''} | ${r.area} | ${r.title} | **${r.status}** | ${String(r.evidence).replace(/\|/g, '\\|')} |`);
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(`\nPASS ${count('PASS')} · FAIL ${count('FAIL')} · BLOCKED ${count('BLOCKED')} · REQUIRES FOUNDER APPROVAL ${count('REQUIRES FOUNDER APPROVAL')}`);
}
process.exit(failed.length ? 1 : 0);
