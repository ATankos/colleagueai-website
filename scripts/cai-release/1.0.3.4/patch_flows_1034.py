"""Release 1.0.3.4 (P0 deadline safeguard) from the 1.0.3.3 solution flows.

  python3 -I patch_flows_1034.py <1.0.3.3 Workflows dir> <out dir>

Rule: a notice deadline is CONFIRMED only when the stored notice period comes from a reviewer-approved record and no
check flag remains. Any flag (conflicting or implausible clauses, business days, unclear reference or timing, wording
that does not state the period, renewal or notice clause not found, 1.0.3.2 record that cannot be re-derived) makes it
NOT VERIFIED: no date is stored or answered, candidates go to the review log only, and the reviewer gets a Teams card
on which only an explicitly confirmed notice period ("6 months", "90 days", "none") makes the deadline CONFIRMED.
"""
import json, sys
from pathlib import Path

SRC = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
FILES = {
    'eff': 'CAICI-Effectiveterms-2BFB2A15-C9D7-F111-84E8-E4FADE0D927F.json',
    'review': 'CAICI-ReviewgateTeams-B3C964D1-A7D7-F111-84E8-E4FADE0D927F.json',
    'nd': 'CAICI-Compute-Noticedeadlines-7F4045FE-F8D9-F111-84E8-000D3A832B24.json',
    'get': 'CAICI-Compute-Geteffectiveterms-4DCE77CB-F9D9-F111-84E8-000D3A832B24.json',
    'daily': 'CAICI-Dailyrecompute-E8D71E13-19D8-F111-84E8-E4FADE0D20C9.json',
}
NV = 'DEADLINE NOT VERIFIED'
DV = "'Deadline not verified — human review required'"
DB = {'apiId': '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
      'connectionName': 'shared_commondataserviceforapps'}


def load(k):
    return json.loads((SRC / FILES[k]).read_text(encoding='utf-8'))


def save(k, obj):
    (OUT / FILES[k]).write_text(json.dumps(obj, ensure_ascii=False), encoding='utf-8')


def compose(expr, after):
    return {'type': 'Compose', 'inputs': expr, 'runAfter': {after: ['Succeeded']}}


def rep(s, old, new, count=1):
    n = s.count(old)
    assert n == count, (n, count, old[:140])
    return s.replace(old, new)


def insert_after(acts, prev, name, action):
    """Insert action `name` after `prev`: whatever ran after prev now runs after name."""
    for a in acts.values():
        if prev in a.get('runAfter', {}):
            a['runAfter'] = {name: ['Succeeded']}
    action['runAfter'] = {prev: ['Succeeded']}
    acts[name] = action


def says(text, n, uw):
    """True when `text` states n <uw>: "(n) uw", " n uw", "n uw" at the start, or the number word (n <= 12)."""
    words = ("createArray('zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', "
             "'eleven', 'twelve')")
    return (f"or(contains({text}, concat('(', string({n}), ') ', {uw})), contains({text}, concat(' ', string({n}), ' ', {uw})), "
            f"startsWith({text}, concat(string({n}), ' ', {uw})), if(lessOrEquals(int({n}), 12), contains({text}, concat({words}[int({n})], ' ', {uw})), false))")


def unit_word(u):
    return f"if(equals({u}, 'business_day'), 'business day', {u})"


def says_unit(text, n, u):
    return f"or({says(text, n, unit_word(u))}, if(equals({u}, 'business_day'), {says(text, n, chr(39) + 'working day' + chr(39))}, false))"


def nunit(x):
    return (f"if(or(contains({x}, 'business'), contains({x}, 'working')), 'business_day', if(contains({x}, 'month'), 'month', "
            f"if(contains({x}, 'year'), 'year', if(contains({x}, 'week'), 'week', if(contains({x}, 'day'), 'day', '')))))")


# ───────────────────────────── Effective terms ─────────────────────────────
eff = load('eff')
A = eff['properties']['definition']['actions']
A['List_family']['inputs']['parameters']['$select'] += ',cai_noticestatus,cai_deadlinereview'
MA = A['Master_exists']['actions']['Master_approved']['actions']
RC = "outputs('N_status')"
NOT_RC = f"not(equals({RC}, 'reviewer_corrected'))"
R = "variables('Eff')?['renewal']"

# a reviewer-confirmed period also confirms the renewal position (status reviewer_corrected counts as found)
MA['Renewal_basis']['inputs'] = rep(MA['Renewal_basis']['inputs'], "createArray('found', 'conflict_resolved')",
                                    "createArray('found', 'conflict_resolved', 'reviewer_corrected')", 3)

# notice clauses whose own quote does not state the period read from them (misread small print, wrong number)
IQ = "toLower(string(coalesce(item()?['quote'], '')))"
IU = "toLower(string(coalesce(item()?['unit'], '')))"
insert_after(MA, 'N_clauses', 'N_clause_mismatch', {'type': 'Query', 'inputs': {
    'from': "@body('N_clauses')",
    'where': f"@not({says_unit(IQ, 'item()?[' + chr(39) + 'amount' + chr(39) + ']', nunit(IU))})"}})

