# Software & Agent Licence — DRAFT for version 2026-11-21 (not in force)

*Proposed replacement for the live text of 13 June 2026. Publication only through the versioning process
(`docs/legal/versioning-and-amendments.md`) after counsel's approval and the founder decisions D1–D5 in `README.md`.*

**Colleague AI s.r.o.**, Školská 1736/12, Nové Město, 110 00 Praha 1, Czech Republic, IČO 29540852, DIČ CZ29540852, registered with the
Municipal Court in Prague, file C 448176 ("**ColleagueAI**", "we"). Contact: hello@colleagueai.ai.

This Licence governs the software package you buy from us (an "**Agent Package**"). It applies together with the Terms of
Service, the Refund Policy and the Privacy Policy in the versions you accept at checkout. Those versions, with their
fingerprints, are recorded on your order and archived; a later change never alters what you accepted.

## 1. What you are licensed to use

(a) **The package.** The Agent Package named on your order (for example *Contract Intelligence & Register, SKU
CAI-L4-CI-001, release 1.0.3.6*) as described in its published factsheet and the product facts on our website on the
day of purchase, including its installation guide and readiness checklist.

(b) **The licence.** On payment, ColleagueAI grants your company a non-exclusive, non-transferable, perpetual licence to
install and use the purchased release of the Agent Package in **one Microsoft tenant** that you name in your order or at
installation (the "**Licensed Tenant**"), for your own internal business purposes, including use by your employees,
contractors and an implementation partner acting for you.

(c) **How it is delivered.** The package is a versioned release file (a Microsoft Power Platform managed solution with
its documentation) identified by its SHA-256 checksum, which we publish on your order page and in the package. It is
not digitally signed; verify the checksum before you import it.

(d) **Tenant changes.** You may move the licence to another tenant of the same company (a migration, a tenant rename
or a re-provisioned environment) by telling us the new tenant identifier. The licence may be in use in one tenant at
a time. A change of the licensed company (a sale of the business, a merger) is a transfer under §2(c).

(e) **Corrective releases.** A corrective release that we issue for your purchased release under §5 is licensed on the
same terms as the release it corrects. Any other release (a new feature release, a new product version) is a separate
purchase unless your order says otherwise.

## 2. What you may not do

(a) **No redistribution.** You may not sell, rent, lease, lend, sublicense, publish or otherwise make the Agent Package
or any part of it available to a third party, or operate it for a third party as a service, except through an
authorised ColleagueAI partner under a signed Partner Program Agreement and except as needed for an implementation
partner to install and support it for you.

(b) **No tampering with notices.** You may not remove or alter proprietary notices, licence files, version identifiers
or checksums in the package.

(c) **No transfer** of this Licence to another legal entity without our written consent, which we will not withhold
unreasonably for a successor of the whole of your business.

(d) **Reverse engineering.** You may not decompile, disassemble or reverse engineer the Agent Package except to the
extent that applicable law expressly permits it notwithstanding this clause (in the Czech Republic, § 66 of Act No.
121/2000 Coll., the Copyright Act, on the acts a lawful user may perform, including observing, studying and testing
the functioning of the program and achieving interoperability). Nothing in this Licence limits those statutory rights,
and you may configure the package through the settings and extension points its documentation describes.

(e) **Scope.** Use outside the Licensed Tenant, or for a purpose the factsheet excludes (for example as the sole
basis of a legal decision without the human review the product requires), is outside the licence.

## 3. Deployment and data

The Agent Package is installed and operated **by you, in your Microsoft tenant**, using your own Microsoft licences,
connected services, environments and permissions. ColleagueAI does not host, operate or have access to your tenant, and
does not receive your contract files, the register, extraction results, reviews or any other business content through
the product. Your Microsoft usage (for example Copilot Studio capacity) is billed to you by Microsoft under your own
agreement and is not part of this Licence.

ColleagueAI separately processes the information needed for website enquiries, orders, payment administration,
licensing, secure downloads and support, as the Privacy Policy explains. Support does not need your business content:
describe the problem, and send only what the case needs. If you send documents in a support request (for example a
contract excerpt to reproduce a problem), we use them only to resolve that case and delete them when it is closed.
Please remove other people's personal data from them first. If personal data for which your company is the controller
is needed to resolve a case, we agree written processing terms with you (Article 28 GDPR) before you send it; if such
data reaches us without those terms, we do not use it, delete it and ask you for a version without it.

## 4. Ownership and rights

(a) The Agent Package, its workflows, prompts, data model, documentation and the CAI Score methodology are protected
by copyright and other intellectual-property rights. They are owned by ColleagueAI or licensed to ColleagueAI with the
right to sublicense them to you. Nothing in this Licence transfers ownership; you receive only the rights in §1.

(b) **Third-party and Microsoft components.** Microsoft Copilot Studio, Power Automate, Dataverse, SharePoint and Teams
are Microsoft products licensed to you by Microsoft under your own agreement, not by ColleagueAI. Open-source and other
third-party components that the package or our website use are listed in `docs/legal/third-party-licences.md` and
remain under their own licences.

(c) **Your content.** Everything you put into the package — contracts, extracted terms, reviews, settings, reports —
remains yours. ColleagueAI claims no rights in it.

