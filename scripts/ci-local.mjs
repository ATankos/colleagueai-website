// Local CI runner: reproduces the `run:` steps of .github/workflows/ci.yml for one
// exact commit, in a fresh isolated checkout, and writes per-commit evidence.
// Uses no GitHub Actions minutes. Procedure and rules: docs/ops/local-ci.md.
//
//   node scripts/ci-local.mjs [--ref <commit>] [--jobs test,e2e] [--expect-tree <tree>]
//                             [--out <dir>] [--keep]
//
// Integrity rules (each one makes the verdict FAIL):
//  - the source working tree must be clean (no modified, staged or untracked files);
//  - the commit is checked out into a new, empty worktree, so nothing local can leak in;
//  - dependencies are installed with `npm ci` from the committed lockfile and verified
//    with `npm ls --all`; the Node major version must equal the workflow's;
//  - every mandatory step must run and exit 0, and a step that runs tests must report
//    a parsed test summary with tests > 0 and nothing skipped, todo, cancelled,
//    flaky or not run; anything else is reported as INCOMPLETE/UNVERIFIED, never PASS;
//  - with --expect-tree, the commit's tree hash must equal the given tree.
// Steps marked continue-on-error in the workflow are reported with their real status
// but do not block (today only the go-live readiness check, failing by design).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir, type, release, arch, cpus } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(name);
const src = process.cwd();
const sh = (cmd, a, cwd = src) => execFileSync(cmd, a, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const problems = [];

// 1. Clean source tree and exact commit.
const dirty = sh('git', ['status', '--porcelain', '--untracked-files=normal']);
if (dirty) {
  console.error('Working tree is not clean; release evidence needs a clean tree:\n' + dirty);
  process.exit(2);
}
const sha = sh('git', ['rev-parse', '--verify', `${opt('--ref', 'HEAD')}^{commit}`]);
const tree = sh('git', ['rev-parse', `${sha}^{tree}`]);
const expectTree = opt('--expect-tree');
if (expectTree && expectTree !== tree) problems.push(`tree ${tree} != expected ${expectTree}`);

const require = createRequire(join(src, 'package.json'));
let yaml;
try { yaml = require('js-yaml'); } catch {
  console.error('js-yaml is not installed. Run once: npm i --no-save js-yaml@4.1.0'); process.exit(2);
}

// 2. Fresh isolated checkout.
const work = mkdtempSync(join(tmpdir(), `ci-local-${sha.slice(0, 8)}-`));
rmSync(work, { recursive: true });
sh('git', ['worktree', 'add', '--detach', work, sha]);
const outDir = resolve(opt('--out', join(tmpdir(), `ci-local-evidence-${sha.slice(0, 8)}`)));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'logs'), { recursive: true });

let seq = 0;
let stepEnv = {};
function run(name, cmd, { timeoutMin = 30 } = {}) {
  const t0 = Date.now();
  // setsid: the step gets its own process group, so servers it starts with `&` are
  // stopped afterwards and cannot hold a port for later steps.
  const bg = cmd.replace(/&\s*$/gm, '>/dev/null 2>&1 &');
  const r = spawnSync('setsid', ['bash', '-eo', 'pipefail', '-c', bg], {
    cwd: work, encoding: 'utf8', maxBuffer: 1 << 28, timeout: timeoutMin * 60000,
    env: { ...process.env, CI: 'true', FORCE_COLOR: '0', ...stepEnv },
  });
  try { process.kill(-r.pid, 'SIGTERM'); } catch { /* group already gone */ }
  const log = `$ ${cmd}\n${r.stdout || ''}${r.stderr || ''}${r.error ? `\n[runner] ${r.error.message}\n` : ''}`;
  const file = join('logs', `${String(seq++).padStart(2, '0')}-${name.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 60)}.log`);
  writeFileSync(join(outDir, file), log);
  return { exit: r.status ?? 1, seconds: Math.round((Date.now() - t0) / 1000), log, file, logSha256: sha256(log) };
}

