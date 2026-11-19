"""Release 1.0.3.5 of CAI-L4-CI-001 from the 1.0.3.4 authoring state (scripts/cai-release/1.0.3.5/baseline).

  python3 -I patch_release_1035.py <baseline-dir> <out-dir>

Writes to <out-dir>:
  <flow>.clientdata.json   full clientdata, ready for PATCH workflows(<id>) {"clientdata": ...} in the authoring environment
  <flow>.definition.json   the definition alone, for review (committed in flows/)
  topic.*.yaml, gpt.default.yaml   bot component data, ready for PATCH botcomponents(<id>) {"data": ...}

Fixes (tenant test of managed 1.0.3.4, 11 Nov 2026):
  D-ET-1  Effective terms failed on extracted text it could not read as a number ("Initial Term"), silently.
          - Duration_months, notice amount, legacy notice days and renewal months are read only when isInt() accepts
            them. An unreadable notice amount, notice days or renewal period adds a review flag, so the deadline is
            DEADLINE NOT VERIFIED and goes to the reviewer; it is never computed from a guess.
          - Any other failure: the contract is marked DEADLINE NOT VERIFIED with no stored date, a review-log row is
            written, the admin gets a Teams alert at once, and the run still ends Failed.
  F-T-3   Approving a contract superseded a contract with the same reference owned by another team.
          - A contract family is now the same reference AND the same owner (team) in Effective terms, its failure
            path, and both agent tools (which also say when the same reference exists in another team).
  F-T-4   An upload that could not be read failed silently: no register row, no message.
          - Extract has a failure path: a register row "UNREADABLE - <file>" (owner team, no dates, approval
            blocked, the reason and the error kept), a review-log row, a Teams message to the reviewer and to the
            uploader with what to do, and the run ends Failed. A later readable upload of the same file name marks
            the failed row as replaced. A missing owner team now alerts the admin instead of failing silently.
          - Review gate and Effective terms skip rows in the "Extraction failed" states (trigger conditions).
"""
import copy
import json
import sys
from pathlib import Path

DV = {'apiId': '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps', 'connectionName': 'shared_commondataserviceforapps'}
TEAMS = {'apiId': '/providers/Microsoft.PowerApps/apis/shared_teams', 'connectionName': 'shared_teams', 'operationId': 'PostMessageToConversation'}
TEAMS_REF = {'api': {'name': 'shared_teams'}, 'connection': {'connectionReferenceLogicalName': 'new_sharedteams_8e81b'}, 'runtimeSource': 'embedded'}
P_ADMIN = 'cai_AdminAlertUpn (cai_AdminAlertUpn)'
P_REVIEWER = 'cai_ReviewerUpn (cai_ReviewerUpn)'
P_TZ = 'cai_BusinessTimeZone (cai_BusinessTimeZone)'
PARAMS = {
    P_ADMIN: {'defaultValue': '', 'type': 'String', 'metadata': {'schemaName': 'cai_AdminAlertUpn'}},
    P_REVIEWER: {'defaultValue': '', 'type': 'String', 'metadata': {'schemaName': 'cai_ReviewerUpn'}},
    P_TZ: {'defaultValue': 'Central Europe Standard Time', 'type': 'String', 'metadata': {'schemaName': 'cai_BusinessTimeZone'}},
}
FAILED_STATES = "@not(startsWith(coalesce(triggerOutputs()?['body/cai_reviewstatus'], ''), 'Extraction failed'))"
NV = 'DEADLINE NOT VERIFIED - HUMAN REVIEW REQUIRED.'

FILES = {
    'eff': 'Effectiveterms-2BFB2A15-C9D7-F111-84E8-E4FADE0D927F',
    'ext': 'Extractcontractonupload-4CA9DEF0-7ED7-F111-84E8-E4FADE0D927F',
    'gate': 'ReviewgateTeams-B3C964D1-A7D7-F111-84E8-E4FADE0D927F',
    'terms': 'Compute-Geteffectiveterms-4DCE77CB-F9D9-F111-84E8-000D3A832B24',
    'notice': 'Compute-Noticedeadlines-7F4045FE-F8D9-F111-84E8-000D3A832B24',
}


def sub(text, old, new, count=None):
    n = text.count(old)
    assert n >= 1 and (count is None or n == count), f'expected {count or ">=1"} of {old[:80]!r}, found {n}'
    return text.replace(old, new)


