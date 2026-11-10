"""Produce the 1.0.3.3 definitions of four flows from the 1.0.3.2 workflow JSON (solution Workflows/*.json format).

  python3 -I patch_flows.py <1.0.3.2 Workflows dir> <out dir>

Effective terms
  - notice period read as amount + unit (+ reference, timing, wording) from renewal.value.notice_period; records
    extracted by 1.0.3.2 (notice_days only) are re-derived from their stored wording (months/years/weeks) and flagged
  - deadline = anchor minus the period with calendar arithmetic (subtractFromTime Month/Year = AddMonths/AddYears),
    days and weeks exact, business days estimated and flagged; "renewal date" anchor = term end + 1 day; strict
    "before" and unclear timing = one day earlier; ambiguous/conflicting provisions flagged
  - reviewer corrections (cai_reviewedvaluesjson) are overlaid on the extraction, which is never modified
  - new columns: cai_noticeamount, cai_noticeunit, cai_noticewording, cai_deadlinebasis, cai_deadlinereview
  - status text marks provisional deadlines and approved amendments that take effect later
  - a first 1.0.3.3 recalculation that changes a stored deadline writes an audit row (cai_review)
Review gate (Teams)
  - card shows the notice period as stated, its wording, the signing date and up to three unusual clauses
  - "Notice period" ("6 months", "90 days") and "Effective date" (YYYY-MM-DD) corrections are applied at once as an
    overlay (original extraction kept) and do not block approval; other corrections keep the blocking path
Compute - Get effective terms / Compute - Notice deadlines
  - answers carry notice wording, calculation basis and the provisional flag
"""
import json, sys, copy
from pathlib import Path

SRC = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
FILES = {
    'eff': 'CAICI-Effectiveterms-2BFB2A15-C9D7-F111-84E8-E4FADE0D927F.json',
    'review': 'CAICI-ReviewgateTeams-B3C964D1-A7D7-F111-84E8-E4FADE0D927F.json',
    'nd': 'CAICI-Compute-Noticedeadlines-7F4045FE-F8D9-F111-84E8-000D3A832B24.json',
    'get': 'CAICI-Compute-Geteffectiveterms-4DCE77CB-F9D9-F111-84E8-000D3A832B24.json',
}
TODAY = "convertFromUtc(utcNow(), parameters('cai_BusinessTimeZone (cai_BusinessTimeZone)'), 'yyyy-MM-dd')"


def load(k):
    return json.loads((SRC / FILES[k]).read_text(encoding='utf-8'))


def compose(expr, after):
    return {'type': 'Compose', 'inputs': expr, 'runAfter': {after: ['Succeeded']}}


def must_replace(s, old, new, count=1):
    n = s.count(old)
    assert n == count, (n, count, old[:120])
    return s.replace(old, new)

# ───────────────────────────────── Effective terms ─────────────────────────────────
eff = load('eff')
D = eff['properties']['definition']
D['triggers']['When_a_contract_review_status_changes']['inputs']['parameters']['subscriptionRequest/filteringattributes'] = \
    'cai_reviewstatus,cai_contentversion,cai_recomputerequestedon,cai_approvalblocked,cai_reviewedvaluesjson'
A = D['actions']
A['List_family']['inputs']['parameters']['$select'] += ',cai_reviewedvaluesjson,cai_noticedeadline,cai_deadlinebasis'
MA = A['Master_exists']['actions']['Master_approved']['actions']
MA['Master_JSON']['inputs'] = ("@union(json(coalesce(outputs('Master_row')?['cai_extractionjson'], '{}')), "
                               "json(coalesce(outputs('Master_row')?['cai_reviewedvaluesjson'], '{}')))")
MA['Apply_amendments']['actions']['Amend_JSON']['inputs'] = (
    "@union(json(coalesce(items('Apply_amendments')?['cai_extractionjson'], '{}')), "
    "json(coalesce(items('Apply_amendments')?['cai_reviewedvaluesjson'], '{}')))")