fl = MA['N_flag_list']['inputs']
# flags a reviewer resolves by confirming the period explicitly
fl = rep(fl, "if(and(outputs('Has_notice'), not(contains(createArray('term_end', 'renewal_date', 'term_end_assumed'), outputs('N_reference')))), ",
         f"if(and(outputs('Has_notice'), {NOT_RC}, not(contains(createArray('term_end', 'renewal_date', 'term_end_assumed'), outputs('N_reference')))), ")
fl = rep(fl, "if(and(outputs('Has_notice'), not(contains(createArray('on_or_before', 'before', 'on_or_before_assumed'), outputs('N_timing')))), ",
         f"if(and(outputs('Has_notice'), {NOT_RC}, not(contains(createArray('on_or_before', 'before', 'on_or_before_assumed'), outputs('N_timing')))), ")
fl = rep(fl, "if(and(outputs('Has_notice'), equals(outputs('N_reference'), 'term_end'), contains(outputs('N_lw'), 'renewal date')), ",
         f"if(and(outputs('Has_notice'), {NOT_RC}, equals(outputs('N_reference'), 'term_end'), contains(outputs('N_lw'), 'renewal date')), ")
# wording: no date is shown for a flagged deadline any more
fl = rep(fl, "the date is an estimate without a holiday calendar",
         "a date can only be estimated without a holiday calendar - confirm the period in calendar days after checking holidays")
fl = rep(fl, "the earlier date is shown", "the earlier candidate date is used")
fl = rep(fl, "the date shown is one day earlier than the plain calculation", "the candidate date is one day earlier than the plain calculation")
fl = rep(fl, "the date shown uses the longest period up to 24 months, which gives the earliest date",
         "the earliest candidate uses the longest period up to 24 months")
fl = rep(fl, "it is not used for the date - check the document", "it is not used - check the document")
fl = rep(fl, "the date shown counts back from the end of the term, which can be up to three days earlier",
         "the candidate counts back from the end of the term, which can be up to three days earlier")
AMT, UNIT = "outputs('N_amount')", "outputs('N_unit')"
new_flags = [
    # false negatives: a renewal or notice clause that was not extracted must never look like "no deadline"
    "if(equals(outputs('Renewal_basis'), 'AUTOMATIC_NOTICE_PERIOD_NOT_FOUND'), 'the contract renews automatically but no notice period was "
    "found in the document - a reviewer must check the renewal and notice clauses', '')",
    "if(equals(outputs('Renewal_basis'), 'NO_RENEWAL_CLAUSE_FOUND'), 'no renewal clause was found in the document - a reviewer must check "
    "whether and how the contract renews (confirm none if it does not renew automatically)', '')",
    f"if(and(not(outputs('Has_notice')), {NOT_RC}, greater(length(body('N_clause_objs')), 0), not(equals(toLower(coalesce({R}?['value']?['type'], '')), "
    "'automatic'))), 'notice-of-non-renewal clauses were found although the contract was not read as renewing automatically - a reviewer "
    "must check the renewal clause', '')",
    # a precedence rule applied by the extraction is an interpretation: a reviewer confirms it
    f"if(and(outputs('N_is_new'), equals({RC}, 'conflict_resolved'), greater(length(union(body('N_keys'), body('N_keys'))), 1)), "
    "concat('the document states different notice periods (', join(body('N_conflict_text'), '; '), '); the extraction applied one of them "
    "under the document''s precedence wording - a reviewer must confirm which applies'), '')",
    # the wording kept as evidence must state the period that was read
    # (nested if: and() evaluates every argument, and int() of a missing amount would fail the run)
    f"if(and(outputs('Has_notice'), outputs('N_is_new'), {NOT_RC}, not(outputs('N_use_longest'))), "
    f"if({says_unit("outputs('N_lw')", AMT, UNIT)}, '', concat('the notice clause wording does not state "
    f"the period read from it (', string({AMT}), ' ', replace({UNIT}, '_', ' '), '(s)) - check the document')), '')",
    f"if(and(greater(length(body('N_clause_mismatch')), 0), {NOT_RC}), concat('the wording of ', string(length(body('N_clause_mismatch'))), "
    "' notice clause(s) does not state the period read from it - check the document'), '')",
]
assert fl.endswith(')')
fl = fl[:-1] + ', ' + ', '.join(new_flags) + ')'
MA['N_flag_list']['inputs'] = fl