def rewire(acts, after, new_chain):
    """Insert new_chain (ordered list of (name, action)) right after action `after` in the same container: every
    action that ran after `after` now runs after the last new action."""
    last = new_chain[-1][0]
    for name, a in acts.items():
        ra = a.get('runAfter') or {}
        if after in ra:
            ra[last] = ra.pop(after)
    prev = after
    for name, a in new_chain:
        assert name not in acts, name
        a['runAfter'] = {prev: ['Succeeded']}
        acts[name] = a
        prev = name


def teams_post(recipient, body, run_after=None):
    a = {'type': 'OpenApiConnection', 'inputs': {'host': dict(TEAMS), 'parameters': {
        'poster': 'Flow bot', 'location': 'Chat with Flow bot', 'body/recipient': recipient, 'body/messageBody': body}}}
    if run_after is not None:
        a['runAfter'] = run_after
    return a


# ------------------------------------------------------------------------------------------------------------------
# Effective terms
# ------------------------------------------------------------------------------------------------------------------
EFF_DUR = "toLower(coalesce(variables('Eff')?['initial_term']?['value']?['duration'], ''))"
EFF_END = "coalesce(variables('Eff')?['initial_term']?['value']?['end'], '')"
IN_BRACKETS = f"trim(first(split(last(split({EFF_DUR}, '(')), ')')))"
FIRST_WORD = f"trim(first(split({EFF_DUR}, ' ')))"
NUMBER = f"if(isInt({IN_BRACKETS}), {IN_BRACKETS}, if(isInt({FIRST_WORD}), {FIRST_WORD}, '0'))"
DURATION_MONTHS = f"@if(not(empty({EFF_END})), 0, mul(int({NUMBER}), if(contains({EFF_DUR}, 'year'), 12, 1)))"

AMOUNT = "variables('Eff')?['renewal']?['value']?['notice_period']?['amount']"
DAYS = "variables('Eff')?['renewal']?['value']?['notice_days']"
MONTHS = "variables('Eff')?['renewal']?['value']?['period_months']"


def safe_int(x):
    return f"if(isInt(string(coalesce({x}, ''))), int(string({x})), null)"


OWNER_CLAUSE = "if(empty(coalesce(outputs('Family_owner'), '')), '', concat(' and _ownerid_value eq ', outputs('Family_owner')))"
TERMS_NOTE = ("concat('Effective terms could not be computed on ', convertFromUtc(utcNow(), parameters('" + P_TZ + "'), "
              "'yyyy-MM-dd HH:mm'), ' (flow run ', coalesce(workflow()?['run']?['name'], ''), '). No notice deadline is given "
              "until a later calculation succeeds; the Daily recompute retries it every morning. Admin: open the Effective "
              "terms run history for the error.')")