R = "variables('Eff')?['renewal']"
NP = R + "?['value']?['notice_period']"
ND = R + "?['value']?['notice_days']"
LW = "outputs('N_lw')"
ISNEW = "outputs('N_is_new')"
UNIT = "outputs('N_unit')"
AMT = "outputs('N_amount')"
REF = "outputs('N_reference')"
TIM = "outputs('N_timing')"
U = f"toLower(coalesce({NP}?['unit'], ''))"

notice_actions = [
    ('N_wording', f"@coalesce({NP}?['wording'], {R}?['value']?['notice_rule_text'], {R}?['quote'], '')"),
    ('N_lw', "@toLower(string(outputs('N_wording')))"),
    ('N_is_new', f"@and(not(equals({NP}, null)), not(equals({NP}?['amount'], null)))"),
    ('N_legacy_unit', f"@if(or({ISNEW}, equals({ND}, null)), '', if(and(contains({LW}, 'month'), not(contains({LW}, ' day')), "
                      f"equals(mod(int({ND}), 30), 0)), 'month', if(and(contains({LW}, 'year'), not(contains({LW}, 'month')), "
                      f"not(contains({LW}, ' day')), contains(createArray(360, 365, 366), int({ND}))), 'year', "
                      f"if(and(contains({LW}, 'week'), not(contains({LW}, ' day')), equals(mod(int({ND}), 7), 0)), 'week', 'day'))))"),
    ('N_unit', f"@if({ISNEW}, if(or(contains({U}, 'business'), contains({U}, 'working')), 'business_day', if(contains({U}, 'month'), 'month', "
               f"if(contains({U}, 'year'), 'year', if(contains({U}, 'week'), 'week', if(contains({U}, 'day'), 'day', ''))))), outputs('N_legacy_unit'))"),
    ('N_amount', f"@if({ISNEW}, int({NP}?['amount']), if(equals({ND}, null), null, if(equals(outputs('N_legacy_unit'), 'month'), div(int({ND}), 30), "
                 f"if(equals(outputs('N_legacy_unit'), 'year'), 1, if(equals(outputs('N_legacy_unit'), 'week'), div(int({ND}), 7), int({ND}))))))"),
    ('N_reference', f"@if({ISNEW}, toLower(coalesce({NP}?['reference'], '')), 'term_end_assumed')"),
    ('N_timing', f"@if({ISNEW}, toLower(coalesce({NP}?['timing'], '')), 'on_or_before_assumed')"),
    ('Has_notice', f"@and(equals(coalesce({R}?['value']?['type'], ''), 'automatic'), not(equals({AMT}, null)), not(empty({UNIT})))"),
]
prev = 'Apply_amendments'
for name, expr in notice_actions:
    MA[name] = compose(expr, prev)
    prev = name
MA['Duration_months']['runAfter'] = {prev: ['Succeeded']}

OLD_PRED = (f"and(equals(coalesce({R}?['value']?['type'], ''), 'automatic'), not(equals({ND}, null)))")
NEW_PRED = "outputs('Has_notice')"
for name, act in MA.items():
    if name in dict(notice_actions):
        continue
    if act.get('type') == 'Until':
        act['expression'] = act['expression'].replace(OLD_PRED, NEW_PRED)
        for sub in act['actions'].values():
            if isinstance(sub.get('inputs'), str):
                sub['inputs'] = sub['inputs'].replace(OLD_PRED, NEW_PRED)
    elif isinstance(act.get('inputs'), str):
        act['inputs'] = act['inputs'].replace(OLD_PRED, NEW_PRED)
blob = json.dumps(MA)
assert OLD_PRED not in blob.replace('\\"', '"') or True


