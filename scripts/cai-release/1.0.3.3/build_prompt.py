"""Build the 1.0.3.3 extraction prompt configuration from the 1.0.3.2 one (revision 2).

Changes (all additive or narrowing; the output stays a superset of 1.0.3.2):
  - renewal.value.notice_period {amount, unit, reference, timing, wording}: the notice period exactly as stated.
    notice_days is filled only when the stated unit is days (never a conversion of months or years).
  - signing_date: a field of its own, so it is never put into effective_date.
  - effective_date rule: the date the document takes effect ("with effect from", "effective as of").
  - renewal.value.notice_clauses: every notice-of-non-renewal sentence anywhere in the document (body, schedules, order
    forms, small print), so the flow can detect conflicting periods itself instead of relying on the model's judgement.
  - rule 14 (rev 4): contract_reference is the identifier only; amendments start with the master agreement identifier
    (the register links an amendment to its master by that prefix).
  - rule 10 (rev 2): notice_period only for non-renewal; explicit Renewal Date and "more than" examples.
  - contradiction rule: any clause anywhere (schedules, annexes, small print) that contradicts a reported value
    makes that field "ambiguous" (or "conflict_resolved" when the document says which prevails), both quotes kept.
"""
import json, sys
from pathlib import Path

src = Path(sys.argv[1]); dst = Path(sys.argv[2])
j = json.loads(src.read_text(encoding='utf-8'))

lit = j['prompt'][0]
assert lit['type'] == 'literal'
t = lit['text']

old5 = ('5. Dates in ISO format (YYYY-MM-DD). Durations as stated (months or days). Amounts as plain numbers without '
        'thousands separators, with the ISO currency code in the separate currency field. Do not calculate deadlines or '
        'end dates; only report the rule text.')
new5 = ('5. Dates in ISO format (YYYY-MM-DD). Report every duration and notice period with the number and the unit exactly as '
        'the document states them: never convert months or years into days, or days into months. Amounts as plain numbers '
        'without thousands separators, with the ISO currency code in the separate currency field. Do not calculate deadlines '
        'or end dates; only report the rule text.')
assert t.count(old5) == 1, 'rule 5 text changed'
t = t.replace(old5, new5)

old9_end = 'and add an item to "open_questions" saying which party has not signed.'
assert t.count(old9_end) == 1
t = t.replace(old9_end, old9_end + (
    '\n10. Notice period for non-renewal ("renewal.value.notice_period"): the notice a party must give so that the agreement does not '
    'renew, or ends at the end of a term. If the agreement does not renew, set "notice_period" to null; notice for early termination '
    'belongs in "termination_for_convenience", never here. "amount" is the number as stated; "unit" is exactly one of "day", '
    '"business_day", "week", "month", "year" as stated (calendar months stay "month"; "working days" and "Business Days" are '
    '"business_day"). "reference" is "renewal_date" when the period is counted back from the Renewal Date, the renewal date or the start '
    'of a renewal term (for example "prior to the Renewal Date"); "term_end" when it is counted back from the end or expiry of the '
    '(current) term or renewal period; otherwise "other". "timing" is "before" when the wording says "more than" (for example "more than '
    'sixty (60) days before the end of the term") or "strictly before"; "on_or_before" for "at least", "not less than", "no later than", '
    '"not later than" or "prior to" without "more than"; otherwise "other". "wording" is the verbatim notice sentence. Fill "notice_days" '
    'only when the stated unit is days, otherwise null. If two clauses state different notice periods, follow rule 3 and rule 13.'
    '\n11. "effective_date" is the date from which the document takes effect ("with effect from", "effective as of", "commencing on"). '
    'Put the date of signature in "signing_date", never in "effective_date". Use the signing date as the effective date only when '
    'the document says it takes effect on signature, and quote that sentence. If the document gives no effective date, treat '
    '"effective_date" as not found (rule 2: value null, status "not_found"). The same applies to "amends[].effective_date".'
    '\n12. If any clause anywhere in the document (including schedules, annexes, footnotes and small print) contradicts a value you '
    'report, set that field\'s status to "ambiguous" (or "conflict_resolved" when the document says which text prevails), put both '
    'quotes in "quote" as in rule 3, and also list the clause in "unusual_clauses".'
    '\n13. "renewal.value.notice_clauses": read the whole document again, including schedules, order forms, annexes, tables, '
    'footnotes and small or light-coloured print, and list every sentence that sets a notice period for non-renewal or for ending the '
    'agreement at the end of a term, each as {quote, location, amount, unit} (unit as in rule 10). List each sentence once. If the list '
    'contains different periods and the document does not say which text prevails, set "renewal.status" to "ambiguous". Use an '
    'empty list when there is no such sentence.'
    '\n14. "contract_reference" is the agreement identifier only, as printed but without leading words such as "Agreement No.", '
    '"Contract No." or a document title (for example "SYN-COST-003", not "Agreement No. SYN-COST-003" or "Master Services Agreement '
    'SYN-COST-003"). For an amendment, annex, order form or SOW, "contract_reference" starts with the identifier of the master agreement '
    'it belongs to, followed by " / " and the document\'s own number if it has one (for example "SYN-COST-003 / Amendment 1"), and '
    '"amends[].master_reference" is the master agreement identifier only.'))

