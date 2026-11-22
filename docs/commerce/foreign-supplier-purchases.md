# Foreign-supplier purchases: capture and VAT assessment workflow

**Status, 22 Nov 2026.** The workflow is built. No purchase has been assessed: the original invoices are not in this
repository, and none should be (they are accounting records). No filing or payment is represented as made.

## Rules this workflow follows

Sources: VAT Act summaries on BusinessInfo.cz (CzechTrade) and the statutory text of §§ 6g–6l ZDPH.

| Rule | Basis |
|---|---|
| A non-payer with a Czech seat becomes an identified person when it receives a service from a person not established in the Czech Republic with place of supply in the Czech Republic (or registers voluntarily first) | § 6h, § 6l ZDPH |
| The identified person self-assesses VAT on such services | § 108(3)(a)(1) ZDPH |
| It files a VAT return only for the periods in which it must declare tax | § 101(5) ZDPH |
| No control statement (that duty is for payers) | § 101c ZDPH |
| No input deduction | identified-person regime |
| EC Sales List only for services it **supplies** to other member states (§ 9(1)), not for services received | § 102 ZDPH |

**Not settled by this workflow**, decided per invoice by the accountant:
- the supplier entity and where it is established;
- whether the place of supply is the Czech Republic;
- the tax point and therefore the period;
- the CZK rate;
- the effect of VAT the supplier charged;
- possible exemptions (for example payment services).

## Workflow

1. **Collect** every invoice from a non-Czech supplier, starting with the oldest unassessed month. Store the original
   PDF in private storage and compute its SHA-256.
2. **Record** it in the private register (JSON array; template `docs/commerce/templates/foreign-purchase.template.json`).
   - Copy the fields exactly as printed: supplier entity and tax ID, service, period, invoice date, currency, net amount,
     VAT charged and by which country, reverse-charge legend, which of our identifiers is printed, payment date.
   - `accountantDecision` stays `null`.
3. **Run** `node scripts/commerce/foreign-purchases.mjs <private-register.json>`.
   - For each invoice it reports what is missing, the flags (VAT charged by the supplier, our tax ID missing, Czech
     supplier, possible exemption, contradictory invoice) and the candidate months.
   - It never computes a tax amount.
   - It refuses a register stored inside the repository.
4. **Accountant decides** in writing per invoice: treatment (`self_assess`, `outside_scope`, `exempt`,
   `supplier_vat_correct_no_self_assessment`, `other`), and for self-assessment the period, tax point and CZK rate.
   The decision is copied into the record with who, when and where it is filed.
5. **Filing** (VAT return for the period, payment) is the accountant's act; the register keeps the filing reference
   once it exists. Nothing here marks a filing as done.

## Suppliers to collect first

These are the services the company's systems use. The legal entity that invoiced us is read from each invoice, not
assumed here.

| Service | Used for | Collect |
|---|---|---|
| Microsoft (Microsoft 365, Power Platform, Copilot Studio capacity) | company tenant, CAI-LAB/CAI-TEST environments | every invoice; **G195024562 first** (`microsoft-invoice-G195024562.md`) |
| Vercel | website hosting, Blob storage | invoices once on Pro (Hobby is free) |
| Upstash | KV store | invoices if any charge arose (Free plan as of 22 Nov 2026) |
| Stripe | payment processing | fee invoices or statements; fee types may differ in treatment (`possible_exemption`) |
| Resend | order and notification e-mail | invoices if on a paid plan |
| Sentry, Plausible | monitoring, analytics | invoices if on a paid plan |
| Domain registrar (colleagueai.ai) | domain and DNS | renewal invoices |
| Any AI or developer tool paid by the company | development | each invoice paid with a company card |

Only invoices addressed to Colleague AI s.r.o. and paid by it belong in the company register. A service paid
personally by a founder is a separate question for the accountant (expense reimbursement or not).
