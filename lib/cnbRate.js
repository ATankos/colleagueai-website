/**
 * lib/cnbRate.js - the Czech National Bank's daily exchange rate for a date, for the CZK conversion printed on a
 * company-ledger invoice when the approved tax policy chooses it (config/tax-policy.json checkout.czkConversion =
 * 'cnb_daily_rate_on_tax_point', accountant decision T8). Nothing calls this while T8 is undecided.
 *
 * Source: ČNB "kurzy devizového trhu", plain-text daily list for a given date (the list valid on that date; for a
 * weekend or holiday ČNB answers with the last list published before it, and the list's own date is recorded).
 */
const URL_BASE = 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';

const realFetchText = async (url) => {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`ČNB answered ${res.status}`);
  return res.text();
};
let fetchText = realFetchText;
export function __setCnbFetchForTests(fn) { fetchText = fn || realFetchText; }

/** Parse the ČNB text list. Returns { listDate: 'YYYY-MM-DD', listNo, rates: { USD: { amount, rate } } }. */
export function parseCnbList(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  const head = /^(\d{2})\.(\d{2})\.(\d{4})\s+#(\d+)/.exec(lines[0] || '');
  if (!head) throw new Error('ČNB list: unrecognised header');
  const rates = {};
  for (const line of lines.slice(2)) {
    const p = line.split('|');
    if (p.length !== 5) continue;
    const amount = Number(p[2]);
    const rate = Number(String(p[4]).replace(',', '.'));
    if (/^[A-Z]{3}$/.test(p[3]) && amount > 0 && rate > 0) rates[p[3]] = { amount, rate };
  }
  return { listDate: `${head[3]}-${head[2]}-${head[1]}`, listNo: Number(head[4]), rates };
}

/**
 * The conversion record for an amount in minor units: { amountCzk, rate (CZK per 1 unit), date, listDate, source }.
 * `date` is the tax point (YYYY-MM-DD). Throws when ČNB cannot be read or lists no rate for the currency; the caller
 * then issues the invoice without a conversion rather than with a guessed one.
 */
export async function cnbConversion({ amountMinor, currency, date }) {
  const cur = String(currency || '').toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('cnbConversion: date must be YYYY-MM-DD');
  const [y, m, d] = date.split('-');
  const list = parseCnbList(await fetchText(`${URL_BASE}?date=${d}.${m}.${y}`));
  const r = list.rates[cur];
  if (!r) throw new Error(`ČNB list ${list.listDate} has no rate for ${cur}`);
  const perUnit = r.rate / r.amount;
  return {
    amountCzk: Math.round(amountMinor * perUnit), // minor units (haléře), like every other amount on the order
    rate: Number(perUnit.toFixed(4)), date, listDate: list.listDate,
    source: `ČNB daily rate list ${list.listDate} #${list.listNo}`,
  };
}
