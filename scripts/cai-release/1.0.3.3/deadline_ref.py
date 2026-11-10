"""Reference and independent calculations for the 1.0.3.3 notice-deadline rules.

register_deadline(): the rule the Effective terms flow implements (Logic Apps semantics:
subtractFromTime(..., 'Month') = .NET AddMonths, which clamps to the last day of a shorter month).

independent_latest(): an independent calculation by brute force, with no month arithmetic library:
the latest calendar day D on which notice still leaves the stated period before the anchor, where
"N months after D" is counted by day number (a missing day number means the last day of that month).

The register is meant to be conservative: never later than the independent latest date, and equal
to it except at month-end anchors, where some readings allow the last day of the earlier month.
"""
from datetime import date, timedelta
import calendar

UNITS = ('day', 'business_day', 'week', 'month', 'year')


def add_months_net(d, n):
    """.NET DateTime.AddMonths (clamps the day to the target month)."""
    m0 = d.year * 12 + (d.month - 1) + n
    y, m = divmod(m0, 12)
    m += 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def months_after_by_day_number(d, n):
    """Independent month counting: same day number n months later, or the last day if that month is shorter."""
    y, m = d.year, d.month
    for _ in range(n):
        m += 1
        if m == 13:
            y, m = y + 1, 1
    last = 30 if m in (4, 6, 9, 11) else 31
    if m == 2:
        last = 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28
    return date(y, m, min(d.day, last))


def legacy_notice(notice_days, wording):
    """1.0.3.2 records stored only notice_days. Re-derive the unit from the stored wording, as the flow does."""
    if notice_days is None:
        return None
    lw = (wording or '').lower()
    nd = int(notice_days)
    if 'month' in lw and ' day' not in lw and nd % 30 == 0:
        return {'amount': nd // 30, 'unit': 'month', 'reference': 'term_end_assumed', 'timing': 'on_or_before_assumed', 'legacy': True}
    if 'year' in lw and 'month' not in lw and ' day' not in lw and nd in (360, 365, 366):
        return {'amount': 1, 'unit': 'year', 'reference': 'term_end_assumed', 'timing': 'on_or_before_assumed', 'legacy': True}
    if 'week' in lw and ' day' not in lw and nd % 7 == 0:
        return {'amount': nd // 7, 'unit': 'week', 'reference': 'term_end_assumed', 'timing': 'on_or_before_assumed', 'legacy': True}
    return {'amount': nd, 'unit': 'day', 'reference': 'term_end_assumed', 'timing': 'on_or_before_assumed', 'legacy': True}


def normalise_unit(u):
    u = (u or '').lower()
    if 'business' in u or 'working' in u:
        return 'business_day'
    for k in ('month', 'year', 'week', 'day'):
        if k in u:
            return k
    return ''


def register_deadline(term_end, notice, status='found'):
    """Return (deadline, flags) as the 1.0.3.3 flow computes them."""
    flags = []
    unit = normalise_unit(notice.get('unit'))
    amount = notice.get('amount')
    ref = notice.get('reference') or ''
    timing = notice.get('timing') or ''
    if amount is None or not unit:
        return None, ['notice period amount or unit missing']
    amount = int(amount)
    if notice.get('legacy') and unit != 'day':
        flags.append('legacy days converted')
    anchor = term_end + timedelta(days=1) if ref == 'renewal_date' else term_end
    if ref not in ('term_end', 'renewal_date', 'term_end_assumed'):
        flags.append('reference unclear')
    if unit == 'month':
        raw = add_months_net(anchor, -amount)
    elif unit == 'year':
        raw = add_months_net(anchor, -12 * amount)
    elif unit == 'week':
        raw = anchor - timedelta(days=7 * amount)
    elif unit == 'business_day':
        raw = anchor - timedelta(days=(amount * 7 + 4) // 5 + 4)
        flags.append('business days estimated')
    else:
        raw = anchor - timedelta(days=amount)
    if timing in ('on_or_before', 'on_or_before_assumed'):
        d = raw
    else:
        d = raw - timedelta(days=1)
        if timing != 'before':
            flags.append('timing unclear')
    if status == 'ambiguous':
        flags.append('conflicting provisions')
    return d, flags


def independent_latest(term_end, amount, unit, reference='term_end', strictly_before=False):
    """Brute force: latest D such that the period counted forward from D does not pass the anchor."""
    anchor = term_end + timedelta(days=1) if reference == 'renewal_date' else term_end
    d = anchor
    for _ in range(4000):
        if unit == 'month':
            end = months_after_by_day_number(d, amount)
        elif unit == 'year':
            end = months_after_by_day_number(d, 12 * amount)
        elif unit == 'week':
            end = d + timedelta(days=7 * amount)
        else:
            end = d + timedelta(days=amount)
        ok = end < anchor if strictly_before else end <= anchor
        if ok:
            return d
        d -= timedelta(days=1)
    raise RuntimeError('no date found')
