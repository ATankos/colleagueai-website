# Counsel answer → configuration intake (first B2B licence)

Purpose: each written counsel decision maps to one repository action. Nothing is published before the answer exists in writing.

## A. Customer documents (Terms, Licence, Refund, Privacy) — PR #532 is the open draft
| Counsel delivers | Engineer action | Gate that proves it |
|---|---|---|
| Approved text of each changed page (or "no change") with the approval date | Replace the page text verbatim (EN); set "Last updated: <approval date>" in the page; in `config/legal.json` set `version` = approval date and `pageMarker` = the exact new line; run `node scripts/legal/archive-legal.mjs`; add the 7 translations only if counsel approves the EN first (translations are recorded as `translations` state, not part of the accepted set) | `tests/legal-archive.test.mjs`, `tests/acceptance.test.mjs`, `tests/legal-consistency.test.mjs` green |
| Licence §3 (no hosted governance layer) and Privacy §4 (Vercel Blob) — already drafted in #532 | approve / redraft | same |
| Support period and security-update promise (CRA procedure C4) | the sentence goes into the Licence and into the product facts block (`PRODUCT_FACTS` in `public/agents.html`) | claims-truth test |

## B. Right to sell — chain of title (Execution Plan §3, term sheets A/B)
| Counsel delivers | Engineer action |
|---|---|
| Signed IP assignment or licence from the author(s)/holding to Colleague AI s.r.o., or written confirmation the company already holds the rights | File the signed PDF in the Release evidence library (private); record its reference in the Implementation Report gate table (G2); no code change |

## C. Bundle revision 2 — PR #533 is the open draft
| Counsel delivers | Engineer action |
|---|---|
| Approved `LICENSE.txt` text for release 1.0.3.6 (replaces "release 1.0.3.2 … controlled test release. Not for production use.") and the release-status wording | Put the text in `docs/cai-l4-ci-001/bundle/LICENSE.txt`; START-HERE "Bundle revision 2"; keep INSTALL §9 text from #533; remove the committed `__pycache__` file; run `scripts/cai-release/1.0.3.6/build_bundle_1036.sh` (managed solution unchanged, `cca6f657…`); new `SHA256SUMS`; update `config/products.json` (`release.package`, `sha256`, `bytes`, `status` per counsel/founder); CI; upload to private Blob; download from the Preview and compare the hash; readiness check |

## D. Vulnerability handling (merged draft `docs/security/vulnerability-handling-procedure.md`, questions C1–C6)
| Counsel delivers | Engineer action |
|---|---|
| C1 applicability/dates, C2 safe-harbour wording, C3 what may be promised, C5 SBOM form, C6 reporting path | Publish `/security/disclosure` from the approved text; update `/.well-known/security.txt` (Contact → security@, Policy → the page); create the private register list |

## E. Sanctions / export (if counsel raises it)
| Counsel delivers | Engineer action |
|---|---|
| Whether a sanctions screening step is required for the first customer and what evidence to keep | A line in the onboarding checklist; no code change for one named customer |

Owner for sending and receiving: founder. Nothing in A–E is done from a verbal answer.
