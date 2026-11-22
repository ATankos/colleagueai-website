# Next-agent readiness (22 November 2026)

**Bottom line: none of the three candidates can be approved for sale now.** The two student agents have unclear
contribution rights, and nobody outside the student team has verified them. The third candidate isn't built yet.
None of them is in `config/products.json`, so checkout refuses all of them in any mode (409 `not_available`).

## What this assessment rests on, and what it does not

- **Rests on:** the IFSA project scope and release definition, the founder's notes from 31 Oct, the catalogue
  (`public/agents.html`), and the IP review (`docs/legal/ip-rights-review.md`).
- **Could not use:**
  - The student repository `colleagueai/agent-factory`. This session's GitHub access does not cover it, and the
    browser extension is not allowed on github.com.
  - The CAI-TEST tenant. The founder has ruled that student accounts and their licences are not to be touched, and
    paid Copilot Studio tests need his approval.
- **Consequence:** no functional, permission or isolation result is claimed below. Each "unknown" is a test still to
  be run.

## Candidates

| | Operations Procedures Assistant | Service Review Pack Builder | Contract Obligations Review (proposed 3rd) |
|---|---|---|---|
| Catalogue | L2, USD 7,900, Operations | L2, USD 7,900, Operations | L4, USD 14,900, Legal |
| What it does | staff find and follow internal procedures (Knowledge Core) | builds periodic service-review packs from performance data (Reporting Core) | obligations from approved contracts, with owners and due dates |
| Built by | IFSA students (Agent 1) | IFSA students (Agent 2) | not built; would be built by Alexandr Tankos on the CAI-L4-CI-001 architecture |
| Technical state | "nearly finished" (31 Oct); release definition not yet confirmed met | behind Agent 1 by the plan | none |
| Reuse of the reference product | platform only | platform only | platform **and** most of the solution (SharePoint intake, evidence excerpts, reviewer gate in Teams, Dataverse register, team isolation, daily recompute) |
| Same buyer as CI&R | no | no | yes: an upsell to every CI&R customer |
| Contribution rights | **student work**: needs a signed licence or assignment from each contributing student. Also needs IFSA's position on IP from the project. Counsel to confirm the form. | same | one author (Instrument A schedule update) |
| Tenant tests | unknown: workflow, permissions, isolation with a second user, human review, error paths, clean import | unknown | n/a |
| Recommendation | **NO-GO** until rights are signed and the Phase 3 tests pass on a non-student account | **NO-GO** (same) | **build next**, after the first CI&R sale |

## Why the order matters

1. **Contribution rights first.** Without written rights from each student, the company cannot license the student
   agents to a customer, however good they are. Collecting them takes days, not code. Start before the project ends:
   freeze on 7 Dec, delivery 8–14 Dec.
2. **Then the release definition.** Both test sets green, a clean import with no manual fixes, a test report,
   install guide and release notes. After that, ColleagueAI's own tenant run:
   - A non-student tester account (e.g. "CAI T7 Tester").
   - The business workflow end to end.
   - A second user to test isolation.
   - The reviewer gate, error paths, and uninstall.
3. **Then onboarding** by the framework (`README.md` §3). The validator lists what is missing, and the GO PR cannot
   go green without its evidence.

## Per-candidate actions

| Action | Owner |
|---|---|
| Ask counsel for a short student contribution licence (one text, signed by each student, covering the agent-factory works) | Founder → counsel |
| Get IFSA's written position on IP from the project | Founder |
| Confirm the Agent 1 release definition is met; share the solution zip, test report and install guide in a place this framework can read | Students (via founder) |
| Approve a capped Copilot Studio budget for ColleagueAI's own tenant test of Agent 1 (non-student account) | Founder |
| Contract Obligations Review: spec reusing the CI&R solution, after the first CI&R sale | Founder + engineering |
