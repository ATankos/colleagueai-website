# Privacy Policy — DRAFT for version 2026-11-21 (not in force)

*Full text proposed for the live page, built from the facts in `docs/legal/privacy-policy-proposal-2026-11-20.md`
(what the code actually collects, stores and sends) and the legal review of 21 November 2026 (B1.2, B1.9, B3, D).
Items in square brackets are facts the founder or accountant must confirm before publication. Publication only through
the versioning process after counsel's approval.*

## 1. Who we are

Colleague AI s.r.o., Školská 1736/12, Nové Město, 110 00 Praha 1, Czech Republic, IČO 29540852, DIČ CZ29540852, registered with the
Municipal Court in Prague, file C 448176,
is the controller of the personal data described in this policy. Contact: hello@colleagueai.ai. We have not appointed
a data protection officer; the legal requirements for one do not apply to us.

## 2. How our products work with your data

Our agent packages are software you install in your own Microsoft 365 and Power Platform environment. Your contracts,
the terms extracted from them, your reviews and your Teams conversations stay in your SharePoint, Dataverse and Teams.
We do not connect to your environment, the installed product sends nothing to us, and we do not process your business
content. For that content, you are the controller and we are neither controller nor processor; we therefore do not
offer a data-processing agreement for the product, because there is no processing to agree on.

We do process the personal data needed to run this website and to administer enquiries, orders, billing, licences,
purchase documents, security and support. That is what this policy describes.

## 3. What we collect and why

| When | Data | Purpose and legal basis |
|---|---|---|
| (a) You request a demo or contact us | name, work e-mail, company, the areas you are interested in, your message | answering your request — steps before a contract (Art. 6(1)(b) GDPR) and our legitimate interest in following up a business enquiry (Art. 6(1)(f)) |
| (b) You order a package | your company's name, registration number, country and VAT or tax ID; optionally the Microsoft tenant to be licensed; the purchasing contact's name and e-mail; the name and role of the person accepting our agreements; the confirmations given; the storefront language and browser type; a salted hash of your network address (we do not store the address itself) | concluding and performing the contract, and keeping evidence of which agreements were accepted (Art. 6(1)(b), (f)) |
| (c) You pay | card or bank details and billing address, entered on Stripe's hosted page; tax ID verification | performing the contract and complying with tax and accounting law (Art. 6(1)(b), (c)). We receive Stripe's identifiers, the amount, billing country and name and the verification result; we never see or store card numbers |
| (d) After payment | your licence record (buyer e-mail, product, release, Stripe session id), the licence agreement confirmation PDF, the invoice and any credit note, download and recovery events | delivering and documenting the purchase (Art. 6(1)(b)); keeping accounting and tax records (Art. 6(1)(c)) |
| (e) We e-mail you | order confirmation, download recovery link, demo confirmation | performing the contract (Art. 6(1)(b)) |
| (f) You visit the site | cookieless analytics (page views, referrer, device class, country) and error reports (URL, browser string; no form content) | legitimate interest in operating, securing and improving the site (Art. 6(1)(f)); no tracking cookies |
| (g) You ask for support | what you send us, which may include contract excerpts or screenshots | handling your request (Art. 6(1)(b)) for your own contact details. Send only what the case needs and remove other people's personal data first. We use support material only to resolve that case and delete it when the case is closed. Where personal data for which your company is the controller is needed to resolve a case, we first agree written processing terms with you (Art. 28 GDPR) and process that data only on your instructions; such data received without those terms is not used and is deleted |
| (h) Marketing | your e-mail and preferences | only with your consent (Art. 6(1)(a)), which you can withdraw at any time |

We do not take automated decisions with legal effect about you and we do not use your data to train AI models.

## 4. Who receives data (processors)

| Provider | What for | Where |
|---|---|---|
| Vercel Inc. | hosting, function logs, and **private file storage (Vercel Blob)** of your order documents and the product packages, reachable only through time-limited links for the order's buyer | private file storage in the EU (Frankfurt, fra1); serverless functions and logs in the United States (Washington, D.C., iad1); Vercel is a US company |
| Upstash Inc. | the database holding enquiry, order, acceptance, licence and evidence records | EU (Dublin, primary region dub1); Upstash is a US company |
| Stripe Payments Europe, Ltd. / Stripe, Inc. | payments, tax ID verification, and where enabled invoice generation. Stripe is our processor for the payment and an independent controller for its own legal obligations (fraud prevention, financial regulation) | EU and United States |
| Resend, Inc. | sending transactional e-mail (order confirmations, document and recovery links) | EU sending region (Ireland, eu-west-1, as configured for colleagueai.ai); Resend is a US company |
| Plausible Insights OÜ | cookieless analytics | EU |
| Functional Software, Inc. (Sentry) | error monitoring | EU ingest endpoint |
| Google LLC | web fonts (your browser's request discloses your IP address to Google) | United States |

We use no other recipients. We disclose data to authorities only where the law requires it. The current list is also
kept in the Trust Center.

## 5. Transfers outside the EEA

Vercel (functions and logs) and Google process data in the United States; Upstash, Resend and Vercel Blob store data in the EU but are US companies whose staff or sub-processors may access it from the United States. We rely on the EU-US Data Privacy Framework where
the provider is certified under it and otherwise on the European Commission's Standard Contractual Clauses contained in
the provider's data-processing terms. Copies are available on request.

## 6. How long we keep data

| Data | Kept |
|---|---|
| Demo and enquiry requests | 12 months |
| Order, acceptance and evidence records; invoices, credit notes and licence agreement confirmations | for the retention period that Czech accounting and tax law requires of us *[accountant: the period under the Accounting Act (No. 563/1991 Coll., § 31) and, only if the company is VAT-registered, § 35 ZDPH — confirm the number of years]*, then deleted or anonymised |
| Licence records | for as long as the licence can be exercised (a perpetual licence: until you ask us to close it) |
| Support material | until the case is closed |
| Analytics and error data | per the provider's standard retention, without identifying you |
| Function logs | days (provider default) |

Where the law obliges us to keep a record, we restrict it instead of deleting it when you ask, and we tell you so.

## 7. Your rights

You can ask for access, rectification, erasure, restriction, portability and to object, and you can withdraw consent at
any time, by e-mail to hello@colleagueai.ai. We answer within one month. You can complain to the Czech Office for
Personal Data Protection (Úřad pro ochranu osobních údajů, uoou.gov.cz) or to the supervisory authority of your country.

## 8. Security

Order documents and packages are stored in private storage and served only through signed, short-lived links. Payment
data never reaches our systems. Access to our records is limited to the people who administer orders. Security
vulnerabilities in our products or website can be reported to hello@colleagueai.ai with a subject starting "SECURITY"
(the contact published in our `security.txt` and on /security); we handle them under our Vulnerability Handling
Procedure.

## 9. Cookies

We set no tracking cookies. Analytics is cookieless. The site uses only technically necessary browser storage, for
example to remember the language you chose or a form you are filling in.

## 10. Changes

We publish new versions of this policy with their date; the version you accepted at checkout stays recorded on your
order and archived.

*Last updated: [date of approval] · version [to be assigned on publication]*
