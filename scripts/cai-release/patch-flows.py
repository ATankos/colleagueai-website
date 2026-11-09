#!/usr/bin/env python3
"""Produce the 1.0.3.2 definitions of two flows from the unpacked 1.0.3.1 package.

  python3 -I patch-flows.py <unpacked-1.0.3.1-dir> <out-dir>

Writes <out-dir>/Dailyrecompute.clientdata.json and <out-dir>/Effectiveterms.clientdata.json
(the full clientdata documents, ready for PATCH workflows(id) {"clientdata": ...} in the authoring
environment) plus a human-readable CHANGES.md. It only reads the input files.

Change 10 (agreed 9 Nov): Daily recompute recomputes only masters whose dates can move within a window
(cai_RecomputeWindowDays, default 90), a full pass once a week (cai_RecomputeFullPassDay, default Monday,
"Never" allowed), rechecks only the rows it stamped, reports WARNING instead of FAILED when the only
laggards have nothing to compute, and records what the run covered.

F-04: Effective terms marks older approved duplicates of a master as SUPERSEDED (with a fresh
cai_termscomputedon) and exits early when the triggering row is one of them, so the daily rule
"every stamped master is refreshed" holds and a duplicate upload is no longer reported daily.
"""
import json
import sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

DAILY = 'CAICI-Dailyrecompute-E8D71E13-19D8-F111-84E8-E4FADE0D20C9.json'
EFF = 'CAICI-Effectiveterms-2BFB2A15-C9D7-F111-84E8-E4FADE0D927F.json'

TZ = "parameters('cai_BusinessTimeZone (cai_BusinessTimeZone)')"
WINDOW = "parameters('cai_RecomputeWindowDays (cai_RecomputeWindowDays)')"
FULLDAY = "parameters('cai_RecomputeFullPassDay (cai_RecomputeFullPassDay)')"
DV_HOST = {
    "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
    "connectionName": "shared_commondataserviceforapps",
}

# ----------------------------------------------------------------------------------------------
# Daily recompute
# ----------------------------------------------------------------------------------------------
daily = json.loads((src / 'Workflows' / DAILY).read_text(encoding='utf-8'))
defn = daily['properties']['definition']
params = defn['parameters']
actions = defn['actions']
main = actions['Main']['actions']

# 1. two new environment-variable parameters (both have defaults, so the import does not ask)
params['cai_RecomputeWindowDays (cai_RecomputeWindowDays)'] = {
    "defaultValue": 90, "type": "Float", "metadata": {"schemaName": "cai_RecomputeWindowDays"}}
params['cai_RecomputeFullPassDay (cai_RecomputeFullPassDay)'] = {
    "defaultValue": "Monday", "type": "String", "metadata": {"schemaName": "cai_RecomputeFullPassDay"}}

# 2. Run_context: today, window end, full-pass flag (all in the business time zone)
main_run_after_keys = list(main['List_masters']['runAfter'].keys())
assert main_run_after_keys == [], main_run_after_keys
run_context = {
    "type": "Compose",
    "inputs": {
        "today": f"@convertFromUtc(utcNow(), {TZ}, 'yyyy-MM-dd')",
        "window_days": f"@int(coalesce({WINDOW}, 90))",
        "window_end": f"@formatDateTime(addDays(convertFromUtc(utcNow(), {TZ}), int(coalesce({WINDOW}, 90))), 'yyyy-MM-dd')",
        "weekday": f"@createArray('sunday','monday','tuesday','wednesday','thursday','friday','saturday')[dayOfWeek(convertFromUtc(utcNow(), {TZ}))]",
        "full_pass_day": f"@toLower(trim(coalesce({FULLDAY}, 'Monday')))",
        "is_full_pass": f"@equals(createArray('sunday','monday','tuesday','wednesday','thursday','friday','saturday')[dayOfWeek(convertFromUtc(utcNow(), {TZ}))], toLower(trim(coalesce({FULLDAY}, 'Monday'))))",
    },
    "runAfter": {},
}

# 3. List_masters: same base rule, plus the window on ordinary days; superseded duplicates never listed
BASE = ("cai_documentrole eq 'master' and cai_reviewstatus eq 'Approved' and "
        "(cai_approvalblocked eq null or cai_approvalblocked eq false) and "
        "not startswith(cai_noticestatus,'SUPERSEDED')")
WINDOW_CLAUSE = ("' and (cai_noticedeadline le ', outputs('Run_context')?['window_end'], "
                 "' or cai_currenttermend le ', outputs('Run_context')?['window_end'], "
                 "' or cai_termscomputedon eq null)'")
