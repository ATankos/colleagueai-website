"""Synthetic notice-period contracts for the 1.0.3.3 extraction tests (all names and numbers invented).

Output: pdf/*.pdf, truth.json with the expected notice period (amount, unit, reference, timing, status), term end,
renewal period and the expected register deadline (computed by deadline_ref.register_deadline, cross-checked by
independent_latest).
"""
import json, os, sys
from datetime import date
import types
sys.path.insert(0, os.path.dirname(__file__))
from deadline_ref import register_deadline, independent_latest

HERE = os.path.dirname(__file__)
# Reuse only the layout helpers (build, signature, boiler) of the D7/D11 generator. Importing gen.py would rebuild
# the D7/D11 PDFs (new CreationDate/ID), so execute just the part before its first document.
_gen_path = next(p for p in (os.environ.get('D7D11_GEN', ''),
                              os.path.join(HERE, '..', 'd7d11', 'gen.py'),
                              os.path.join(HERE, '..', '..', '..', 'docs', 'cai-l4-ci-001', 'test-fixtures', 'd7-d11', 'gen.py'))
                 if p and os.path.exists(p))
_src = open(_gen_path, encoding='utf-8').read()
_cut = _src.index('\ntruth = {}\n')
g = types.ModuleType('d7d11_layout')
g.__file__ = _gen_path
exec(compile(_src[:_cut], _gen_path, 'exec'), g.__dict__)
g.OUT = os.path.join(HERE, 'pdf')
os.makedirs(g.OUT, exist_ok=True)
if os.environ.get('TRUTH_ONLY'):  # recompute truth.json without rebuilding the PDFs (keeps their bytes and hashes)
    g.build = lambda *a, **k: None
CUST = 'Brightwater Labs s.r.o.'
truth = {}


def contract(ref, title, supplier, start, end_text, term_clause, renewal_clause, extra_sections=(), signed='10 November 2026',
             expect=None, role='master', meta_extra=()):
    meta = [f'Agreement No. {ref}', f'between <b>{CUST}</b>, Vinohradska 2133/112, Prague (the "Customer")',
            f'and <b>{supplier}</b> (the "Supplier")', *meta_extra]
    secs = [('1. Subject', [f'1.1 The Supplier provides the services described in Schedule 1 to the Customer.']),
            ('2. Fees', ['2.1 The Customer pays a monthly fee of EUR 4,500 (exclusive of VAT), invoiced monthly in arrears; invoices are payable within thirty (30) days.']),
            ('3. Term and renewal', [term_clause, renewal_clause]),
            ('4. Liability', ['4.1 Each party\'s total liability under this Agreement is limited to the fees paid in the twelve (12) months before the claim.']),
            *extra_sections,
            ('5. Governing law', ['5.1 This Agreement is governed by the laws of the Czech Republic.'])]
    secs += g.signature(CUST, supplier, signed)
    g.build(f'{ref}.pdf', title, meta, secs)
    truth[ref] = dict(expect, role=role)


def exp(term_end, amount, unit, reference='term_end', timing='on_or_before', status='found', period=12, renewal='automatic', candidates=(), wording=''):
    te = date.fromisoformat(term_end)
    d, flags = register_deadline(te, {'amount': amount, 'unit': unit, 'reference': reference, 'timing': timing}, status, candidates, wording)
    ind = None
    if unit in ('day', 'week', 'month', 'year'):
        ind = independent_latest(te, amount, unit, reference, strictly_before=(timing == 'before')).isoformat()
    return dict(term_end=term_end, renewal=renewal, period_months=period, notice=dict(amount=amount, unit=unit, reference=reference, timing=timing),
                candidates=[list(c) for c in candidates], status=status, deadline=d.isoformat() if d else None, independent_latest=ind, flags=flags)


S = 'Helix Facility Services a.s.'
contract('SYN-N01', 'Managed Print Services Agreement', S, '2027-02-01', '',
         '3.1 This Agreement commences on 1 February 2027 and runs until 31 January 2028 (the "Initial Term").',
         '3.2 It then renews automatically for successive periods of twelve (12) months unless either party gives written notice of non-renewal at least three (3) months before the end of the then-current term.',
         expect=exp('2028-01-31', 3, 'month'))
