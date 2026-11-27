# Certification evidence pack: version-specific template

`CEP-<agent-slug>-<version>` · MCL D05-01, D05-02, D13-01, D14-01, D17-01 · one pack per release or certified update

> The pack **assembles existing records**; it creates no new source of truth. Every row points to the record it was taken from. A release can carry `certifiedAt` in `config/products.json` (which lets a certificate read Active under the four-axis rule) only after section 6 is signed.

## 1. Identity
| Field | Value | Source |
|---|---|---|
| Agent / SKU / CAI tier | | `config/products.json`, `config/agents/<slug>.json` |
| Version / bundle revision | | release record |
| Package file, SHA-256, bytes | | release record; `SHA256SUMS-<ver>.txt` |
| Managed solution name, version, hash | | `config/agents/<slug>.json` → `managedSolution` |
| Previous certified release | | `config/products.json` |
| Reason class for this release | first certification / certified update (S) / corrective (M/L) | impact assessment `CIA-…` |

## 2. Gates and tests
| Item | Result | Evidence |
|---|---|---|
| Mandatory release gates (17) | n/17 PASS | `config/release-gates.json` at commit `…` |
| `releaseEvidenceErrors` for this version | [] | CI run |
| Central regression suite (version, critical failures, pass rate vs threshold) | | run report |
| Security / adversarial set (OWASP-organised) | | run report |
| Golden-set accuracy per field vs previous certified release (≤ 2-point drop) | | golden-set report |
| AI Token Economy baseline | | benchmark report |
| Clean install / workflow / upgrade / uninstall / rollback | | P-INSTALL-CLEAN, P-WORKFLOW-CLEAN, P-UPGRADE, P-UNINSTALL, rollback record |

## 3. Statement of applicability
All 86 MCL controls, each marked **applicable / not applicable (reason)** with its evidence reference. An "applicable, no evidence" row blocks section 6.

## 4. Regulatory mapping used in customer material
Only **verified** rows of `applicability-matrix-v1.0.md`, each with edition, checker and date. Indicative rows are listed as internal.

## 5. Open items and known limitations
| # | Item | Class (M/L/S/C) | Owner | Due |
|---|---|---|---|---|

## 6. Certification decision (D17)
| Role | Name | Conflict declaration on file (yes/no, date) | Decision | Date |
|---|---|---|---|---|
| Builder (FT): no decision role | | n/a | n/a | |
| Independent reviewer (IR) | | | approve / approve with conditions / reject | |
| Approver (FC) | | | | |

**After both approvals,** one reviewed PR records `certifiedAt` (and the pack's SHA-256) on the release record. Nothing else changes.