list_masters = main['List_masters']
BASE_SQ = BASE.replace("'", "''")  # workflow expressions take single-quoted literals only
list_masters['inputs']['parameters']['$filter'] = (
    f"@concat('{BASE_SQ}', if(equals(outputs('Run_context')?['is_full_pass'], true), '', concat({WINDOW_CLAUSE})))")
list_masters['inputs']['parameters']['$select'] = 'cai_contractid,cai_contractreference,cai_documentname'
list_masters['runAfter'] = {"Run_context": ["Succeeded"]}

# 4. Request_recompute unchanged (stamps cai_recomputerequestedon = Run_started)

# 5. Wait: 3 minutes up to 50 stamped rows, then 1 minute per 50, capped at 30
main['Wait_for_recompute']['inputs']['interval']['count'] = (
    "@if(lessOrEquals(length(body('List_masters')?['value']), 50), 3, "
    "min(30, div(add(length(body('List_masters')?['value']), 49), 50)))")

# 6. Recheck only the rows this run stamped (minute floor of the run start; Dataverse keeps seconds)
recheck = main['Recheck']
recheck['inputs']['parameters']['$filter'] = (
    "@concat('cai_documentrole eq ''master'' and cai_recomputerequestedon ge ', "
    "formatDateTime(outputs('Run_started'), 'yyyy-MM-ddTHH:mm:00Z'))")

# 7. Not_refreshed unchanged; add the "nothing to compute" subset and a three-way status
main['Not_refreshed_blocking'] = {
    "type": "Query",
    "inputs": {
        "from": "@body('Not_refreshed')",
        "where": "@not(or(startswith(coalesce(item()?['cai_noticestatus'], ''), 'NO TERM END'), "
                 "startswith(coalesce(item()?['cai_noticestatus'], ''), 'SUPERSEDED')))",
    },
    "runAfter": {"Not_refreshed_refs": ["Succeeded"]},
}
main['Job_status']['inputs'] = (
    "@if(not(and(equals(outputs('Recheck_meta')?['is_complete'], true), "
    "equals(outputs('List_masters_meta')?['is_complete'], true))), 'FAILED', "
    "if(equals(length(body('Not_refreshed')), 0), 'SUCCEEDED', "
    "if(equals(length(body('Not_refreshed_blocking')), 0), 'WARNING', 'FAILED')))")
main['Job_status']['runAfter'] = {"Not_refreshed_blocking": ["Succeeded"]}

# 8. Job-run row: what the run covered
log_run = main['Log_run']['inputs']['parameters']
log_run['item/cai_details'] = (
    "@{string(addProperty(addProperty(addProperty(addProperty(json('{\"business_timezone_source\":"
    "\"environment variable cai_BusinessTimeZoneIana\",\"rule\":\"every master stamped by this run must show "
    "cai_termscomputedon at or after the run start; WARNING when the only laggards have nothing to compute "
    "(NO TERM END or SUPERSEDED)\"}'), 'run', addProperty(addProperty(outputs('Run_context'), "
    "'requested_count', length(body('List_masters')?['value'])), 'wait_minutes', "
    "if(lessOrEquals(length(body('List_masters')?['value']), 50), 3, "
    "min(30, div(add(length(body('List_masters')?['value']), 49), 50))))), 'not_refreshed', "
    "body('Not_refreshed_refs')), 'list_query', outputs('List_masters_meta')), 'recheck_query', "
    "outputs('Recheck_meta')))}")

# alert text: FAILED only (unchanged condition), mention the scope
alert = main['If_failed_alert']['actions']['Alert_admin']['inputs']['parameters']
alert['body/messageBody'] = alert['body/messageBody'].replace(
    "' approved contract(s) were not refreshed: '",
    "' contract(s) requested by this run were not refreshed: '")

# insert Run_context first (dict order is cosmetic; runAfter defines the graph)
main_new = {"Run_context": run_context}
main_new.update(main)
actions['Main']['actions'] = main_new

(out / 'Dailyrecompute.clientdata.json').write_text(json.dumps(daily, indent=2, ensure_ascii=False), encoding='utf-8')

# ----------------------------------------------------------------------------------------------
# Effective terms
# ----------------------------------------------------------------------------------------------
eff = json.loads((src / 'Workflows' / EFF).read_text(encoding='utf-8'))
edef = eff['properties']['definition']
eact = edef['actions']
mex = eact['Master_exists']['actions']

TRIGGER_ID = "triggerOutputs()?['body/cai_contractid']"
MASTER_ID = "outputs('Master_row')?['cai_contractid']"
SUPERSEDED_TEXT = ("concat('SUPERSEDED: effective terms are held by the newer approved master ''', "
                   "coalesce(outputs('Master_row')?['cai_documentname'], ''), ''' (uploaded ', "
                   "formatDateTime(outputs('Master_row')?['createdon'], 'yyyy-MM-dd'), "
                   "'). This duplicate is not used for answers.')")