contract('SYN-N02', 'Cleaning Services Agreement', S, '2026-03-01', '',
         '3.1 This Agreement commences on 1 March 2026 and expires on 29 February 2028 (the "Initial Term").',
         '3.2 Unless terminated by notice given no later than six (6) months prior to the expiry of the Initial Term or of any renewal period, this Agreement renews automatically for further periods of twelve (12) months.',
         expect=exp('2028-02-29', 6, 'month'))
contract('SYN-N03', 'Software Support Agreement', 'Kestrel Data GmbH', '2025-01-01', '',
         '3.1 This Agreement commences on 1 January 2025 and continues until 31 December 2027.',
         '3.2 Thereafter it renews automatically for successive twelve (12) month periods unless terminated by either party on not less than twelve (12) months\' written notice before the end of the current term.',
         expect=exp('2027-12-31', 12, 'month'))
contract('SYN-N04', 'Security Monitoring Agreement', S, '2026-03-01', '',
         '3.1 This Agreement commences on 1 March 2026 and ends on 28 February 2027. The first day after the end of any term is the "Renewal Date".',
         '3.2 On each Renewal Date this Agreement renews for a further twelve (12) months unless either party has given notice of non-renewal at least three (3) months prior to the Renewal Date.',
         expect=exp('2027-02-28', 3, 'month', reference='renewal_date'))
contract('SYN-N05', 'Data Hosting Agreement', 'Kestrel Data GmbH', '2026-01-01', '',
         '3.1 This Agreement has an initial term from 1 January 2026 to 31 December 2027.',
         '3.2 It renews automatically for further periods of twelve (12) months unless a party gives written notice at least ninety (90) days before the end of the then-current term.',
         expect=exp('2027-12-31', 90, 'day'))
contract('SYN-N06', 'Translation Services Agreement', 'Lingua Partners s.r.o.', '2026-07-01', '',
         '3.1 This Agreement runs from 1 July 2026 until 30 June 2027.',
         '3.2 It renews automatically for successive periods of twelve (12) months unless either party gives notice of non-renewal more than sixty (60) days before the end of the current term.',
         expect=exp('2027-06-30', 60, 'day', timing='before', wording='more than sixty (60) days before the end of the current term'))
contract('SYN-N07', 'Courier Services Agreement', 'Swift Parcel a.s.', '2026-10-01', '',
         '3.1 This Agreement runs from 1 October 2026 until 30 September 2027.',
         '3.2 It renews automatically for periods of twelve (12) months unless terminated by at least eight (8) weeks\' written notice before expiry of the current term.',
         expect=exp('2027-09-30', 8, 'week'))
contract('SYN-N08', 'Payroll Services Agreement', 'Ledger Works s.r.o.', '2026-11-01', '',
         '3.1 This Agreement runs from 1 November 2026 until 31 October 2027.',
         '3.2 It renews automatically for further periods of twelve (12) months unless either party gives notice not later than thirty (30) Business Days before the end of the term. "Business Day" means a day on which banks are open in Prague.',
         expect=exp('2027-10-31', 30, 'business_day'))
contract('SYN-N09', 'Facility Maintenance Agreement', S, '2026-01-01', '',
         '3.1 This Agreement runs from 1 January 2026 until 31 December 2027.',
         '3.2 It renews automatically for further periods of twelve (12) months unless either party gives notice of non-renewal at least three (3) months before the end of the then-current term.',
         extra_sections=[('Schedule 2 - Service levels', ['S2.1 Availability target: 99.5% per month.',
                          ('small', 'S2.9 Any notice of non-renewal requires at least six (6) months before the end of the then-current term.')])],
         expect=exp('2027-12-31', 3, 'month', status='ambiguous', candidates=[(3, 'month'), (6, 'month')]))
