// Confidential evidence never reaches the public repository, the server logs or the client build. Signed documents,
// personal identifiers, accounting records and the internal IP/tax drafts stay private; the public index of evidence
// carries only references (config/evidence-manifest.json). The approved tax policy, once it exists, must rest on
// verified evidence records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('no signed document, identity document or accounting record is tracked', () => {
  const allowedPdf = /^(public\/docs\/agents\/|docs\/cai-l4-ci-001\/test-fixtures\/)/;
  const pdfs = tracked.filter((f) => /\.pdf$/i.test(f) && !allowedPdf.test(f));
  assert.deepEqual(pdfs, [], 'PDFs outside the published dossiers and synthetic fixtures');
  assert.deepEqual(tracked.filter((f) => /(signed|podepsan|passport|obcansky-prukaz|invoice-G\d+|registrace|osvedceni)/i.test(f)), []);
});

test('tracked text holds no Czech birth number, IBAN or payment card number', () => {
  const text = tracked.filter((f) => /\.(md|json|js|mjs|cjs|html|txt|yml|ts)$/i.test(f) && f !== 'package-lock.json');
  const hits = [];
  for (const f of text) {
    const s = read(f);
    if (/\b\d{6}\/\d{3,4}\b/.test(s)) hits.push(`${f}: birth-number pattern`);
    if (/\b[A-Z]{2}\d{2}(?: ?\d{4}){4,7}\b/.test(s)) hits.push(`${f}: IBAN pattern`);
    if (/\b(?:4\d{3}|5[1-5]\d{2})(?:[ -]?\d{4}){3}\b/.test(s) && !/tests\/|docs\/stripe|stripe-e2e|release-gates|e2e/.test(f)) hits.push(`${f}: card-number pattern`);
  }
  assert.deepEqual(hits, []);
});

test('server logs never print buyer identifiers', () => {
  const offenders = [];
  for (const f of tracked.filter((x) => /^(api|lib)\/.*\.js$/.test(x))) {
    read(f).split('\n').forEach((l, i) => {
      if (/console\.(log|warn|error|info)\(/.test(l) && /(\.email\b|taxId|vatId|registrationNumber|buyer\.(name|company|address))/.test(l)) offenders.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

const DIST = join(ROOT, 'dist');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
test('the client build carries no internal legal, tax or evidence material', { skip: !existsSync(DIST) && 'run npm run build first' }, () => {
  const bad = /evidence-manifest|private:(legal|tax|blob)|Výhradní licenční smlouva|Exclusive Licence Agreement \(English reference|vatStatusEvidence|accountantDecision|founderReported/;
  const hits = walk(DIST).filter((f) => /\.(html|js|json|txt|css|map)$/.test(f) && bad.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map((f) => f.slice(ROOT.length)), []);
  assert.ok(!existsSync(join(DIST, 'docs/legal')) && !existsSync(join(DIST, 'config')), 'internal folders are not served');
});

test('an approved tax policy rests on verified evidence records', () => {
  const policy = JSON.parse(read('config/tax-policy.json'));
  const manifest = JSON.parse(read('config/evidence-manifest.json'));
  const rec = (id) => manifest.records.find((r) => r.id === id);
  if (policy.status === 'approved') {
    for (const id of ['vat-registration-decision', 'accountant-t1-t14']) assert.equal(rec(id)?.status, 'verified', `${id} must be verified before the policy is approved`);
  } else {
    assert.equal(rec('vat-registration-decision').status, 'pending');
    assert.equal(rec('accountant-t1-t14').status, 'pending');
  }
});