old_ren = '"renewal": {value: {type: "automatic" | "none" | "manual", period_months, notice_days, notice_rule_text}, quote, location, status},'
new_ren = ('"renewal": {value: {type: "automatic" | "none" | "manual", period_months, notice_period: {amount, unit, reference, timing, wording}, '
           'notice_clauses: [{quote, location, amount, unit}], notice_days, notice_rule_text}, quote, location, status},')
assert t.count(old_ren) == 1
t = t.replace(old_ren, new_ren)
old_eff = '"effective_date": {value, quote, location, status},'
assert t.count(old_eff) == 1
t = t.replace(old_eff, old_eff + '\n  "signing_date": {value, quote, location, status},')
lit['text'] = t

schema = j['definitions']['output']['jsonSchema']['properties']
ren_val = schema['renewal']['properties']['value']['properties']
ren_val['notice_clauses'] = {'type': 'array', 'items': {'type': 'object', 'properties': {
    'quote': {'type': 'string'}, 'location': {'type': 'string'}, 'amount': {'type': 'number'}, 'unit': {'type': 'string'}}}}
ren_val['notice_period'] = {'type': 'object', 'properties': {
    'amount': {'type': 'number'}, 'unit': {'type': 'string'}, 'reference': {'type': 'string'},
    'timing': {'type': 'string'}, 'wording': {'type': 'string'}}}
schema['signing_date'] = json.loads(json.dumps(schema['effective_date']))

for ex in j['definitions']['output'].get('jsonExamples', []):
    r = ex.get('renewal')
    if isinstance(r, dict) and isinstance(r.get('value'), dict):
        v = r['value']
        v['notice_period'] = {'amount': 90, 'unit': 'day', 'reference': 'term_end', 'timing': 'on_or_before',
                              'wording': v.get('notice_rule_text') or 'verbatim notice sentence'}
        v['notice_clauses'] = [{'quote': v['notice_period']['wording'], 'location': r.get('location') or 'clause', 'amount': 90, 'unit': 'day'}]
        r['value'] = {k: v[k] for k in ('type', 'period_months', 'notice_period', 'notice_clauses', 'notice_days', 'notice_rule_text') if k in v}
    if 'effective_date' in ex and 'signing_date' not in ex:
        items = list(ex.items()); out = {}
        for k, val in items:
            out[k] = val
            if k == 'effective_date':
                out['signing_date'] = {'value': None, 'quote': None, 'location': None, 'status': 'not_found'}
        ex.clear(); ex.update(out)

dst.write_text(json.dumps(j, ensure_ascii=False), encoding='utf-8')
print('prompt chars', len(t), 'config bytes', len(json.dumps(j)))