def patch_eff(cd):
    defn = cd['properties']['definition']
    acts = defn['actions']
    ma = acts['Master_exists']['actions']['Master_approved']['actions']
    # D-ET-1: duration
    assert 'int(trim(first(split(toLower(' in ma['Duration_months']['inputs']
    ma['Duration_months']['inputs'] = DURATION_MONTHS
    # D-ET-1: every other number read from extracted text
    text = json.dumps(ma, ensure_ascii=False)
    text = sub(text, f"int({AMOUNT})", "outputs('N_amount_safe')", 1)
    text = sub(text, f"int({DAYS})", "outputs('N_days_safe')")
    text = sub(text, f"equals({DAYS}, null)", "equals(outputs('N_days_safe'), null)")
    text = sub(text, f"coalesce({MONTHS}, 12)", "coalesce(outputs('Renewal_months_safe'), 12)")
    text = sub(text, f"@if(equals({MONTHS}, null), null, int({MONTHS}))", "@outputs('Renewal_months_safe')", 1)
    assert 'int(variables(' not in text.replace("int(variables('Eff')?['initial_term']", ''), 'an unguarded int() on extracted data remains'
    ma = json.loads(text)
    acts['Master_exists']['actions']['Master_approved']['actions'] = ma
    unread = ("@createArray("
              f"if(and(not(equals({AMOUNT}, null)), equals(outputs('N_amount_safe'), null)), concat('the notice period amount \"', string({AMOUNT}), '\" could not be read as a whole number'), ''), "
              f"if(and(not(equals({DAYS}, null)), equals(outputs('N_days_safe'), null)), concat('the stored notice days \"', string({DAYS}), '\" could not be read as a whole number'), ''), "
              f"if(and(not(equals({MONTHS}, null)), equals(outputs('Renewal_months_safe'), null)), concat('the renewal period \"', string({MONTHS}), '\" could not be read as a number of months'), ''))")
    rewire(ma, 'Apply_amendments', [
        ('N_amount_safe', {'type': 'Compose', 'inputs': '@' + safe_int(AMOUNT)}),
        ('N_days_safe', {'type': 'Compose', 'inputs': '@' + safe_int(DAYS)}),
        ('Renewal_months_safe', {'type': 'Compose', 'inputs': '@' + safe_int(MONTHS)}),
        ('Numbers_unread_all', {'type': 'Compose', 'inputs': unread}),
        ('Numbers_unread', {'type': 'Query', 'inputs': {'from': "@outputs('Numbers_unread_all')", 'where': '@not(empty(item()))'}}),
    ])
    fl = ma['N_flag_list']['inputs']
    assert fl.startswith('@createArray(') and fl.endswith(')')
    ma['N_flag_list']['inputs'] = fl[:-1] + (", if(greater(length(body('Numbers_unread')), 0), concat(join(body('Numbers_unread'), '; '), "
                                             "' - a reviewer must confirm the notice period and the renewal period'), ''))")
    # F-T-3: a family is the same reference and the same owner
    rewire(acts, 'Master_reference', [('Family_owner', {'type': 'Compose', 'inputs': "@triggerOutputs()?['body/_ownerid_value']"})])
    lf = acts['List_family']['inputs']['parameters']
    lf['$select'] += ',_ownerid_value'
    old_filter = "@concat('startswith(cai_contractreference,''', replace(outputs('Master_reference'), '''', ''''''), ''')')"
    assert lf['$filter'] == old_filter
    lf['$filter'] = "@concat('startswith(cai_contractreference,''', replace(outputs('Master_reference'), '''', ''''''), ''')', " + OWNER_CLAUSE + ")"
    # never computes for rows whose extraction failed
    trig = defn['triggers']['When_a_contract_review_status_changes']
    trig['conditions'] = [{'expression': FAILED_STATES}]
    # D-ET-1: failure path (replaces the candidate merged in #522, adds the owner filter and an immediate admin alert)
    acts.pop('Report_terms_not_computed', None)
    target = ("@if(equals(triggerOutputs()?['body/cai_documentrole'], 'master'), triggerOutputs()?['body/cai_contractid'], "
              "coalesce(first(body('Find_master_for_failure')?['value'])?['cai_contractid'], triggerOutputs()?['body/cai_contractid']))")
    acts['Report_terms_not_computed'] = {
        'type': 'Scope',
        'runAfter': {'Master_exists': ['Failed', 'TimedOut', 'Skipped']},
        'actions': {
            'Find_master_for_failure': {'type': 'OpenApiConnection', 'runAfter': {}, 'inputs': {'parameters': {
                'entityName': 'cai_contracts', '$select': 'cai_contractid,cai_contractreference',
                '$filter': ("@concat('cai_contractreference eq ''', replace(outputs('Master_reference'), '''', ''''''), "
                            "''' and cai_documentrole eq ''master'' and cai_reviewstatus eq ''Approved''', " + OWNER_CLAUSE + ")"),
                '$orderby': 'createdon desc', '$top': 1}, 'host': dict(DV, operationId='ListRecords')}},
            'Failure_note': {'type': 'Compose', 'inputs': '@' + TERMS_NOTE,
                             'runAfter': {'Find_master_for_failure': ['Succeeded', 'Failed', 'TimedOut', 'Skipped']}},
            'Failure_target': {'type': 'Compose', 'inputs': target, 'runAfter': {'Failure_note': ['Succeeded']}},
            'Mark_terms_not_computed': {'type': 'OpenApiConnection', 'runAfter': {'Failure_target': ['Succeeded']}, 'inputs': {'parameters': {
                'entityName': 'cai_contracts', 'recordId': "@outputs('Failure_target')",
                'item/cai_noticestatus': f"@concat('{NV} ', outputs('Failure_note'))",
                'item/cai_noticedeadline': '@null', 'item/cai_noticetermend': '@null', 'item/cai_termscomputedon': '@null',
            }, 'host': dict(DV, operationId='UpdateOnlyRecord')}},
            'Log_terms_not_computed': {'type': 'OpenApiConnection', 'runAfter': {'Mark_terms_not_computed': ['Succeeded', 'Failed']}, 'inputs': {'parameters': {
                'entityName': 'cai_reviews',
                'item/cai_Contract@odata.bind': "@concat('cai_contracts(', outputs('Failure_target'), ')')",
                'item/cai_title': "@concat(outputs('Master_reference'), ' - effective terms not computed')",
                'item/cai_decision': 'Effective terms not computed - run failed',
                'item/cai_reviewer': 'CAI Contract Intelligence (system)',
                'item/cai_decidedon': '@utcNow()',
                'item/cai_source': 'Release 1.0.3.5 failure path',
                'item/cai_comment': "@outputs('Failure_note')",
            }, 'host': dict(DV, operationId='CreateRecord')}},
            'Alert_admin_terms_not_computed': teams_post(
                f"@parameters('{P_ADMIN}')",
                "@concat('<p><b>CAI Contract Intelligence - effective terms NOT computed</b></p><p>Contract: ', outputs('Master_reference'), "
                "' (', coalesce(triggerOutputs()?['body/cai_documentname'], ''), '). ', outputs('Failure_note'), ' The contract now shows "
                "DEADLINE NOT VERIFIED and the assistant gives no date for it.</p>')",
                {'Log_terms_not_computed': ['Succeeded', 'Failed']}),
            'End_run_failed': {'type': 'Terminate', 'runAfter': {'Alert_admin_terms_not_computed': ['Succeeded', 'Failed', 'TimedOut', 'Skipped']},
                               'inputs': {'runStatus': 'Failed', 'runError': {'code': 'EffectiveTermsNotComputed', 'message': "@{outputs('Failure_note')}"}}},
        },
    }
    defn['parameters'].setdefault(P_ADMIN, PARAMS[P_ADMIN])
    assert P_TZ in defn['parameters']
    cd['properties']['connectionReferences'].setdefault('shared_teams', TEAMS_REF)
    return cd


