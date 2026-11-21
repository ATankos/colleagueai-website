# Proposed customer agreements — draft set 2026-11-21

**Status: DRAFT. Not published, not accepted by anyone, not counsel-approved.** These files are the proposed next
versions of the four customer-facing agreements and of the licence text inside the release package. They implement the
legal and tax review of 21 November 2026 (items B1.1–B1.9, B2, B3). The live pages (`public/terms.html`, `license.html`,
`refund.html`, `privacy.html`) and their archived versions (`public/legal/archive/`) are untouched.

## How they become operative (no shortcut)

1. Counsel validates or corrects the texts and the founder decides the open points below.
2. The approved English text is put on the page in `public/` with its new "Last updated" / "Effective" line.
3. `config/legal.json`: new `version` and `pageMarker` per document and a new `set` id (material change); then
   `node scripts/legal/archive-legal.mjs` archives the new version next to the old one and records its fingerprint
   (`docs/legal/versioning-and-amendments.md`). Earlier test acceptances keep their versions.
4. Translations are redone from the approved English text; until then `translations.status` stays `out_of_sync` and the
   checkout says English governs (it already does).

## Decisions the founder must make (business decisions, not legal requirements)

| # | Decision | Proposal in the drafts |
|---|---|---|
| D1 | Support window for corrective and security releases | **24 months from delivery of the purchased release** (Licence §5). Shorter is allowed; indefinite is not promised anywhere. |
| D2 | Controlling language | English controls; translations are for convenience (Terms §11). |
| D3 | Governing law and forum | Czech law; courts of Prague; B2B only (Terms §10). |
| D4 | Liability cap | the price paid for the affected package in the 12 months before the claim (Terms §8), with the non-excludable carve-outs. |
| D5 | Company IP rights | the drafts promise only what the company can grant; the sublicensing warranty in Licence §4 depends on the executed rights instrument (`docs/legal/ip-licence-agreement-DRAFT.md`). Do not publish §4 before it is signed. |

## What changed and why (review item → draft clause)

| Review item | Live text | Draft |
|---|---|---|
| B1.1 false hosted layer | Licence §3 "We host only the governance layer" | Licence §3: customer-tenant operation; what ColleagueAI does and does not receive; website/order/support processing per Privacy Policy |
| B1.2 storage provider | Privacy §4 "Cloudflare R2" | Privacy §4/§5: Vercel Blob (private, time-limited links), Upstash, Stripe, Resend, Vercel, Plausible, Sentry; order and document processing from #539 described |
| B1.3 ownership claim | Licence §4 "all IP remains with Colleague AI" | Licence §4: rights held or licensed with the right to sublicense, warranted only once the instrument exists; third-party and Microsoft components excluded |
| B1.4 signed package | product facts "signed package" | Licence §1(c): versioned release package identified by SHA-256 checksum (website already corrected in PR #549) |
| B1.5 support duration | Licence §5 "per order/maintenance" | Licence §5: corrective releases and security fixes for the window in D1; e-mail support; what is excluded |
| B1.6 as-is / liability | Terms §7, Licence §7 blanket | Terms §8 and Licence §7: limited warranty of conformity with the factsheet; exclusions only "to the extent permitted"; non-excludable liability carved out (Civil Code § 2898); reverse-engineering restriction limited to what § 66 of the Copyright Act allows |
| B1.7 refunds | Refund §2 headline "non-refundable once downloaded" | Refund §2 rewritten: the remedies of §5–§6 are the rule for defects and errors; §4 consumer handling made conditional and honest |
| B1.8 translations | config says out_of_sync | Terms §11: English controls; translations non-binding until re-issued |
| B1.9 support data | — | Privacy §3(g) and Licence §3: support material is processed only as the customer sends it, deleted after the case; no processor role unless agreed in writing |
| B2 first-sale terms | — | Licence §1–§2: one Czech legal entity, one named Microsoft tenant, non-exclusive, non-transferable, perpetual, tenant re-assignment rule |
| B3 replacement language | — | adopted in Licence §3 and Privacy §1 |

## Not in these drafts

- Continuous Certification terms (`config/legal.json certification`, draft, sales off).
- Partner Program Agreement.
- Any Czech translation; the Czech version is produced from the approved English text (D2).