# verification state and candidate calculations (for the reviewer only)
REF, TIM = "outputs('N_reference')", "outputs('N_timing')"
ANC = f"if(equals({REF}, 'renewal_date'), addDays(outputs('D_anchor'), 1, 'yyyy-MM-dd'), outputs('D_anchor'))"
IA, IUU = "int(item()?['a'])", "item()?['u']"
raw = (f"if(equals({IUU}, 'month'), subtractFromTime({ANC}, {IA}, 'Month', 'yyyy-MM-dd'), "
       f"if(equals({IUU}, 'year'), subtractFromTime({ANC}, {IA}, 'Year', 'yyyy-MM-dd'), "
       f"if(equals({IUU}, 'week'), addDays({ANC}, mul(-7, {IA}), 'yyyy-MM-dd'), "
       f"if(equals({IUU}, 'business_day'), concat('about ', addDays({ANC}, mul(-1, add(div(add(mul({IA}, 7), 4), 5), 4)), 'yyyy-MM-dd'), ' (business days, estimate)'), "
       f"addDays({ANC}, mul(-1, {IA}), 'yyyy-MM-dd')))))")
cand = (f"if(contains(createArray('on_or_before', 'on_or_before_assumed'), {TIM}), {raw}, if(equals({IUU}, 'business_day'), {raw}, "
        f"addDays({raw}, -1, 'yyyy-MM-dd')))")
insert_after(MA, 'N_flags', 'D_unverified', compose("@not(empty(outputs('N_flags')))", 'N_flags'))
insert_after(MA, 'D_unverified', 'D_anchor', compose(
    "@if(empty(coalesce(outputs('Notice_term_end'), '')), variables('CurrentEnd'), outputs('Notice_term_end'))", 'D_unverified'))
# a 1.0.3.2 record has no structured notice period: its period re-derived from the stored wording is the candidate
LEGACY_OBJ = ("if(and(not(outputs('N_is_new')), outputs('Has_notice')), createArray(setProperty(setProperty(setProperty(setProperty(setProperty("
              "json('{}'), 'a', outputs('N_amount')), 'u', outputs('N_unit')), 'd', 0), 'k', concat(string(outputs('N_amount')), ' ', outputs('N_unit'))), "
              "'loc', 'stored by release 1.0.3.2, re-derived from its wording')), json('[]'))")
insert_after(MA, 'D_anchor', 'D_candidates', {'type': 'Select', 'inputs': {'from': f"@union(outputs('N_all'), {LEGACY_OBJ})", 'select': (
    "@concat(replace(item()?['k'], '_', ' '), '(s) (', item()?['loc'], '): ', if(greater(item()?['d'], 731), 'not used - implausible period', "
    f"if(empty(coalesce(outputs('D_anchor'), '')), 'no term end', concat({cand}, ' for the term ending ', outputs('D_anchor')))))")}})
insert_after(MA, 'D_candidates', 'D_candidate_text', compose(
    "@if(equals(length(body('D_candidates')), 0), 'no notice period was read from the document', join(body('D_candidates'), '; '))", 'D_candidates'))

loc = f"{R}?['location']"
unv_basis = ("concat('NOT VERIFIED - no notice deadline is given until a reviewer confirms the notice period, its wording and the calculation. ', "
             f"if(outputs('Has_notice'), concat('Period read from the document: ', string({AMT}), ' ', replace({UNIT}, '_', ' '), '(s). '), "
             "'No usable notice period was read. '), "
             "if(empty(string(outputs('N_wording'))), '', concat('Contract wording: \"', string(outputs('N_wording')), '\"', "
             f"if(empty(coalesce({loc}, '')), '', concat(' (', {loc}, ')')), '. ')), "
             "'Candidate calculations are kept for the reviewer in the review log.')")
b = MA['Deadline_basis']['inputs']
assert b.startswith('@')
MA['Deadline_basis']['inputs'] = f"@if(outputs('D_unverified'), {unv_basis}, {b[1:]})"
MA['Status_text']['inputs'] = rep(MA['Status_text']['inputs'], "concat('NO AUTOMATIC RENEWAL (confirmed by clause) - ', ",
                                  "concat('NO AUTOMATIC RENEWAL (confirmed by ', if(equals(outputs('N_status'), 'reviewer_corrected'), 'reviewer', 'clause'), ') - ', ")
st = MA['Status_text_final']['inputs']
unv_status = (f"concat('{NV} - HUMAN REVIEW REQUIRED. No notice deadline is given until a reviewer confirms the notice period. ', "
              "if(empty(variables('CurrentEnd')), '', concat('Current term ends ', variables('CurrentEnd'), '. ')), 'Why: ', outputs('N_flags'), "
              "if(empty(outputs('Execution_warning')), '', concat(' | ', outputs('Execution_warning'))))")
MA['Status_text_final']['inputs'] = f"@if(outputs('D_unverified'), {unv_status}, {st[1:]})"

