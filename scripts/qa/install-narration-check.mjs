#!/usr/bin/env node
// Checks the installation video's narration against the authoritative release documents.
//
// Usage: node scripts/qa/install-narration-check.mjs <INSTALL.pdf> <START-HERE.pdf> [--json]
//
// Every factual statement in the English narration (scripts/i18n/videos/install.json) is
// reduced to one or more anchors: a number, a Microsoft UI label or an instruction. Each
// anchor is searched in INSTALL.pdf, then START-HERE.pdf (text from `pdftotext -layout`,
// lower-cased, whitespace, quotes and dashes normalised). An anchor marked `expect: "absent"`
// is a known discrepancy that the on-page disclosure covers; the check fails if such an
// anchor unexpectedly appears (the disclosure would then be stale) or if any other anchor is
// found in neither document. Exit code 0 = narration verified as documented.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [installPdf, startPdf] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
if (!installPdf || !startPdf) {
  console.error('usage: install-narration-check.mjs <INSTALL.pdf> <START-HERE.pdf> [--json]');
  process.exit(2);
}

const norm = (s) => s.toLowerCase()
  .replace(/[‘’“”"']/g, '')
  .replace(/[‐-―]/g, '-')
  .replace(/\s+/g, ' ');
const text = (f) => norm(execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }));
const DOCS = { 'INSTALL.pdf': text(installPdf), 'START-HERE.pdf': text(startPdf) };

// [segment index, what the narration asserts, regex (or literal string) on the normalised document text, options]
const ANCHORS = [
  [0, 'installs in the customer\'s own Microsoft environment', /your own microsoft licen|stay in your microsoft tenant/],
  [1, '"20 to 30 minutes" setup time', /20\s*(-|to)\s*30 minutes/, { expect: 'absent', covers: 'On-page disclosure: plan 60-90 minutes in total; 20-30 assumes every prerequisite is in place (INSTALL.pdf: about 60 minutes).' }],
  [1, 'time estimate exists (about 60 minutes)', /about 60 minutes/],
  [4, 'INSTALL.pdf holds the detailed instructions', /install\.pdf/],
  [5, 'Dataverse with at least 1 GB free', /at least 1 gb of free/],
  [5, 'System Administrator', /system administrator/],
  [5, 'Copilot Studio capacity', /copilot studio (capacity|credits|messages)/],
  [6, 'dedicated SharePoint contract library', /(dedicated|own) (sharepoint )?(document )?library|library (used )?only for contracts|contract library/],
  [7, 'reviewer with Teams', /reviewer/],
  [7, 'alert administrator', /admin for alerts|alert admin/],
  [8, 'Microsoft 365 admin access', /microsoft 365 admin/],
  [8, 'text-based English test contract', /text-based|text based|selectable text|not a scan/],
  [9, 'Microsoft usage charges are separate from the licence', /(billed|charged|paid) (by|to) microsoft|microsoft (bills|charges)|separate from (the|your) licen/],
  [10, 'budget alerts at 50, 80 and 100 %', /50 %, 80 % and 100 %/],
  [11, 'budget alerts do not stop spending', /(do not|does not|dont|doesnt) stop (spending|charges|the spend)|alerts? (only )?(notify|warn)/],
  [12, 'verify the bundle checksum against the order page', /sha-?256|checksum/],
  [12, 'checksum shown on the order page', /order page/],
  [13, 'extract the outer bundle, leave the managed solution ZIP unopened', /(do not|dont) (unzip|extract|open)/],
  [14, 'five values', /five values|the five values/],
  [14, 'SharePoint site address', /sharepoint site (address|url)/],
  [14, 'library ID', /library id/],
  [14, 'owner team name, exact', /owner team/],
  [16, 'make.powerapps.com', 'make.powerapps.com'],
  [17, 'Solutions > Import solution', /import solution/],
  [18, 'both Dataverse references on the same connection', /(same|one) dataverse connection|both dataverse/],
  [19, 'SharePoint and Teams connections', /microsoft teams connection/],
  [20, 'four connection references', /four connection references/],
  [20, 'same System Administrator account for all references', /(use )?one system administrator account for all/],
  [22, 'Import stays grey until each value is entered', /import stays grey|import button stays grey/],
  [23, 'Microsoft 365 admin centre > Agents > All agents', /all agents/],
  [24, 'agent name: CAI Contract Intelligence Assistant', /cai contract intelligence assistant/],
  [25, 'block the agent if it shows Available', /available/],
  [25, 'block it', /block/],
  [26, 'Draft or Blocked during setup', /draft|blocked/],
  [27, 'seven cloud flows', /seven flows/],
  [28, 'Review gate (Teams) must be turned on by hand', /review gate \(teams\) will probably show off|left off in every fresh install/],
  [28, 'Review gate sends approval cards to Teams', /(card|cards).{0,80}teams|teams.{0,80}(card|cards)/],
  [29, 'keep Daily recompute off during testing', /keep daily recompute off/],
  [30, 'Daily recompute consumes capacity', /daily recompute.{0,200}(usd|cost|capacity|credits)/],
  [31, 'owner team with exactly the entered name', /owner team/],
  [32, 'security role CAI Contract Reader', /cai contract reader/],
  [33, 'Read on Contract and Field evidence', /field evidence/],
  [34, 'Copilot Studio: no connected channel', /channel/],
  [34, 'sharing restricted to the owner', /shar(ed|ing)/],
  [34, 'Authenticate with Microsoft', /authenticate with microsoft/],
  [34, 'both topics turned on', /topics?/],
  [35, 'do not publish the agent during installation', /(do not|dont) publish/],
  [36, 'readiness check included', /readiness check|check-cai-install-readiness/],
  [37, 'readiness check changes nothing', /changes nothing/],
  [37, 'final result READY', /ready or not ready/],
  [38, 'test with an owner-team account', /owner team/],
  [39, 'status Pending review after upload', /pending review/],
  [39, 'Teams review card', /(card|cards).{0,80}teams|teams.{0,80}(card|cards)/],
  [41, 'test question: notice deadlines in the next 400 days', /400 days/],
  [42, 'allow the connection if prompted', /allow/],
  [43, 'section 9a before approving real contracts', /9a/],
  [43, 'check notice periods against the source contract', /notice period/],
  [44, 'support: hello@colleagueai.ai', /hello@colleagueai\.ai/],
  [44, 'quote order email and release number', /release number|release version|order (e-?mail|number)/],
];

