// Local security scan, free tools only, replacing CodeQL once the repository is private
// (code scanning on private repositories needs paid GitHub Code Security).
//
//   node scripts/security-local.mjs [--out <dir>]
//
// Three scanners, each must run and report, or the verdict is FAIL:
//  1. Dependencies: `npm audit` on the committed lockfile. FAIL on any high or critical.
//  2. SAST: Semgrep Community Edition (LGPL-2.1) with the semgrep-rules repository
//     (Semgrep Rules License v1.0: internal use) on every tracked JS/TS file.
//     Semgrep cannot parse JSON import attributes (`with { type: 'json' }`), so files are
//     scanned from a copy with only that clause removed. A file that still cannot be
//     parsed FAILS unless it is listed, with a reason, in security/semgrep-reviewed.json.
//     Every ERROR or WARNING finding must match a reviewed entry there (rule, file and
//     the finding's code line); an unreviewed one FAILS.
//  3. Secrets: detect-secrets (Apache-2.0) on every tracked file, against the audited
//     baseline .secrets.baseline. A finding not in the baseline, or one in the baseline
//     that is not audited as is_secret:false, FAILS.
// Setup once (pinned): pip install semgrep==1.95.0 detect-secrets==1.5.0 "setuptools<81"
//   and git clone https://github.com/semgrep/semgrep-rules, then set SEMGREP_RULES to it.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const sh = (c, a, o = {}) => execFileSync(c, a, { encoding: 'utf8', maxBuffer: 1 << 28, ...o }).trim();
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const problems = [];
const report = {};

const dirty = sh('git', ['status', '--porcelain', '--untracked-files=normal']);
if (dirty) { console.error('Working tree is not clean:\n' + dirty); process.exit(2); }
const sha = sh('git', ['rev-parse', 'HEAD']);
const tree = sh('git', ['rev-parse', 'HEAD^{tree}']);
const outDir = resolve(opt('--out', join(tmpdir(), `security-local-${sha.slice(0, 8)}`)));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const rules = process.env.SEMGREP_RULES;
const tool = (c, a) => { try { return sh(c, a); } catch { return null; } };
report.tools = {
  node: process.version, npm: tool('npm', ['-v']),
  semgrep: tool('semgrep', ['--version']), detectSecrets: tool('detect-secrets', ['--version']),
  semgrepRules: rules && existsSync(rules) ? tool('git', ['-C', rules, 'rev-parse', 'HEAD']) : null,
};
for (const [k, v] of Object.entries(report.tools)) if (!v) problems.push(`${k} not available: scanner did not run`);

// 1. Dependencies.
{
  const r = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  let v = null;
  try { v = JSON.parse(r.stdout).metadata.vulnerabilities; } catch { problems.push('npm audit produced no parsable report'); }
  report.dependencies = { tool: 'npm audit', vulnerabilities: v };
  if (v && (v.high || v.critical)) problems.push(`npm audit: ${v.high} high, ${v.critical} critical`);
  writeFileSync(join(outDir, 'npm-audit.json'), r.stdout || '');
}

