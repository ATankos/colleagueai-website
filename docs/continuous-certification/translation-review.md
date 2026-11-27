# Continuous Certification copy: native-language review (required before publication)

**Status:** pending for all seven translations.
**27 Nov 2026:** PR #586 was merged and published (09:34 UTC, 2da5396e) before any row below was signed off. The seven translations are live unreviewed. The reviews are still required; corrections follow in a reviewed PR. Recorded in `docs/launch/operational-record-2026-11-27.md`.
- The English source and the seven translations in `scripts/i18n/certified-content.json` were written by the engineering assistant, not by native speakers.
- The structural checks pass: key parity, no English leaks, banned-claim scan in every language.
- No automated check can judge legal register, tone or terminology. PR #586 is not published until every row below is signed off.

| Language | Keys to review | Reviewer (native, ideally with B2B or legal experience) | Date | Result |
|---|---|---|---|---|
| cs: Czech | all keys added for the commercial pillar (`msg` … `price_note`, `b*_v`, `lic_note`, `st_legend`, `r2`) | | | pending |
| de: German | same | | | pending |
| fr: French | same | | | pending |
| es: Spanish | same | | | pending |
| it: Italian | same | | | pending |
| pl: Polish | same | | | pending |
| pt: Portuguese | same | | | pending |

## What the reviewer checks
1. **The central message reads naturally.** Where a literal "assurance" would read as a warranty, a neutral term is used.
   - es uses "aseguramiento"; it and pt use the audit term "assurance". Confirm or replace.
   - Avoid "garantía", "garanzia" and "garantia". The test `tests/cc-positioning.test.mjs` bans them.
2. **No sentence promises compliance, security, savings or an ISO or regulatory status.**
3. **The labels stay distinct in meaning:**
   - "Built and tested": a specific capability;
   - "Subscription benefit";
   - "Planned".
4. **Fixed terms keep their established local forms:** "Coming soon" (translated, never English), Continuous Certification (product name, untranslated), Certificate ID (local form as in `verify_label`).
5. **The licence note** (`lic_note`) states unambiguously that security fixes, corrective releases and legally required remediation need no subscription.

## How to record the review
- Corrections go into `certified-content.json` in a reviewed PR.
- The row above is completed with the reviewer, the date and the result.

## CAI-AUD-009 — corrective-release wording (open for native review)

The English source of two keys was clarified in the audit remediation, because "every licensee" overstated who receives a
corrective release. A corrective release is part of the perpetual licence of the version it corrects, and of no other version.

| Key | English after this change |
|---|---|
| `b4` | A corrective release that fixes a defect in a version you bought is part of your perpetual licence for that version, at no further licence fee, whether or not you subscribe. Corrective releases do not add later feature releases to your licence. |
| `b4_v` | corrective releases for the version you bought |

**Round 2 (27 Nov 2026): preliminary translations added.** `b4` and `b4_v` are now translated from the English above
for cs, de, fr, es, it, pl and pt, so the live pages no longer say that security fixes reach "every licensee".
These translations were written by the engineering assistant. **They have NOT been approved by a native speaker** and must
not be described as reviewed. The rows in the table above stay `pending`. Points for the reviewer:

- "corrective release" is rendered as: cs *opravná verze*, de *Korrektur-Release*, fr *version corrective*, es *versión correctiva*,
  it *versione correttiva*, pl *wersja korygująca*, pt *versão corretiva*. Confirm these match the licence agreement's terms.
- The perpetual licence is "licencja bezterminowa" (pl), "unbefristete Lizenz" (de), "licence perpétuelle" (fr). Confirm against the licence.
- The sentence "Corrective releases do not add later feature releases to your licence" is deliberately explicit; do not soften it.
- The `lic_note` key (security fixes and legally required remediation need no subscription) was not changed in this round.
