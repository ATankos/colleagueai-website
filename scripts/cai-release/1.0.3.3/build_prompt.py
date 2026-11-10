"""Build the 1.0.3.3 extraction prompt configuration from the 1.0.3.2 one.

Changes (all additive or narrowing; the output stays a superset of 1.0.3.2):
  - renewal.value.notice_period {amount, unit, reference, timing, wording}: the notice period exactly as stated.
    notice_days is filled only when the stated unit is days (never a conversion of months or years).
  - signing_date: a field of its own, so it is never put into effective_date.
  - effective_date rule: the date the document takes effect ("with effect from", "effective as of").
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
    '\n10. Notice period for renewal or non-renewal ("renewal.value.notice_period"): "amount" is the number as stated; "unit" is '
    'exactly one of "day", "business_day", "week", "month", "year" as stated (calendar months stay "month"; "working days" are '
    '"business_day"); "reference" is "term_end" when the period is counted back from the end or expiry of the (current) term, '
    '"renewal_date" when it is counted back from the renewal date or the start of a renewal term, otherwise "other"; "timing" is '
    '"on_or_before" for wording such as "at least", "not less than", "no later than", "prior to" or "before ... upon N months\' notice", '
    '"before" only for "more than" or "strictly before", otherwise "other"; "wording" is the verbatim notice sentence. Fill '
    '"notice_days" only when the stated unit is days, otherwise null. If two clauses state different notice periods, follow rule 3.'
    '\n11. "effective_date" is the date from which the document takes effect ("with effect from", "effective as of", "commencing on"). '
    'Put the date of signature in "signing_date", never in "effective_date". Use the signing date as the effective date only when '
    'the document says it takes effect on signature, and quote that sentence. If the document gives no effective date, set '
    '"effective_date" to "not_found". The same applies to "amends[].effective_date".'
    '\n12. If any clause anywhere in the document (including schedules, annexes, footnotes and small print) contradicts a value you '
    'report, set that field\'s status to "ambiguous" (or "conflict_resolved" when the document says which text prevails), put both '
    'quotes in "quote" as in rule 3, and also list the clause in "unusual_clauses".'))

old_ren = '"renewal": {value: {type: "automatic" | "none" | "manual", period_months, notice_days, notice_rule_text}, quote, location, status},'
new_ren = ('"renewal": {value: {type: "automatic" | "none" | "manual", period_months, notice_period: {amount, unit, reference, timing, wording}, '
           'notice_days, notice_rule_text}, quote, location, status},')
assert t.count(old_ren) == 1
t = t.replace(old_ren, new_ren)
old_eff = '"effective_date": {value, quote, location, status},'
assert t.count(old_eff) == 1
t = t.replace(old_eff, old_eff + '\n  "signing_date": {value, quote, location, status},')
lit['text'] = t

schema = j['definitions']['output']['jsonSchema']['properties']
ren_val = schema['renewal']['properties']['value']['properties']
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
        r['value'] = {k: v[k] for k in ('type', 'period_months', 'notice_period', 'notice_days', 'notice_rule_text') if k in v}
    if 'effective_date' in ex and 'signing_date' not in ex:
        items = list(ex.items()); out = {}
        for k, val in items:
            out[k] = val
            if k == 'effective_date':
                out['signing_date'] = {'value': None, 'quote': None, 'location': None, 'status': 'not_found'}
        ex.clear(); ex.update(out)

dst.write_text(json.dumps(j, ensure_ascii=False), encoding='utf-8')
print('prompt chars', len(t), 'config bytes', len(json.dumps(j)))
