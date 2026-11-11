# CAI-L4-CI-001 1.0.3.5 — corrective release candidate (not approved, not built)

Status: **candidate only.** Nothing here changes the frozen managed 1.0.3.4 solution, the customer package in Blob or
`config/products.json`. Building and shipping 1.0.3.5 needs the founder's separate approval (see "To release" below).

## Defect D-ET-1 (found 11 Nov 2026, tenant lifecycle test of managed 1.0.3.4, CAI-TEST)

| | |
|---|---|
| What happened | The reviewer approved SYN-N02 in Teams. The *Effective terms* run failed in action `Duration_months` (`int()` on the extracted duration "Initial Term"). |
| Why | `Duration_months` read the first word of the duration as a number. It is needed only when the initial term has no end date, but it ran, and threw, for every approved master. |
| How often | Depends on the extractor's wording. The same SYN-N02.pdf extracted on 10 Nov gave "24 months" and computed correctly. Contracts that state the term by dates ("from 1 March 2026 until 29 February 2028") invite wording like "Initial Term". |
| Effect | Contract stays Approved with no effective terms and no deadline. The flow has no failure path: no status, no message, nothing outside the flow run history. |
| What the agent said | Safe: "stored terms are stale … withheld until the register recomputes them" (single question) and "SYN-N02 has stale effective terms … withheld" (portfolio question). No wrong date was given. |
| Who finds out | Nobody at approval time. The Daily recompute (if switched on) would list it as not refreshed and alert the admin the next morning, and every day after, because every recompute fails the same way. There is no customer-side workaround short of re-uploading and hoping for different wording. |

## The change (two parts, nothing else)

1. `Duration_months` applies `int()` only to text that `isInt()` accepts (the number in brackets, else the first
   word, else `'0'`) and returns 0 whenever the term has an end date. An unreadable duration gives 0, which `Term_end`
   already treats as "no term end".
2. New scope `Report_terms_not_computed` (runs when the master branch fails, times out or is skipped): marks the master
   (for an amendment, the newest approved master of its family) `DEADLINE NOT VERIFIED - HUMAN REVIEW REQUIRED.` with
   the reason, clears the stored deadline, notice term end and computed-on time, writes a review-log row, and ends the
   run as Failed. It writes no attribute that triggers the flow, so it cannot loop. The next Daily recompute reports the
   contract to the admin.

Not included (founder decision): an immediate Teams alert from this flow. It would need a Teams connection and the
`cai_AdminAlertUpn` variable added to *Effective terms*; today the alert comes from the Daily recompute.

## Evidence

- `tests/cai-release-1035.test.mjs` evaluates the shipped and patched expressions: reproduces the failure for
  "Initial Term", "two years" and date-only wording; shows the 1.0.3.4 result for "24 months" (24, as in the tenant on
  10 Nov); shows the patched expression never throws, with `if()` evaluated lazily or with both branches; checks the
  failure path, the no-loop rule, the Daily recompute alert path, and that nothing else in the flow changed.
- `flows/…Effectiveterms….definition.json` is the output of `patch_flows_1035.py` on the 1.0.3.4 definition; the test
  checks it is reproducible.
- Not yet run in a tenant. The 1.0.3.4 tenant evidence is in the launch implementation report.

## To release (each step needs approval)

1. Apply the patch in the authoring environment (CAI-LAB), bump the solution to 1.0.3.5, export managed.
2. Re-run the notice fixture set (`docs/cai-l4-ci-001/test-fixtures/notice-1.0.3.3`) plus SYN-N02 with the duration
   forced to "Initial Term", and one forced failure to see the NOT VERIFIED status, review row and Daily recompute alert.
3. Rebuild the customer bundle, publish the checksum, point `config/products.json` at it (`saleApproved` stays false).