(d) **Warranty of title.** ColleagueAI warrants that it holds the rights needed to grant the licence in §1. *[Publish
this sentence only once the author-to-company rights instrument in `docs/legal/ip-licence-agreement-DRAFT.md` is
executed; founder decision D5.]*

## 5. Support, corrective releases and security updates

Three different things are promised here, each with its own period. None of them is a promise of new features or
of free upgrades without end.

(a) **Functional support.** For **24 months from the day the purchased release is delivered** (download available on
your order page) *[founder decision D1]*, ColleagueAI answers e-mail at hello@colleagueai.ai on business days, with your
order number, about installation of the package from its installation guide and about reproducible defects in the
purchased release.

(b) **Corrective releases for ordinary defects.** For the same 24 months *[D1]*, where the purchased release
materially fails to conform to its factsheet or installation guide, ColleagueAI provides a corrective release, a
corrected package or corrected documentation, as described in the Refund Policy §5. A corrective release fixes a
defect; it does not add functions.

(c) **Security vulnerability handling and security updates.** Independently of (a) and (b), ColleagueAI handles
security vulnerabilities reported in the purchased release under its Vulnerability Handling Procedure (Trust Center)
and provides security updates for the **security support period** of that release. The security support period of
each release is stated on its factsheet *[founder decision D1a: for release 1.0.3.6 the proposal is 24 months from
delivery, the same as (a) and (b)]* and is in every case **at least the period that the law applicable to that
release requires**. Where a release is placed on the market, or substantially modified, on or after 11 December 2027,
Regulation (EU) 2024/2847 (Cyber Resilience Act), Article 13(8), requires a security support period that reflects the
expected time of use and is at least five years from the day that release is placed on the market, unless the
product is expected to be used for a shorter time, and ColleagueAI will state that period on the factsheet
accordingly. A security update within the security support period is provided at no further licence fee, as a
corrective release, without new functions. Security vulnerability **reports** are accepted at any time, inside or
outside any period, at the security contact in the Trust Center and in our `security.txt`; the reporting duties that
apply to ColleagueAI under the Cyber Resilience Act (Article 14, applicable from 11 September 2026) are performed
whether or not a support period has ended.

(d) **What is not included** in (a)–(c): installation, configuration or operation of the package in your tenant (your
administrator or implementation partner does that from the guide); changes to your Microsoft environment; new
features or new releases with new functions; support for modifications you made to the package; packages or
components you obtained elsewhere; and anything excluded by the factsheet (for example scanned documents or languages
the release does not support).

(e) **After a period ends** you keep the perpetual licence and the last release you received. New releases with new
functions are separate purchases, and support beyond (a)–(c) is available only under a maintenance arrangement we may
offer in writing. Nothing in this Licence promises functional upgrades without end.

## 6. Term and termination

(a) The licence to a purchased release is perpetual for the Licensed Tenant. Support (§5), any subscription and any
Continuous Certification right apply only for their own term.

(b) ColleagueAI may terminate this Licence by written notice if you materially breach §2 and do not cure the breach
within 30 days of being told of it in writing. On termination you must stop using the Agent Package and delete your
copies; your own content (§4(c)) is unaffected.

(c) Termination of support, of a subscription or of the Terms of Service does not end a fully paid perpetual licence.

## 7. Warranty and liability

(a) **Conformity.** ColleagueAI warrants that, for 30 days from delivery, the purchased release will materially conform
to its published factsheet and installation guide when installed as described. Your remedies for non-conformity are
those in the Refund Policy (remedy, replacement, price reduction or refund) and the rights that mandatory law gives a
business customer for defective performance, which this Licence does not limit.

(b) **AI-generated output.** Extracted terms, excerpts and deadline calculations are produced by an AI service and are
unverified until a person in your organisation reviews them. They are not legal advice. The product requires and
records that review; you are responsible for the decisions you take on reviewed or unreviewed output. This paragraph
describes how the product works; it does not excuse a defect in the software itself.

(c) **No other warranties.** To the extent permitted by applicable law, ColleagueAI gives no other warranty, express or
implied, including as to fitness for a particular purpose or uninterrupted operation, and does not warrant Microsoft
services or your environment.

(d) **Liability.** Nothing in this Licence excludes or limits liability that cannot be excluded or limited by law,
including liability for death or personal injury, for damage caused intentionally or by gross negligence, or under
§ 2898 of Act No. 89/2012 Coll. (Civil Code). Subject to that, ColleagueAI's total liability arising from or in
connection with an Agent Package is limited as set out in the Terms of Service (§8), and ColleagueAI is not liable for
indirect or consequential loss, loss of profit or loss of data that you could have prevented by the backups and review
the documentation describes.

## 8. General

(a) This Licence and the Terms of Service are the whole agreement for the Agent Package; an order confirmation or
quotation may add commercial details but does not change these terms unless it says so expressly and is signed by
ColleagueAI.

(b) Czech law governs this Licence; disputes are decided by the courts of Prague, Czech Republic (Terms §10). The
English text controls; translations are provided for convenience (Terms §11).

(c) If a provision is invalid, the rest remains in force and the invalid provision is replaced by the valid one that
comes closest to its purpose.

*Last updated: [date of approval] · version [to be assigned on publication]*