function parseCounts(log) {
  const c = { runner: 'none', total: null, passed: null, failed: 0, skipped: 0, todo: 0, cancelled: 0, flaky: 0, didNotRun: 0 };
  const num = (re) => [...log.matchAll(re)].reduce((s, m) => s + Number(m[1]), 0);
  if (/^# (tests|pass) \d+/m.test(log)) { // node:test TAP summary (one per test run, summed)
    c.runner = 'node:test';
    c.total = num(/^# tests (\d+)/gm); c.passed = num(/^# pass (\d+)/gm); c.failed = num(/^# fail (\d+)/gm);
    c.skipped = num(/^# skipped (\d+)/gm); c.todo = num(/^# todo (\d+)/gm); c.cancelled = num(/^# cancelled (\d+)/gm);
    return c;
  }
  const vt = [...log.matchAll(/^\s*Tests\s+(.+?)\((\d+)\)\s*$/gm)];
  if (/Test Files\s/.test(log) && vt.length) { // vitest
    c.runner = 'vitest'; c.total = 0; c.passed = 0;
    for (const m of vt) {
      c.total += Number(m[2]);
      for (const [, n, label] of m[1].matchAll(/(\d+)\s+(passed|failed|skipped|todo)/g)) c[label] = (c[label] || 0) + Number(n);
    }
    return c;
  }
  if (/Running \d+ tests? using \d+ workers?/.test(log)) { // playwright
    c.runner = 'playwright';
    c.passed = num(/^\s*(\d+) passed/gm); c.failed = num(/^\s*(\d+) failed/gm); c.skipped = num(/^\s*(\d+) skipped/gm);
    c.flaky = num(/^\s*(\d+) flaky/gm); c.didNotRun = num(/^\s*(\d+) did not run/gm) + num(/^\s*(\d+) interrupted/gm);
    const planned = num(/Running (\d+) tests? using/g);
    const seen = c.passed + c.failed + c.skipped + c.flaky + c.didNotRun;
    c.total = seen === 0 ? null : seen;
    if (planned > seen && seen) c.didNotRun += planned - seen;
    return c;
  }
  return c;
}

// 3. Environment and dependencies.
const wf = yaml.load(readFileSync(join(work, '.github/workflows/ci.yml'), 'utf8'));
const env = {
  node: process.version, npm: sh('npm', ['-v']), os: `${type()} ${release()} ${arch()}`,
  osRelease: existsSync('/etc/os-release') ? (readFileSync('/etc/os-release', 'utf8').match(/PRETTY_NAME="([^"]+)"/) || [])[1] : null,
  cpus: cpus().length,
  packageLockSha256: sha256(readFileSync(join(work, 'package-lock.json'))),
  packageJsonSha256: sha256(readFileSync(join(work, 'package.json'))),
};
const install = run('npm ci', 'npm ci --no-audit --no-fund');
const lsTree = run('npm ls --all', 'npm ls --all >/dev/null');
env.npmCi = install.exit === 0 ? 'ok' : 'FAILED';
env.npmLsAll = lsTree.exit === 0 ? 'ok' : 'FAILED';
if (install.exit !== 0) problems.push('npm ci failed');
if (lsTree.exit !== 0) problems.push('installed dependency tree does not match package-lock.json (npm ls --all)');
try { env.playwright = sh('npx', ['playwright', '--version'], work); } catch { env.playwright = null; }

const jobs = opt('--jobs', 'test,e2e').split(',');
const results = [];
for (const job of jobs) {
  const j = wf.jobs[job];
  if (!j) { problems.push(`job ${job} not in ci.yml`); continue; }
  for (const step of j.steps) {
    const name = step.name || step.uses || step.run.split('\n')[0].slice(0, 70);
    if (step.uses) {
      const u = step.uses.split('@')[0];
      if (u === 'actions/setup-node') {
        const want = String(step.with?.['node-version'] ?? '').split('.')[0];
        const ok = want === process.versions.node.split('.')[0];
        if (!ok) problems.push(`Node ${process.version} does not match workflow node-version ${want}`);
        results.push({ job, name, kind: 'environment', status: ok ? 'PASS' : 'FAIL', detail: `workflow ${want}.x, local ${process.version}` });
      } else if (u === 'actions/checkout') {
        results.push({ job, name, kind: 'environment', status: 'PASS', detail: `fresh worktree at ${sha}` });
      } else {
        results.push({ job, name, kind: 'not-applicable-locally', status: 'N/A', detail: u });
      }
      continue;
    }
    const cmd = step.run.trim();
    if (/^npm ci\b/.test(cmd)) {
      results.push({ job, name, kind: 'environment', status: install.exit === 0 ? 'PASS' : 'FAIL', detail: 'npm ci from the committed lockfile (run once)' });
      continue;
    }
    if (/^npx playwright install\b/.test(cmd)) {
      const r = run(name, 'npx playwright install --dry-run chromium');
      const dirs = [...r.log.matchAll(/Install location:\s+(\S+)/g)].map((m) => m[1]);
      const ok = r.exit === 0 && dirs.length > 0 && dirs.every((d) => existsSync(d));
      if (!ok) problems.push('Playwright browser for the installed Playwright version is missing');
      results.push({ job, name, kind: 'environment', status: ok ? 'PASS' : 'FAIL', detail: `browsers present: ${dirs.join(', ')}`, log: r.file });
      continue;
    }
    stepEnv = { ...(wf.env || {}), ...(j.env || {}), ...(step.env || {}) };
    const r = run(name, cmd, { timeoutMin: j['timeout-minutes'] || 45 });
    stepEnv = {};
    const counts = parseCounts(r.log);
    let status;
    if (r.exit !== 0) status = 'FAIL';
    else if (counts.runner === 'none') status = 'PASS';
    else if (counts.total === null) status = 'UNVERIFIED';
    else if (counts.total === 0) status = 'NO_TESTS';
    else if (counts.skipped || counts.todo || counts.cancelled || counts.didNotRun) status = 'INCOMPLETE';
    else if (counts.flaky) status = 'FLAKY';
    else status = 'PASS';
    const mandatory = !step['continue-on-error'];
    results.push({ job, name, kind: 'step', mandatory, status, blocking: mandatory && status !== 'PASS',
      exit: r.exit, seconds: r.seconds, counts, commandSha256: sha256(cmd), log: r.file, logSha256: r.logSha256 });
    console.log(`${status.padEnd(10)} ${mandatory ? '' : '(informational) '}[${job}] ${name}${counts.total != null ? `  tests=${counts.total}` : ''}`);
  }
}

// 4. Test files no executed step references (a coverage gap: reported, not hidden).
const scripts = JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')).scripts || {};
const cmds = jobs.flatMap((jb) => (wf.jobs[jb]?.steps || []).map((s) => s.run || '')).join('\n');
const expanded = cmds + '\n' + Object.entries(scripts).filter(([k]) => cmds.includes(`npm run ${k}`)).map(([, v]) => v).join('\n');
const testFiles = existsSync(join(work, 'tests')) ? readdirSync(join(work, 'tests')).filter((f) => /\.test\.m?js$/.test(f)).map((f) => `tests/${f}`) : [];
const notInCi = testFiles.filter((f) => !expanded.includes(f));

const steps = results.filter((x) => x.kind === 'step');
const envFail = results.filter((x) => x.kind === 'environment' && x.status !== 'PASS').length;
const blocking = steps.filter((x) => x.blocking).length;
const verdict = problems.length === 0 && blocking === 0 && envFail === 0 ? 'PASS' : 'FAIL';
const out = {
  verdict, sha, tree, expectTree: expectTree || null, ranAt: new Date().toISOString(),
  runner: 'scripts/ci-local.mjs (local, no GitHub Actions minutes)',
  runnerSha256: sha256(readFileSync(new URL(import.meta.url))),
  workflowSha256: sha256(readFileSync(join(work, '.github/workflows/ci.yml'))), jobs, environment: env, problems,
  summary: { steps: steps.length, pass: steps.filter((x) => x.status === 'PASS').length, blocking,
    informationalNotPass: steps.filter((x) => !x.mandatory && x.status !== 'PASS').map((x) => `${x.name}: ${x.status}`),
    testsCounted: steps.reduce((s, x) => s + (x.counts?.total || 0), 0) },
  testFilesNotRunByCi: notInCi, results,
};
const evidence = `ci-local-${sha.slice(0, 8)}.json`;
writeFileSync(join(outDir, evidence), JSON.stringify(out, null, 2));
const sums = readdirSync(join(outDir, 'logs')).sort().map((f) => `${sha256(readFileSync(join(outDir, 'logs', f)))}  logs/${f}`);
sums.push(`${sha256(readFileSync(join(outDir, evidence)))}  ${evidence}`);
writeFileSync(join(outDir, 'SHA256SUMS'), sums.join('\n') + '\n');
if (!flag('--keep')) sh('git', ['worktree', 'remove', '--force', work]);
console.log(`\n${verdict}: ${sha.slice(0, 8)} tree ${tree.slice(0, 8)}: ${out.summary.pass}/${steps.length} steps PASS, ${blocking} blocking` +
  `${problems.length ? `; problems: ${problems.join('; ')}` : ''}` +
  `${notInCi.length ? `\nTest files not run by CI: ${notInCi.join(', ')}` : ''}\nEvidence: ${outDir}`);
process.exit(verdict === 'PASS' ? 0 : 1);
