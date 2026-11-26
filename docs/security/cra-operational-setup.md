# CRA and security support: operational set-up (prepared 20 November 2026; nothing published yet)

Companion to `vulnerability-handling-procedure.md` (the procedure, under counsel review). This file holds the concrete artefacts the procedure needs, ready to apply the day counsel's C1–C6 answers and the founder's D10 decision arrive. **No certification, conformity assessment or regulatory approval is claimed anywhere below.**

## 1. `security@colleagueai.ai` — mailbox configuration (founder, D10)

- Microsoft 365 admin center → Teams & groups → **Shared mailboxes** → add `security@colleagueai.ai`, members: both founders. Send-as for both. Keep it a shared mailbox (no licence needed; discoverable by both).
- Mail flow: an inbox rule (or a Power Automate "when a new e-mail arrives in a shared mailbox") that (i) sends the auto-acknowledgement below within minutes and (ii) creates the register entry (section 3) with the e-mail's received time as *aware at*.
- Auto-acknowledgement (text): *"Thank you. Your report to security@colleagueai.ai was received on {date} UTC and has the reference {CAI-VUL-YYYY-NNN}. We triage reports within 2 business days and will reply from this address. Please do not test customer tenants or production payment flows. — Colleague AI s.r.o."*
- Forwarding of the hello@ "security" keyword is not needed: a customer's security report through support is moved into the same register by hand (section 3).

## 2. Public responsible-disclosure wording — `security.txt` and `/security/disclosure`

`public/.well-known/security.txt` (replace on approval; `Expires` at most 12 months ahead; sign with the key if one is published):

```
Contact: mailto:security@colleagueai.ai
Expires: 2027-11-20T00:00:00.000Z
Preferred-Languages: en, cs
Canonical: https://www.colleagueai.ai/.well-known/security.txt
Policy: https://www.colleagueai.ai/security/disclosure
Acknowledgments: https://www.colleagueai.ai/security/disclosure#thanks
```