up = MA['Update_master_terms']['inputs']['parameters']
up['item/cai_noticedeadline'] = "@if(or(outputs('D_unverified'), empty(outputs('Next_notice_deadline'))), null, outputs('Next_notice_deadline'))"
up['item/cai_noticetermend'] = "@if(or(outputs('D_unverified'), empty(outputs('Notice_term_end'))), null, outputs('Notice_term_end'))"
up['item/cai_previousnoticedeadline'] = "@if(and(not(outputs('D_unverified')), equals(outputs('Previous_cycle_status'), 'MISSED')), outputs('Deadline'), null)"
up['item/cai_previouscyclestatus'] = "@if(outputs('D_unverified'), 'NOT_VERIFIED', outputs('Previous_cycle_status'))"
assert up['item/cai_effnoticedays'].startswith('@')
up['item/cai_effnoticedays'] = "@if(outputs('D_unverified'), null, " + up['item/cai_effnoticedays'][1:] + ")"

# audit row whenever a stored deadline is replaced or withdrawn by release 1.0.3.4
OLD = "outputs('Master_row')?['cai_noticedeadline']"
NEWDL = "if(outputs('D_unverified'), '', coalesce(outputs('Next_notice_deadline'), ''))"
ir = MA.pop('If_recalculated_by_1033')
ir['expression'] = {'and': [
    {'equals': [f"@empty(coalesce({OLD}, ''))", False]},
    {'equals': ["@or(empty(coalesce(outputs('Master_row')?['cai_deadlinebasis'], '')), outputs('D_unverified'))", True]},
    {'not': {'equals': [f"@substring(string({OLD}), 0, 10)", f"@{NEWDL}"]}},
]}
lp = ir['actions']['Log_recalculation']['inputs']['parameters']
lp['item/cai_title'] = ("@concat(outputs('Master_reference'), if(outputs('D_unverified'), ' - notice deadline withdrawn until a reviewer confirms it (release 1.0.3.4)', "
                        "' - notice deadline recalculated by release 1.0.3.4'))")
lp['item/cai_decision'] = "@if(outputs('D_unverified'), 'Deadline withdrawn - not verified (release 1.0.3.4)', 'Deadline recalculated (release 1.0.3.4)')"
lp['item/cai_source'] = 'Release 1.0.3.4 recalculation'
for k in ('item/cai_comment', 'item/cai_correctionsjson'):
    lp[k] = rep(lp[k], "coalesce(outputs('Next_notice_deadline'), 'none')" if k == 'item/cai_comment' else "coalesce(outputs('Next_notice_deadline'), '')",
                "if(outputs('D_unverified'), 'NOT VERIFIED', coalesce(outputs('Next_notice_deadline'), 'none'))", 2 if k == 'item/cai_comment' else 1)
MA['If_recalculated_by_1034'] = ir

# review-required alert: one review log entry and one Teams card per new or changed unverified state (never a reminder date)
NEWREV = "if(empty(outputs('N_flags')), '', substring(outputs('N_flags'), 0, min(length(outputs('N_flags')), 1900)))"
cmt = ("concat('Candidate calculations (not deadlines, for the reviewer only): ', outputs('D_candidate_text'), '. Reasons: ', outputs('N_flags'), "
       "'. Contract wording: \"', string(outputs('N_wording')), '\"')")
MA['If_deadline_needs_review'] = {
    'type': 'If',
    'expression': {'and': [
        {'equals': ["@outputs('D_unverified')", True]},
        {'or': [
            {'equals': [f"@startsWith(coalesce(outputs('Master_row')?['cai_noticestatus'], ''), '{NV}')", False]},
            {'not': {'equals': ["@coalesce(outputs('Master_row')?['cai_deadlinereview'], '')", f"@{NEWREV}"]}},
        ]},
    ]},
    'actions': {
        'Log_deadline_review': {'type': 'OpenApiConnection', 'inputs': {'parameters': {
            'entityName': 'cai_reviews',
            'item/cai_Contract@odata.bind': "@concat('cai_contracts(', outputs('Master_row')?['cai_contractid'], ')')",
            'item/cai_title': "@concat(outputs('Master_reference'), ' - deadline not verified, reviewer confirmation requested')",
            'item/cai_decision': 'Deadline not verified - review requested',
            'item/cai_reviewer': 'CAI Contract Intelligence (system)',
            'item/cai_decidedon': '@utcNow()',
            'item/cai_source': 'Release 1.0.3.4 deadline safeguard',
            'item/cai_comment': f"@substring({cmt}, 0, min(3990, length({cmt})))",
            'item/cai_correctionsjson': ("@{string(setProperty(setProperty(setProperty(setProperty(json('{\"schema\":\"cai.deadlineverification.v1\","
                                         "\"note\":\"candidates are not deadlines\"}'), 'candidates', body('D_candidates')), 'reasons', outputs('N_flags')), "
                                         "'term_end', outputs('D_anchor')), 'wording', string(outputs('N_wording'))))}"),
        }, 'host': dict(DB, operationId='CreateRecord')}, 'runAfter': {}},
        'Request_deadline_review': {'type': 'OpenApiConnection', 'inputs': {'parameters': {
            'entityName': 'cai_contracts',
            'recordId': "@outputs('Master_row')?['cai_contractid']",
            'item/cai_reviewrequestedon': '@utcNow()',
        }, 'host': dict(DB, operationId='UpdateOnlyRecord')}, 'runAfter': {'Log_deadline_review': ['Succeeded']}},
    },
    'else': {'actions': {}},
    'runAfter': {'If_recalculated_by_1034': ['Succeeded']},
}
MA['Mark_other_masters_superseded']['runAfter'] = {'If_deadline_needs_review': ['Succeeded']}
save('eff', eff)

