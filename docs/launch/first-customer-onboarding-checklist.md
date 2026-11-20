# First customer — onboarding checklist (one B2B licence, one jurisdiction)

Tick in order. Nothing in B starts before A is complete; nothing in C before B. Owner in brackets.

## A. Before quoting
- [ ] Buyer category confirmed in writing (country, VAT ID if any) and it is the **one approved category** in `config/tax-policy.json` (accountant form, section D) [founder]
- [ ] Counsel-approved Terms / Licence / Refund / Privacy live (`config/legal.json` version + archive) and PR #532 closed by merge of the approved text [founder → engineer]
- [ ] IP chain-of-title document filed in the Release evidence library (G2) [founder]
- [ ] Hosting: Vercel plan decision recorded (Hobby ToS §4 = non-commercial; Pro before the first payment) [founder]
- [ ] Payment route per T13: Stripe live keys **or** Czech invoicing tool + bank transfer; live checkout stays disabled until the GO PR [founder]
- [ ] security@ mailbox exists; `/security/disclosure` + `security.txt` published from counsel's C1–C6 answers [founder → engineer]

## B. Order
- [ ] Written order (e-mail is enough) naming: legal entity, VAT ID, billing address, SKU CAI-L4-CI-001, release 1.0.3.6 bundle revision N, price USD 14,900, licence terms version, the named admin who will install [founder]
- [ ] Sanctions/export line answered if counsel asked for it (counsel form E) [founder]
- [ ] Tax document issued per T7 (route per T13); `invoiceNote` wording from the approved treatment printed on it [accountant route]
- [ ] Payment received (or Stripe `checkout.session.completed` + webhook evidence) [founder]

## C. Delivery
- [ ] Download token issued (`api/download`), customer downloads the bundle; **customer-side hash** of `CAI-L4-CI-001_1.0.3.6.zip` reported back and matches the order page [customer admin → founder]
- [ ] Customer admin confirms the four START-HERE points: Dataverse environment, Copilot Studio capacity (plan or credits), Azure budget with alerts set, DPIA decision taken [customer]
- [ ] Install by the customer admin from INSTALL.pdf (~60 min): import, seven flows On, owner team, **M365 admin center agent check — block an *Available* entry**, first test (section 9). We do not touch their tenant [customer]
- [ ] First-test result sent to us as: upload time, row appeared (Y/N), card received (Y/N), agent answer (Y/N) — or the 9b message seen [customer → founder]
- [ ] Known-limitation acknowledgement: customer has INSTALL section 10 and the facts block (one line in the delivery e-mail) [founder]

## D. After go-live (first 30 days)
- [ ] Support channel: hello@ with order e-mail + SKU + release; response target as stated in the support-period line [founder]
- [ ] Vulnerability reports: security@ → register → procedure timelines [founder]
- [ ] Daily recompute turned On by the customer before go-live (INSTALL 5) [customer]
- [ ] Revision 2 (or later) bundle: inform the customer with the new SHA and what changed; upgrade path INSTALL 4 [founder]
- [ ] Implementation Report §14 and Release evidence library updated with the order, the hash confirmation and the first-test result [engineer]
