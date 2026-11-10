# Deadline safeguard tests: release 1.0.3.4

Targeted regression tests for the P0 "unsafe PROVISIONAL deadline" correction, run on 10 November 2026 in the
authoring test environment (flows of release 1.0.3.4 deployed, synthetic contracts only), then on an upgrade of a
1.0.3.3 test environment with existing data, and finally as a clean install of the final package into a second test environment
from which the previous release had been uninstalled. All contracts are synthetic; the notice-set PDFs and expected results are
in `../notice-1.0.3.3/`.

**Rule under test.** A notice deadline is stored and answered only when it is CONFIRMED: the notice period comes from a
reviewer-approved record and no check flag remains. Otherwise the deadline is *not verified*: no date is stored or
answered (also no days left, previous-cycle date or reminder), the reason is kept in *Deadline review*, the candidate
calculations go only to the review log and to a Teams card for the reviewer, and only an explicitly confirmed notice
period ("6 months", "90 days", "none", with the confirmation tick) makes the deadline CONFIRMED.

## Results

| # | Case | Contract | Expected | Result |
|---|---|---|---|---|
| 1 | Small print misread (6 months read as 90 months) | SYN-N09 | Not verified, no date; candidates 3 months = 2027-09-30, 90 months = not used | Pass. 1.0.3.3 date 2027-09-30 withdrawn (audit row keeps it); card sent |
| 2 | Reviewer confirms 6 months with the tick | SYN-N09 | CONFIRMED 2027-06-30, basis names the reviewer | Pass; review log "Notice period confirmed by reviewer" |
| 3 | Conflicting clauses resolved by the extraction's precedence rule (Order Form 2 months vs clause 3 months) | SYN-N10 | Not verified (precedence is an interpretation) | Pass; candidates 2028-02-29 / 2028-01-30 |
| 4 | Reviewer approves without confirming a period | SYN-N10 | Stays not verified; no new card (no loop) | Pass; recalculation twice more, no new request |
| 5 | Business days | SYN-N08 | Not verified; candidate marked estimate | Pass |
| 6 | Automatic renewal, notice clause not extracted at all | SYN-F01 | Not verified ("no notice period was found") | Pass |
| 7 | Renewal clause not extracted | SYN-F02 | Not verified ("no renewal clause was found") | Pass |
| 8 | Reviewer confirms "none" with the tick | SYN-F02 | No automatic renewal, confirmed by reviewer; no deadline | Pass |
| 9 | Notice clauses found but contract read as not renewing | SYN-F03 | Not verified | Pass |
| 10 | Period entered without the tick | SYN-F03 | Not applied; review recorded as Needs correction (terms withheld) | Pass |
| 11 | Wording does not state the period read (8 vs "three (3) months") | SYN-F04 | Not verified | Pass |
| 12 | Implausible period only (36 months) | SYN-F05 | Not verified; candidate "not used - implausible period" | Pass |
| 13 | 1.0.3.2 record, wording in months (180 days converted to 6 months) | SYN-L1, SYN-L3, SYN-L4, SYN-L5 | Not verified; candidate re-derived from the stored wording | Pass |
| 14 | 1.0.3.2 record, stored wording does not show the period | AUR-SaaS-2025-0412 (synthetic) | Not verified | Pass |
| 15 | 1.0.3.2 record, reviewer-approved exact day period (180 days) | VC-MSA-2024-017 (synthetic) | CONFIRMED 2027-09-16 | Pass |
| 16 | 1.0.3.2 record, exact day period | SYN-L2 | CONFIRMED | Pass |
| 17 | Month-end, renewal date, "more than", amendment, roll-forward, reviewer-corrected | SYN-N02, N04, N06, N11, N09-RT | Unchanged dates (2027-08-29, 2026-12-01, 2027-04-30, 2028-03-30, 2027-06-30) | Pass |
| 18 | No automatic renewal stated | SYN-N14 | No deadline, no flag | Pass |
| 19 | Agent answer, unverified | SYN-N10 | Starts with "Deadline not verified — human review required", no date | Pass |
| 20 | Agent portfolio answer | all | Only CONFIRMED deadlines with dates; unverified listed without a date | Pass |
| 21 | Daily recompute | all | One Teams message to the reviewer listing the unverified contracts by term end; records still storing an unconfirmed date are selected whatever the window | Pass (10 listed) |
| 22 | Upgrade 1.0.3.3 to 1.0.3.4 with data | test environment | Records, evidence, reviews, job runs and flow states unchanged; agent not published by the import | Pass (24 contracts, 194 evidence rows) |
| 23 | After upgrade: recalculation | SYN-N09, SYN-IN-001, SYN-N02, SYN-N12 | N09 and IN-001 not verified with a card; N02 2027-08-29 and reviewer-corrected N12 2028-01-31 CONFIRMED | Pass |
| 24 | Clean install of the final package (empty environment, previous release uninstalled) | test environment | Import succeeds; 4 connection references bound; 5 values set; role read-only (11 privileges); agent per-user authentication; each installed flow definition identical to the package; agent instructions contain the not-verified rule; readiness check READY | Pass (readiness check 10 of 10; *Review gate* turned on by hand at the first attempt) |
| 25 | Agent publication after the clean install | test environment | Any automatic publish is found and blocked | The Copilot Studio service published the agent about 3 minutes after the import (Microsoft 365 entry *Available*, shared with nobody); blocked in the admin center; readiness check warns R6b. Documented in INSTALL section 7 |
| 26 | Stale deadlines after the 1.0.3.3 → 1.0.3.4 upgrade (10 Nov, 19:10 CET) | test environment, 9 contracts that still stored a 1.0.3.3 date with an open review reason | One run of *Daily recompute* (the documented correction) withholds them; evidence and confirmed records untouched | Pass. Job run SUCCEEDED, 10 selected and refreshed, 0 failed. The 9 dates were cleared, each kept in a review record *Deadline withdrawn - not verified (release 1.0.3.4)*, and 9 review requests were logged. Extraction JSON hashes unchanged for all 24 records; field evidence 194 before and after. Confirmed SYN-N02 2027-08-29 and SYN-N12 2028-01-31 were not selected and are unchanged. `check-deadline-integrity.mjs` logic: 0 stale |

**Stale data after an upgrade (test 26).** A record calculated by 1.0.3.3 or 1.0.3.2 keeps its stored date until it is
recalculated. The agent does not answer it, but the value can be read through the Dataverse API (for example with Excel,
Power BI or a user's own flow) by members of the owner team. The solution has no model-driven app, and none of its seven
system views on the Contracts table shows the deadline or status columns. `scripts/cai-release/1.0.3.4/check-deadline-integrity.mjs`
(read-only) lists such records; one run of *Daily recompute* clears them, because it selects every record that stores a
date with an open review reason or no calculation basis, whatever the window. Running the check or the job again changes nothing.

The deadline tests 1-23 were not repeated on the clean install: its seven flow definitions are identical to those tested
(SHA-256 of the canonical definition JSON compared one by one). The readiness check `check-cai-install-readiness.mjs`
now reads the connection-reference component type from the environment (it is 10129 in one environment and 10169 in
another); before this fix check R3 found no references in the clean install.

## What these tests do not show

- A notice clause that the extraction does not find at all, in a contract whose renewal clause it does find with a
  plausible, consistently quoted period, is not detectable by these checks. The reviewer's check of the document is
  the control.
- A misread that changes both the number and its quoted wording consistently (for example "eight (8) months" for
  "six (6) months") is not detectable either.
- The calculation is a calendar calculation, not a legal interpretation of the clause.