// 2. SAST.
const reviewed = JSON.parse(readFileSync('security/semgrep-reviewed.json', 'utf8'));
if (report.tools.semgrep && report.tools.semgrepRules) {
  const files = sh('git', ['ls-files', '*.js', '*.mjs', '*.cjs', '*.jsx', '*.ts', '*.tsx']).split('\n').filter(Boolean);
  const copy = mkdtempSync(join(tmpdir(), 'sast-'));
  for (const f of files) {
    mkdirSync(join(copy, dirname(f)), { recursive: true });
    writeFileSync(join(copy, f), readFileSync(f, 'utf8').replace(/\s+(?:with|assert)\s*\{\s*type:\s*['"]json['"]\s*\}/g, ''));
  }
  const r = spawnSync('semgrep', ['scan', '--metrics=off', '--disable-version-check', '--json', '-q',
    '--config', join(rules, 'javascript'), '--config', join(rules, 'generic', 'secrets'), '.'], { cwd: copy, encoding: 'utf8', maxBuffer: 1 << 29 });
  rmSync(copy, { recursive: true, force: true });
  let res = null;
  try { res = JSON.parse(r.stdout); } catch { problems.push('semgrep produced no parsable report'); }
  if (res) {
    writeFileSync(join(outDir, 'semgrep.json'), r.stdout);
    const unparsed = [...new Set(res.errors.map((e) => e.path || e.spans?.[0]?.file).filter(Boolean))];
    const unparsedUnreviewed = unparsed.filter((f) => !reviewed.unparsed.some((u) => u.path === f));
    const fp = (x) => `${x.check_id.split('.').pop()}|${x.path}|${sha256(x.extra.lines.replace(/\s+/g, ' ').trim()).slice(0, 16)}`;
    const known = new Set(reviewed.findings.map((f) => f.fingerprint));
    const material = res.results.filter((x) => x.extra.severity !== 'INFO');
    const unreviewed = material.filter((x) => !known.has(fp(x)));
    report.sast = {
      tool: 'semgrep CE', filesScanned: res.paths.scanned.length, trackedSourceFiles: files.length,
      findings: res.results.length, errorOrWarning: material.length, reviewed: material.length - unreviewed.length,
      unreviewed: unreviewed.map((x) => ({ fingerprint: fp(x), severity: x.extra.severity, line: x.start.line })),
      unparsedFiles: unparsed, unparsedUnreviewed,
    };
    if (unreviewed.length) problems.push(`semgrep: ${unreviewed.length} ERROR/WARNING finding(s) not reviewed`);
    if (unparsedUnreviewed.length) problems.push(`semgrep could not parse: ${unparsedUnreviewed.join(', ')}`);
  }
}

// 3. Secrets.
if (report.tools.detectSecrets) {
  // The two review files hold hashes and fingerprints by design; they are the scanners' own records.
  const files = sh('git', ['ls-files']).split('\n').filter((f) => f && !/\.(mp4|png|jpe?g|webp|gif|ico|pdf|zip|woff2?|ttf|otf)$/i.test(f) &&
    f !== '.secrets.baseline' && f !== 'security/semgrep-reviewed.json');
  const r = spawnSync('detect-secrets', ['scan', ...files], { encoding: 'utf8', maxBuffer: 1 << 29 });
  let scan = null;
  try { scan = JSON.parse(r.stdout); } catch { problems.push('detect-secrets produced no parsable report'); }
  if (scan) {
    const base = JSON.parse(readFileSync('.secrets.baseline', 'utf8'));
    const audited = new Map();
    for (const [f, list] of Object.entries(base.results)) for (const s of list) audited.set(`${f}|${s.hashed_secret}`, s.is_secret);
    const found = Object.entries(scan.results).flatMap(([f, list]) => list.map((s) => ({ f, s })));
    const notBaselined = found.filter(({ f, s }) => !audited.has(`${f}|${s.hashed_secret}`));
    const flagged = found.filter(({ f, s }) => audited.get(`${f}|${s.hashed_secret}`) !== false && audited.has(`${f}|${s.hashed_secret}`));
    report.secrets = { tool: 'detect-secrets', filesScanned: files.length, findings: found.length,
      auditedFalsePositives: found.length - notBaselined.length - flagged.length,
      notBaselined: notBaselined.map(({ f, s }) => `${s.type} ${f}:${s.line_number}`),
      notAuditedOrSecret: flagged.map(({ f, s }) => `${s.type} ${f}:${s.line_number}`) };
    if (notBaselined.length) problems.push(`detect-secrets: ${notBaselined.length} new finding(s)`);
    if (flagged.length) problems.push(`detect-secrets: ${flagged.length} finding(s) not audited as false positive`);
  }
}

const verdict = problems.length ? 'FAIL' : 'PASS';
const out = { verdict, sha, tree, ranAt: new Date().toISOString(), runnerSha256: sha256(readFileSync(new URL(import.meta.url))), problems, ...report };
writeFileSync(join(outDir, `security-local-${sha.slice(0, 8)}.json`), JSON.stringify(out, null, 2));
console.log(`${verdict}: ${sha.slice(0, 8)}  deps ${JSON.stringify(report.dependencies?.vulnerabilities)}; ` +
  `SAST ${report.sast ? `${report.sast.errorOrWarning} ERROR/WARNING, ${report.sast.unreviewed.length} unreviewed, ${report.sast.unparsedFiles.length} unparsed` : 'not run'}; ` +
  `secrets ${report.secrets ? `${report.secrets.findings} found, ${report.secrets.notBaselined.length} new` : 'not run'}` +
  `${problems.length ? `\nProblems: ${problems.join('; ')}` : ''}\nEvidence: ${outDir}`);
process.exit(verdict === 'PASS' ? 0 : 1);