# ------------------------------------------------------------------------------------------------------------------
# Extract contract on upload
# ------------------------------------------------------------------------------------------------------------------
FILE = "triggerOutputs()?['body/{FilenameWithExtension}']"
LINK = "triggerOutputs()?['body/{Link}']"
UPLOADER_EMAIL = "coalesce(triggerOutputs()?['body/Author/Email'], '')"
UPLOADER = "coalesce(triggerOutputs()?['body/Author/DisplayName'], triggerOutputs()?['body/Author/Email'], 'unknown')"
STEP = ("if(equals(actions('Get_file_content')?['status'], 'Failed'), 'open', if(equals(actions('Run_a_prompt')?['status'], 'Failed'), 'read', "
        "if(equals(actions('Parse_JSON')?['status'], 'Failed'), 'parse', if(equals(actions('Add_a_new_row')?['status'], 'Failed'), 'register', 'evidence'))))")
DETAIL_RAW = ("string(coalesce(actions('Get_file_content')?['error']?['message'], actions('Run_a_prompt')?['outputs']?['body']?['error']?['message'], "
              "actions('Run_a_prompt')?['error']?['message'], actions('Parse_JSON')?['error']?['message'], actions('Add_a_new_row')?['outputs']?['body']?['error']?['message'], "
              "actions('Add_a_new_row')?['error']?['message'], actions('Apply_to_each')?['error']?['message'], 'no error text returned'))")
REASONS = {
    'open': 'SharePoint did not return the file (it may have been deleted, moved or locked).',
    'read': 'The file could not be read as a contract: it may not be a PDF or Word document, it may be a scan without a text layer, password-protected, damaged or too large.',
    'parse': 'The extraction result could not be understood.',
    'register': 'The register row could not be written (check that the owner team has the CAI Contract Reader role).',
    'evidence': 'The register row was written but some evidence rows were not, so the extraction is incomplete.',
}
REASON = ("if(equals(outputs('Failure_step'), 'open'), '{open}', if(equals(outputs('Failure_step'), 'read'), '{read}', "
          "if(equals(outputs('Failure_step'), 'parse'), '{parse}', if(equals(outputs('Failure_step'), 'register'), '{register}', '{evidence}'))))").format(**REASONS)
