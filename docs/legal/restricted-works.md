# Restricted-work register

Works the company **may not license, sell, demonstrate as its product or claim rights in** until their rights chain is
documented. The machine-readable register is `config/restricted-works.json`, and the validator enforces it:
- a listed slug cannot pass onboarding while it is restricted;
- checkout already refuses any agent without a product record (409 `not_available`).

| Work | Origin | Missing evidence | Status |
|---|---|---|---|
| Operations Procedures Assistant | IFSA Agent Factory (Fall 2026), Agent 1; built by students in the ColleagueAI tenant and the private `colleagueai/agent-factory` repository | a signed licence or assignment from each contributing student; IFSA's written position on IP from the project | **restricted** |
| Service Review Pack Builder | IFSA Agent Factory, Agent 2 | same | **restricted** |
| Risk Event Capture | IFSA Agent Factory, Agent 3 (target) | same | **restricted** |

## Why

The students are not employees of the company, and no commission or licence from them is on record. Under Czech law the
author is the natural person who created the work. Without a written licence from each author (an exclusive licence
needs written form, § 2358(2)(a) Civil Code), the company holds no right it could sublicense to a customer, however the
work was built or hosted. The project's own terms with IFSA may also bear on it.

## To clear an entry

1. Counsel drafts one short contribution licence (the Instrument A text adapted: works identified by repository commit
   and solution hash; scope; remuneration; moral rights). Each contributing student signs it.
2. Obtain IFSA's written confirmation of its position on IP from the project.
3. Store the documents privately. Add one `rights_chain` record per work to `config/evidence-manifest.json`: `verified`,
   with the SHA-256 of the signed set.
4. Set the work's entry to `cleared` with `evidenceId`. Only then can it be onboarded through the commercial framework.
   It still needs its own tests and GO (`docs/commercial-framework/README.md`).
