/**
 * tests/cai-release-1036.test.mjs - release 1.0.3.6 of CAI-L4-CI-001 (scripts/cai-release/1.0.3.6), finding F-UX-1.
 *
 * In the 19 Nov 2026 tenant test the review card showed a schedule as "90 (90) months" under "Evidence (verbatim
 * quotes)"; the PDF says "six (6) months" in 4.5-point light-grey text, and the extraction model misread it in all three
 * extractions of that document. The excerpts are the model's reading, so 1.0.3.6 never presents them as verified or
 * verbatim quotations: not on the review card, not in the deadline basis and Teams deadline card, not in the agent.
 *
 * Checks: no user-facing text in the released flows or agent calls AI-extracted text verbatim, quoted evidence or
 * contract wording; the new labels are present; the change is wording only (putting the old strings back gives the
 * 1.0.3.5 files exactly); the committed release files are what the generator makes.
 * Usage: node --test tests/cai-release-1036.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const DIR = 'scripts/cai-release/1.0.3.6';
const PREV = 'scripts/cai-release/1.0.3.5/release';
const GATE = 'ReviewgateTeams-B3C964D1-A7D7-F111-84E8-E4FADE0D927F';
const EFF = 'Effectiveterms-2BFB2A15-C9D7-F111-84E8-E4FADE0D927F';
const TERMS = 'Compute-Geteffectiveterms-4DCE77CB-F9D9-F111-84E8-000D3A832B24';
const read = (p) => readFileSync(p, 'utf8');
const def = (dir, stem) => read(`${dir}/${stem}.definition.json`);

test('no user-facing text presents AI-extracted text as verified or verbatim', () => {
  const flows = [GATE, EFF, TERMS].map((s) => def(`${DIR}/release`, s)).join('\n');
  for (const bad of ['verbatim', 'quoted evidence', 'values match the evidence', 'Contract wording:', 'the document contains conflicting',
    'the document states different', 'Notice clauses found in the whole document', 'shown with the contract wording']) {
    assert.ok(!flows.includes(bad), `flows still say: ${bad}`);
  }
  const gpt = read(`${DIR}/release/gpt.default.yaml`);
  assert.ok(!gpt.includes('Quote the stored quote'), 'agent instruction');
  assert.match(gpt, /not a verified quotation of the document, and never call it verbatim/);
  assert.ok(!read(`${DIR}/release/topic.T7GetEffectiveTerms.yaml`).includes('location and quote.'));
});

test('the review card, the deadline texts and the agent tool say the excerpts are AI-extracted and unverified', () => {
  const gate = def(`${DIR}/release`, GATE);
  assert.ok(gate.includes('Extracted by AI (CAI Contract Intelligence) and NOT VERIFIED against the document.'));
  assert.ok(gate.includes('AI-extracted excerpts (unverified - compare them with the original document)'));
  assert.ok(gate.includes('Approve - I checked these values in the original document'));
  assert.ok(gate.includes('**Notice wording (AI-extracted, unverified)**'));
  const eff = def(`${DIR}/release`, EFF);
  assert.equal(eff.split('Notice wording as extracted by AI (unverified): ').length - 1, 4);
  assert.ok(eff.includes('the AI extraction found conflicting renewal or notice provisions (unverified excerpts): '));
  assert.ok(def(`${DIR}/release`, TERMS).includes('notice wording as extracted by AI (unverified, not a verified quotation)'));
});

test('wording only: putting the old strings back gives the 1.0.3.5 files exactly', () => {
  const src = read(`${DIR}/patch_release_1036.py`);
  // Run the generator's own rules in reverse on the release output.
  const script = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('p', '${DIR}/patch_release_1036.py'); p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
for stem, rules in p.FLOW_RULES.items():
    a = json.load(open('${DIR}/release/' + stem + '.clientdata.json', encoding='utf-8'))
    back = [(new, old, n) for old, new, n in rules]
    a['properties']['definition'] = p.patch_strings(a['properties']['definition'], back, stem, {})
    b = json.load(open('${PREV}/' + stem + '.clientdata.json', encoding='utf-8'))
    assert a == b, stem
for name, rules in (('gpt.default.yaml', p.GPT_RULES), ('topic.T7GetEffectiveTerms.yaml', p.TOPIC_TERMS_RULES)):
    t = open('${DIR}/release/' + name, encoding='utf-8').read()
    for old, new, n in rules: t = t.replace(new, old)
    assert t == open('${PREV}/' + name, encoding='utf-8').read(), name
print('ok')
`;
  assert.ok(src.includes('FLOW_RULES'));
  assert.equal(execFileSync('python3', ['-I', '-c', script]).toString().trim(), 'ok');
});

test('the committed release files are what the generator makes from the 1.0.3.5 release', () => {
  const out = mkdtempSync(join(tmpdir(), 'cai1036-'));
  execFileSync('python3', ['-I', `${DIR}/patch_release_1036.py`, PREV, out]);
  const files = readdirSync(`${DIR}/release`).sort();
  assert.deepEqual(readdirSync(out).sort(), files);
  for (const f of files) assert.equal(read(join(out, f)), read(`${DIR}/release/${f}`), f);
});
