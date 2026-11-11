"""Corrective release candidate 1.0.3.5 (NOT APPROVED, NOT BUILT) from the 1.0.3.4 Effective terms flow.

  python3 -I patch_flows_1035.py <1.0.3.4 Workflows dir or flows dir> <out dir>

Defect D-ET-1, found in the tenant lifecycle test of managed 1.0.3.4 on 11 Nov 2026 (CAI-TEST):
the reviewer approved SYN-N02 and the Effective terms run failed in action Duration_months with int() applied to the
extracted term duration "Initial Term". Duration_months is only needed when the initial term has no end date, but it ran
(and threw) for every approved master. The flow has no failure path, so the contract stayed Approved with no effective
terms and nobody was told. The same document extracted on 10 Nov gave "24 months" and computed correctly: the failure
depends on how the extractor words the duration, and contracts that state a term by dates ("from 1 March 2026 until
29 February 2028") invite exactly this wording.

Two changes, nothing else:
1. Duration_months never calls int() on text that is not a whole number (isInt guard), and returns 0 when the term has
   an end date. A duration it cannot read gives 0, which Term_end already treats as "no term end" (NO TERM END path).
2. A failure path: if the master branch fails, times out or is skipped, the master (or, without one, the triggering
   record) is marked DEADLINE NOT VERIFIED with no stored deadline and no computed-on time, a review-log row is written,
   and the run still ends Failed. The next Daily recompute then lists it as not refreshed and alerts the admin
   (Recheck -> Not_refreshed -> Job_status FAILED -> Alert_admin). No trigger attribute is written, so it cannot loop.

Accepts either exported solution flow files ({"properties": {"definition": ...}}) or the bare *.definition.json files
kept in scripts/cai-release/<version>/flows.
"""
import json, sys
from pathlib import Path

STEM = 'CAICI-Effectiveterms-2BFB2A15-C9D7-F111-84E8-E4FADE0D927F'
DB = {'apiId': '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
      'connectionName': 'shared_commondataserviceforapps'}
NV = 'DEADLINE NOT VERIFIED - HUMAN REVIEW REQUIRED.'

DUR = "toLower(coalesce(variables('Eff')?['initial_term']?['value']?['duration'], ''))"
END = "coalesce(variables('Eff')?['initial_term']?['value']?['end'], '')"
IN_BRACKETS = f"trim(first(split(last(split({DUR}, '(')), ')')))"
FIRST_WORD = f"trim(first(split({DUR}, ' ')))"
NUMBER = f"if(isInt({IN_BRACKETS}), {IN_BRACKETS}, if(isInt({FIRST_WORD}), {FIRST_WORD}, '0'))"
DURATION_MONTHS = f"@if(not(empty({END})), 0, mul(int({NUMBER}), if(contains({DUR}, 'year'), 12, 1)))"

NOTE = ("concat('Effective terms could not be computed on ', convertFromUtc(utcNow(), "
        "parameters('cai_BusinessTimeZone (cai_BusinessTimeZone)'), 'yyyy-MM-dd HH:mm'), ' (flow run ', "
        "coalesce(workflow()?['run']?['name'], ''), '). No notice deadline is given until a later calculation succeeds. "
        "Admin: open the Effective terms run history; the next Daily recompute reports this contract.')")


