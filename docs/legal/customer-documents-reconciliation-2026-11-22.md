# Customer documents against the internal rights instruments (22 Nov 2026)

**What was checked:** the published Software & Agent Licence, Terms of Service, Privacy Policy, Refund Policy, Partner
Agreement, Trust Center and the CAI-L4-CI-001 factsheet. They were read against IP Instrument A (unsigned), the
technical architecture and the delivered bundle.

**What this changes:** nothing is published or changed here. Proposed wording goes into the next versioned agreement
set (`docs/legal/proposed/README.md`) for counsel. The archive and the acceptance records of earlier versions are
untouched.

## Findings

| # | Document, clause | Statement | Finding | Proposed handling |
|---|---|---|---|---|
| F1 | Licence §4(a); Terms §7 | the Agent Package, workflows, prompts, data model and documentation are "owned by ColleagueAI or licensed to ColleagueAI with the right to sublicense" | **exceeds the evidenced rights today.** The human author's rights are not yet licensed to the company in writing, and an exclusive licence requires written form. Until Instrument A is signed, the company cannot show the chain the clause states. | no text change. **Sale stays blocked by gate L-IP** (and the validator's IP check) until Instrument A is executed; the statement then becomes true. The published Licence gives no title or non-infringement warranty (§7 covers conformity only). The proposed warranty of title (decision D5, §4(d)) stays unpublished until then. |
| F2 | Licence §4(a); Terms §7 | the "CAI Score methodology" / "CAI Score framework" is protected by copyright and other intellectual-property rights | **overclaim.** A method, principle or idea as such is not a copyright work. Only its expression (texts, tables, graphics) is protected, and no trade-mark registration is on record. | next agreement set: "the texts, documentation and graphics describing the CAI Score" instead of "methodology/framework". Counsel to approve. |
| F3 | Licence §4(b) | third-party components are "listed in docs/legal/third-party-licences.md" | the list did not name the Inter and DejaVu Sans Mono fonts embedded in the bundle PDFs | **fixed in this change:** inventory section "Delivered to customers". No text change needed. |
| F4 | Licence §1(b), §3; Privacy §2; factsheet "How it is delivered" | the package runs in the customer's tenant; ColleagueAI does not host it or access the tenant | consistent with the architecture (managed solution; Microsoft connectors in the customer's tenant; no outbound connection to ColleagueAI in the solution) | none |
| F5 | Partner Agreement; Licence §2(a) | partners may resell or deploy for clients only under a signed Partner Agreement | consistent with Instrument A clause 3.1(b) (sub-sublicences through partners) | none |
| F6 | Factsheet; Licence §5 | 24-month support and corrective releases | rights to issue corrective releases depend on clause 2.3 / 5 of Instrument A (new versions; Accession Schedules for new works) | none; Accession Schedule at each release (Instrument A clause 5.2) |
| F7 | Trust Center | CAI Score described as the company's framework | descriptive; no ownership claim beyond F2 | none |
| F8 | Any customer-facing text | IFSA student products | appear only as catalogue concepts with "Request access"; no package, no licence offered | none; restricted register enforces it |