contract('SYN-N10', 'Catering Services Agreement', 'Gastro Plus s.r.o.', '2026-05-01', '',
         '3.1 This Agreement runs from 1 May 2026 until 30 April 2028. The Order Form prevails over these terms in case of conflict.',
         '3.2 It renews automatically for further periods of twelve (12) months unless either party gives notice of non-renewal at least three (3) months before the end of the then-current term.',
         extra_sections=[('Order Form', [('table', [['Item', 'Agreed'], ['Monthly fee', 'EUR 4,500'],
                                                   ['Notice of non-renewal', 'at least two (2) months before the end of the then-current term']])])],
         expect=exp('2028-04-30', 2, 'month', status='conflict_resolved', candidates=[(3, 'month'), (2, 'month')]))
contract('SYN-N11', 'Network Services Agreement', 'Kestrel Data GmbH', '2026-07-01', '',
         '3.1 This Agreement runs from 1 July 2026 until 30 June 2028.',
         '3.2 It renews automatically for further periods of twelve (12) months unless either party gives notice of non-renewal at least six (6) months before the end of the then-current term.',
         expect=exp('2028-06-30', 6, 'month'))
g.build('SYN-N11-A1.pdf', 'Amendment No. 1 to the Network Services Agreement',
        ['Amendment No. 1 to Agreement No. SYN-N11', f'between <b>{CUST}</b> and <b>Kestrel Data GmbH</b>'],
        [('1. Amendment', ['1.1 Clause 3.2 of Agreement No. SYN-N11 is replaced as follows: "It renews automatically for further periods of twelve (12) months unless either party gives notice of non-renewal at least three (3) months before the end of the then-current term."',
                           '1.2 This Amendment takes effect with effect from 1 January 2027. All other terms remain unchanged.'])]
        + g.signature(CUST, 'Kestrel Data GmbH', '10 December 2026'))
truth['SYN-N11-A1'] = dict(role='amendment', effective_date='2027-01-01', signing_date='2026-12-10',
                           notice=dict(amount=3, unit='month', reference='term_end', timing='on_or_before'),
                           combined=exp('2028-06-30', 3, 'month'))
contract('SYN-N12', 'Archive Storage Agreement', 'Vault Box s.r.o.', '2026-09-01', '',
         '3.1 This Agreement runs from 1 September 2026 until 31 August 2028.',
         '3.2 It renews automatically for further periods of twelve (12) months unless either party gives notice of non-renewal at least six (6) months before the end of the then-current term.',
         expect=exp('2028-08-31', 6, 'month'))
contract('SYN-N13', 'Equipment Maintenance Agreement', S, '2023-01-01', '',
         '3.1 This Agreement commenced on 1 January 2023 with an initial term of three (3) years ending on 31 December 2025.',
         '3.2 It renews automatically for successive renewal periods of twelve (12) months unless either party gives notice of non-renewal at least three (3) months before the end of the current renewal period.',
         signed='15 December 2022',
         expect=dict(exp('2026-12-31', 3, 'month'), note='rolls forward: 2025-12-31 -> 2026-12-31; deadline 2026-09-30 missed -> next term 2027-12-31, next deadline 2027-09-30',
                     next_deadline=register_deadline(date(2027, 12, 31), {'amount': 3, 'unit': 'month', 'reference': 'term_end', 'timing': 'on_or_before'})[0].isoformat()))
contract('SYN-N14', 'Event Support Agreement', 'Stage Crew s.r.o.', '2026-12-01', '',
         '3.1 This Agreement runs from 1 December 2026 until 31 December 2027.',
         '3.2 This Agreement expires at the end of the term and does not renew automatically.',
         expect=dict(term_end='2027-12-31', renewal='none', notice=None, deadline=None, flags=[]))

json.dump(truth, open(os.path.join(HERE, 'truth.json'), 'w'), indent=1)
print(len(truth), 'documents;', sorted(os.listdir(g.OUT)))
for k, v in truth.items():
    e = v.get('combined') or v
    print(k, e.get('term_end'), e.get('notice'), e.get('deadline'), e.get('independent_latest'), e.get('flags'))