def failure_scope():
    # A master that triggered the run is marked itself; for an amendment, the newest approved master of its family.
    target = ("@if(equals(triggerOutputs()?['body/cai_documentrole'], 'master'), triggerOutputs()?['body/cai_contractid'], "
              "coalesce(first(body('Find_master_for_failure')?['value'])?['cai_contractid'], "
              "triggerOutputs()?['body/cai_contractid']))")
    return {
        'type': 'Scope',
        'runAfter': {'Master_exists': ['Failed', 'TimedOut', 'Skipped']},
        'actions': {
            'Find_master_for_failure': {'type': 'OpenApiConnection', 'runAfter': {}, 'inputs': {'parameters': {
                'entityName': 'cai_contracts', '$select': 'cai_contractid,cai_contractreference',
                '$filter': ("@concat('cai_contractreference eq ''', replace(outputs('Master_reference'), '''', ''''''), "
                            "''' and cai_documentrole eq ''master'' and cai_reviewstatus eq ''Approved''')"),
                '$orderby': 'createdon desc', '$top': 1}, 'host': dict(DB, operationId='ListRecords')}},
            'Failure_note': {'type': 'Compose', 'inputs': '@' + NOTE,
                             'runAfter': {'Find_master_for_failure': ['Succeeded', 'Failed', 'TimedOut', 'Skipped']}},
            'Failure_target': {'type': 'Compose', 'inputs': target, 'runAfter': {'Failure_note': ['Succeeded']}},
            'Mark_terms_not_computed': {'type': 'OpenApiConnection', 'runAfter': {'Failure_target': ['Succeeded']},
                                        'inputs': {'parameters': {
                'entityName': 'cai_contracts',
                'recordId': "@outputs('Failure_target')",
                'item/cai_noticestatus': f"@concat('{NV} ', outputs('Failure_note'))",
                'item/cai_noticedeadline': '@null',
                'item/cai_noticetermend': '@null',
                'item/cai_termscomputedon': '@null',
            }, 'host': dict(DB, operationId='UpdateOnlyRecord')}},
            'Log_terms_not_computed': {'type': 'OpenApiConnection',
                                       'runAfter': {'Mark_terms_not_computed': ['Succeeded', 'Failed']},
                                       'inputs': {'parameters': {
                'entityName': 'cai_reviews',
                'item/cai_Contract@odata.bind': "@concat('cai_contracts(', outputs('Failure_target'), ')')",
                'item/cai_title': "@concat(outputs('Master_reference'), ' - effective terms not computed')",
                'item/cai_decision': 'Effective terms not computed - run failed',
                'item/cai_reviewer': 'CAI Contract Intelligence (system)',
                'item/cai_decidedon': '@utcNow()',
                'item/cai_source': 'Release 1.0.3.5 failure path',
                'item/cai_comment': "@outputs('Failure_note')",
            }, 'host': dict(DB, operationId='CreateRecord')}},
            'End_run_failed': {'type': 'Terminate',
                               'runAfter': {'Log_terms_not_computed': ['Succeeded', 'Failed', 'TimedOut', 'Skipped']},
                               'inputs': {'runStatus': 'Failed', 'runError': {
                                   'code': 'EffectiveTermsNotComputed',
                                   'message': "@{outputs('Failure_note')}"}}},
        },
    }


def patch_definition(defn):
    acts = defn['actions']
    ma = acts['Master_exists']['actions']['Master_approved']['actions']
    old = ma['Duration_months']['inputs']
    assert 'int(trim(first(split(toLower(' in old, 'unexpected 1.0.3.4 Duration_months expression'
    ma['Duration_months']['inputs'] = DURATION_MONTHS
    assert 'Report_terms_not_computed' not in acts, 'already patched'
    acts['Report_terms_not_computed'] = failure_scope()
    return defn


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    matches = sorted(p for p in src.glob(STEM + '*.json'))
    assert len(matches) == 1, f'expected one Effective terms flow file in {src}, found {[p.name for p in matches]}'
    p = matches[0]
    obj = json.loads(p.read_text(encoding='utf-8'))
    defn = obj['properties']['definition'] if 'properties' in obj else obj
    patch_definition(defn)
    text = json.dumps(obj, ensure_ascii=False, indent=1 if 'properties' not in obj else None)
    (out / p.name).write_text(text + ('\n' if 'properties' not in obj else ''), encoding='utf-8')
    print(f'patched {p.name} -> {out / p.name}')


if __name__ == '__main__':
    main()
