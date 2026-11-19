/**
 * tests/cai-release-1035.test.mjs - release 1.0.3.5 of CAI-L4-CI-001 (scripts/cai-release/1.0.3.5).
 *
 * Three defects from the tenant test of managed 1.0.3.4 (11 Nov 2026):
 *   D-ET-1  Effective terms failed on extracted text that was not a number ("Initial Term") and nobody was told.
 *   F-T-3   Approving a contract superseded another team's contract with the same reference.
 *   F-T-4   An upload that could not be read failed without a register row or a message.
 * The tests evaluate the shipped (1.0.3.4) and released (1.0.3.5) flow expressions with a small evaluator for the
 * workflow-expression functions involved, run the agent tools' filters on rows from two teams, check the failure
 * paths, and check that the committed release files are what the generator makes from the 1.0.3.4 baseline.
 * Nothing here talks to a tenant; the tenant evidence is in the implementation report.
 * Usage: node --test tests/cai-release-1035.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const DIR = 'scripts/cai-release/1.0.3.5';
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const STEM = {
  eff: 'Effectiveterms-2BFB2A15-C9D7-F111-84E8-E4FADE0D927F', ext: 'Extractcontractonupload-4CA9DEF0-7ED7-F111-84E8-E4FADE0D927F',
  gate: 'ReviewgateTeams-B3C964D1-A7D7-F111-84E8-E4FADE0D927F', terms: 'Compute-Geteffectiveterms-4DCE77CB-F9D9-F111-84E8-000D3A832B24',
  notice: 'Compute-Noticedeadlines-7F4045FE-F8D9-F111-84E8-000D3A832B24',
};
const base = (k) => load(`${DIR}/baseline/${STEM[k]}.clientdata.json`);
const rel = (k) => load(`${DIR}/release/${STEM[k]}.clientdata.json`);
const daily = load('scripts/cai-release/1.0.3.4/flows/CAICI-Dailyrecompute-E8D71E13-19D8-F111-84E8-E4FADE0D20C9.definition.json');
const def = (cd) => cd.properties.definition;
const ma = (cd) => def(cd).actions.Master_exists.actions.Master_approved.actions;

// ── A small evaluator for workflow expressions: literals, function calls, ?['x'] / ['x'] access. ──
function parse(src) {
  let i = 0;
  const ws = () => { while (/\s/.test(src[i])) i++; };
  const expr = () => {
    ws();
    let node;
    if (src[i] === "'") {
      let s = ''; i++;
      for (;;) {
        if (i >= src.length) throw new Error('unterminated string');
        if (src[i] === "'" && src[i + 1] === "'") { s += "'"; i += 2; continue; }
        if (src[i] === "'") { i++; break; }
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
const str = (x) => (x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x));
const FN = {
  not: (x) => !x, and: (...a) => a.every(Boolean), or: (...a) => a.some(Boolean), equals: (a, b) => a === b,
  greater: (a, b) => a > b, less: (a, b) => a < b, empty: isEmpty, coalesce: (...a) => a.find((x) => x != null) ?? null,
  toLower: (s) => { if (typeof s !== 'string') throw new Error('toLower expects a string'); return s.toLowerCase(); },
  trim: (s) => { if (typeof s !== 'string') throw new Error('trim expects a string'); return s.trim(); },
  contains: (h, n) => (typeof h === 'string' ? h.includes(n) : Array.isArray(h) ? h.includes(n) : false),
  startsWith: (s, p) => String(s).startsWith(p),
  split: (s, sep) => { if (typeof s !== 'string') throw new Error('split expects a string'); return s.split(sep); },
  first: (a) => (typeof a === 'string' ? a[0] ?? '' : a?.[0] ?? null),
  last: (a) => (typeof a === 'string' ? a.slice(-1) : a?.length ? a[a.length - 1] : null),
  int: toInt, isInt: (x) => { try { toInt(x); return true; } catch { return false; } },
  mul: (a, b) => a * b, length: (x) => x.length, string: str, concat: (...a) => a.map(str).join(''),
  replace: (s, a, b) => s.split(a).join(b), join: (a, sep) => a.join(sep), createArray: (...a) => a,
  substring: (s, a, n) => { if (a + n > s.length) throw new Error('substring out of range'); return s.substr(a, n); },
  json: (s) => JSON.parse(s), setProperty: (o, k, v) => ({ ...o, [k]: v }),
  addProperty: (o, k, v) => { if (k in o) throw new Error('exists'); return { ...o, [k]: v }; },
  sort: (a, k) => [...a].sort((x, y) => (x[k] > y[k] ? 1 : x[k] < y[k] ? -1 : 0)),
  utcNow: () => '2026-11-19T15:00:00Z', convertFromUtc: (t) => t.slice(0, 16).replace('T', ' '),
};
function evaluate(src, ctx = {}, { eagerIf = false } = {}) {
  const ev = (n) => {
    if (n.k === 'lit') return n.v;
    if (n.k === 'get') { const o = ev(n.o); const key = ev(n.key); return o == null ? null : (o[key] ?? null); }
    const a = () => n.args.map(ev);
    switch (n.f) {
      case 'if': if (eagerIf) { const [c, x, y] = a(); return c ? x : y; } return ev(n.args[0]) ? ev(n.args[1]) : ev(n.args[2]);
      case 'variables': return ctx.variables?.[ev(n.args[0])];
      case 'outputs': { const k = ev(n.args[0]); if (!(k in (ctx.outputs || {}))) throw new Error(`outputs('${k}') not in context`); return ctx.outputs[k]; }
      case 'body': { const k = ev(n.args[0]); if (!(k in (ctx.body || {}))) throw new Error(`body('${k}') not in context`); return ctx.body[k]; }
      case 'actions': return ctx.actions?.[ev(n.args[0])] ?? { status: 'Skipped' };
      case 'parameters': return ctx.parameters?.[ev(n.args[0])] ?? '';
      case 'triggerOutputs': return ctx.trigger ?? {};
      case 'workflow': return { run: { name: 'run-123' } };
      case 'item': return ctx.item;
      case 'items': return ctx.items?.[ev(n.args[0])];
      default:
        if (!FN[n.f]) throw new Error(`function ${n.f} not in the test evaluator`);
        return FN[n.f](...a());
    }
  };
  return ev(parse(src.replace(/^@/, '')));
}
const query = (action, ctx) => evaluate(action.inputs.from, ctx).filter((item) => evaluate(action.inputs.where, { ...ctx, item }));
const months = (defn, duration, end = null, opts) => evaluate(defn.actions.Master_exists.actions.Master_approved.actions.Duration_months.inputs,
  { variables: { Eff: { initial_term: { value: { start: '2026-03-01', end, duration } } } } }, opts);

// ── D-ET-1 ──
test('reproduces D-ET-1: the 1.0.3.4 duration expression throws on durations without a leading number', () => {
  for (const d of ['Initial Term', 'two years', 'until 29 February 2028']) assert.throws(() => months(def(base('eff')), d, '2028-02-29'), /int\(\)/, d);
  assert.equal(months(def(base('eff')), '24 months', '2028-02-29'), 24, 'the 10 Nov extraction ("24 months") worked');
});

test('1.0.3.5: the duration never throws, is 0 with an end date, and is read only from whole numbers', () => {
  for (const d of ['Initial Term', 'two years', '', null, '24-month', '1.5 years', '(', ')', "O'Brien's term", '-3 months']) {
    for (const eagerIf of [false, true]) {
      assert.doesNotThrow(() => months(def(rel('eff')), d, null, { eagerIf }), `${d}`);
      assert.equal(months(def(rel('eff')), d, '2028-02-29', { eagerIf }), 0);
    }
  }
  for (const [d, m] of [['24 months', 24], ['2 (two) years', 24], ['twenty-four (24) months', 24], ['3 years', 36], ['Initial Term', 0], ['two years', 0]]) {
    assert.equal(months(def(rel('eff')), d, null), m, String(d));
  }
});

test('1.0.3.5: notice amount, notice days and renewal months are read only when they are whole numbers, else flagged', () => {
  const a = ma(rel('eff'));
  const run = (renewal) => {
    const ctx = { variables: { Eff: { renewal: { value: renewal } } }, outputs: {} };
    for (const k of ['N_amount_safe', 'N_days_safe', 'Renewal_months_safe', 'Numbers_unread_all']) ctx.outputs[k] = evaluate(a[k].inputs, ctx);
    ctx.body = { Numbers_unread: query(a.Numbers_unread, ctx) };
    return ctx;
  };
  let c = run({ notice_period: { amount: 6 }, notice_days: null, period_months: '12' });
  assert.deepEqual([c.outputs.N_amount_safe, c.outputs.N_days_safe, c.outputs.Renewal_months_safe, c.body.Numbers_unread], [6, null, 12, []]);
  c = run({ notice_period: { amount: 'six' }, notice_days: '90 days', period_months: '12 months' });
  assert.deepEqual([c.outputs.N_amount_safe, c.outputs.N_days_safe, c.outputs.Renewal_months_safe], [null, null, null]);
  assert.equal(c.body.Numbers_unread.length, 3);
  assert.match(c.body.Numbers_unread[0], /notice period amount "six" could not be read/);
  // the flag list carries it, so the deadline is DEADLINE NOT VERIFIED (D_unverified = flags not empty)
  assert.match(a.N_flag_list.inputs, /if\(greater\(length\(body\('Numbers_unread'\)\), 0\), concat\(join\(body\('Numbers_unread'\), '; '\), ' - a reviewer must confirm the notice period and the renewal period'\), ''\)\)$/);
  assert.equal(a.D_unverified.inputs, "@not(empty(outputs('N_flags')))");
  assert.match(a.Status_text_final.inputs, /^@if\(outputs\('D_unverified'\), concat\('DEADLINE NOT VERIFIED - HUMAN REVIEW REQUIRED/);
});

test('1.0.3.5: no int() in Effective terms takes extracted text that was not checked first', () => {
  const s = JSON.stringify(def(rel('eff')));
  const args = new Set();
  for (const m of s.matchAll(/\bint\(/g)) {
    let i = m.index + 4; let d = 1; const st = i;
    while (d && i < s.length) { if (s[i] === '(') d++; else if (s[i] === ')') d--; i++; }
    args.add(s.slice(st, i - 1));
  }
  // item()?['amount'] is only read from body('N_clauses'), which keeps clauses whose amount is all digits (checked below)
  const allowed = [/^outputs\('N_amount'\)$/, /^item\(\)\?\['a'\]$/, /^string\(item\(\)\?\['amount'\]\)$/, /^item\(\)\?\['amount'\]$/, /^if\(isInt\(/,
    /^string\(variables\('Eff'\)\?\['renewal'\]\?\['value'\]\?\['(notice_period'\]\?\['amount|notice_days|period_months)'\]\)$/];
  for (const a of args) assert.ok(allowed.some((r) => r.test(a)), `unguarded int(${a.slice(0, 80)})`);
  // the string(...) forms only appear inside if(isInt(string(coalesce(...))), int(string(...)), null)
  for (const k of ['N_amount_safe', 'N_days_safe', 'Renewal_months_safe']) assert.match(ma(rel('eff'))[k].inputs, /^@if\(isInt\(string\(coalesce\(/);
  const m = ma(rel('eff'));
  for (const k of ['N_clause_mismatch', 'N_clause_objs']) assert.equal(m[k].inputs.from, "@body('N_clauses')", k);
  assert.match(m.N_clauses.inputs.where, /empty\(replace\(replace\(replace\(replace\(replace\(replace\(replace\(replace\(replace\(replace\(string\(item\(\)\?\['amount'\]\), '0', ''\)/);
});

test('1.0.3.5: a failed calculation marks the contract NOT VERIFIED, logs it, alerts the admin at once and ends Failed', () => {
  const s = def(rel('eff')).actions.Report_terms_not_computed;
  assert.deepEqual(s.runAfter, { Master_exists: ['Failed', 'TimedOut', 'Skipped'] });
  const a = s.actions;
  const p = a.Mark_terms_not_computed.inputs.parameters;
  assert.match(p['item/cai_noticestatus'], /^@concat\('DEADLINE NOT VERIFIED - HUMAN REVIEW REQUIRED\. '/);
  for (const f of ['cai_noticedeadline', 'cai_noticetermend', 'cai_termscomputedon']) assert.equal(p[`item/${f}`], '@null', f);
  assert.equal(a.Log_terms_not_computed.inputs.parameters.entityName, 'cai_reviews');
  assert.equal(a.Alert_admin_terms_not_computed.inputs.host.operationId, 'PostMessageToConversation');
  assert.equal(a.Alert_admin_terms_not_computed.inputs.parameters['body/recipient'], "@parameters('cai_AdminAlertUpn (cai_AdminAlertUpn)')");
  assert.equal(a.End_run_failed.inputs.runStatus, 'Failed');
  assert.ok(def(rel('eff')).parameters['cai_AdminAlertUpn (cai_AdminAlertUpn)']);
  assert.equal(rel('eff').properties.connectionReferences.shared_teams.connection.connectionReferenceLogicalName, 'new_sharedteams_8e81b');
});

test('1.0.3.5: the failure path writes no attribute that triggers Effective terms (no loop)', () => {
  const trig = def(rel('eff')).triggers.When_a_contract_review_status_changes.inputs.parameters['subscriptionRequest/filteringattributes'].split(',');
  const written = Object.values(def(rel('eff')).actions.Report_terms_not_computed.actions)
    .flatMap((x) => Object.keys(x.inputs?.parameters || {}).filter((k) => k.startsWith('item/')).map((k) => k.slice(5).toLowerCase()));
  for (const t of trig) assert.ok(!written.includes(t.trim().toLowerCase()), t);
});

test('the next Daily recompute still reports a contract left NOT VERIFIED by a failure (second alert path)', () => {
  const m = daily.actions.Main.actions;
  assert.match(m.List_masters.inputs.parameters.$filter, /cai_termscomputedon eq null/);
  assert.ok(!m.Not_refreshed_blocking.inputs.where.includes('DEADLINE NOT VERIFIED'));
  assert.equal(m.If_failed_alert.actions.Alert_admin.inputs.host.operationId, 'PostMessageToConversation');
});

// ── F-T-3 ──
test('reproduces F-T-3: the 1.0.3.4 family is every contract with the reference, whatever its team', () => {
  const f = evaluate(def(base('eff')).actions.List_family.inputs.parameters.$filter, { outputs: { Master_reference: 'SYN-N09' } });
  assert.equal(f, "startswith(cai_contractreference,'SYN-N09')");
});

test('1.0.3.5: a contract family is the same reference and the same owner team, in Effective terms and its failure path', () => {
  const d = def(rel('eff'));
  const ctx = { outputs: { Master_reference: "O'Brien-01", Family_owner: '14658391-badd-f111-84e8-7ced8d44b3cd' } };
  assert.equal(evaluate(d.actions.List_family.inputs.parameters.$filter, ctx),
    "startswith(cai_contractreference,'O''Brien-01') and _ownerid_value eq 14658391-badd-f111-84e8-7ced8d44b3cd");
  assert.equal(evaluate(d.actions.Report_terms_not_computed.actions.Find_master_for_failure.inputs.parameters.$filter, ctx),
    "cai_contractreference eq 'O''Brien-01' and cai_documentrole eq 'master' and cai_reviewstatus eq 'Approved' and _ownerid_value eq 14658391-badd-f111-84e8-7ced8d44b3cd");
  assert.equal(d.actions.Family_owner.inputs, "@triggerOutputs()?['body/_ownerid_value']");
  assert.deepEqual(d.actions.Family_owner.runAfter, { Master_reference: ['Succeeded'] });
  assert.match(d.actions.List_family.inputs.parameters.$select, /,_ownerid_value$/);
  // superseding only ever sees that family
  const mark = JSON.stringify(ma(rel('eff')).Mark_other_masters_superseded);
  assert.match(mark, /Filter_approved_masters/);
  assert.match(JSON.stringify(d.actions.Filter_master.inputs), /List_family/);
});

const T1 = 'aaaaaaaa-0000-0000-0000-000000000001'; // Legal
const T2 = 'bbbbbbbb-0000-0000-0000-000000000002'; // Lifecycle test team
const ROWS = [
  { cai_contractid: 'L1', cai_contractreference: 'SYN-N09', cai_documentname: 'SYN-N09.pdf', cai_documentrole: 'master', cai_reviewstatus: 'Approved', createdon: '2026-11-10T11:59:00Z', _ownerid_value: T1 },
  { cai_contractid: 'L2', cai_contractreference: 'SYN-N09 / Amendment No. 1', cai_documentname: 'SYN-N09-A1.pdf', cai_documentrole: 'amendment', cai_reviewstatus: 'Approved', createdon: '2026-11-10T12:30:00Z', _ownerid_value: T1 },
  { cai_contractid: 'T1', cai_contractreference: 'SYN-N09', cai_documentname: 'SYN-N09.pdf', cai_documentrole: 'master', cai_reviewstatus: 'Approved', createdon: '2026-11-11T10:38:51Z', _ownerid_value: T2 },
];

test('1.0.3.5 agent tool "Get effective terms": the newest approved master\'s team only, and the other team\'s contract is named', () => {
  const a = def(rel('terms')).actions;
  const ctx = { outputs: { Reference: 'SYN-N09' }, body: {} };
  ctx.body.Family_rows = query(a.Family_rows, { ...ctx, outputs: { ...ctx.outputs, List_family: { value: ROWS } } });
  ctx.body.Approved_masters = query(a.Approved_masters, ctx);
  ctx.outputs.Family_owner = evaluate(a.Family_owner.inputs, ctx);
  assert.equal(ctx.outputs.Family_owner, T2);
  ctx.body.Owner_family_rows = query(a.Owner_family_rows, ctx);
  ctx.body.Other_team_rows = query(a.Other_team_rows, ctx);
  assert.deepEqual(ctx.body.Owner_family_rows.map((r) => r.cai_contractid), ['T1']);
  assert.deepEqual(ctx.body.Other_team_rows.map((r) => r.cai_contractid), ['L1', 'L2']);
  assert.deepEqual(query(a.Approved_amendments, ctx).map((r) => r.cai_contractid), [], "Legal's amendment never counts for the other team's contract");
  assert.equal(a.Family_summary.inputs.from, "@body('Owner_family_rows')");
  const results = JSON.stringify(a);
  assert.equal((results.match(/"same_reference_in_other_teams":"@body\('Other_team_docs'\)"/g) || []).length, 5, 'every result shape names the other contract');
  // 1.0.3.4 mixed them: Legal's amendment counted against the newer master, so the stored basis never matched
  const b = def(base('terms')).actions;
  const ctx4 = { outputs: { Reference: 'SYN-N09' }, body: {} };
  ctx4.body.Family_rows = query(b.Family_rows, { ...ctx4, outputs: { ...ctx4.outputs, List_family: { value: ROWS } } });
  assert.deepEqual(query(b.Approved_amendments, ctx4).map((r) => r.cai_contractid), ['L2']);
});

test('1.0.3.5 agent tool "Notice deadlines": the same reference in two teams gives two contracts', () => {
  const a = def(rel('notice')).actions;
  const ctx = { outputs: { List_approved: { value: ROWS } }, body: {} };
  ctx.body.Approved_masters = query(a.Approved_masters, ctx);
  const keys = ctx.body.Approved_masters.map((item) => evaluate(a.References.inputs.select, { ...ctx, item }));
  assert.deepEqual([...new Set(keys)].length, 2);
  for (const k of new Set(keys)) {
    const rows = query(a.For_each_contract.actions.Master_rows, { ...ctx, items: { For_each_contract: k } });
    assert.equal(rows.length, 1, k);
  }
  const legalKey = keys[ctx.body.Approved_masters.findIndex((r) => r._ownerid_value === T1)];
  assert.deepEqual(query(a.For_each_contract.actions.Amendment_rows, { ...ctx, items: { For_each_contract: legalKey } }).map((r) => r.cai_contractid), ['L2']);
  // 1.0.3.4: one key for both teams, so one of the two deadlines was never listed
  const b = def(base('notice')).actions;
  assert.equal(new Set(ctx.body.Approved_masters.map((item) => evaluate(b.References.inputs.select, { ...ctx, item }))).size, 1);
});

test('1.0.3.5 agent topics read the owner team, and the agent is told not to mix two contracts', () => {
  for (const f of ['topic.T7NoticeDeadlines.yaml', 'topic.T7GetEffectiveTerms.yaml']) {
    const y = readFileSync(`${DIR}/release/${f}`, 'utf8');
    assert.match(y, /\$select: cai_contractid,[^\n]*,_ownerid_value\n/);
    assert.match(y, /\n {16}_ownerid_value: String\n/);
  }
  assert.match(readFileSync(`${DIR}/release/gpt.default.yaml`, 'utf8'), /same_reference_in_other_teams lists documents/);
});

// ── F-T-4 ──
const extDef = () => def(rel('ext'));
const failCtx = (statuses, extra = {}) => ({
  actions: Object.fromEntries(Object.entries(statuses).map(([k, v]) => [k, typeof v === 'string' ? { status: v } : v])),
  trigger: { 'body/{FilenameWithExtension}': 'SYN-BROKEN.pdf', 'body/{Link}': 'https://example.invalid/x', 'body/Author/DisplayName': 'Test Uploader', 'body/Author/Email': 'uploader@example.invalid' },
  parameters: { 'cai_ReviewerUpn (cai_ReviewerUpn)': 'reviewer@example.invalid' }, outputs: {}, ...extra,
});

test('reproduces F-T-4: in 1.0.3.4 nothing runs after a failed extraction', () => {
  const acts = def(base('ext')).actions;
  const after = Object.entries(acts).filter(([, a]) => Object.values(a.runAfter || {}).some((s) => s.includes('Failed') || s.includes('Skipped')));
  assert.deepEqual(after, []);
});

test('1.0.3.5: an unreadable upload gets a register row, a review-log row, a Teams message to the reviewer and the uploader, and a Failed run', () => {
  const s = extDef().actions.Report_extraction_failure;
  assert.deepEqual(s.runAfter, { Apply_to_each: ['Failed', 'Skipped', 'TimedOut'] });
  const a = s.actions;
  const cases = [
    [{ Get_file_content: 'Succeeded', Run_a_prompt: { status: 'Failed', outputs: { body: { error: { message: 'The file is not a supported document.' } } } }, Parse_JSON: 'Skipped', Add_a_new_row: 'Skipped', Apply_to_each: 'Skipped' }, 'read', /could not be read as a contract/],
    [{ Get_file_content: { status: 'Failed', error: { message: 'Not found' } } }, 'open', /SharePoint did not return the file/],
    [{ Get_file_content: 'Succeeded', Run_a_prompt: 'Succeeded', Parse_JSON: 'Succeeded', Add_a_new_row: { status: 'Failed', error: { message: 'Principal team is missing prvCreatecai_contract' } } }, 'register', /owner team has the CAI Contract Reader role/],
    [{ Get_file_content: 'Succeeded', Run_a_prompt: 'Succeeded', Parse_JSON: 'Succeeded', Add_a_new_row: { status: 'Succeeded', outputs: { body: { cai_contractid: 'C1', cai_contractreference: 'SYN-X' } } }, Apply_to_each: 'Failed' }, 'evidence', /evidence rows were not/],
  ];
  for (const [st, step, reason] of cases) {
    const ctx = failCtx(st);
    ctx.outputs.Failure_step = evaluate(a.Failure_step.inputs, ctx);
    assert.equal(ctx.outputs.Failure_step, step);
    ctx.outputs.Failure_detail_raw = evaluate(a.Failure_detail_raw.inputs, ctx);
    ctx.outputs.Failure_detail = evaluate(a.Failure_detail.inputs, ctx);
    ctx.outputs.Failure_reason = evaluate(a.Failure_reason.inputs, ctx);
    ctx.outputs.Failure_todo = evaluate(a.Failure_todo.inputs, ctx);
    ctx.outputs.Failure_reference = evaluate(a.Failure_reference.inputs, ctx);
    assert.match(ctx.outputs.Failure_reason, reason);
    assert.ok(ctx.outputs.Failure_detail.length <= 300);
    if (step === 'evidence') assert.equal(ctx.outputs.Failure_reference, 'SYN-X');
    else assert.equal(ctx.outputs.Failure_reference, 'UNREADABLE - SYN-BROKEN.pdf');
    ctx.outputs.Owner_team_id = 'team-1';
    const row = a.Row_exists.else.actions.Add_failure_row.inputs.parameters;
    const ev = JSON.parse(evaluate(row['item/cai_extractionjson'], ctx));
    assert.equal(ev.extraction_failed.step, step);
    assert.equal(ev.extraction_failed.file, 'SYN-BROKEN.pdf');
    assert.equal(ev.extraction_failed.uploaded_by, 'Test Uploader');
    const msg = evaluate(a.Notify_reviewer.inputs.parameters['body/messageBody'], ctx);
    assert.match(msg, /Contract file could not be read: SYN-BROKEN\.pdf/);
    assert.match(msg, /What to do:/);
    assert.ok(evaluate(a.Uploader_is_someone_else.expression.and[1].not.equals[0], ctx) !== evaluate(a.Uploader_is_someone_else.expression.and[1].not.equals[1], ctx));
  }
  const row = a.Row_exists.else.actions.Add_failure_row.inputs.parameters;
  assert.equal(row['item/cai_reviewstatus'], 'Extraction failed');
  assert.equal(row['item/cai_approvalblocked'], true);
  assert.equal(row['item/ownerid@odata.bind'], "@concat('teams(', outputs('Owner_team_id'), ')')", 'only the owner team sees it, like every other row');
  assert.match(row['item/cai_noticestatus'], /^@concat\('FILE COULD NOT BE READ - NOT IN THE REGISTER\. '/);
  assert.equal(a.Row_exists.actions.Mark_row_failed.inputs.parameters['item/cai_reviewstatus'], 'Extraction failed');
  assert.equal(a.Log_extraction_failure.inputs.parameters.entityName, 'cai_reviews');
  assert.equal(a.Notify_reviewer.inputs.parameters['body/recipient'], "@parameters('cai_ReviewerUpn (cai_ReviewerUpn)')");
  assert.equal(a.End_run_failed.inputs.runStatus, 'Failed');
  assert.equal(rel('ext').properties.connectionReferences.shared_teams.connection.connectionReferenceLogicalName, 'new_sharedteams_8e81b');
});

test('1.0.3.5: rows whose extraction failed get no review card and no calculation; a readable re-upload marks them replaced', () => {
  for (const [k, trig] of [['gate', 'When_a_row_is_added,_modified_or_deleted'], ['eff', 'When_a_contract_review_status_changes']]) {
    const cond = def(rel(k)).triggers[trig].conditions[0].expression;
    for (const [st, run] of [['Pending review', true], ['Approved', true], [null, true], ['Extraction failed', false], ['Extraction failed - replaced', false]]) {
      assert.equal(evaluate(cond, { trigger: { 'body/cai_reviewstatus': st } }), run, `${k} ${st}`);
    }
  }
  const acts = extDef().actions;
  assert.deepEqual(acts.Find_earlier_failures.runAfter, { Apply_to_each: ['Succeeded'] });
  assert.equal(evaluate(acts.Find_earlier_failures.inputs.parameters.$filter, failCtx({}, { outputs: { Owner_team_id: 'team-1' } })),
    "cai_reviewstatus eq 'Extraction failed' and cai_documentname eq 'SYN-BROKEN.pdf' and _ownerid_value eq team-1");
  assert.equal(acts.Mark_earlier_failures_replaced.actions.Mark_replaced.inputs.parameters['item/cai_reviewstatus'], 'Extraction failed - replaced');
});

test('1.0.3.5: the extracted notice days no longer fail the register write, and a missing owner team alerts the admin', () => {
  const p = extDef().actions.Add_a_new_row.inputs.parameters['item/cai_noticedays'];
  const v = (x) => evaluate(p, { body: { Parse_JSON: { renewal: { value: { notice_days: x } } } } });
  assert.equal(v(90), 90); assert.equal(v('90'), 90); assert.equal(v('ninety'), null); assert.equal(v(null), null);
  const br = extDef().actions.Owner_team_configured.actions;
  assert.equal(br.Alert_owner_team_missing.inputs.parameters['body/recipient'], "@parameters('cai_AdminAlertUpn (cai_AdminAlertUpn)')");
  assert.deepEqual(br.Stop_owner_team_missing.runAfter, { Alert_owner_team_missing: ['Succeeded', 'Failed', 'TimedOut'] });
});

// ── Release integrity ──
const actionNames = (acts, out = new Map(), path = '') => {
  for (const [k, v] of Object.entries(acts)) {
    out.set(path + k, JSON.stringify({ ...v, actions: undefined, else: undefined }));
    if (v.actions) actionNames(v.actions, out, `${path}${k}/`);
    if (v.else?.actions) actionNames(v.else.actions, out, `${path}${k}/else/`);
  }
  return out;
};
test('1.0.3.5 changes only the actions it is meant to change', () => {
  const expected = {
    eff: ['Family_owner', 'List_family', 'Report_terms_not_computed', 'Master_exists/Master_approved/Duration_months', 'Master_exists/Master_approved/N_amount_safe',
      'Master_exists/Master_approved/N_days_safe', 'Master_exists/Master_approved/Renewal_months_safe', 'Master_exists/Master_approved/Numbers_unread_all',
      'Master_exists/Master_approved/Numbers_unread', 'Master_exists/Master_approved/N_wording', 'Master_exists/Master_approved/N_legacy_unit',
      'Master_exists/Master_approved/N_amount0', 'Master_exists/Master_approved/N_flag_list', 'Master_exists/Master_approved/Roll_forward',
      'Master_exists/Master_approved/Next_term_end', 'Master_exists/Master_approved/Update_master_terms', 'Init_Eff'],
    ext: ['Add_a_new_row', 'Owner_team_configured/Alert_owner_team_missing', 'Owner_team_configured/Stop_owner_team_missing', 'Find_earlier_failures',
      'Mark_earlier_failures_replaced', 'Report_extraction_failure'],
    gate: [], terms: ['Family_owner', 'Owner_family_rows', 'Other_team_rows', 'Other_team_docs', 'Family_summary', 'Approved_masters', 'Approved_amendments',
      'Approved_master_exists/Is_fresh/Result_OK', 'Approved_master_exists/Is_fresh/else/Result_stale', 'Approved_master_exists/else/Result_no_master',
      'Not_found/Result_not_found', 'Completeness_guard/Result_incomplete'],
    notice: ['References', 'For_each_contract/Master_rows', 'For_each_contract/Amendment_rows'],
  };
  for (const [k, names] of Object.entries(expected)) {
    const a = actionNames(def(base(k)).actions); const b = actionNames(def(rel(k)).actions);
    const changed = [...b.keys()].filter((n) => a.get(n) !== b.get(n)).map((n) => n.split('/').slice(0, n.startsWith('Report_') ? 1 : undefined).join('/'));
    const top = [...new Set(changed.map((n) => (n.startsWith('Report_') || n.startsWith('Mark_earlier') ? n.split('/')[0] : n)))];
    const unexpected = top.filter((n) => !names.includes(n) && !names.some((x) => n.startsWith(`${x}/`)));
    assert.deepEqual(unexpected, [], `${k}: unexpected change ${unexpected}`);
    const removed = [...a.keys()].filter((n) => !b.has(n) && !n.startsWith('Report_terms_not_computed'));
    assert.deepEqual(removed, [], `${k}: removed actions`);
  }
});

test('the committed release files are exactly what the generator makes from the 1.0.3.4 baseline', () => {
  const out = mkdtempSync(join(tmpdir(), 'cai1035-'));
  execFileSync('python3', ['-I', `${DIR}/patch_release_1035.py`, `${DIR}/baseline`, out]);
  const files = readdirSync(out).sort();
  assert.deepEqual(files, readdirSync(`${DIR}/release`).sort());
  for (const f of files) assert.equal(readFileSync(join(out, f), 'utf8'), readFileSync(`${DIR}/release/${f}`, 'utf8'), f);
});
