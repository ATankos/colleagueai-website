# Privacy Policy — proposed text for counsel (20 November 2026) and GDPR role assessment

**Status: proposal. Not published. Publishing it is a new legal version: counsel approves the text → `public/privacy.html` is replaced → `config/legal.json` `privacy.version` and `pageMarker` are bumped → `node scripts/legal/archive-legal.mjs` → `tests/legal-archive.test.mjs` green → PR merged by the founder. Earlier buyers keep the version they accepted (the order record and the agreement confirmation name it).** This proposal completes the §4 correction staged in PR #532 (Vercel Blob instead of Cloudflare R2) and replaces the rest of the page so that it describes what the systems actually do.

## A. Facts the policy must describe (from the code, 20 Nov 2026)

| Data | Collected where | Stored where | Kept | Purpose / basis |
|---|---|---|---|---|
| Demo or enquiry request: name, work e-mail, company, interests, message | `/contact`, `/api/demo-booking` | Upstash (KV) `lead:*`, 365-day TTL; notification e-mail via Resend when configured | 12 months | Answering the request — pre-contractual steps / legitimate interest |
| Order identification: company, registration number, country, VAT/tax ID, optional Microsoft tenant, purchasing contact name and e-mail, name and role of the person accepting, the confirmations given, storefront language, browser type, a **salted hash** of the network address (not the address) | Order-confirmation page (`/api/checkout`) | Upstash: `acceptance:*`, `order:*`, `evidence:*`; the Stripe Customer (name, e-mail, VAT ID, registration number) | For the statutory retention period of commercial and accounting records (accountant T7; Czech law generally 10 years for tax documents) | Performance of the contract; legal obligation (tax records) |
| Payment: card or bank details, billing address, tax ID verification | Stripe Checkout (hosted by Stripe) | Stripe. We store the Stripe identifiers, amounts, billing country and name, the verification result; **never card numbers** | As above | Contract; legal obligation |
| Licence and delivery: buyer e-mail, product, release, Stripe session id, download events | `/api/webhook`, `/api/success`, `/api/download`, `/api/recover` | Upstash `entitlement:*`; download links are sealed tokens (no e-mail in URLs) | As above | Contract |
| Order documents: licence agreement confirmation PDF, invoice copy, credit notes (contain the order identification above) | Generated after payment | Vercel Blob, **private** store, `orders/<orderId>/`; reachable only through sealed, minutes-long links for the order's buyer | As above | Contract; legal obligation |
| Transactional e-mail: order notification, download recovery, demo notification | `lib/mail.js` | Resend (transport); no attachments | Provider logs per Resend's terms | Contract |
| Site analytics | Plausible (cookieless), Vercel Web Analytics and Speed Insights | Providers | Per provider | Legitimate interest; no cookies |
| Error monitoring | Sentry (browser and server errors; URLs and user-agent, no form content) | Sentry (EU ingest endpoint configured) | Per provider | Legitimate interest |
| Web fonts | Google Fonts (the browser's request discloses the IP address to Google) | Google | — | Legitimate interest (counsel: consent banner not needed for fonts? state the position) |
| Hosting and function logs | Vercel (current plan keeps function logs for a short period) | Vercel | Short | Legitimate interest (security, operation) |
| Partner programme: partner code, commission ledger | `/api/webhook` | Upstash `partner:*` | Contract term + retention | Contract |

**Not collected / not processed by ColleagueAI:** the customer's contracts, extracted terms, reviews, Teams messages or any content inside the customer's Microsoft tenant. The product is a managed solution the customer installs in its own tenant; ColleagueAI never connects to it and holds no credential for it (`PRODUCT_FACTS`, INSTALL, licence §3 draft).

## B. GDPR roles and the DPA question

- **Website, orders, licences, support:** Colleague AI s.r.o. is the **controller**. Processors: Vercel (hosting, logs, Blob storage), Upstash (records), Stripe (payments — Stripe acts as an independent controller for its own regulatory purposes and as processor for ours; state both), Resend (e-mail), Plausible, Sentry, Google (fonts). Each needs a DPA / data-processing terms on file: Vercel, Upstash, Stripe, Resend, Sentry and Plausible publish standard DPAs incorporated by their terms — **[founder: download and file each one in the Release evidence library; counsel: confirm sufficiency]**.
- **The product in the customer's tenant:** the customer is the controller of its contract data; **ColleagueAI is not a processor**, because it does not process that data at all (no access, no hosting, no telemetry from the product back to ColleagueAI). Our assessment: **a customer DPA is not required for the services we perform**, and offering one would misdescribe the relationship. What a customer's procurement will expect instead: a short **"no processing" statement** in the Privacy Policy and the licence (licence §3 draft in PR #532 says it), and the facts a customer needs for its own DPIA (where the product stores data — its SharePoint, Dataverse and Teams; which Microsoft AI services the flows call — Copilot Studio; that ColleagueAI receives nothing). **[counsel: confirm; and whether support cases where a customer voluntarily sends us a contract excerpt or a screenshot need a clause (we would be a controller of what we receive for support, bound to delete it after the case)]**
- **International transfers:** Vercel, Upstash and Resend process in the United States (Upstash region and Vercel Blob region to be confirmed by the founder from the dashboards; Vercel functions run in `fra1`/EU when so configured — state the actual regions). Basis: the EU–US Data Privacy Framework where the provider is certified, otherwise Standard Contractual Clauses in the provider's DPA. **[founder: check each provider's DPF status; counsel: wording]**
- **Retention and deletion:** demo/enquiry data 12 months; order, licence, invoice, evidence and document records for the statutory retention period of accounting and tax records (accountant T7 states the years); Stripe keeps its own records under its terms; entitlement records for as long as the licence is exercisable (perpetual) and then per request. Deletion requests to hello@ are answered within one month; records that the law requires us to keep are restricted instead of deleted, and the requester is told which.
- **Seller identification on the page:** the current page states "DIČ CZ29540852". The seller's VAT registration is the accountant's open question (T1); the DIČ must appear only when registered. **[accountant T1 → counsel → the page]**

## C. Proposed text (English; translations after approval)

> **Privacy Policy** — Last updated: [approval date]
>
> **1. Who we are.** Colleague AI s.r.o., Školská 1736/12, Nové Město, 110 00 Praha 1, Czech Republic, IČO 29540852, registered with the Municipal Court in Prague, file C 448176[, DIČ … — only if registered], is the controller of the personal data described here. Contact: hello@colleagueai.ai.
>
> **2. How our products work with your data.** ColleagueAI agent packages are software you install in your own Microsoft 365 and Power Platform environment. Your contracts, the terms extracted from them, reviews and messages stay in your SharePoint, Dataverse and Teams. We do not connect to your environment, we receive no data from the installed product, and we do not process your business data. For that data you are the controller and Microsoft is your provider under your Microsoft agreements. We therefore do not act as your processor and do not offer a data processing agreement for the product; we provide the technical facts you need for your own assessment (installation guide, section 1).
>
> **3. Data we collect on this website.** (a) When you request a demo or contact us: your name, work e-mail, company and what you tell us. (b) When you order: your company's legal name, registration number, country and VAT/tax ID, optionally the Microsoft tenant to be licensed, the purchasing contact's name and e-mail, the name and role of the person accepting our agreements, the confirmations given, your browser type and language, and a salted hash of your network address (we do not store the address). (c) When you pay: Stripe collects your payment details and billing address on its own pages; we receive the payment references, the amounts, the billing name and country and the result of your VAT ID verification. We never see or store card numbers. (d) After payment: your licence record, the documents of your order (licence agreement confirmation, invoice, any credit note), the download events, and the e-mails we send you about the order. (e) Site analytics without cookies and error reports.
>
> **4. Purposes and legal bases.** Answering your request (pre-contractual steps, Art. 6(1)(b) GDPR); concluding and performing your order, including delivery, licence records and support (Art. 6(1)(b)); keeping tax and accounting records (Art. 6(1)(c)); securing and improving the site and keeping evidence of agreements concluded (legitimate interests, Art. 6(1)(f)); marketing only with your consent (Art. 6(1)(a)).
>
> **5. Service providers (processors).** Vercel (hosting, logs, private file storage of your order documents and the product packages), Upstash (order, licence and request records), Stripe (payments, tax ID verification, invoices where enabled; Stripe is also an independent controller for its own legal obligations), Resend (transactional e-mail), Plausible (cookieless analytics), Sentry (error monitoring), Google Fonts (web fonts; your browser requests them from Google). The list is kept current at [Trust Center URL].
>
> **6. International transfers.** Some providers process data in the United States (Vercel, Upstash, Resend[, …]). We rely on the EU–US Data Privacy Framework where the provider is certified and otherwise on the Standard Contractual Clauses in the provider's data processing terms.
>
> **7. Retention.** Demo and enquiry data: up to twelve months. Order, invoice, licence and agreement records, including the documents of your order: for the retention period that tax and accounting law requires of us [accountant: years], then deleted or anonymised. Licence records: for as long as the licence can be exercised. Analytics and error data: per the provider's retention, without identifying you.
>
> **8. Your rights.** Access, rectification, erasure, restriction, portability, objection, and withdrawal of consent, by e-mail to hello@colleagueai.ai; we answer within one month. Where the law requires us to keep a record, we restrict it instead of deleting it and tell you so. You may complain to the Czech Office for Personal Data Protection (ÚOOÚ) or your local authority.
>
> **9. Cookies.** We use no tracking cookies; analytics is cookieless. Only technically necessary storage is used, for example to keep a form you are filling in.
>
> **10. Security reports.** Security contact: [security@colleagueai.ai once created]; see [/security/disclosure once published].

## D. Versioning (how this ships)

1. Counsel returns the approved text with its approval date.
2. `public/privacy.html` text replaced verbatim; "Last updated" = approval date; `config/legal.json` → `privacy.version` = approval date, `pageMarker` = the new "Last updated" line.
3. `node scripts/legal/archive-legal.mjs` adds the archived copy; `node --test tests/legal-archive.test.mjs tests/acceptance.test.mjs tests/legal-consistency.test.mjs`.
4. Seven translations only after the English is approved; they are recorded as translations of the approved English version.
5. PR #532 is then closed by this change (its §4 sentence is contained here).
