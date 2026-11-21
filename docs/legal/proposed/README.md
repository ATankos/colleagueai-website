# Proposed customer agreements — draft set 2026-11-21

**Status: DRAFT. Not published, not accepted by anyone, not counsel-approved.** These files are the proposed next
versions of the four customer-facing agreements and of the licence text inside the release package. They implement the
legal and tax review of 21 November 2026 (items B1.1–B1.9, B2, B3). The live pages (`public/terms.html`, `license.html`,
`refund.html`, `privacy.html`) and their archived versions (`public/legal/archive/`) are untouched.

## Facts of 21 November 2026 that the drafts reflect

- **Seller identification.** ARES has no VAT-register entry for IČO 29540852 and VIES answered INVALID for
  CZ29540852 (checked 21 Nov 2026). The drafts state no VAT identifier; one is added only from an official
  registration decision. The live accepted versions still print "DIČ CZ29540852" inside their text; it leaves them with
  this new version, never by editing an accepted version.
- **Who signs for the company.** The Commercial Register (Municipal Court in Prague, C 448176) shows Marek Těšitel as
  the sole managing director, acting alone, and as the sole registered shareholder. No draft names a second director.
- **First-sale scope.** Terms §2 states it: Czech businesses, card, the named release (config/launch-scope.json).
- **PR #532** proposed the Licence §3 and Privacy §4 corrections by editing the live pages in place. Those sentences
  are superseded by Licence §3 and Privacy §4/§5 of this set; #532 no longer touches a live page, and its seven
  machine translations are kept for the translator in `translations-2026-11-21-candidates.json` (not wired into the build).

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
| D1 | Functional support and corrective releases for ordinary defects | **24 months from delivery of the purchased release** (Licence §5(a), (b)). Shorter is allowed; indefinite functional upgrades are not promised anywhere. |
| D1a | Security support period of release 1.0.3.6 (security vulnerability handling and security updates, Licence §5(c)) | **proposal: 24 months from delivery**, stated on the factsheet. Assessment: release 1.0.3.6 is placed on the market before 11 December 2027, so the Cyber Resilience Act's Article 13 obligations - including the minimum five-year security support period of Article 13(8) - apply to it only if it is substantially modified on or after that date (Article 69(2)); the Article 14 reporting duties apply to it since 11 September 2026 regardless. A release placed on the market, or a substantial modification made, on or after 11 December 2027 needs a stated security support period of at least five years (or the shorter expected time of use, which we do not propose to argue). The Licence therefore fixes no number shorter than the law for any release: it states the period per release on the factsheet and guarantees it is never below the legal minimum. The founder confirms 24 months for 1.0.3.6 and accepts that the next release placed on the market after 11 December 2027 carries five years. |
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
| B1.5 support duration | Licence §5 "per order/maintenance" | Licence §5: functional support and corrective releases for the window in D1; security vulnerability handling and security updates for the security support period in D1a, never below the CRA minimum that applies to the release; what is excluded; no indefinite free upgrades |
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