# ───────────────────────────── Review gate ─────────────────────────────
rv = load('review')
RA = rv['properties']['definition']['actions']
TR = "triggerOutputs()?['body/{}']"
ESC = lambda e: f"replace(replace(replace(string({e}), '\\', '\\\\'), '\"', '\\\"'), decodeUriComponent('%0A'), ' ')"
insert_after(RA, 'Claim_review_request', 'Deadline_mode', compose(
    f"@and(equals({TR.format('cai_reviewstatus')}, 'Approved'), startsWith(coalesce({TR.format('cai_noticestatus')}, ''), '{NV}'))",
    'Claim_review_request'))
insert_after(RA, 'Deadline_mode', 'Deadline_request', {'type': 'OpenApiConnection', 'inputs': {'parameters': {
    'entityName': 'cai_reviews', '$select': 'cai_comment,createdon',
    '$filter': f"@concat('_cai_contract_value eq ', {TR.format('cai_contractid')}, ' and cai_decision eq ''Deadline not verified - review requested''')",
    '$orderby': 'createdon desc', '$top': 1}, 'host': dict(DB, operationId='ListRecords')}})
dm_text = ('This contract is approved, but its notice deadline is withheld from users until you confirm it. Open the document and check '
           'every notice clause. Then choose Notice period - applied at once, enter the period that applies (for example 6 months or 90 days, '
           'or none if the contract does not renew automatically), tick the confirmation and submit Approve. Submitting without a confirmed '
           'notice period leaves the deadline NOT VERIFIED.')
dm_part = ("if(outputs('Deadline_mode'), concat('{\"type\":\"Container\",\"style\":\"attention\",\"items\":[{\"type\":\"TextBlock\",\"wrap\":true,"
           "\"weight\":\"Bolder\",\"color\":\"Attention\",\"text\":\"DEADLINE NOT VERIFIED — human review required\"},{\"type\":\"TextBlock\","
           "\"wrap\":true,\"text\":\"" + dm_text + "\"},{\"type\":\"TextBlock\",\"wrap\":true,\"size\":\"Small\",\"text\":\"**Why:** ', "
           + ESC(f"coalesce({TR.format('cai_deadlinereview')}, '')") + ", '\"},{\"type\":\"TextBlock\",\"wrap\":true,\"size\":\"Small\","
           "\"text\":\"**', " + ESC("coalesce(first(body('Deadline_request')?['value'])?['cai_comment'], 'Candidate calculations: not available')") +
           ", '**\"}]},'), '')")
cb = RA['Card_banner']['inputs']
assert cb.startswith('@concat(')
RA['Card_banner']['inputs'] = '@concat(' + dm_part + ', ' + cb[len('@concat('):]
cc = RA['Card_correction']['inputs']
cc = rep(cc, 'A Notice period correction (for example 6 months or 90 days) or an Effective date correction (YYYY-MM-DD) is applied at once: '
             'the extracted value and its evidence are kept, the corrected value is used and recorded with your name, and Approve still approves. '
             'Any other correction records this review as Needs correction and blocks approval until it is resolved.',
         'A notice deadline becomes CONFIRMED only through a Notice period you confirm here: choose Notice period - applied at once, enter '
         'the period (for example 6 months or 90 days, or none if the contract does not renew automatically) and tick the confirmation. '
         'Business days cannot be confirmed by calculation: enter the calendar days you have checked. An Effective date correction '
         '(YYYY-MM-DD) is applied at once. The extracted values and their evidence are kept and your correction is recorded with your name. '
         'A Notice period without the confirmation, and any other correction, records this review as Needs correction and blocks approval '
         'until it is resolved.')
cc = rep(cc, '{"type":"Input.Text","id":"comment"',
         '{"type":"Input.Toggle","id":"notice_confirmed","title":"I have checked this notice period against the original wording in the '
         'document and the calculation (notice deadline = term end, or renewal date, minus this period)","value":"false","valueOn":"true",'
         '"valueOff":"false","wrap":true},{"type":"Input.Text","id":"comment"')
RA['Card_correction']['inputs'] = cc
RA['Submitted']['inputs']['notice_confirmed'] = ("@toLower(string(coalesce(body('Post_adaptive_card_and_wait_for_a_response')?['data']?['notice_confirmed'], "
                                                 "'false')))")