TODO = ("if(contains(createArray('open', 'read'), outputs('Failure_step')), 'Upload a text-based PDF or Word copy of the signed contract "
        "(run text recognition on a scan first) to the same library. ', 'Upload the file again; if it fails again, ask the administrator to check the flow run. ')")


def patch_ext(cd):
    defn = cd['properties']['definition']
    acts = defn['actions']
    p = acts['Add_a_new_row']['inputs']['parameters']
    old = "@if(equals(body('Parse_JSON')?['renewal']?['value']?['notice_days'], null), null, int(body('Parse_JSON')?['renewal']?['value']?['notice_days']))"
    assert p['item/cai_noticedays'] == old
    nd = "body('Parse_JSON')?['renewal']?['value']?['notice_days']"
    p['item/cai_noticedays'] = '@' + safe_int(nd)
    # owner team missing: tell the admin before stopping
    branch = acts['Owner_team_configured']['actions']
    stop = branch['Stop_owner_team_missing']
    branch['Alert_owner_team_missing'] = teams_post(
        f"@parameters('{P_ADMIN}')",
        "@concat('<p><b>CAI Contract Intelligence - uploads are NOT processed</b></p><p>No owner team named ', parameters('cai_ContractOwnerTeam (cai_ContractOwnerTeam)'), "
        "' exists, so ', " + FILE + ", ' was not extracted. Set the environment variable cai_ContractOwnerTeam to an existing owner team that has the CAI Contract Reader role "
        "(INSTALL, configuration), then upload the file again.</p>')", {})
    stop['runAfter'] = {'Alert_owner_team_missing': ['Succeeded', 'Failed', 'TimedOut']}
    # a readable upload replaces earlier failed rows of the same file name in the same team
    acts['Find_earlier_failures'] = {'type': 'OpenApiConnection', 'runAfter': {'Apply_to_each': ['Succeeded']}, 'inputs': {'parameters': {
        'entityName': 'cai_contracts', '$select': 'cai_contractid',
        '$filter': ("@concat('cai_reviewstatus eq ''Extraction failed'' and cai_documentname eq ''', replace(" + FILE + ", '''', ''''''), "
                    "''' and _ownerid_value eq ', outputs('Owner_team_id'))")}, 'host': dict(DV, operationId='ListRecords')}}
    acts['Mark_earlier_failures_replaced'] = {'type': 'Foreach', 'foreach': "@outputs('Find_earlier_failures')?['body/value']",
                                              'runAfter': {'Find_earlier_failures': ['Succeeded']}, 'actions': {
        'Mark_replaced': {'type': 'OpenApiConnection', 'inputs': {'parameters': {
            'entityName': 'cai_contracts', 'recordId': "@items('Mark_earlier_failures_replaced')?['cai_contractid']",
            'item/cai_reviewstatus': 'Extraction failed - replaced',
            'item/cai_noticestatus': ("@concat('REPLACED: a readable upload of the same file was extracted on ', convertFromUtc(utcNow(), parameters('" + P_TZ + "'), 'yyyy-MM-dd'), "
                                      "' as ', coalesce(outputs('Add_a_new_row')?['body/cai_contractreference'], ''), '. This row is kept as evidence of the failed upload.')"),
        }, 'host': dict(DV, operationId='UpdateOnlyRecord')}}}}
    # failure path
    evidence = ("@string(addProperty(json('{}'), 'extraction_failed', setProperty(setProperty(setProperty(setProperty(setProperty(json('{}'), "
                "'step', outputs('Failure_step')), 'error', outputs('Failure_detail')), 'file', " + FILE + "), 'uploaded_by', " + UPLOADER + "), "
                "'flow_run', coalesce(workflow()?['run']?['name'], ''))))")
    message = ("@concat('<p><b>Contract file could not be read: ', " + FILE + ", '</b></p><p>Uploaded by ', " + UPLOADER + ", ' on ', "
               "convertFromUtc(utcNow(), parameters('" + P_TZ + "'), 'yyyy-MM-dd HH:mm'), '. <a href=\"', " + LINK + ", '\">Open the file</a></p><p><b>Why:</b> ', "
               "outputs('Failure_reason'), '</p><p><b>What to do:</b> ', outputs('Failure_todo'), 'The register keeps a row ', "
               "outputs('Failure_reference'), ' as evidence of this upload, with no dates; the assistant does not use it.</p>')")
    acts['Report_extraction_failure'] = {
        'type': 'Scope',
        'runAfter': {'Apply_to_each': ['Failed', 'Skipped', 'TimedOut']},
        'actions': {
            'Failure_step': {'type': 'Compose', 'runAfter': {}, 'inputs': '@' + STEP},
            'Failure_detail_raw': {'type': 'Compose', 'runAfter': {'Failure_step': ['Succeeded']}, 'inputs': '@' + DETAIL_RAW},
            'Failure_detail': {'type': 'Compose', 'runAfter': {'Failure_detail_raw': ['Succeeded']},
                               'inputs': "@if(greater(length(outputs('Failure_detail_raw')), 300), concat(substring(outputs('Failure_detail_raw'), 0, 297), '...'), outputs('Failure_detail_raw'))"},
            'Failure_reason': {'type': 'Compose', 'runAfter': {'Failure_detail': ['Succeeded']}, 'inputs': '@' + REASON},
            'Failure_todo': {'type': 'Compose', 'runAfter': {'Failure_reason': ['Succeeded']}, 'inputs': '@' + TODO},
            'Failure_reference': {'type': 'Compose', 'runAfter': {'Failure_todo': ['Succeeded']},
                                  'inputs': "@if(equals(actions('Add_a_new_row')?['status'], 'Succeeded'), coalesce(actions('Add_a_new_row')?['outputs']?['body']?['cai_contractreference'], ''), concat('UNREADABLE - ', " + FILE + "))"},
            'Row_exists': {'type': 'If', 'runAfter': {'Failure_reference': ['Succeeded']},
                           'expression': {'equals': ["@actions('Add_a_new_row')?['status']", 'Succeeded']},
                           'actions': {'Mark_row_failed': {'type': 'OpenApiConnection', 'inputs': {'parameters': {
                               'entityName': 'cai_contracts', 'recordId': "@outputs('Add_a_new_row')?['body/cai_contractid']",
                               'item/cai_reviewstatus': 'Extraction failed',
                               'item/cai_noticestatus': "@concat('FILE COULD NOT BE PROCESSED - NOT IN THE REGISTER. ', outputs('Failure_reason'), ' ', outputs('Failure_todo'))",
                           }, 'host': dict(DV, operationId='UpdateOnlyRecord')}}},
                           'else': {'actions': {'Add_failure_row': {'type': 'OpenApiConnection', 'inputs': {'parameters': {
                               'entityName': 'cai_contracts',
                               'item/cai_contractreference': "@outputs('Failure_reference')",
                               'item/cai_documentname': '@' + FILE,
                               'item/cai_documenthash': "@concat(triggerOutputs()?['body/{Identifier}'], '#v', string(triggerOutputs()?['body/{VersionNumber}']))",
                               'item/cai_sourceurl': '@' + LINK,
                               'item/cai_reviewstatus': 'Extraction failed',
                               'item/cai_approvalblocked': True,
                               'item/cai_noticestatus': "@concat('FILE COULD NOT BE READ - NOT IN THE REGISTER. ', outputs('Failure_reason'), ' ', outputs('Failure_todo'))",
                               'item/cai_extractionjson': evidence,
                               'item/ownerid@odata.bind': "@concat('teams(', outputs('Owner_team_id'), ')')",
                           }, 'host': dict(DV, operationId='CreateRecord')}}}}},
            'Failure_row_id': {'type': 'Compose', 'runAfter': {'Row_exists': ['Succeeded', 'Failed']},
                               'inputs': "@coalesce(actions('Add_failure_row')?['outputs']?['body']?['cai_contractid'], actions('Add_a_new_row')?['outputs']?['body']?['cai_contractid'], '')"},
            'Log_extraction_failure': {'type': 'OpenApiConnection', 'runAfter': {'Failure_row_id': ['Succeeded']}, 'inputs': {'parameters': {
                'entityName': 'cai_reviews',
                'item/cai_Contract@odata.bind': "@if(empty(outputs('Failure_row_id')), null, concat('cai_contracts(', outputs('Failure_row_id'), ')'))",
                'item/cai_title': "@concat(" + FILE + ", ' - could not be read')",
                'item/cai_decision': 'Extraction failed',
                'item/cai_reviewer': 'CAI Contract Intelligence (system)',
                'item/cai_decidedon': '@utcNow()',
                'item/cai_source': 'Release 1.0.3.5 extraction failure path',
                'item/cai_comment': "@concat(outputs('Failure_reason'), ' Detail: ', outputs('Failure_detail'))",
            }, 'host': dict(DV, operationId='CreateRecord')}},
            'Notify_reviewer': teams_post(f"@parameters('{P_REVIEWER}')", message, {'Log_extraction_failure': ['Succeeded', 'Failed']}),
            'Uploader_is_someone_else': {'type': 'If', 'runAfter': {'Notify_reviewer': ['Succeeded', 'Failed']},
                                         'expression': {'and': [{'not': {'equals': ['@' + UPLOADER_EMAIL, '']}},
                                                                {'not': {'equals': ['@toLower(' + UPLOADER_EMAIL + ')', f"@toLower(parameters('{P_REVIEWER}'))"]}}]},
                                         'actions': {'Notify_uploader': teams_post('@' + UPLOADER_EMAIL, message)}, 'else': {'actions': {}}},
            'End_run_failed': {'type': 'Terminate', 'runAfter': {'Uploader_is_someone_else': ['Succeeded', 'Failed', 'TimedOut', 'Skipped']},
                               'inputs': {'runStatus': 'Failed', 'runError': {'code': 'ExtractionFailed',
                                                                              'message': "@{concat(outputs('Failure_reason'), ' ', outputs('Failure_detail'))}"}}},
        },
    }
    for k in (P_ADMIN, P_REVIEWER, P_TZ):
        defn['parameters'].setdefault(k, PARAMS[k])
    cd['properties']['connectionReferences'].setdefault('shared_teams', TEAMS_REF)
    return cd