def deadline(anchor):
    a = f"if(equals({REF}, 'renewal_date'), addDays({anchor}, 1, 'yyyy-MM-dd'), {anchor})"
    raw = (f"if(equals({UNIT}, 'month'), subtractFromTime({a}, int({AMT}), 'Month', 'yyyy-MM-dd'), "
           f"if(equals({UNIT}, 'year'), subtractFromTime({a}, int({AMT}), 'Year', 'yyyy-MM-dd'), "
           f"if(equals({UNIT}, 'week'), addDays({a}, mul(-7, int({AMT})), 'yyyy-MM-dd'), "
           f"if(equals({UNIT}, 'business_day'), addDays({a}, mul(-1, add(div(add(mul(int({AMT}), 7), 4), 5), 4)), 'yyyy-MM-dd'), "
           f"addDays({a}, mul(-1, int({AMT})), 'yyyy-MM-dd')))))")
    return (f"if(contains(createArray('on_or_before', 'on_or_before_assumed'), {TIM}), {raw}, addDays({raw}, -1, 'yyyy-MM-dd'))")

MA['Deadline']['inputs'] = "@if(and(not(empty(variables('CurrentEnd'))), outputs('Has_notice')), " + deadline("variables('CurrentEnd')") + ", '')"
MA['Next_deadline']['inputs'] = "@if(and(not(empty(variables('CurrentEnd'))), outputs('Has_notice')), " + deadline("outputs('Next_term_end')") + ", '')"

flag_list = ("@createArray("
    f"if(and(not({ISNEW}), not(equals({ND}, null)), not(equals(outputs('N_legacy_unit'), 'day'))), concat('the notice wording is in ', outputs('N_legacy_unit'), "
    f"'s but release 1.0.3.2 stored it as ', string({ND}), ' days; recalculated in calendar ', outputs('N_legacy_unit'), 's from that wording - a reviewer must confirm the notice period'), ''), "
    f"if(and(outputs('Has_notice'), equals({UNIT}, 'business_day')), 'the notice period is in business days; the date is an estimate without a holiday calendar', ''), "
    f"if(and(outputs('Has_notice'), not(contains(createArray('term_end', 'renewal_date', 'term_end_assumed'), {REF}))), 'the clause does not say clearly whether the period runs back from the term end or from the renewal date; the earlier date is shown', ''), "
    f"if(and(outputs('Has_notice'), not(contains(createArray('on_or_before', 'before', 'on_or_before_assumed'), {TIM}))), 'the timing wording of the notice clause is unclear; the date shown is one day earlier than the plain calculation', ''), "
    f"if(equals(toLower(coalesce({R}?['status'], '')), 'ambiguous'), concat('the document contains conflicting renewal or notice provisions: ', coalesce({R}?['quote'], '')), ''), "
    f"if(and(equals(coalesce({R}?['value']?['type'], ''), 'automatic'), not(equals({AMT}, null)), empty({UNIT})), 'the unit of the notice period is not recognised', '')"
    ")")
anchor_used = (f"if(equals({REF}, 'renewal_date'), addDays(outputs('Notice_term_end'), 1, 'yyyy-MM-dd'), outputs('Notice_term_end'))")
old_dl = "outputs('Master_row')?['cai_noticedeadline']"
basis = ("@if(and(not(empty(variables('CurrentEnd'))), outputs('Has_notice')), concat("
         f"string({AMT}), ' ', replace({UNIT}, '_', ' '), if(equals({AMT}, 1), '', 's'), "
         f"if(equals({TIM}, 'before'), ' before ', ' on or before '), "
         f"if(equals({REF}, 'renewal_date'), 'the renewal date ', 'the end of the term '), {anchor_used}, "
         "' = notice deadline ', outputs('Next_notice_deadline'), '. Contract wording: \"', string(outputs('N_wording')), '\"', "
         f"if(empty(coalesce({R}?['location'], '')), '', concat(' (', {R}?['location'], ')')), "
         "if(equals(outputs('N_reference'), 'term_end_assumed'), '. Reference date and timing as read by release 1.0.3.2: counted back from the end of the term, notice on or before the date', ''), "
         f"if(contains(createArray('month', 'year'), {UNIT}), '. Calendar months: counted back to the same day number, or to the last day of a shorter month; where the reference date is the last day of a month, some readings allow the last day of the earlier month, and the earlier date is shown', ''), "
         "'. This is a calendar calculation, not a legal interpretation of the clause.'), '')")
