/**
 * tests/cai-release-1035.test.mjs - corrective release candidate 1.0.3.5, defect D-ET-1 (Effective terms).
 *
 * Managed 1.0.3.4, tenant test 11 Nov 2026: approving SYN-N02 failed the Effective terms run in Duration_months, because
 * int() was applied to the extracted duration "Initial Term". The contract stayed Approved with no effective terms and
 * no one was told. These tests evaluate the shipped and the patched expressions with a small evaluator for the
 * workflow-expression functions they use, and check the failure path the patch adds. if() is evaluated lazily, as the
 * tenant shows (the 10 Nov run with "24 months" succeeded although the unused branch would have thrown); the patched
 * expression is also checked with both branches evaluated, so it does not depend on that. They read the committed definitions; nothing here talks to a tenant.
 * Usage: node --test tests/cai-release-1035.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const FILE = 'CAICI-Effectiveterms-2BFB2A15-C9D7-F111-84E8-E4FADE0D927F.definition.json';
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const v1034 = load(`scripts/cai-release/1.0.3.4/flows/${FILE}`);
const v1035 = load(`scripts/cai-release/1.0.3.5/flows/${FILE}`);
const daily = load('scripts/cai-release/1.0.3.4/flows/CAICI-Dailyrecompute-E8D71E13-19D8-F111-84E8-E4FADE0D20C9.definition.json');
const masterActions = (d) => d.actions.Master_exists.actions.Master_approved.actions;

// ── A minimal evaluator for the expression subset: literals, function calls, ?['x'] / ['x'] access. ──
function parse(src) {
  let i = 0;
  const ws = () => { while (/\s/.test(src[i])) i++; };
  const expr = () => {
    ws();
    let node;
    if (src[i] === "'") {
      let s = ''; i++;
      for (;;) {
        if (src[i] === "'" && src[i + 1] === "'") { s += "'"; i += 2; continue; }
        if (src[i] === "'") { i++; break; }
        if (i >= src.length) throw new Error('unterminated string');
        s += src[i++];
      }
      node = { k: 'lit', v: s };
    } else if (/[-\d]/.test(src[i])) {
      const m = /^-?\d+(\.\d+)?/.exec(src.slice(i)); i += m[0].length; node = { k: 'lit', v: Number(m[0]) };
    } else {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      if (!m) throw new Error(`parse error at ${i}: ${src.slice(i, i + 20)}`);
      i += m[0].length; ws();
      if (src[i] === '(') {
        i++; const args = []; ws();
        if (src[i] === ')') i++;
        else for (;;) { args.push(expr()); ws(); if (src[i] === ',') { i++; continue; } if (src[i] === ')') { i++; break; } throw new Error(`expected , or ) at ${i}`); }
        node = { k: 'call', f: m[0], args };
      } else node = { k: 'lit', v: { true: true, false: false, null: null }[m[0]] };
    }
    for (;;) {
      ws();
      if (src[i] === '?' && src[i + 1] === '[') { i += 2; const key = expr(); ws(); i++; node = { k: 'get', o: node, key }; continue; }
      if (src[i] === '[') { i++; const key = expr(); ws(); i++; node = { k: 'get', o: node, key }; continue; }
      return node;
    }
  };
  const n = expr(); ws();
  if (i !== src.length) throw new Error(`trailing input at ${i}`);
  return n;
}
const isEmpty = (x) => x == null || x === '' || (Array.isArray(x) && !x.length) || (typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length);
const toInt = (x) => {
  if (typeof x === 'number' && Number.isInteger(x)) return x;
  if (typeof x === 'string' && /^\s*[+-]?\d+\s*$/.test(x)) return parseInt(x, 10);
  throw new Error(`int(): '${x}' is not a valid integer`);
};
const FN = {
  not: (x) => !x, and: (...a) => a.every(Boolean), or: (...a) => a.some(Boolean), equals: (a, b) => a === b,
  greater: (a, b) => a > b, empty: isEmpty, coalesce: (...a) => a.find((x) => x != null) ?? null,
  toLower: (s) => { if (typeof s !== 'string') throw new Error('toLower expects a string'); return s.toLowerCase(); },
  trim: (s) => { if (typeof s !== 'string') throw new Error('trim expects a string'); return s.trim(); },
  contains: (h, n) => (typeof h === 'string' ? h.includes(n) : Array.isArray(h) ? h.includes(n) : false),
  split: (s, sep) => { if (typeof s !== 'string') throw new Error('split expects a string'); return s.split(sep); },
  first: (a) => (typeof a === 'string' ? a[0] ?? '' : a?.[0] ?? null),
  last: (a) => (typeof a === 'string' ? a.slice(-1) : a?.length ? a[a.length - 1] : null),
  int: toInt, isInt: (x) => { try { toInt(x); return true; } catch { return false; } },
  mul: (a, b) => a * b,
};
function evaluate(src, vars, { eagerIf = false } = {}) {
  const ev = (n) => {
    if (n.k === 'lit') return n.v;
    if (n.k === 'call' && n.f === 'if') {
      if (eagerIf) { const [c, a, b] = n.args.map(ev); return c ? a : b; }
      return ev(n.args[0]) ? ev(n.args[1]) : ev(n.args[2]);
    }
    if (n.k === 'get') { const o = ev(n.o); const key = ev(n.key); return o == null ? null : (o[key] ?? null); }
    if (n.f === 'variables') return vars[ev(n.args[0])];
    if (!FN[n.f]) throw new Error(`function ${n.f} not in the test evaluator`);
    return FN[n.f](...n.args.map(ev));
  };
  return ev(parse(src.replace(/^@/, '')));
}
const months = (defn, duration, end = null, opts) => evaluate(masterActions(defn).Duration_months.inputs,
  { Eff: { initial_term: { value: { start: '2026-03-01', end, duration } } } }, opts);

test('reproduces D-ET-1: the 1.0.3.4 expression throws on durations without a leading number', () => {
  for (const d of ['Initial Term', 'two years', 'until 29 February 2028', 'the term set out in clause 3']) {
    assert.throws(() => months(v1034, d, '2028-02-29'), /int\(\)/, d);
  }
  // and the observed case: SYN-N02 on 11 Nov had an end date, so the value was not even needed
  assert.throws(() => months(v1034, 'Initial Term', '2028-02-29'));
  assert.equal(months(v1034, '24 months', '2028-02-29'), 24, 'the 10 Nov extraction ("24 months") worked');
});

test('1.0.3.5: Duration_months never throws and is 0 whenever the term has an end date', () => {
  const words = ['Initial Term', 'two years', 'until 29 February 2028', '24 months', '2 (two) years', 'twenty-four (24) months',
    '', null, '24-month', '1.5 years', '(', ')', '( )', 'term ( 12 ) months', "O'Brien's term", '  36  ', '-3 months'];
  for (const d of words) {
    for (const eagerIf of [false, true]) {
      assert.doesNotThrow(() => months(v1035, d, null, { eagerIf }), `${d} eagerIf=${eagerIf}`);
      assert.equal(months(v1035, d, '2028-02-29', { eagerIf }), 0, `end date present: ${d}`);
    }
  }
});

test('1.0.3.5: without an end date, readable durations still give months; unreadable ones give 0 (no term end)', () => {
  const cases = [['24 months', 24], ['2 (two) years', 24], ['twenty-four (24) months', 24], ['3 years', 36], ['12', 12],
    ['Initial Term', 0], ['two years', 0], ['24-month', 0], ['1.5 years', 0], ['', 0], [null, 0]];
  for (const [d, m] of cases) {
    assert.equal(months(v1035, d, null), m, String(d));
    assert.equal(months(v1035, d, null, { eagerIf: true }), m, `${d} (both if() branches evaluated)`);
  }
  // Term_end uses the months only when the end is empty, and only when greater than 0: 0 means "no term end"
  const te = masterActions(v1035).Term_end.inputs;
  assert.match(te, /^@if\(not\(empty\(coalesce\(variables\('Eff'\)\?\['initial_term'\]\?\['value'\]\?\['end'\], ''\)\)\)/);
  assert.match(te, /greater\(outputs\('Duration_months'\), 0\)/);
});

test('1.0.3.5: no int() is applied to unchecked extracted duration text', () => {
  const dm = masterActions(v1035).Duration_months.inputs;
  const intArgs = [...dm.matchAll(/int\(/g)].length;
  assert.equal(intArgs, 1, 'one int() call');
  assert.match(dm, /mul\(int\(if\(isInt\(/, 'its argument is chosen by isInt() and defaults to the string 0');
});

test('1.0.3.5: a failed run marks the contract NOT VERIFIED, keeps no date, logs it and still ends Failed', () => {
  const s = v1035.actions.Report_terms_not_computed;
  assert.equal(s.type, 'Scope');
  assert.deepEqual(s.runAfter, { Master_exists: ['Failed', 'TimedOut', 'Skipped'] });
  const a = s.actions;
  const p = a.Mark_terms_not_computed.inputs.parameters;
  assert.match(p['item/cai_noticestatus'], /^@concat\('DEADLINE NOT VERIFIED - HUMAN REVIEW REQUIRED\. '/);
  for (const f of ['cai_noticedeadline', 'cai_noticetermend', 'cai_termscomputedon']) assert.equal(p[`item/${f}`], '@null', f);
  assert.match(a.Failure_target.inputs, /^@if\(equals\(triggerOutputs\(\)\?\['body\/cai_documentrole'\], 'master'\), triggerOutputs\(\)\?\['body\/cai_contractid'\]/);
  assert.equal(a.Log_terms_not_computed.inputs.parameters.entityName, 'cai_reviews');
  assert.deepEqual(a.Log_terms_not_computed.runAfter, { Mark_terms_not_computed: ['Succeeded', 'Failed'] });
  assert.equal(a.End_run_failed.type, 'Terminate');
  assert.equal(a.End_run_failed.inputs.runStatus, 'Failed');
});

test('1.0.3.5: the failure path writes no attribute that triggers this flow (no loop)', () => {
  const trig = v1035.triggers.When_a_contract_review_status_changes.inputs.parameters['subscriptionRequest/filteringattributes'].split(',');
  const written = Object.values(v1035.actions.Report_terms_not_computed.actions)
    .flatMap((x) => Object.keys(x.inputs?.parameters || {}).filter((k) => k.startsWith('item/')).map((k) => k.slice(5).toLowerCase()));
  assert.ok(written.includes('cai_noticestatus'));
  for (const t of trig) assert.ok(!written.includes(t.trim().toLowerCase()), `writes trigger attribute ${t}`);
});

test('the next Daily recompute reports a contract left by the failure path (admin alert)', () => {
  const m = daily.actions.Main.actions;
  assert.match(m.List_masters.inputs.parameters.$filter, /cai_termscomputedon eq null/, 'daily window includes never-computed terms');
  assert.match(m.Not_refreshed.inputs.where, /empty\(coalesce\(item\(\)\?\['cai_termscomputedon'\], ''\)\)/);
  const blocking = m.Not_refreshed_blocking.inputs.where;
  assert.ok(!blocking.includes('DEADLINE NOT VERIFIED'), 'a NOT VERIFIED status is not excused');
  assert.match(m.Job_status.inputs, /'FAILED'/);
  assert.equal(m.If_failed_alert.actions.Alert_admin.inputs.host.operationId, 'PostMessageToConversation');
});

test('1.0.3.5 differs from 1.0.3.4 only in Duration_months and the added failure scope', () => {
  const a = structuredClone(v1034); const b = structuredClone(v1035);
  delete masterActions(a).Duration_months.inputs; delete masterActions(b).Duration_months.inputs;
  delete b.actions.Report_terms_not_computed;
  assert.deepEqual(b, a);
});

test('the patch script reproduces the committed 1.0.3.5 definition from 1.0.3.4', () => {
  const out = mkdtempSync(join(tmpdir(), 'cai1035-'));
  execFileSync('python3', ['-I', 'scripts/cai-release/1.0.3.5/patch_flows_1035.py', 'scripts/cai-release/1.0.3.4/flows', out]);
  assert.deepEqual(readdirSync(out), [FILE]);
  assert.equal(readFileSync(join(out, FILE), 'utf8'), readFileSync(`scripts/cai-release/1.0.3.5/flows/${FILE}`, 'utf8'));
});