# ------------------------------------------------------------------------------------------------------------------
# Review gate: no card for a row whose extraction failed
# ------------------------------------------------------------------------------------------------------------------
def patch_gate(cd):
    trig = cd['properties']['definition']['triggers']['When_a_row_is_added,_modified_or_deleted']
    assert 'conditions' not in trig
    trig['conditions'] = [{'expression': FAILED_STATES}]
    return cd


# ------------------------------------------------------------------------------------------------------------------
# Agent tools: one contract = same reference and same owner team
# ------------------------------------------------------------------------------------------------------------------
REF_KEY = "toLower(trim(first(split(coalesce(item()?['cai_contractreference'], ''), ' / '))))"
OWNER_KEY = f"concat({REF_KEY}, '|', coalesce(item()?['_ownerid_value'], ''))"
SAME_REF_NOTE = ('Another contract with the same reference exists in a team the user can also see. These terms are only for the documents in '
                 'documents_in_family; the other documents are a different contract and their values must not be mixed in.')


def patch_terms(cd):
    acts = cd['properties']['definition']['actions']
    acts['Family_owner'] = {'type': 'Compose', 'inputs': (
        "@if(greater(length(body('Approved_masters')), 0), last(sort(body('Approved_masters'), 'createdon'))?['_ownerid_value'], "
        "if(greater(length(body('Family_rows')), 0), last(sort(body('Family_rows'), 'createdon'))?['_ownerid_value'], ''))")}
    acts['Owner_family_rows'] = {'type': 'Query', 'inputs': {'from': "@body('Family_rows')", 'where': "@equals(coalesce(item()?['_ownerid_value'], ''), coalesce(outputs('Family_owner'), ''))"}}
    acts['Other_team_rows'] = {'type': 'Query', 'inputs': {'from': "@body('Family_rows')", 'where': "@not(equals(coalesce(item()?['_ownerid_value'], ''), coalesce(outputs('Family_owner'), '')))"}}
    acts['Other_team_docs'] = {'type': 'Select', 'inputs': {'from': "@body('Other_team_rows')", 'select': {
        'document': "@item()?['cai_documentname']", 'reference': "@item()?['cai_contractreference']", 'review_status': "@item()?['cai_reviewstatus']"}}}
    # order: Family_rows -> Approved_masters -> Family_owner -> Owner_family_rows -> Other_team_rows -> Other_team_docs
    #        -> Family_summary -> Approved_amendments -> (rest unchanged)
    acts['Approved_masters']['runAfter'] = {'Family_rows': ['Succeeded']}
    acts['Family_owner']['runAfter'] = {'Approved_masters': ['Succeeded']}
    acts['Owner_family_rows']['runAfter'] = {'Family_owner': ['Succeeded']}
    acts['Other_team_rows']['runAfter'] = {'Owner_family_rows': ['Succeeded']}
    acts['Other_team_docs']['runAfter'] = {'Other_team_rows': ['Succeeded']}
    acts['Family_summary']['runAfter'] = {'Other_team_docs': ['Succeeded']}
    acts['Approved_amendments']['runAfter'] = {'Family_summary': ['Succeeded']}
    assert acts['Family_summary']['inputs']['from'] == "@body('Family_rows')"
    acts['Family_summary']['inputs']['from'] = "@body('Owner_family_rows')"
    assert acts['Approved_amendments']['inputs']['from'] == "@body('Family_rows')"
    acts['Approved_amendments']['inputs']['from'] = "@body('Owner_family_rows')"
    n = 0

    def add_note(a):
        nonlocal n
        for k, v in a.items():
            if k.startswith('Result_') and v['type'] == 'Compose' and isinstance(v['inputs'], dict):
                v['inputs']['same_reference_in_other_teams'] = "@body('Other_team_docs')"
                v['inputs']['same_reference_note'] = f"@if(greater(length(body('Other_team_docs')), 0), '{SAME_REF_NOTE}', '')"
                n += 1
            for sub_ in ('actions',):
                if sub_ in v:
                    add_note(v[sub_])
            if 'else' in v:
                add_note(v['else'].get('actions', {}))
    add_note(acts)
    assert n == 5, n
    return cd