RA['Current_row']['inputs']['parameters']['$select'] += ',cai_noticestatus'
RA['Is_current_request']['inputs'] = (
    "@and(equals(body('Current_row')?['cai_activereviewrequest'], outputs('Request_id')), or(equals(body('Current_row')?['cai_reviewstatus'], "
    f"'Pending review'), and(equals(body('Current_row')?['cai_reviewstatus'], 'Approved'), startsWith(coalesce(body('Current_row')?['cai_noticestatus'], ''), '{NV}'))))")
IC = RA['If_current_request']['actions']
V, F = "outputs('Submitted')?['value']", "outputs('Submitted')?['field']"
CONF = "equals(outputs('Submitted')?['notice_confirmed'], 'true')"
ac = IC['Applied_correction']['inputs']
ac['notice_ok'] = "@and(" + ac['notice_ok'][1:] + f", {CONF})"
ac['none_ok'] = (f"@and(equals({F}, 'notice_period'), contains(createArray('none', 'no renewal', 'no automatic renewal', 'does not renew'), "
                 f"toLower(trim({V}))), {CONF})")
IC['Applied']['inputs'] = ("@or(outputs('Applied_correction')?['notice_ok'], outputs('Applied_correction')?['none_ok'], "
                           "outputs('Applied_correction')?['date_ok'])")
insert_after(IC, 'Blocking_correction', 'Deadline_mode_now', compose(
    f"@and(equals(body('Current_row')?['cai_reviewstatus'], 'Approved'), startsWith(coalesce(body('Current_row')?['cai_noticestatus'], ''), '{NV}'))",
    'Blocking_correction'))
dr = IC['Decision_rule']['inputs']
IC['Decision_rule']['inputs'] = ("@if(and(outputs('Deadline_mode_now'), equals(outputs('Final_decision'), 'Approved'), not(outputs('Applied'))), "
                                 "'Approved - the notice deadline stays NOT VERIFIED: no confirmed notice period was submitted (choose Notice period - "
                                 "applied at once, enter the period and tick the confirmation).', " + dr[1:] + ")")
EXT = "json(coalesce(triggerOutputs()?['body/cai_extractionjson'], '{}'))"
OV = "json(coalesce(body('Current_row')?['cai_reviewedvaluesjson'], '{}'))"
BASE_R = f"coalesce({OV}?['renewal'], {EXT}?['renewal'], json('{{}}'))"
NONE_R = (f"setProperty(setProperty(setProperty(setProperty({BASE_R}, 'value', setProperty(removeProperty(removeProperty(setProperty("
          f"coalesce({BASE_R}?['value'], json('{{}}')), 'type', 'none'), 'notice_period'), 'notice_days'), 'extracted', coalesce({BASE_R}?['value'], json('{{}}')))), "
          "'status', 'reviewer_corrected'), 'corrected_by', outputs('Submitted')?['reviewer']), 'corrected_on', utcNow())")
ov = IC['Overlay']['inputs']
assert ov.startswith('@if(')
IC['Overlay']['inputs'] = f"@if(outputs('Applied_correction')?['none_ok'], setProperty({OV}, 'renewal', {NONE_R}), {ov[1:]})"
IC['Add_a_new_row']['inputs']['parameters']['item/cai_decision'] = (
    "@if(and(outputs('Applied'), equals(outputs('Final_decision'), 'Approved')), if(and(outputs('Deadline_mode_now'), "
    "or(outputs('Applied_correction')?['notice_ok'], outputs('Applied_correction')?['none_ok'])), 'Notice period confirmed by reviewer', "
    "'Approved with reviewer correction'), outputs('Final_decision'))")
rr = IC['Review_record']['inputs']
rr['notice_period_confirmed'] = "@or(outputs('Applied_correction')?['notice_ok'], outputs('Applied_correction')?['none_ok'])"
rr['deadline_verification_card'] = "@outputs('Deadline_mode_now')"
save('review', rv)

# ───────────────────────────── Compute - Notice deadlines ─────────────────────────────
nd = load('nd')
NA = nd['properties']['definition']['actions']
M = "first(body('Master_rows'))?['{}']"
U = (f"or(startsWith(coalesce({M.format('cai_noticestatus')}, ''), '{NV}'), not(empty(coalesce({M.format('cai_deadlinereview')}, ''))), "
     f"and(not(empty(coalesce({M.format('cai_noticedeadline')}, ''))), empty(coalesce({M.format('cai_deadlinebasis')}, ''))))")
OLD_SUMMARY = ("'DEADLINE NOT VERIFIED - HUMAN REVIEW REQUIRED. The stored deadline was calculated by an earlier release or needs a human check; "
               "it is withheld until the register recalculates it and a reviewer confirms it.'")