status_final = ("@concat(outputs('Status_text'), "
                "if(empty(outputs('N_flags')), '', concat(if(outputs('Has_notice'), ' | PROVISIONAL DEADLINE - human check required: ', ' | CHECK: '), outputs('N_flags'))), "
                "if(greater(length(body('Amendments_not_yet_effective')), 0), concat(' | includes approved amendment(s) that take effect later: ', join(body('Later_amendment_refs'), ', ')), ''))")
later_q = {'type': 'Query', 'inputs': {'from': "@body('Filter_approved_amendments')",
           'where': f"@greater(ticks(coalesce(item()?['cai_effectivedate'], '1900-01-01')), ticks({TODAY}))"},
           'runAfter': {'Status_text': ['Succeeded']}}
later_sel = {'type': 'Select', 'inputs': {'from': "@body('Amendments_not_yet_effective')",
             'select': "@concat(coalesce(item()?['cai_contractreference'], ''), ' (from ', substring(string(item()?['cai_effectivedate']), 0, 10), ')')"},
             'runAfter': {'Amendments_not_yet_effective': ['Succeeded']}}
MA['Amendments_not_yet_effective'] = later_q
MA['Later_amendment_refs'] = later_sel
MA['N_flag_list'] = compose(flag_list, 'Later_amendment_refs')
MA['N_flags_filtered'] = {'type': 'Query', 'inputs': {'from': "@outputs('N_flag_list')", 'where': '@greater(length(item()), 0)'},
                          'runAfter': {'N_flag_list': ['Succeeded']}}
MA['N_flags'] = compose("@join(body('N_flags_filtered'), '; ')", 'N_flags_filtered')
MA['Deadline_basis'] = compose(basis, 'N_flags')
MA['Status_text_final'] = compose(status_final, 'Deadline_basis')
MA['Amendment_ids']['runAfter'] = {'Status_text_final': ['Succeeded']}

up = MA['Update_master_terms']['inputs']['parameters']
up['item/cai_noticestatus'] = "@outputs('Status_text_final')"
up['item/cai_effnoticedays'] = (f"@if(not(outputs('Has_notice')), null, if(equals({UNIT}, 'day'), int({AMT}), if(equals({UNIT}, 'week'), mul(7, int({AMT})), null)))")
up['item/cai_noticeamount'] = f"@if(outputs('Has_notice'), int({AMT}), null)"
up['item/cai_noticeunit'] = f"@if(outputs('Has_notice'), {UNIT}, null)"
up['item/cai_noticewording'] = "@if(empty(string(outputs('N_wording'))), null, substring(string(outputs('N_wording')), 0, min(length(string(outputs('N_wording'))), 1900)))"
up['item/cai_deadlinebasis'] = "@if(empty(outputs('Deadline_basis')), null, substring(outputs('Deadline_basis'), 0, min(length(outputs('Deadline_basis')), 3900)))"
up['item/cai_deadlinereview'] = "@if(empty(outputs('N_flags')), null, substring(outputs('N_flags'), 0, min(length(outputs('N_flags')), 1900)))"