def patch_notice(cd):
    acts = cd['properties']['definition']['actions']
    assert acts['References']['inputs']['select'] == '@' + REF_KEY
    acts['References']['inputs']['select'] = '@' + OWNER_KEY
    fe = acts['For_each_contract']['actions']
    assert fe['Master_rows']['inputs']['where'] == f"@equals({REF_KEY}, items('For_each_contract'))"
    fe['Master_rows']['inputs']['where'] = f"@equals({OWNER_KEY}, items('For_each_contract'))"
    old = f"@and(not(equals(item()?['cai_documentrole'], 'master')), equals({REF_KEY}, items('For_each_contract')))"
    assert fe['Amendment_rows']['inputs']['where'] == old
    fe['Amendment_rows']['inputs']['where'] = f"@and(not(equals(item()?['cai_documentrole'], 'master')), equals({OWNER_KEY}, items('For_each_contract')))"
    return cd


def patch_topic(yaml_text):
    marker = '          $select: cai_contractid,'
    assert yaml_text.count(marker) == 1
    start = yaml_text.index(marker)
    end = yaml_text.index('\n', start)
    yaml_text = yaml_text[:end] + ',_ownerid_value' + yaml_text[end:]
    schema = '                cai_contractid: String\n'
    assert yaml_text.count(schema) == 1
    return yaml_text.replace(schema, schema + '                _ownerid_value: String\n')