`/security/disclosure` (draft page text; **[C2]** safe harbour and **[C3]** what times may be promised are counsel's):

> **Reporting a security vulnerability**
> If you believe you have found a security vulnerability in a ColleagueAI product (for example the Contract Intelligence & Register package) or in colleagueai.ai, please tell us at security@colleagueai.ai. Include the product and version (the release number from your package or order), what you observed, how to reproduce it, and how we can reach you. We acknowledge every report within one business day and tell you our triage result within two business days.
>
> **What we ask.** Do not access, modify or delete data that is not yours; do not test against customer environments or production payment flows; do not use social engineering, denial of service or physical attacks; give us a reasonable time to fix before you publish. Test only against your own installation or a trial environment.
>
> **What we do.** We confirm, fix and release a corrective version through our normal release process (a new version number and a new published checksum, never a silent replacement), notify the licensees of affected versions, and, where it applies, report as the EU Cyber Resilience Act requires. We credit reporters who wish to be named, after the fix is available. [Safe-harbour sentence — counsel.] We do not currently pay bounties.
>
> **Scope.** ColleagueAI products and colleagueai.ai. Microsoft Power Platform, Copilot Studio, Dataverse, Stripe, Vercel and other providers have their own programmes; please report issues in those platforms to them.
>
> **Supported versions.** [Per C4: the support period of each release and the line "security fixes for release 1.0.3.x are provided as corrective releases at no further licence fee during the support period".]

Localisation: EN first; the seven locales after approval through the usual page generator.

## 3. Security incident and vulnerability register (private)

Where: a new restricted list **"Security register"** on the SharePoint site that holds the Release evidence library (members: both founders). One row per report or incident:

| Column | Content |
|---|---|
| ID | `CAI-VUL-YYYY-NNN` (vulnerability) or `CAI-INC-YYYY-NNN` (incident) |
| Aware at (UTC) | the moment we became aware — the CRA clocks start here |
| Source | reporter (name/handle, contact) / customer order id / internal / monitoring |
| Product, versions | e.g. CAI-L4-CI-001 1.0.3.6; site |
| Description | what, how reproduced |
| Classification | confirmed / not a vulnerability / duplicate / out of scope; **actively exploited: yes/no**; **severe incident: yes/no** |
| Severity | CVSS v4 estimate and rationale |
| Triage done at | ≤ 2 business days after *aware at* |
| Authority reporting | early warning sent at / notification sent at / final report sent at, each with the platform reference; "not applicable" with the reason |
| Fix | corrective release version, package SHA-256, release date |
| Customer notification | sent at, to which order ids, template version |
| Reporter communication | acknowledged at, result told at, credit requested yes/no |
| Status | open / fixing / released / closed |
| Owner | founder / deputy |

The register is the evidence for Art. 14 timelines; nothing is deleted from it.

## 4. Vulnerability intake and triage (checklist)

1. Register the entry with *aware at* (section 3) and send the acknowledgement (section 1).
2. Within 2 business days: reproduce on a test tenant with synthetic contracts (never on a customer tenant); classify; estimate CVSS v4; decide whether it is **actively exploited** (evidence of exploitation in the wild) and whether an **incident** (an event that actually affected the security of a product or its users) occurred — these two decisions start the 24 h clock.
3. Tell the reporter the triage result.
4. If exploited or an incident: start the section 6 workflow at once, in parallel with the fix.

## 5. Corrective security release process

Identical to the release process already gated in the repository, named here for the record:
1. Fix in the CAI-LAB environment; export the managed solution; `scripts/check-cai-solution-package.mjs` C1–C9 must pass.
2. New version number (patch), new bundle via `scripts/cai-release/<version>/build_bundle_*.sh`, new `SHA256SUMS`, release-candidate test, `config/products.json` updated with the new package hash and `correctiveFor` listing the fixed versions; CI green; founder merges.
3. Upload to the private Blob store; download from the Preview and compare the hash; readiness check.
4. Entitlements: buyers of the affected versions are offered the corrective release automatically (`lib/releaseAccess.js` corrective-release rule) — the order page and `/recover` show it.
5. Customer notification (section 7); register updated; reporter told; CVE requested when applicable.

## 6. Authority reporting workflow (Art. 14) — who does what, when

| Step | Actively exploited vulnerability | Severe incident | Who | Where recorded |
|---|---|---|---|---|
| Early warning | ≤ 24 h after *aware at* | ≤ 24 h after *aware at* | Founder (deputy: public co-founder) | Register: timestamp + platform reference |
| Notification | ≤ 72 h after *aware at* | ≤ 72 h after *aware at* | same | same |
| Intermediate report | on request of the coordinating CSIRT, with relevant status updates | on request of the coordinating CSIRT | same | same |
| Final report | ≤ 14 days after a corrective/mitigating measure is available | ≤ 1 month after the incident notification | same | same |
| Users informed | without undue delay, with mitigations | without undue delay, with mitigations | same | Register + mail log |

Platform and recipient: the single reporting platform operated by ENISA and the CSIRT designated as coordinator for the Czech Republic — **[C6]** counsel/founder to identify the exact submission path and register the submitting account **before** the first report is needed; the register row "authority reporting" stays "not applicable — not exploited / not an incident" for ordinary vulnerabilities.

## 7. Customer security notification (template)

Subject: `Security notice for ColleagueAI {product} {affected versions} — corrective release {new version} available`

> Dear {company},
> This notice concerns your ColleagueAI order {order id} ({product}, release {purchased version}).
> **What happened.** {one-paragraph description without exploitation details}. Severity: {CVSS/label}. Affected versions: {list}. {Whether exploitation in the wild is known.}
> **What to do now.** {Interim mitigation, if any — e.g. turn off flow X until upgraded.}
> **The fix.** Corrective release {new version} is available on your order page ({link via /recover}); package `{file}`, SHA-256 `{hash}`. Upgrade as described in the installation guide, section 4 (upgrade), about {minutes} minutes. It is provided at no further licence fee under your licence's security-maintenance entitlement.
> **Your data.** The product runs in your own tenant; ColleagueAI has no access to it and received no data from it. {If relevant: what the customer should check in its own tenant.}
> Questions: security@colleagueai.ai with your order number. Reference {CAI-VUL-…}.
> Colleague AI s.r.o.

Sent from security@ (or hello@ until it exists) to each affected order's purchasing contact; logged in the register with the order ids.

## 8. Security-maintenance entitlement versus paid functionality upgrades (wording for counsel, C4)

Proposed distinction, to be mirrored in the Licence (§5/§6), the product facts and the agreement confirmation PDF (which today prints the published facts):

- **Security maintenance (included in the licence fee):** corrective releases that fix defects in the purchased release, including security vulnerabilities, for the **support period** of that release line, at no further licence fee. The buyer's perpetual licence covers every corrective release of the purchased line (`correctiveFor`), and the download system offers it automatically.
- **Functional upgrades (not included):** new feature releases (a new minor or major line) are a new purchase or a Continuous Certification entitlement when that programme opens; they are never required to receive a security fix of the purchased line during the support period.
- **Support period:** **[C4 — counsel and founder state it, e.g. "24 months from the release date, or 12 months after the next feature release, whichever is later"]**. After it ends, security fixes are provided only in the current line. The period is printed on the disclosure page (section 2) and in the agreement confirmation once decided.

## 9. What is not claimed

No CE marking, conformity assessment, ISO/SOC certification or regulatory approval exists or is claimed; the site's claims-truth test keeps such words off the pages. Nothing in this file is published until counsel's answers and the founder's D10 are recorded in the Implementation Report.

## 10. Operability check before launch (added 21 November 2026)

The review of 21 November 2026 is right that a procedure on paper is not a process. Before the first sale the founder
confirms each line with evidence (a screenshot or a register row), and the result goes into the launch evidence:

| # | Check | Evidence |
|---|---|---|
| O1 | `security@colleagueai.ai` exists, both founders receive it, a test mail from an external address was auto-acknowledged with a reference | the acknowledgement e-mail |
| O2 | `/.well-known/security.txt` published with the new contact, policy URL and an `Expires` date within 12 months (text in section 2) | the live file |
| O3 | `/security/disclosure` published (ready page: `docs/security/disclosure-page-READY.html`, copied to `public/security/disclosure.html` and localized through the usual generator after counsel's C2/C3 answers) | the live page |
| O4 | "Security register" list exists on the Release evidence site with the columns of section 3; one dry-run row created and closed | the row |
| O5 | Reporting path identified: the ENISA single reporting platform account (or the interim national CSIRT submission route) with login held by the founder and the deputy; a dry run of the form up to the final step | screenshot of the form |
| O6 | Customer notification template (section 7) sent once to the founders' own order from the test purchase | the e-mail |
| O7 | Support window published in the licence (founder decision D1 in `docs/legal/proposed/README.md`) so that "supported versions" on the disclosure page is a fact, not a promise | the published licence |

Until O1–O5 are done, the disclosure page and `security.txt` keep `hello@colleagueai.ai` and the procedure is marked
"draft" in the Trust Center; no CRA conformity, CE marking or certification is claimed at any stage.