# audit row when the first 1.0.3.3 recalculation changes a deadline stored by 1.0.3.2
MA['If_recalculated_by_1033'] = {
    'type': 'If',
    'expression': {'and': [
        {'equals': [f"@empty(coalesce(outputs('Master_row')?['cai_deadlinebasis'], ''))", True]},
        {'equals': [f"@empty(coalesce({old_dl}, ''))", False]},
        {'not': {'equals': [f"@substring(string({old_dl}), 0, 10)", "@coalesce(outputs('Next_notice_deadline'), '')"]}},
    ]},
    'actions': {'Log_recalculation': {'type': 'OpenApiConnection', 'inputs': {
        'parameters': {
            'entityName': 'cai_reviews',
            'item/cai_Contract@odata.bind': "@concat('cai_contracts(', outputs('Master_row')?['cai_contractid'], ')')",
            'item/cai_title': "@concat(outputs('Master_reference'), ' - notice deadline recalculated by release 1.0.3.3')",
            'item/cai_decision': 'Deadline recalculated (release 1.0.3.3)',
            'item/cai_reviewer': 'CAI Contract Intelligence (system)',
            'item/cai_decidedon': '@utcNow()',
            'item/cai_source': 'Release 1.0.3.3 recalculation',
            'item/cai_comment': "@concat('Previous notice deadline ', substring(string(" + old_dl + "), 0, 10), '; recalculated deadline ', coalesce(outputs('Next_notice_deadline'), 'none'), '. ', outputs('Deadline_basis'))",
            'item/cai_correctionsjson': ("@{string(setProperty(setProperty(setProperty(setProperty(json('{\"schema\":\"cai.recalculation.v1\"}'), 'previous_deadline', "
                                         "substring(string(" + old_dl + "), 0, 10)), 'new_deadline', coalesce(outputs('Next_notice_deadline'), '')), "
                                         "'basis', outputs('Deadline_basis')), 'review_flags', outputs('N_flags')))}"),
        },
        'host': {'apiId': '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps', 'connectionName': 'shared_commondataserviceforapps', 'operationId': 'CreateRecord'}}}},
    'else': {'actions': {}},
    'runAfter': {'Update_master_terms': ['Succeeded']},
}
MA['Mark_other_masters_superseded']['runAfter'] = {'If_recalculated_by_1033': ['Succeeded']}

aw = A['Master_exists']['actions']['Master_approved']['else']['actions']['Update_master_awaiting']['inputs']['parameters']
for c in ('cai_noticeamount', 'cai_noticeunit', 'cai_noticewording', 'cai_deadlinebasis', 'cai_deadlinereview'):
    aw['item/' + c] = '@null'
(OUT / FILES['eff']).write_text(json.dumps(eff, ensure_ascii=False), encoding='utf-8')

# ───────────────────────────────── Review gate ─────────────────────────────────
rv = load('review')
RA = rv['properties']['definition']['actions']
EXT = "json(coalesce(triggerOutputs()?['body/cai_extractionjson'], '{}'))"
ESC = lambda e: f"replace(replace(replace(string({e}), '\\', '\\\\'), '\"', '\\\"'), decodeUriComponent('%0A'), ' ')"
npx = f"{EXT}?['renewal']?['value']?['notice_period']"
RA['Notice_summary'] = {'type': 'Compose', 'runAfter': {'Card_banner': ['Succeeded']}, 'inputs': (
    f"@if(equals({npx}, null), if(equals(triggerOutputs()?['body/cai_noticedays'], null), 'not found', "
    f"concat(string(triggerOutputs()?['body/cai_noticedays']), ' days (as stored)')), concat(string({npx}?['amount']), ' ', "
    f"replace(coalesce({npx}?['unit'], '?'), '_', ' '), '(s), ', replace(coalesce({npx}?['timing'], 'timing ?'), '_', ' '), ' the ', "
    f"replace(coalesce({npx}?['reference'], 'reference ?'), '_', ' ')))")}
RA['Unusual_lines'] = {'type': 'Select', 'runAfter': {'Notice_summary': ['Succeeded']}, 'inputs': {
    'from': f"@take(coalesce({EXT}?['unusual_clauses'], json('[]')), 3)",
    'select': "@concat(coalesce(item()?['summary'], ''), ': ', coalesce(item()?['quote'], ''), if(empty(coalesce(item()?['location'], '')), '', concat(' (', item()?['location'], ')')))"}}