def patch_gpt(yaml_text):
    anchor = "  - For portfolio lists, also report contracts listed under deadlines_not_verified"
    assert yaml_text.count(anchor) == 1
    add = ("  - If same_reference_in_other_teams lists documents, say that another contract with the same reference exists in a team "
           "you can also see, name its documents, and make clear the values given are only for the documents in documents_in_family. "
           "Never mix values from the two contracts. In portfolio lists, contracts with the same reference in different teams are separate entries.\n")
    return yaml_text.replace(anchor, add + anchor)


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for key, fn in (('eff', patch_eff), ('ext', patch_ext), ('gate', patch_gate), ('terms', patch_terms), ('notice', patch_notice)):
        stem = FILES[key]
        cd = json.loads((src / f'{stem}.clientdata.json').read_text(encoding='utf-8'))
        cd = fn(copy.deepcopy(cd))
        (out / f'{stem}.clientdata.json').write_text(json.dumps(cd, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        (out / f'{stem}.definition.json').write_text(json.dumps(cd['properties']['definition'], ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    for name in ('topic.T7NoticeDeadlines.yaml', 'topic.T7GetEffectiveTerms.yaml'):
        (out / name).write_text(patch_topic((src / name).read_text(encoding='utf-8')), encoding='utf-8')
    (out / 'gpt.default.yaml').write_text(patch_gpt((src / 'gpt.default.yaml').read_text(encoding='utf-8')), encoding='utf-8')
    print(f'wrote {out}')


if __name__ == '__main__':
    main()