en = NA['For_each_contract']['actions']['Entry']['inputs']
en['notice_deadline'] = f"@if({U}, null, {M.format('cai_noticedeadline')})"
en['stops_renewal_on'] = f"@if({U}, null, {M.format('cai_noticetermend')})"
en['previous_cycle_status'] = f"@if({U}, 'NOT_VERIFIED', coalesce({M.format('cai_previouscyclestatus')}, 'NOT_APPLICABLE'))"
en['previous_notice_deadline'] = f"@if({U}, null, {M.format('cai_previousnoticedeadline')})"
en['register_summary'] = (f"@if({U}, if(startsWith(coalesce({M.format('cai_noticestatus')}, ''), '{NV}'), {M.format('cai_noticestatus')}, {OLD_SUMMARY}), "
                          f"{M.format('cai_noticestatus')})")
en['deadline_basis'] = f"@if({U}, null, {M.format('cai_deadlinebasis')})"
en['deadline_verification'] = f"@if({U}, 'NOT VERIFIED', if(empty(coalesce({M.format('cai_noticedeadline')}, '')), 'NO DEADLINE', 'CONFIRMED'))"
NA['No_deadline']['inputs']['where'] = "@and(empty(coalesce(item()?['notice_deadline'], '')), not(equals(item()?['deadline_verification'], 'NOT VERIFIED')))"
insert_after(NA, 'No_deadline', 'Not_verified', {'type': 'Query', 'inputs': {
    'from': "@body('Fresh')", 'where': "@equals(item()?['deadline_verification'], 'NOT VERIFIED')"}})
sel = NA['In_window_list']['inputs']['select']
sel['deadline_status'] = 'CONFIRMED'
sel.pop('deadline_review', None)
insert_after(NA, 'No_deadline_list', 'Not_verified_list', {'type': 'Select', 'inputs': {'from': "@body('Not_verified')", 'select': {
    'contract_reference': "@item()?['contract_reference']", 'document': "@item()?['document']",
    'deadline_status': DV[1:-1], 'notice_deadline': None,
    'reason': "@coalesce(item()?['deadline_review'], item()?['register_summary'])",
    'current_term_end': "@item()?['current_term_end']", 'notice_wording': "@item()?['notice_wording']",
    'execution_status': "@item()?['execution_status']", 'execution_warning': "@item()?['execution_warning']"}}})
res = NA['Result']['inputs']
res['count_not_verified'] = "@length(body('Not_verified_list'))"
res['deadlines_not_verified'] = "@body('Not_verified_list')"
res['rule'] = rep(res['rule'], ' Each deadline is a calendar calculation from the stored notice period (amount and unit as stated in the contract), '
                  'shown with the contract wording and the calculation basis; a PROVISIONAL deadline must be checked by a person. This is not legal advice.',
                  ' Only CONFIRMED deadlines are listed with a date: a calendar calculation from a reviewer-approved notice period, shown with the '
                  'contract wording and the calculation basis. A deadline that a reviewer has not confirmed is listed under deadlines_not_verified '
                  'with no date: say "Deadline not verified — human review required" and give no date. This is not legal advice.')
save('nd', nd)

# ───────────────────────────── Compute - Get effective terms ─────────────────────────────
gt = load('get')
FR = gt['properties']['definition']['actions']['Approved_master_exists']['actions']['Is_fresh']['actions']
MM = "outputs('Master')?['{}']"
insert_after(FR, 'Changed_by_amendment', 'Unverified', compose(
    f"@or(startsWith(coalesce({MM.format('cai_noticestatus')}, ''), '{NV}'), not(empty(coalesce({MM.format('cai_deadlinereview')}, ''))), "
    f"and(not(empty(coalesce({MM.format('cai_noticedeadline')}, ''))), empty(coalesce({MM.format('cai_deadlinebasis')}, ''))))", 'Changed_by_amendment'))
ok = FR['Result_OK']['inputs']
ren = ok['renewal']
UV = "outputs('Unverified')"
ren['effective_notice_days'] = f"@if({UV}, null, {MM.format('cai_effnoticedays')})"
pc = ren['previous_cycle']
pc['status'] = f"@if({UV}, 'NOT_VERIFIED', coalesce({MM.format('cai_previouscyclestatus')}, 'NOT_APPLICABLE'))"
pc['notice_deadline'] = f"@if({UV}, null, {MM.format('cai_previousnoticedeadline')})"
pc['applies_to_term_ending'] = f"@if(or({UV}, not(equals({MM.format('cai_previouscyclestatus')}, 'MISSED'))), null, {MM.format('cai_currenttermend')})"
nn = ren['next_notice']
for k in ('status', 'notice_deadline', 'days_left', 'stops_renewal_on'):
    assert nn[k].startswith('@')
