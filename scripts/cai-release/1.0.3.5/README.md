# CAI-L4-CI-001 1.0.3.5: corrective release, built and tenant-tested, superseded before release

Status on 19 Nov 2026: **superseded by 1.0.3.6 before release (finding F-UX-1), never distributed.** The managed
solution and the bundle below were built and tested; they were never uploaded to Blob and never listed in
`config/products.json`. 1.0.3.6 (`../1.0.3.6`) carries the same fixes plus the unverified-extraction labels. The bundle
documents in `docs/cai-l4-ci-001` now describe 1.0.3.6; `SHA256SUMS-1.0.3.5.txt` keeps the record of this build. The
"To release" steps below are historical.

| Artifact | Bytes | SHA-256 |
|---|---|---|
| `CAIContractIntelligence_1_0_3_5_managed.zip` (exported from CAI-LAB) | 122,520 | `6d5fc02417609ec57799a92594aa1c34960563703fef8fc325649d133f24fe80` |
| `CAI-L4-CI-001_1.0.3.5.zip` (customer bundle, `build_bundle_1035.sh`) | 361,481 | `67f5c618196aa4e24326cfa1e0355345f440b319c0b20f673f9ff3a9412a10d7` |
| Baseline `CAIContractIntelligence_1_0_3_4_managed.zip` | 118,169 | `7bacb544abef718b08cf9b77436ce0863e05499bc063682c4cc08d143129df0e` |

Every file in the bundle is listed in `docs/cai-l4-ci-001/bundle/SHA256SUMS-1.0.3.5.txt`.

## Defects fixed

| Id | Found | What happened in 1.0.3.4 | 1.0.3.5 |
|---|---|---|---|
| D-ET-1 | 11 Nov, tenant | *Effective terms* threw on `int()` of a duration like "Initial Term"; the contract stayed Approved with no terms and no deadline, and nothing outside the run history showed it. | Every number read from the terms (duration, notice amount, notice days, renewal months) goes through `isInt()`; an unreadable one makes the deadline NOT VERIFIED with a reason for the reviewer. Any other failure of the calculation runs `Report_terms_not_computed`: DEADLINE NOT VERIFIED with time and run, stored dates cleared, review-log row, immediate Teams message to the admin, run ends Failed. |
| F-T-3 | 11 Nov, tenant | The contract family was matched by reference only, across owner teams: approving SYN-N09 in one team marked another team's SYN-N09 SUPERSEDED. | A family is the same reference **and** the same owner team, in *Effective terms* (incl. its failure path), *Compute - Get effective terms* and *Compute - Notice deadlines*. The agent tools return other teams' contracts with the same reference separately (`same_reference_in_other_teams`), and the agent instructions say to name them without mixing. |
| F-T-4 | 11 Nov, tenant | An unreadable upload failed the extraction run with no record and no message. | `Report_extraction_failure`: row "UNREADABLE - <file>" (Extraction failed, approval blocked, owner team, evidence JSON with step, error, file, uploader, run), review-log row, Teams message to the reviewer and the uploader with reason and next step, run ends Failed. A readable re-upload marks the earlier row "Extraction failed - replaced". A missing owner team now also alerts the admin. Review gate and Effective terms ignore "Extraction failed" rows. |

## Files

- `baseline/`: the 1.0.3.4 flow `clientdata` and the agent's topic and instruction data, read from CAI-LAB on 19 Nov.
- `patch_release_1035.py`: the only source of the change. `python3 -I patch_release_1035.py baseline release` writes
  `release/` (5 flows as clientdata and definition, 2 topics, agent instructions).
- `release/`: the generated content that was applied to CAI-LAB and exported as the managed solution.
- `tests/cai-release-1035.test.mjs`: evaluates the WDL expressions of baseline and release (reproduces the three
  defects on the baseline; checks the fixes, the failure paths, the no-loop rule, that nothing else changed, and that
  the generator output is reproducible).
- `build_dossier.py`: the 1.0.3.5 product dossier (2 pages). Section 06 uses the corrected data-hosting wording.
- `build_bundle_1035.sh`: builds the customer bundle from the managed zip (byte-for-byte reproducible).
- `release-candidate.json`: the future `release` entry of `config/products.json`;
  `tests/cai-1035-release-candidate.test.mjs` checks it against the checksums, the documents and the download rules.

## Evidence (19 Nov 2026)

Automated: `cai-release-1035` 18/18 and `cai-1035-release-candidate` 6/6 locally; the CI result is on the pull request.

Tenant (CAI-TEST upgraded 1.0.3.4 -> 1.0.3.5 in the UI; CAI-TEST-2 clean install in the UI; details and times in the
Purchasing Infrastructure Implementation Report, section 12):

- Upgrade kept all data (32 contracts, 386 evidence, 33 reviews, 8 job runs) and every flow's on/off state.
- Clean install: file SHA-256 verified in the browser before import; empty environment variables (no placeholders);
  every import component "success"; Review gate left Off (as INSTALL section 5 says); agent auto-published about one
  minute after the import and blocked in the Microsoft 365 admin center (INSTALL section 7).
- Lifecycle in CAI-TEST: upload, extraction, Teams review, approval, rejection, correction and resolution, amendment,
  deadline calculation (every date given equals `truth.json`: SYN-N02, N05, N09 with the reviewer's 6 months, N11 with
  its amendment, N13; SYN-N10 with conflicting clauses withheld as NOT VERIFIED by design), unreadable file with evidence and message, readable replacement,
  forced calculation failure and its repair, missing owner team, one Daily recompute run, access isolation by
  impersonation (own team only, no writes), agent answers (team-separated, injection refused). In CAI-TEST-2 (clean
  install): a readable and an unreadable upload, review, approval and deadline (2027-08-29, as `truth.json`).
- Cross-team: decisions on SYN-N09, SYN-N11, SYN-ADV-002 and SYN-N02 in one team left the other teams' rows untouched;
  Legal's SYN-N09, wrongly superseded by 1.0.3.4, was restored by requesting its recalculation.

Known and documented, not fixed in this release: the review card still heads quotes "Evidence (verbatim quotes)"
although quotes can carry the extraction's misreading (INSTALL sections 9a and 10).

Note: CAI-LAB's *Daily recompute* was switched Off on 19 Nov after the tests (idle environment). Switch it back On
before exporting a later release from CAI-LAB, or the package will ship it Off.

## To release (founder approval)

1. Approve the release (technical and security readiness in the report; commercial approvals are separate).
2. Upload `CAI-L4-CI-001_1.0.3.5.zip` to Blob under `agents/contract-intelligence-and-register/` and check its size
   (361,481 bytes) through the download endpoint on a Preview with test delivery.
3. In `config/products.json`, move the 1.0.3.4 record to `previousReleases` and make `release-candidate.json` (without
   `_comment` and `managedSolution`, with `releasedAt`) the `release`. `saleApproved` stays false.
4. Replace `public/docs/agents/contract-intelligence-and-register.pdf` with the output of `build_dossier.py`.