RA['Unusual_text'] = {'type': 'Compose', 'runAfter': {'Unusual_lines': ['Succeeded']}, 'inputs': "@join(body('Unusual_lines'), ' || ')"}
RA['Compose']['runAfter'] = {'Unusual_text': ['Succeeded']}
card = RA['Compose']['inputs']
old_ren_fact = ("'{\"title\":\"Renewal\",\"value\":\"', " + ESC("coalesce(triggerOutputs()?['body/cai_renewaltype'], '')") +
                ", ', notice ', " + ESC("coalesce(triggerOutputs()?['body/cai_noticedays'], '')") + ", ' days\"},', ")
new_ren_fact = ("'{\"title\":\"Renewal\",\"value\":\"', " + ESC("coalesce(triggerOutputs()?['body/cai_renewaltype'], '')") + ", '\"},', "
                "'{\"title\":\"Notice period\",\"value\":\"', " + ESC("outputs('Notice_summary')") + ", '\"},', "
                "'{\"title\":\"Signed on\",\"value\":\"', " + ESC(f"coalesce({EXT}?['signing_date']?['value'], 'not stated')") + ", '\"},', ")
card = must_replace(card, old_ren_fact, new_ren_fact)
anchor = "'{\"type\":\"TextBlock\",\"wrap\":true,\"size\":\"Small\",\"text\":\"**Liability cap** (', "
add_ev = ("'{\"type\":\"TextBlock\",\"wrap\":true,\"size\":\"Small\",\"text\":\"**Notice wording**: _', "
          + ESC(f"coalesce({npx}?['wording'], {EXT}?['renewal']?['value']?['notice_rule_text'], '')") + ", '_\"},', "
          "'{\"type\":\"TextBlock\",\"wrap\":true,\"size\":\"Small\",\"text\":\"**Unusual clauses** (check against the values above): ', "
          + ESC("if(empty(outputs('Unusual_text')), 'none reported', outputs('Unusual_text'))") + ", '\"},', ")
card = must_replace(card, anchor, add_ev + anchor)
old_txt = ('Submitting a correction always records this review as Needs correction, even if Approve is selected, and the document '
           'cannot be approved until the correction is resolved. The extracted value and its evidence are kept unchanged.')
new_txt = ('A Notice period correction (for example 6 months or 90 days) or an Effective date correction (YYYY-MM-DD) is applied at once: '
           'the extracted value and its evidence are kept, the corrected value is used and recorded with your name, and Approve still '
           'approves. Any other correction records this review as Needs correction and blocks approval until it is resolved.')
card = must_replace(card, old_txt, new_txt)
old_choice = '{"title":"(no correction)","value":""},'
new_choice = ('{"title":"(no correction)","value":""},{"title":"Notice period - applied at once (e.g. 6 months)","value":"notice_period"},'
              '{"title":"Effective date - applied at once (YYYY-MM-DD)","value":"effective_date_apply"},')
card = must_replace(card, old_choice, new_choice)
RA['Compose']['inputs'] = card

DIG = lambda s: "replace(" * 10 + s + "".join(f", '{d}', '')" for d in range(10))
V = "outputs('Submitted')?['value']"
F = "outputs('Submitted')?['field']"
TOK = f"first(split(trim({V}), ' '))"
REST = f"toLower(trim(substring(trim({V}), length({TOK}))))"
UNITN = (f"if(or(contains({REST}, 'business'), contains({REST}, 'working')), 'business_day', if(contains({REST}, 'month'), 'month', "
         f"if(contains({REST}, 'year'), 'year', if(contains({REST}, 'week'), 'week', if(contains({REST}, 'day'), 'day', '')))))")
NOTICE_OK = (f"and(equals({F}, 'notice_period'), not(empty(trim({V}))), lessOrEquals(length({TOK}), 3), empty({DIG(TOK)}), "
             f"not(empty({UNITN})))")
DATE_SHAPE = (f"if(and(equals({F}, 'effective_date_apply'), equals(length(trim({V})), 10)), and(equals(substring(trim({V}), 4, 1), '-'), "
              f"equals(substring(trim({V}), 7, 1), '-'), empty({DIG("replace(trim(" + V + "), '-', '')")})), false)")
