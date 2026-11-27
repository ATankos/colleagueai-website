# AI Token Economy benchmark: protocol and report template

`ATE-<agent-slug>-<version>-<yyyy-mm-dd>` · MCL D18-01, D18-02

> **Status in v1.0:**
> - The baseline at each release is a product-certification input (class M).
> - The quarterly comparison for subscribers is a priority operational deliverable. It is contractual only after spec §4.2 is met.
> - The benchmark describes the **certified release on ColleagueAI's reference environment**. It is not a forecast of any customer's consumption or cost.
> - This benchmark is separate from the planned CAI Token Economy Monitor product.

## Protocol (fixed per package; changes only by MCL revision)
1. **Environment:** CAI-TEST, with the managed solution of the release under test, a clean data set and a stated Copilot Studio capacity type. Record the environment id and capacity type.
2. **Workload:** the package's synthetic golden workload, for example for Contract Intelligence & Register *N* synthetic contracts from `docs/cai-l4-ci-001/test-fixtures`.
   - It is a fixed list with fixed order.
   - One **business transaction** is defined per package. For CI: one contract taken from upload to approved register entry, with its agent answer.
3. **Runs:** 3 runs. Report the median, plus the minimum and maximum.
4. **Measures:**
   - Copilot Studio consumption per business transaction, in the unit Microsoft reports in the Power Platform admin center (Copilot Credits or messages). Record the unit and the data timestamp.
   - p50 and p95 end-to-end latency.
   - Task success rate against the golden expected results.
   - Flow runs per transaction.
5. **Comparison:** against the previous certified release, measured under the same protocol.
   - Flag consumption > +15% or success < −2 points.
   - Every flag gets a cause note.
6. **Recording:** the raw run export is stored in the Release evidence library. The report references it by SHA-256.

## Report
| Field | Value |
|---|---|
| Package / version / bundle revision | |
| Environment / capacity type / unit | |
| Workload id and size | |
| Runs (date, operator role) | |

| Measure | Median | Min | Max | Previous certified release | Change | Flag |
|---|---|---|---|---|---|---|
| Consumption per business transaction | | | | | | |
| p50 latency (s) | | | | | | |
| p95 latency (s) | | | | | | |
| Task success rate | | | | | | |
| Flow runs per transaction | | | | | | |

**Cause notes for flags:**

**Not claimed:** no cost saving, price or consumption level is promised. Microsoft's pricing and metering are Microsoft's and may change.
