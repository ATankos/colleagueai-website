# Microsoft invoice G195024562: assessment record

| Item | State (22 Nov 2026) |
|---|---|
| Original invoice | **not available in this workspace.** Reported on 30 Oct 2026 as EUR 218.52 net + EUR 45.89 VAT. |
| Finding on an October 2026 VAT obligation | **cannot be made without the original**; not made here |
| Filing or payment | none represented; none on record |
| Deadline to watch | if a self-assessment duty arose in October 2026, the return and payment for October fall due on **25 Nov 2026** (the 25th of the following month); the accountant confirms from the original |

## What the original must show, field by field

1. **Supplier entity and its VAT number.** A foreign entity (for example an Irish one) or a Czech entity (CZ…) decides
   whether this is a service from a non-established person at all.
2. **Customer block.** Which Colleague AI identifier is printed, and whether a DIČ appears. Microsoft treats a customer
   without a validated VAT ID as a non-business customer and charges local VAT.
3. **VAT line.** Rate, amount, which country's VAT, and any reverse-charge legend. EUR 45.89 on EUR 218.52 is 21.0 %,
   the Czech standard rate: consistent with Czech VAT charged because no VAT ID was on the account. That is an
   inference from the reported figures, not a finding.
4. **Invoice date and service period or tax point.** These decide the month.
5. **Service description:** cloud subscription, licence, consumption or marketplace fee.
6. **Net amount and currency;** the CZK rate rule the accountant applies.
7. **Payment date.**

## Decision tree for the accountant (none applied here)

| Original shows | Consequence to assess |
|---|---|
| Foreign supplier, no VAT, reverse-charge legend | the identified person self-assesses Czech VAT for the month of the tax point (§ 108(3)(a)(1) ZDPH); no deduction |
| Foreign supplier, Czech (or other) VAT charged, no VAT ID of ours on the invoice | the supplier treated the company as a non-business customer. The charged VAT is not recoverable by an identified person. Whether a self-assessment duty still arises is the accountant's call: VAT charged by the supplier does not by itself remove it. Ask Microsoft for a corrected invoice, and add the DIČ to the Microsoft account once the official record confirms it. |
| Czech supplier entity with a CZ VAT number | domestic supply with Czech VAT; no self-assessment; no deduction |

## How to close this record

1. Founder: download the original from the Microsoft admin centre (Billing → Invoices), store it privately, compute
   its SHA-256.
2. Enter it as the first record of the private register (`foreign-supplier-purchases.md`).
3. Run `node scripts/commerce/foreign-purchases.mjs <register>`.
4. Accountant: decide in writing before 25 Nov 2026 whether an October return is due. Copy the decision into the
   record.
