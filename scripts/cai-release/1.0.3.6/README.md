# CAI-L4-CI-001 1.0.3.6: corrective release, controlled release (not for sale)

Status on 19 Nov 2026: **built, tenant-tested, uploaded to private Blob; `saleApproved` stays false.** 1.0.3.6 replaces
1.0.3.5, which was built and tested the same day but never released (`../1.0.3.5/release-candidate.json` is marked
`superseded-internal`). Version numbers are never reused: the 1.0.3.5 package (`6d5fc024…`) stays on record as an
internal build.

| Artifact | Bytes | SHA-256 |
|---|---|---|
| `CAIContractIntelligence_1_0_3_6_managed.zip` (exported from CAI-LAB 19 Nov 17:32 UTC) | 122,951 | `cca6f657831a09d35e680a6cdc5be4eba329072ae918d76c1c2c8fa9dedad0f8` |
| `CAI-L4-CI-001_1.0.3.6.zip` (customer bundle, `build_bundle_1036.sh`, reproducible) | 368,718 | `69b3067694fdb27952f66addae17b45836dddfd3965bae6f5e6fe2bdd25dbd50` |
| Superseded internal build `CAIContractIntelligence_1_0_3_5_managed.zip` | 122,520 | `6d5fc02417609ec57799a92594aa1c34960563703fef8fc325649d133f24fe80` |

Every file in the bundle is listed in `docs/cai-l4-ci-001/bundle/SHA256SUMS-1.0.3.6.txt`.

## What changed (finding F-UX-1)

In the 19 Nov tenant test the review card for SYN-N09 showed Schedule 2 as "90 (90) months" under the heading
*Evidence (verbatim quotes)*, and the approve option read *the values match the evidence*. The PDF says "six (6) months"
in 4.5-point light-grey text (RGB 0.62); the AI Builder extraction misread it identically in all four extractions of that
file (10, 11 and 19 Nov, and the 1.0.3.6 regression). The excerpts are the model's reading of the page, not text copied
from it, and nothing checks them against the file.

1.0.3.6 never presents AI-extracted text as verbatim or verified:

- **Review card** (*Review gate*): header *Extracted by AI (CAI Contract Intelligence) and NOT VERIFIED against the
  document…*; section *AI-extracted excerpts (unverified - compare them with the original document)*; *Notice wording
  (AI-extracted, unverified)*; *Notice clauses the AI found in the document (unverified…)*; *Unusual clauses the AI
  reported (unverified…)*; approve option *Approve - I checked these values in the original document*.
- **Deadline texts** (*Effective terms*): *Notice wording as extracted by AI (unverified): "…"*, and the reasons say what
  the AI extraction found, not what the document says.
- **Agent**: the instructions and the effective-terms tool description call the stored excerpt AI-extracted and
  unverified, never verbatim, and send the user to the original document for exact wording.
- **Dataverse descriptions** of the notice wording, the effective-terms JSON and the field-evidence excerpt column.

Wording only: no action, condition, expression or data field changed (`tests/cai-release-1036.test.mjs` puts the old
strings back and gets the 1.0.3.5 files exactly). Checking excerpts against the document's text layer would need a new AI
step (cost and architecture): proposed separately, not in this release.

## Files

- `patch_release_1036.py`: the only source of the change (`python3 -I patch_release_1036.py ../1.0.3.5/release release`).
- `release/`: the generated flows, topics and agent instructions applied to CAI-LAB and exported.
- `build_dossier.py`: the 1.0.3.6 product dossier (two pages); also published as
  `public/docs/agents/contract-intelligence-and-register.pdf`.
- `build_bundle_1036.sh`: unpacks the managed solution and runs `scripts/check-cai-solution-package.mjs` (C1-C9, version
  1.0.3.6; C8 fails a package whose flows were exported Off, such as Daily recompute left Off in an idle authoring
  environment), then builds the bundle.
- `release-candidate.json`: the `release` entry of `config/products.json` (plus the managed-solution record);
  `tests/cai-1036-release-candidate.test.mjs` checks it against the checksums, documents, products.json and download rules.

## Evidence (19 Nov 2026)

Automated: `cai-release-1036` 4/4, `cai-1036-release-candidate` 8/8 locally; CI result on the pull request.

Tenant (details: Implementation Report section 12):