# a) early exit: the triggering row is an approved master of this family but not the newest one
mex['Trigger_is_superseded_master'] = {
    "type": "If",
    "expression": {"and": [
        {"equals": ["@triggerOutputs()?['body/cai_documentrole']", "master"]},
        {"equals": ["@triggerOutputs()?['body/cai_reviewstatus']", "Approved"]},
        {"not": {"equals": [f"@{TRIGGER_ID}", f"@{MASTER_ID}"]}},
        {"greater": ["@length(body('Filter_approved_masters'))", 1]},
    ]},
    "actions": {
        "Mark_trigger_superseded": {
            "type": "OpenApiConnection",
            "inputs": {
                "parameters": {
                    "entityName": "cai_contracts",
                    "recordId": f"@{TRIGGER_ID}",
                    "item/cai_masterreference": "@outputs('Master_reference')",
                    "item/cai_noticestatus": f"@{SUPERSEDED_TEXT}",
                    "item/cai_termscomputedon": "@utcNow()",
                },
                "host": dict(DV_HOST, operationId="UpdateOnlyRecord"),
            },
            "runAfter": {},
        },
        "Stop_superseded": {
            "type": "Terminate",
            "inputs": {"runStatus": "Succeeded"},
            "runAfter": {"Mark_trigger_superseded": ["Succeeded"]},
        },
    },
    "else": {"actions": {}},
    "runAfter": {"Master_row": ["Succeeded"]},
}
mex['Master_approved']['runAfter'] = {"Trigger_is_superseded_master": ["Succeeded"]}

# b) after the effective master is written, mark every other approved master of the family
approved = mex['Master_approved']['actions']
approved['Mark_other_masters_superseded'] = {
    "type": "Foreach",
    "foreach": "@body('Filter_approved_masters')",
    "actions": {
        "If_not_effective_master": {
            "type": "If",
            "expression": {"not": {"equals": [
                "@items('Mark_other_masters_superseded')?['cai_contractid']", f"@{MASTER_ID}"]}},
            "actions": {
                "Mark_superseded": {
                    "type": "OpenApiConnection",
                    "inputs": {
                        "parameters": {
                            "entityName": "cai_contracts",
                            "recordId": "@items('Mark_other_masters_superseded')?['cai_contractid']",
                            "item/cai_masterreference": "@outputs('Master_reference')",
                            "item/cai_noticestatus": f"@{SUPERSEDED_TEXT}",
                            "item/cai_termscomputedon": "@utcNow()",
                        },
                        "host": dict(DV_HOST, operationId="UpdateOnlyRecord"),
                    },
                    "runAfter": {},
                }
            },
            "else": {"actions": {}},
            "runAfter": {},
        }
    },
    "runAfter": {"Update_master_terms": ["Succeeded"]},
    "runtimeConfiguration": {"concurrency": {"repetitions": 5}},
}

(out / 'Effectiveterms.clientdata.json').write_text(json.dumps(eff, indent=2, ensure_ascii=False), encoding='utf-8')

(out / 'CHANGES.md').write_text(f"""# Flow changes for 1.0.3.2 (generated by patch-flows.py)

## CAI CI - Daily recompute
- New parameters cai_RecomputeWindowDays (default 90) and cai_RecomputeFullPassDay (default Monday).
- New action Run_context (today, window_end, weekday, is_full_pass).
- List_masters: base rule + `not startswith(cai_noticestatus,'SUPERSEDED')` + on ordinary days
  `(cai_noticedeadline le window_end or cai_currenttermend le window_end or cai_termscomputedon eq null)`.
- Wait_for_recompute: 3 min up to 50 rows, else 1 min per 50, cap 30.
- Recheck: only rows with cai_recomputerequestedon >= run start (minute floor), not all masters.
- New action Not_refreshed_blocking; Job_status = SUCCEEDED / WARNING / FAILED (FAILED also when a list was incomplete).
- Log_run details: run context, requested_count, wait_minutes. Alert on FAILED only (unchanged).

## CAI CI - Effective terms
- New If Trigger_is_superseded_master after Master_row: when the triggering row is an approved master that is not
  the newest approved master of its family, mark it SUPERSEDED (fresh cai_termscomputedon) and terminate Succeeded.
- New Foreach Mark_other_masters_superseded after Update_master_terms: every other approved master of the family
  gets the SUPERSEDED status and a fresh stamp.
- No change to how the effective master is chosen (newest approved by createdon) or to its computed terms.
""", encoding='utf-8')
print('written', sorted(p.name for p in out.iterdir()))