const segs = JSON.parse(readFileSync(path.join(ROOT, 'scripts/i18n/videos/install.json'), 'utf8')).segments;
const rows = ANCHORS.map(([seg, claim, re, opt = {}]) => {
  const where = Object.entries(DOCS).filter(([, t]) => (typeof re === 'string' ? t.includes(re) : re.test(t))).map(([d]) => d);
  const expectAbsent = opt.expect === 'absent';
  const ok = expectAbsent ? where.length === 0 : where.length > 0;
  return { seg, at: segs[seg].t[0], narration: segs[seg].en, claim, foundIn: where, expect: expectAbsent ? 'absent' : 'present', ok, covers: opt.covers };
});
const failed = rows.filter((r) => !r.ok);
const found = rows.filter((r) => r.expect === 'present');
const summary = {
  anchors: rows.length,
  verified: found.filter((r) => r.ok).length,
  inInstallPdf: found.filter((r) => r.foundIn.includes('INSTALL.pdf')).length,
  startHereOnly: found.filter((r) => r.ok && !r.foundIn.includes('INSTALL.pdf')).length,
  knownDiscrepancies: rows.filter((r) => r.expect === 'absent').length,
  failed: failed.length,
  segmentsCovered: new Set(rows.map((r) => r.seg)).size,
  segments: segs.length,
};
if (asJson) console.log(JSON.stringify({ summary, rows }, null, 2));
else {
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.at.toFixed(1).padStart(6)} s  ${r.claim}  [${r.expect === 'absent' ? 'absent as expected' : r.foundIn.join(', ') || 'NOT FOUND'}]`);
  console.log(JSON.stringify(summary));
}
process.exit(failed.length ? 1 : 0);
