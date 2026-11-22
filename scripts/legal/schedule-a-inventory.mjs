#!/usr/bin/env node
/**
 * scripts/legal/schedule-a-inventory.mjs - the objective identifiers for Schedule A of IP Instrument A.
 *
 *   node scripts/legal/schedule-a-inventory.mjs [<cut-off commit>]   (default: HEAD)
 *
 * For each group of works it prints the git tree hash of its paths at the cut-off commit (the exact content the
 * schedule refers to), the number of files, and who committed changes to those paths up to the cut-off: the human
 * author's identities, AI-assistant commits (made in sessions run on his instruction), commits by the author that
 * carry an AI co-author trailer, and automated tools. It also prints the released packages with their SHA-256 from
 * config/products.json and the managed-solution hash from the release record. It reads git and files only.
 *
 * Commit counts are evidence of who changed what, not a legal conclusion about authorship.
 */
import { execFileSync } from 'node:child_process';

const cut = process.argv[2] || 'HEAD';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const sha = git('rev-parse', cut);
const date = git('show', '-s', '--format=%cs', sha);

const HUMAN = /^(ATankos|Alex Tankos|Alexandr Tankos)$/;
const AI = /\(Claude\)$|^Claude$/;
const GROUPS = [
  ['A1', 'Website: pages in eight languages, styles, client scripts, structured data', ['public', 'src', 'index.html']],
  ['A2', 'Commercial engine: checkout, acceptance, tax policy, invoicing, fulfilment, delivery, recovery, order documents', ['api', 'lib', 'config']],
  ['A3', 'Tests, release gates, build, audit, validation and release tooling', ['tests', 'scripts', '.github']],
  ['A4', 'Contract Intelligence & Register product documentation, bundle texts and test fixtures', ['docs/cai-l4-ci-001']],
  ['A5', 'Other documentation: runbooks, methods, legal drafts, inventories', ['docs']],
];
const BRAND = ['public/logo.svg', 'public/favicon.svg', 'public/icons.svg', 'public/og-image.png', 'public/apple-touch-icon.png', 'public/icon-192.png', 'public/icon-512.png'];

function stats(paths) {
  const out = git('log', sha, '--format=%an%x1f%(trailers:key=Co-Authored-By,valueonly,separator=%x2c)%x1e', '--', ...paths);
  const s = { human: 0, humanWithAiTrailer: 0, ai: 0, tools: 0 };
  for (const rec of out.split('\x1e').map((x) => x.trim()).filter(Boolean)) {
    const [name, trailers = ''] = rec.split('\x1f');
    if (HUMAN.test(name)) { s.human += 1; if (/claude|anthropic/i.test(trailers)) s.humanWithAiTrailer += 1; }
    else if (AI.test(name)) s.ai += 1;
    else s.tools += 1;
  }
  return s;
}
const tree = (p) => { try { return git('rev-parse', `${sha}:${p}`); } catch { return null; } };
const files = (paths) => {
  const inc = paths.filter((p) => !p.startsWith(':(exclude)'));
  const exc = paths.filter((p) => p.startsWith(':(exclude)')).map((p) => p.slice(10) + '/');
  return git('ls-tree', '-r', '--name-only', sha, '--', ...inc).split('\n').filter((f) => f && !exc.some((e) => f.startsWith(e))).length;
};

const lines = [];
lines.push(`Cut-off commit: \`${sha}\` (${date}), repository \`colleagueai-website\`.`, '');
lines.push('| # | Group | Paths (git tree hash at cut-off) | Files | Commits: author / of which with AI co-author trailer / AI assistant / tools |', '|---|---|---|---|---|');
for (const [id, label, paths] of GROUPS) {
  const p = id === 'A5' ? ['docs', ':(exclude)docs/cai-l4-ci-001'] : paths;
  const s = stats(p);
  const trees = paths.map((x) => `\`${x}\` ${tree(x)?.slice(0, 12) ?? '(absent)'}`).join('<br>');
  lines.push(`| ${id} | ${label} | ${trees}${id === 'A5' ? '<br>(excluding `docs/cai-l4-ci-001`)' : ''} | ${files(p)} | ${s.human} / ${s.humanWithAiTrailer} / ${s.ai} / ${s.tools} |`);
}
const b = stats(BRAND);
lines.push(`| A8 | Brand artwork files | ${BRAND.map((f) => `\`${f}\` ${tree(f)?.slice(0, 12) ?? '(absent)'}`).join('<br>')} | ${BRAND.length} | ${b.human} / ${b.humanWithAiTrailer} / ${b.ai} / ${b.tools} |`);

const P = JSON.parse(git('show', `${sha}:config/products.json`));
const ci = P['contract-intelligence-and-register'];
const rc = JSON.parse(git('show', `${sha}:scripts/cai-release/${ci.release.version}/release-candidate.json`));
lines.push('', '**A6/A7: Contract Intelligence & Register (CAI-L4-CI-001) managed solution and its agent instructions and prompts**', '');
lines.push('| Item | File | SHA-256 | Bytes |', '|---|---|---|---|');
lines.push(`| Managed solution ${ci.release.version} (agent, topics, instructions, prompts, 7 flows, 4 tables, 1 role) | \`${rc.managedSolution.file}\` | \`${rc.managedSolution.sha256}\` | ${rc.managedSolution.bytes} |`);
lines.push(`| Release bundle ${ci.release.version} revision ${ci.release.bundleRevision} (current) | \`${ci.release.package}\` | \`${ci.release.sha256}\` | ${ci.release.bytes} |`);
for (const pb of ci.release.previousBundles || []) lines.push(`| Release bundle ${ci.release.version} revision ${pb.bundleRevision} | \`${pb.package}\` | \`${pb.sha256}\` | ${pb.bytes ?? ''} |`);
for (const pr of ci.previousReleases || []) lines.push(`| Earlier release ${pr.version} | \`${pr.package}\` | \`${pr.sha256}\` | ${pr.bytes ?? ''} |`);
console.log(lines.join('\n'));