nn['status'] = f"@if({UV}, 'NOT_VERIFIED', {nn['status'][1:]})"
nn['notice_deadline'] = f"@if({UV}, null, {nn['notice_deadline'][1:]})"
nn['days_left'] = f"@if({UV}, null, {nn['days_left'][1:]})"
nn['stops_renewal_on'] = f"@if({UV}, null, {nn['stops_renewal_on'][1:]})"
ren['register_summary'] = (f"@if({UV}, if(startsWith(coalesce({MM.format('cai_noticestatus')}, ''), '{NV}'), {MM.format('cai_noticestatus')}, {OLD_SUMMARY}), "
                           f"{MM.format('cai_noticestatus')})")
ren['deadline_basis'] = f"@if({UV}, null, {MM.format('cai_deadlinebasis')})"
ren['deadline_status'] = f"@if({UV}, {DV}, if(empty(coalesce({MM.format('cai_noticedeadline')}, '')), 'NO NOTICE DEADLINE', 'CONFIRMED'))"
ok['rule'] = rep(ok['rule'], ' Notice deadlines are calendar calculations from the notice period as stated (amount and unit), shown with the '
                 'contract wording and the calculation basis; a PROVISIONAL deadline must be checked by a person. This is not legal advice.',
                 ' A notice deadline is given only when it is CONFIRMED: a calendar calculation from a reviewer-approved notice period, shown with '
                 'the contract wording and the calculation basis. When deadline_status is "Deadline not verified — human review required", no '
                 'deadline date is given and none may be worked out. This is not legal advice.')
save('get', gt)

# ───────────────────────────── Daily recompute ─────────────────────────────
dl = load('daily')
DM = dl['properties']['definition']['actions']['Main']['actions']
lm = DM['List_masters']['inputs']['parameters']
lm['$filter'] = rep(lm['$filter'], "' or cai_termscomputedon eq null)'",
                    "' or cai_termscomputedon eq null or (cai_noticedeadline ne null and (cai_deadlinereview ne null or cai_deadlinebasis eq null)))'")
alert = DM['If_failed_alert']['actions']['Alert_admin']
DM['List_unverified'] = {'type': 'OpenApiConnection', 'runAfter': {'If_failed_alert': ['Succeeded']}, 'inputs': {'parameters': {
    'entityName': 'cai_contracts', '$select': 'cai_contractreference,cai_documentname,cai_currenttermend',
    '$filter': f"cai_documentrole eq 'master' and cai_reviewstatus eq 'Approved' and startswith(cai_noticestatus,'{NV}')",
    '$orderby': 'cai_currenttermend asc', '$top': 50}, 'host': dict(DB, operationId='ListRecords')}}
DM['Unverified_lines'] = {'type': 'Select', 'runAfter': {'List_unverified': ['Succeeded']}, 'inputs': {
    'from': "@body('List_unverified')?['value']",
    'select': "@concat('<li>', coalesce(item()?['cai_contractreference'], ''), ' - current term ends ', coalesce(item()?['cai_currenttermend'], 'unknown'), '</li>')"}}
DM['If_unverified'] = {'type': 'If', 'runAfter': {'Unverified_lines': ['Succeeded']},
                       'expression': {'greater': ["@length(body('Unverified_lines'))", 0]},
                       'actions': {'Remind_reviewer': {'type': 'OpenApiConnection', 'runAfter': {}, 'inputs': {
                           'host': alert['inputs']['host'],
                           'parameters': {'poster': 'Flow bot', 'location': 'Chat with Flow bot',
                                          'body/recipient': "@parameters('cai_ReviewerUpn (cai_ReviewerUpn)')",
                                          'body/messageBody': ("@concat('<p><b>CAI Contract Intelligence - ', string(length(body('Unverified_lines'))), "
                                                               "' notice deadline(s) not verified - human review required</b></p><p>These approved contracts have "
                                                               "no confirmed notice deadline. Users see \"Deadline not verified - human review required\" and no "
                                                               "date until you confirm the notice period on the review card in Teams.</p><ul>', "
                                                               "join(body('Unverified_lines'), ''), '</ul>')")}}}},
                       'else': {'actions': {}}}
pars = dl['properties']['definition'].setdefault('parameters', {})
if 'cai_ReviewerUpn (cai_ReviewerUpn)' not in pars:
    pars['cai_ReviewerUpn (cai_ReviewerUpn)'] = json.loads(json.dumps(
        load('review')['properties']['definition']['parameters']['cai_ReviewerUpn (cai_ReviewerUpn)']))
save('daily', dl)

# expression length guard (8,192 characters per expression)
for k in FILES:
    def walk(x, path=''):
        if isinstance(x, dict):
            for kk, vv in x.items():
                walk(vv, path + '/' + kk)
        elif isinstance(x, list):
            for i, vv in enumerate(x):
                walk(vv, f'{path}[{i}]')
        elif isinstance(x, str) and x.startswith('@') and len(x) > 7000:
            print('LONG', k, path, len(x))
            assert len(x) < 8192, (k, path, len(x))
    walk(json.loads((OUT / FILES[k]).read_text(encoding='utf-8')))
print('written', sorted(p.name for p in OUT.iterdir()))
