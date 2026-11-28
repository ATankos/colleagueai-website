// Local CI runner: executes the `run:` steps of .github/workflows/ci.yml jobs in
// order, in this checkout, and writes a pass/fail evidence file named after the
// commit. Uses no GitHub Actions minutes. See docs/ops/local-ci.md.
// Usage: node scripts/ci-local.mjs [job ...]          (default jobs: test e2e)
// Needs a YAML parser once: npm i --no-save js-yaml@4.1.0
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const dir = process.cwd();
const jobs = process.argv.slice(2).length ? process.argv.slice(2) : ['test', 'e2e'];
const require = createRequire(dir + '/package.json');
let yaml;
try { yaml = require('js-yaml'); } catch {
  console.error('js-yaml is not installed. Run once: npm i --no-save js-yaml@4.1.0'); process.exit(2);
}
const wf = yaml.load(readFileSync(dir + '/.github/workflows/ci.yml', 'utf8'));
const sha = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();
const skip = /^(npm ci|npx playwright install)/; // dependencies already installed locally
const results = [];
for (const job of jobs) {
  for (const step of wf.jobs[job].steps) {
    if (!step.run || skip.test(step.run.trim())) continue;
    const t0 = Date.now();
    // Background servers started by a step (cmd &) would keep the pipe open; give them /dev/null.
    const r = spawnSync('bash', ['-eo', 'pipefail', '-c', step.run.replace(/&\s*$/gm, '>/dev/null 2>&1 &')], {
      cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28,
      env: { ...process.env, CI: 'true', ...(wf.env || {}), ...(wf.jobs[job].env || {}), ...(step.env || {}) },
    });
    const ok = r.status === 0;
    results.push({ job, name: step.name || step.run.slice(0, 60), ok,
      allowedToFail: !!step['continue-on-error'], seconds: Math.round((Date.now() - t0) / 1000),
      tail: ok ? '' : (r.stdout + r.stderr).split('\n').slice(-15).join('\n') });
    console.log(`${ok ? 'PASS' : step['continue-on-error'] ? 'FAIL (allowed)' : 'FAIL'}  [${job}] ${step.name || step.run.slice(0, 60)}`);
  }
}
const blocking = results.filter(r => !r.ok && !r.allowedToFail).length;
const out = { sha, ranAt: new Date().toISOString(), runner: 'local workspace (no GitHub Actions minutes)', jobs,
  steps: results.length, passed: results.filter(r => r.ok).length, blockingFailures: blocking, results };
const outFile = `tests/results/ci-local-${sha.slice(0, 8)}.json`;
mkdirSync('tests/results', { recursive: true });
writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`\n${sha.slice(0, 8)}: ${out.passed}/${out.steps} steps passed, ${blocking} blocking failures. Evidence: ${outFile}`);
process.exit(blocking ? 1 : 0);