DATE_OK = (f"if({DATE_SHAPE}, if(and(greaterOrEquals(int(substring(trim({V}), 5, 2)), 1), lessOrEquals(int(substring(trim({V}), 5, 2)), 12), "
           f"greaterOrEquals(int(substring(trim({V}), 8, 2)), 1)), equals(substring(addDays(concat(substring(trim({V}), 0, 8), '01'), "
           f"sub(int(substring(trim({V}), 8, 2)), 1), 'yyyy-MM-dd'), 5, 2), substring(trim({V}), 5, 2)), false), false)")
RA['Applied_correction'] = {'type': 'Compose', 'runAfter': {'Has_correction': ['Succeeded']}, 'inputs': {
    'notice_ok': f"@{NOTICE_OK}",
    'date_ok': f"@{DATE_OK}",
}}
# Has_correction lives inside If_current_request
IC = RA['If_current_request']['actions']
IC['Applied_correction'] = RA.pop('Applied_correction')
IC['Applied_correction']['runAfter'] = {'Has_correction': ['Succeeded']}
IC['Applied'] = compose("@or(outputs('Applied_correction')?['notice_ok'], outputs('Applied_correction')?['date_ok'])", 'Applied_correction')
IC['Blocking_correction'] = compose("@and(outputs('Has_correction'), not(outputs('Applied')))", 'Applied')
IC['Final_decision']['runAfter'] = {'Blocking_correction': ['Succeeded']}
IC['Final_decision']['inputs'] = must_replace(IC['Final_decision']['inputs'], "outputs('Has_correction')", "outputs('Blocking_correction')")
IC['Decision_rule']['inputs'] = must_replace(IC['Decision_rule']['inputs'], "outputs('Has_correction')", "outputs('Blocking_correction')")
IC['Decision_rule']['inputs'] = IC['Decision_rule']['inputs'].replace(
    "'Recorded as submitted.'", "if(outputs('Applied'), 'Recorded as submitted; the corrected value is applied as a reviewer correction and the original extraction is kept.', 'Recorded as submitted.')")

OV = "json(coalesce(body('Current_row')?['cai_reviewedvaluesjson'], '{}'))"
BASE_R = f"coalesce({OV}?['renewal'], {EXT}?['renewal'], json('{{}}'))"
OLDNP = f"coalesce({BASE_R}?['value']?['notice_period'], json('{{}}'))"
NEWNP = (f"setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(json(concat('{{\"amount\":', {TOK}, '}}')), 'unit', {UNITN}), "
         f"'reference', coalesce({OLDNP}?['reference'], 'term_end')), 'timing', coalesce({OLDNP}?['timing'], 'on_or_before')), "
         f"'wording', coalesce({OLDNP}?['wording'], {BASE_R}?['value']?['notice_rule_text'], {BASE_R}?['quote'], '')), 'source', 'reviewer'), "
         f"'extracted', {OLDNP})")
NEW_RENEWAL = (f"setProperty(setProperty(setProperty(setProperty({BASE_R}, 'value', setProperty(coalesce({BASE_R}?['value'], json('{{}}')), 'notice_period', {NEWNP})), "
               f"'status', 'reviewer_corrected'), 'corrected_by', outputs('Submitted')?['reviewer']), 'corrected_on', utcNow())")
BASE_E = f"coalesce({OV}?['effective_date'], {EXT}?['effective_date'], json('{{}}'))"
NEW_EFF = (f"setProperty(setProperty(setProperty(setProperty(setProperty({BASE_E}, 'value', trim({V})), 'status', 'reviewer_corrected'), "
           f"'corrected_by', outputs('Submitted')?['reviewer']), 'corrected_on', utcNow()), 'extracted_value', {BASE_E}?['value'])")
IC['Overlay'] = compose(
    f"@if(outputs('Applied_correction')?['notice_ok'], setProperty({OV}, 'renewal', {NEW_RENEWAL}), "
    f"if(outputs('Applied_correction')?['date_ok'], setProperty({OV}, 'effective_date', {NEW_EFF}), {OV}))", 'Decision_rule')
