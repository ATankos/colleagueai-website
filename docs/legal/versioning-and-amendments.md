# Agreement versions, evidence and amendments

**Status:** the mechanism is built. No agreement text was changed in this work. Counsel has not approved the current texts. Amendments that depend on counsel are prepared outside this public repository and are not published.

## What a buyer accepts, and what is recorded

The order confirmation (`/api/checkout`) lists the four agreements in `config/legal.json`: Terms of Service, Software & Agent Licence, Refund Policy and Privacy Policy. Each one is shown with its version and fingerprint, and links to the English page. The buyer ticks that the company accepts them "in the versions shown". Before Stripe is called, the acceptance record (`acceptance:<id>`) and the order (`order:<id>`) store:

| Field | Meaning |
| --- | --- |
| `legalSet` | the document set id (`config/legal.json set`) |
| `legalVersions` | `terms=…;licence=…;refund=…;privacy=…` (also in the Stripe session metadata) |
| `legalDocuments` / `acceptance.documents` | per document: `version`, `sha256` (fingerprint of the text), `archive` (path of the archived copy) |
| `acceptedAt`, `buyer`, `declaredBy`, `declaredRole`, `consents` | who accepted, for which company, when, and which boxes were ticked |
| `clientHash`, `userAgent` | salted hash of the IP address and the browser string; no plain IP |

The fingerprint is the SHA-256 of the agreement's words: the page from its title to its footer, tags removed and whitespace collapsed. A changed word changes it. A changed menu, footer link or style does not. The archived copy in `legal/archive/<document>/<version>.html` holds that text, and `legal/archive/manifest.json` lists every archived version. Together they prove which words any order accepted, whatever the live page says later.

## Rules the tests enforce

`tests/legal-archive.test.mjs`, with `node scripts/legal/archive-legal.mjs --check` as the same check by hand:

- An archived copy never changes, and no version is listed twice.
- Each live page matches the fingerprint of the version the confirmation names. Editing a page without a new version fails CI.
- The archive script refuses to store different words under an existing version.
- The confirmation links only the English texts that are recorded.

`tests/acceptance.test.mjs` also checks that each page's "Last updated" or "Effective" line matches `pageMarker`.

## How to amend an agreement (after counsel approves the new text)

1. Edit the page in `public/` with the approved text, including its "Last updated" or "Effective" line.
2. In `config/legal.json`, give the document a new `version` and `pageMarker`. If the change is material, also give the set a new `set` id. A buyer with the confirmation page open must then review the documents again.
3. Run `node scripts/legal/archive-legal.mjs`. It archives the new version beside the old one and writes the new `sha256` and `archive` into `config/legal.json`.
4. Redo the translations from the approved English text, or mark them out of sync in `config/legal.json translations` (see below).
5. Earlier buyers keep the version they accepted: their records name it and the archive holds it. Whether, how and when existing customers are told about a change, and whether it binds them, is a counsel decision. It is not automated.

## Baseline (10 November 2026)

The four current versions were archived as the pages read on 10 November 2026. Git history shows the texts changed after their version dates without new versions:
- Terms: changed on 3 and 14 September and 7 November 2026, still labelled 13 June 2026.
- Licence: changed on 3 September and 7 November, labelled 13 June.
- Privacy: changed on 3 September and 7 November, labelled 13 June.
- Refund Policy: changed on 6, 7, 13 and 14 September, labelled 1.0 of 9 July 2026.

No live sale has taken place, so no buyer accepted an earlier wording. Test-mode acceptance records made before the baseline may refer to earlier text under the same label. Counsel-approved texts are to be published as new versions. From the baseline on, a silent edit fails CI.

## Translations

The localized legal pages (cs, de, fr, es, it, pl, pt) are not part of the accepted set. They still carry the termination clause from before 3 September 2026, which says licence rights end on termination, under the same "Last updated" date. The English Terms say a paid perpetual licence survives termination of services. `config/legal.json translations.status` is `out_of_sync`. Which language governs, and the corrected translations, are counsel decisions. The translations are redone from the approved English texts before live sales, then the status is set to `in_sync`.

## Continuous Certification terms

`config/legal.json certification` is a draft (`draft-2026-11-10`) awaiting counsel. It is shown only when `CERTIFICATION_SALES_ENABLED=1`, which is off. Its version is recorded with the opt-in. It is archived the same way once approved.