- CAI-LAB: read-back equal to the 1.0.3.5 release, change applied, export; package check 9/9 (C8: all 7 flows Activated).
- CAI-TEST: managed upgrade 1.0.3.5 -> 1.0.3.6 in the UI (file hash checked in the browser), data and flow states kept
  (42 contracts, 602 evidence, 49 reviews, 9 job runs). SYN-N10 recompute: new deadline wording. SYN-N09 upload: review
  card with the new labels; Approve with a confirmed 6 months -> 2027-06-30 (= `truth.json`), deadline basis labelled
  AI-extracted (unverified); the older SYN-N09 of the same team SUPERSEDED, the same reference in two other teams
  untouched. Agent: refused to present the excerpt as verbatim, called it AI-extracted and unverified, flagged the 3 vs 6
  months discrepancy and sent the user to the original document.
- Not repeated for 1.0.3.6: a clean install. The 1.0.3.5 clean install (CAI-TEST-2) used the same components, import
  steps and environment variables; 1.0.3.6 differs only in text.

## Release steps done

1. Bundle uploaded to private Blob `agents/contract-intelligence-and-register/CAI-L4-CI-001_1.0.3.6.zip` (dashboard ETag =
   MD5 of the bundle).
2. `config/products.json`: 1.0.3.6 is the release, 1.0.3.4 and 1.0.3.2 stay as previous releases, `saleApproved` false.
3. Public dossier replaced with the 1.0.3.6 dossier.
4. Download through `/api/download` on the pull request's Preview with a test entitlement: see the pull request.

## Bundle revision 2 (21 Nov 2026): documents only, same managed solution

| Artifact | Bytes | SHA-256 |
|---|---|---|
| `CAI-L4-CI-001_1.0.3.6-r2.zip` (customer bundle, revision 2, reproducible) | 370,005 | `66639e7ffe1c41d9f403081f07655ff6587007726c8e965a9640601ae0fd9ac8` |
| `CAIContractIntelligence_1_0_3_6_managed.zip` (unchanged) | 122,951 | `cca6f657831a09d35e680a6cdc5be4eba329072ae918d76c1c2c8fa9dedad0f8` |
| Revision 1, delivered, kept unchanged: `CAI-L4-CI-001_1.0.3.6.zip` | 368,718 | `69b3067694fdb27952f66addae17b45836dddfd3965bae6f5e6fe2bdd25dbd50` |

What changed (file checksums in `docs/cai-l4-ci-001/bundle/SHA256SUMS-1.0.3.6-r2.txt`):

- `LICENSE.txt`: named "release 1.0.3.2" in revision 1; now "release 1.0.3.6, bundle revision 2". No other wording
  changed: the licence and release-status text that counsel is reviewing (`docs/legal/proposed/package-LICENSE-1.0.3.6.txt`)
  is not used here; if counsel changes it, that is revision 3.
- `INSTALL.md` §9 (PR #533): the Copilot-capacity symptom of the 20 Nov clean install and the first-upload miss.
- `START-HERE.md`, `INSTALL.md`: bundle revision 2 and the file name `CAI-L4-CI-001_1.0.3.6-r2.zip`.
- `check-cai-install-readiness.mjs`: the usage example names `--expect-version 1.0.3.6` (was 1.0.3.4); no logic change.
- `MANIFEST.json`, the generated PDFs and `SHA256SUMS.txt` follow from the above.

Unchanged: the managed solution, `DOSSIER.pdf` and `deploymentSettings.template.json` (same checksums as revision 1).

Naming: `scripts/cai-release/build-bundle.py` keeps revision 1 on the historical name `CAI-L4-CI-001_<release>.zip` and
gives every later revision its own name `CAI-L4-CI-001_<release>-r<N>.zip`, so no delivered bundle is overwritten.
Built with `build_bundle_1036.sh` (the revision comes from `MANIFEST.template.json`); revision 1 was first rebuilt from
`main` and matched `69b30676…` byte for byte, and two revision-2 builds were identical.

Publication (founder): upload the file to private Blob as
`agents/contract-intelligence-and-register/CAI-L4-CI-001_1.0.3.6-r2.zip` **before** this change reaches a deployment,
because `config/products.json` then points downloads at it. Revision 1 stays in Blob. Buyers of 1.0.3.6 (only the two
test orders so far) are then offered revision 2; their agreement confirmations keep the revision-1 hash they recorded.