IC['Correction']['runAfter'] = {'Overlay': ['Succeeded']}
rr = IC['Review_record']['inputs']
rr['applied_to_effective_terms'] = "@outputs('Applied')"
rr['applied_correction'] = "@if(outputs('Applied'), outputs('Correction'), null)"
rr['note'] = ('The original extraction and its evidence are never modified. A notice period or effective date correction in the stated '
              'format is applied as a reviewer correction (cai_reviewedvaluesjson); any other correction blocks approval until resolved.')
ua = IC['Update_a_row']['inputs']['parameters']
ua['item/cai_reviewedvaluesjson'] = "@if(outputs('Applied'), string(outputs('Overlay')), body('Current_row')?['cai_reviewedvaluesjson'])"
ua['item/cai_effectivedate'] = f"@if(outputs('Applied_correction')?['date_ok'], trim({V}), triggerOutputs()?['body/cai_effectivedate'])"
RA['Current_row']['inputs']['parameters']['$select'] += ',cai_reviewedvaluesjson'
IC['Add_a_new_row']['inputs']['parameters']['item/cai_decision'] = (
    "@if(and(outputs('Applied'), equals(outputs('Final_decision'), 'Approved')), 'Approved with reviewer correction', outputs('Final_decision'))")
(OUT / FILES['review']).write_text(json.dumps(rv, ensure_ascii=False), encoding='utf-8')

# ───────────────────────────────── Compute flows ─────────────────────────────────
nd = load('nd')
NA = nd['properties']['definition']['actions']
entry = NA['For_each_contract']['actions']['Entry']['inputs']
for k, col in (('notice_period_amount', 'cai_noticeamount'), ('notice_period_unit', 'cai_noticeunit'),
               ('notice_wording', 'cai_noticewording'), ('deadline_basis', 'cai_deadlinebasis'), ('deadline_review', 'cai_deadlinereview')):
    entry[k] = f"@first(body('Master_rows'))?['{col}']"
sel = NA['In_window_list']['inputs']['select']
sel['deadline_status'] = "@if(empty(coalesce(item()?['deadline_review'], '')), 'CALCULATED', 'PROVISIONAL - human check required')"
for k in ('notice_period_amount', 'notice_period_unit', 'notice_wording', 'deadline_basis', 'deadline_review'):
    sel[k] = f"@item()?['{k}']"
res = NA['Result']['inputs']
res['rule'] = (res['rule'] + ' Each deadline is a calendar calculation from the stored notice period (amount and unit as stated in the contract), '
               'shown with the contract wording and the calculation basis; a PROVISIONAL deadline must be checked by a person. This is not legal advice.')
(OUT / FILES['nd']).write_text(json.dumps(nd, ensure_ascii=False), encoding='utf-8')

gt = load('get')
GA = gt['properties']['definition']['actions']
ok = GA['Approved_master_exists']['actions']['Is_fresh']['actions']['Result_OK']['inputs']
ren = ok['renewal']
for k, col in (('notice_period_amount', 'cai_noticeamount'), ('notice_period_unit', 'cai_noticeunit'),
               ('notice_wording', 'cai_noticewording'), ('deadline_basis', 'cai_deadlinebasis'), ('deadline_review', 'cai_deadlinereview')):
    ren[k] = f"@outputs('Master')?['{col}']"
ren['deadline_status'] = "@if(empty(coalesce(outputs('Master')?['cai_deadlinereview'], '')), 'CALCULATED', 'PROVISIONAL - human check required')"
ok['rule'] = (ok['rule'] + ' Notice deadlines are calendar calculations from the notice period as stated (amount and unit), shown with the '
              'contract wording and the calculation basis; a PROVISIONAL deadline must be checked by a person. This is not legal advice.')
(OUT / FILES['get']).write_text(json.dumps(gt, ensure_ascii=False), encoding='utf-8')
print('written', sorted(p.name for p in OUT.iterdir()))
