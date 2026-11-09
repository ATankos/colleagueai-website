# CAI-L4-CI-001: rebuild checklist for release 1.0.3.2 (proposal)

> **Status: proposal of 8 Nov 2026. Nothing in this file has been built, published or deployed.**
> Release 1.0.3.1 stays exactly as published. A rebuild needs the owner's approval (decision 2).
> Audit position is unchanged: A6 PARTIAL, B1 and B2 OPEN, commercial sales NO-GO.
> Updated the same evening with a second fresh install of 1.0.3.1 (first table of section 1). It changes F8 and F9 and confirms F10.

Companion files in this change: `INSTALL.proposed.md` (proposed replacement for the bundle's INSTALL.md) and `scripts/check-cai-solution-package.mjs` (static check of an unpacked solution; not run by CI).

Labels used below. **CONFIRMED**: read directly from a real install or from the package files. **INFERRED**: follows from confirmed facts. **HYPOTHESIS**: untested, and it cannot be tested without importing or publishing again.

## 1. What the evidence says

### Second fresh install of 1.0.3.1 (8 Nov 2026, evening)

One more fresh import of the unchanged 1.0.3.1 into a second new environment. The three connections were authorised first and all five values were entered on the import screen. Nothing was uploaded, shared or chatted with, and we did not publish the agent.

| Question | Result |
|---|---|
| The import itself | 67 of 67 steps succeeded, no warnings, 3 min 42 s. (First install: two warnings, 4 min 43 s.) |
| F8: does the automatic publish fail again? | **No.** It ended *Succeeded*, without diagnostics, about a minute after the import. The agent was then listed *Available* in the Microsoft 365 admin center (shared with: nobody, never used, no channel). The administrator blocked it about five minutes after the publish. |
| F9: do all seven flows come On when the five values are supplied? | **Six of seven.** Extract contract on upload and Daily recompute came On. Review gate (Teams) stayed Off again, with no import warning. |
| F10: 9 or 11 privileges? | **11 again.** An empty new environment already gives each of its 120 standard roles Read, Write and Create on the *SharePoint Data* table (organisation level) before the product is installed. |

### F8. The automatic publish of the agent failed once and succeeded once

- **CONFIRMED (first fresh install).** After a fresh managed import of 1.0.3.1 the platform's automatic publish of the agent ended as *Failed*. The diagnostics are two `ConnectionNotShared` errors, "The connection reference must be shared with 1st party app.", one on each agent topic that reads the register as the signed-in user (*Get effective terms (user access)* and *Notice deadlines (user access)*). The agent stayed a draft and has no published version.
- **CONFIRMED.** Both topics call Dataverse through the one connection reference that belongs to the agent, in the mode that uses the end user's credentials. During the import that reference was bound to the same Dataverse connection as the flows' Dataverse reference, and it is shared with the agent's own owner team. The publish ran as the administrator who ran the import.
- **CONFIRMED.** The Copilot Studio first-party application user exists and already has full rights on connection-reference records. **INFERRED:** a share of the Dataverse record is therefore not what is missing.
- **CONFIRMED (second fresh install).** The same package, imported into a second new environment, published successfully (table above). The two topics therefore do not make the publish fail on their own, and the earlier inference that the failure belongs to the agent content is withdrawn. Release 1.0.2.0, which has no agent-owned reference, published automatically on each fresh install we looked at. For 1.0.3.1 the sample is two: one failure, one success.
- **HYPOTHESIS (open).** The two installs differ in how the connections came about (in the first they were created and authorised in one session just before the import; in the second they already existed, and the sign-in of two of them was completed in a different browser session), in the values (placeholders against five real values), in the environment, and only slightly in timing (the publish started about a minute after the import in both). None of these is shown to be the cause, and two installs are too few to tell. The leading idea is still a missing share on the Power Platform connection behind the reference, which something in how the connection is created may or may not arrange. It cannot be tested without importing again. Microsoft's public pages do not define the message.
- **Consequence.** A failed publish is what kept the agent a draft in the first install. That is an accident, not a control, and it did not repeat: in the second install the agent was published and listed *Available* within minutes. INSTALL section 7 must therefore cover both outcomes, and its Block step is needed in practice. The shipped INSTALL section 7 says that importing "publishes the agent automatically ... even in a brand-new environment"; that was true for 1.0.2.0, true for one of two installs of 1.0.3.1, and false for the other.

### F9. Three flows stayed Off in the first install, one in the second

- **CONFIRMED.** All seven flows are exported as activated, so the import tries to switch each one on. Two activations returned the warning *Attribute 'value' was not found for environment variable ...* (SharePoint site URL, Admin for alerts). The Review gate activation reported success and the flow stayed Off.
- **CONFIRMED.** Of the five values the customer is asked for, only the contract owner team is required at import. The other four have no default and are not required, so the import screen lets them stay blank.
- **CONFIRMED.** The three flows that stayed Off are exactly the three that read a variable with no value (Extract contract on upload, Review gate (Teams), Daily recompute). The four that are On read none. The Flow checker shows only *This flow is off*.
- **CONFIRMED (second install).** With all five values entered on the import screen, Extract contract on upload and Daily recompute came On, so blank values do explain those two. Review gate (Teams) stayed Off again, with no warning.
- **INFERRED.** Blank values do not explain Review gate: it stayed Off in both installs. Its activation step reports success and changes nothing, and nothing we can read says why.
- **CONFIRMED (package).** Review gate is the only flow whose definition has webhook-type actions (two Teams *Post adaptive card and wait for a response*), and the only flow whose workflow record in the package carries a `RendererObjectTypeCode` tag. Daily recompute, which turned on, uses the same Teams connection reference with ordinary *post message* actions. **HYPOTHESIS:** neither feature is shown to matter; nothing was changed or tested.
- **Not yet re-read.** The stored value of the Reviewer variable in the second environment. If it turned out to be blank, the Review gate result would again be explained by a blank value.
- **Consequence.** A buyer has to turn Review gate on by hand after the import (INSTALL section 5). The static checker cannot see this: the package exports the flow as activated.

### F10. The role has 11 privileges after a fresh import, 9 in the package

- **CONFIRMED.** The package declares nine privileges for *CAI Contract Reader*: Read on Contracts and Field evidence (user level) and seven read-only platform basics. It declares no Create, Write, Delete, Assign or Share.
- **CONFIRMED.** The role in the fresh environment has 11: the nine plus Create and Write on the *SharePoint Data* system table, at the only depth that table has (organisation). Every one of the 121 roles in that environment holds both, Basic User included. In the two older environments the CAI role is the only role without them. The table is private and organisation-owned, and a read through the API returns an error even for an administrator.
- **CONFIRMED.** The role is assigned to nobody until the administrator adds it to the owner team.
- **CONFIRMED (second fresh install).** The role again has 11 privileges. In the empty new environment, before the product was installed, all 120 standard roles already held Read, Write and Create on *SharePoint Data* at organisation level.
- **INFERRED.** The two extra privileges are the platform's standard baseline for roles, applied when the role is created in a fresh environment, not something the package asks for. A holder of the role gets nothing on the contract tables from them. The two older environments, where the role has 9, were created earlier, so a platform change over time cannot be excluded. The sample for a fresh import is now two, both 11.

### Package hygiene found on the way

- **CONFIRMED.** An unused approval component ("Run a multistage approval (preview)") is in 1.0.2.0 and 1.0.3.1. Nothing in the package references it. Its one stage is assigned to an account in the vendor's own Microsoft 365 tenant, and that is the only e-mail address in the package.
- **CONFIRMED.** `solution.xml` carries a stale description: "Release candidate 1.0.2.0 ... Not for publication (T7 open)." It is shown to customers.
- **CONFIRMED.** `MANIFEST.json` lists "Import publishes the agent automatically" under known limitations.

## 2. Changes for the rebuild (release 1.0.3.2)

| # | Change | Why | Checked by |
|---|---|---|---|
| 1 | Remove the unused approval component from the solution in the authoring environment (after "Show dependencies" confirms nothing uses it), then export. | Nothing uses it; it carries an e-mail address of the vendor's own tenant; a customer import creates an approval stub for it. | Checker C3, C6 |
| 2 | Replace the solution description. Proposed text: "ColleagueAI Contract Intelligence & Register, release 1.0.3.2. Four tables, seven flows, one Copilot Studio agent that you do not publish (see INSTALL section 7) and one read-only security role." | The current text describes release 1.0.2.0 and says "Not for publication". | C2 |
| 3 | Make all five values required at import: set the *required* flag on the SharePoint site URL, Contract library ID, Reviewer and Admin for alerts variables (the owner team already has it). | A blank value leaves flows Off and the import screen does not stop it (F9). | C4; retests 1 and 2 |
| 4 | Replace "Import publishes the agent automatically" in `MANIFEST.json` known limitations with: "The import tries to publish the agent and may fail. Do not publish it; follow INSTALL section 7." Replace INSTALL.md with the approved `INSTALL.proposed.md`. Review the dossier sentence "Managed import can publish the agent automatically, and an upgrade keeps the previously published agent": it is accurate ("can"), but it should also say that no publishing procedure has been tested. | The shipped wording is wrong for 1.0.3.1 (F8). | Section 3B |
| 5 | Version 1.0.3.2 everywhere: solution version, inner zip name, bundle name, START-HERE.md and .pdf, INSTALL.pdf, `MANIFEST.json` (release, solution version, sha256) and `SHA256SUMS.txt`. `deploymentSettings.template.json` already lists all five values and the four connection references and stays as it is. | A changed package needs its own version; upgrades depend on it. | C1; section 3B |
| 6 | No change to the security role. Keep the nine declared privileges. | The two extra privileges are added by the platform, not declared by the package. INSTALL documents "9 or 11" and tells the administrator what to check (F10). | C5 |
| 7 | No change to the agent topics or the agent-owned connection reference until decision 1 is taken. Do **not** switch the topics to the maker's credentials to make the publish pass: that would run register queries as the maker and remove per-user isolation (B1, B2). | The publication problem is open (F8). | C7 |
| 8 | Run the checker on the unpacked solution before every upload and keep its output with the release evidence. | Catches regressions of changes 1 to 3 and 6 without a tenant. | The script |
| 9 | Find out why the import leaves *Review gate (Teams)* Off (F9). In the authoring environment, compare its exported workflow with a flow that does turn on; the only differences found in the package are one extra `RendererObjectTypeCode` tag and the two *wait for a response* Teams actions. If a package change makes the import turn it on, take it. Otherwise INSTALL keeps the by-hand step in section 5. | The import left it Off in two of two fresh installs, with and without values, and says nothing. | Retest 1 |

## 3. Acceptance criteria

### A. Static, on the unpacked solution

```
node scripts/check-cai-solution-package.mjs <unpacked-solution-folder> --expect-version 1.0.3.2
```

All eight checks must pass.

| Check | Passes when | Shipped 1.0.3.1 |
|---|---|---|
| C1 | The solution version is the expected one (or is present, when no version is given). | passes without `--expect-version` |
| C2 | The description names the version and contains no "release candidate", "not for publication" or "T7". | fails |
| C3 | The package has no approval component. | fails |
| C4 | Every environment variable has a default or is required at import. | fails (four variables) |
| C5 | *CAI Contract Reader* declares exactly the nine read privileges. | passes |
| C6 | No e-mail address is embedded anywhere in the package. | fails (approval component) |
| C7 | Every declared connection reference is used by a flow, topic or bot. | passes |
| C8 | Every cloud flow is exported activated. | passes |

How the script itself was checked: it fails exactly C2, C3, C4 and C6 on the shipped 1.0.3.1 package; it passes all eight on a copy patched for changes 1 to 3 and the version; and each of seven single-fault copies (stale description, approval folder, blank-able variable, two extra privileges, e-mail address, unused connection reference, flow exported as draft) fails exactly the one intended check.

### B. Bundle, by review

- `MANIFEST.json`: release, solution version and sha256 match the new inner zip; the known-limitations entry is replaced (change 4).
- `SHA256SUMS.txt` is regenerated and matches every file in the bundle.
- INSTALL.md and INSTALL.pdf both come from the approved text, and START-HERE shows 1.0.3.2.
- The dossier wording is reviewed (change 4). The public dossier PDF in this repository is **not** changed by this proposal.
- `config/products.json` and the stored bundle are changed only after the owner approves the release, in a separate step.

### C. Must be unchanged

Seven flows, four tables, the nine role privileges, the two agent topics, the four connection references.

## 4. Required retests on the rebuilt package

None of these has been run on a rebuilt package. Retests 1, 3 and 4 were run once on the shipped 1.0.3.1 (the second fresh install, section 1); the results are in the pass-criterion column. Each retest needs the owner's approval, because it needs a new import, a new environment, a licence or Copilot Credits, none of which is allowed until the owner says so.

| # | Retest | Where | Pass criterion |
|---|---|---|---|
| 1 | Fresh import with all five values supplied. | A fresh environment that has never held the product | All seven flows are On straight after the import, with no manual action. This also shows whether Review gate comes On. Shipped 1.0.3.1: six of seven, Review gate stays Off. |
| 2 | Fresh import with a value left blank, up to the environment-variables step. Do not import. | Same session as retest 1 | The wizard does not continue. |
| 3 | State of the agent after the import. Record only; do not publish, share or add a channel. | Same environment | The agent is *Draft* with no *Available* entry, or, if it is *Available*, the *Block* step in INSTALL section 7 works. Record the publish status and diagnostics. Shipped 1.0.3.1: one install failed to publish (draft), one published and showed *Available*, and the *Block* step worked. |
| 4 | Privileges of *CAI Contract Reader* after a fresh import and after an upgrade. | Same environment; an upgraded one | 9 or 11, never anything but Read on the ColleagueAI tables. Shipped 1.0.3.1: 11 on both fresh imports and 9 after an upgrade. The remaining question, fresh-import path or platform change over time, has low value because the effective scope is none either way. |
| 5 | Walk through `INSTALL.proposed.md` as a customer administrator would, sections 1 to 9. | Same environment | No step, menu name or column name differs from the text, or the text is corrected. |
| 6 | Upgrade 1.0.3.1 to 1.0.3.2 on an environment that has 1.0.3.1 with its values set. | An environment with 1.0.3.1 installed | The approval stub is removed; no prompt for values that already exist; flows stay On; the role keeps its count; the agent's state is unchanged. |
| 7 | Interactive publish by an administrator, only if decision 1 is option C. | A disposable environment | Shows whether the `ConnectionNotShared` error appears at an interactive publish and what resolves it (hypotheses in section 1). Publishing makes the agent *Available* in the organisation's agent list until it is blocked, so the block must be part of the plan. |
| 8 | Chat session by a second, separately licensed user (the known limitation, relevant to B1 and B2). | An environment with a second licence | The second user sees only the owner team's contracts, a non-member sees none. Needs a licence and Copilot Credits. |

## 5. Decisions needed from the owner

1. **Publication path for the agent.** On a fresh 1.0.3.1 install the automatic publish failed once and succeeded once. When it succeeds, the agent is listed *Available* until an administrator blocks it; when it fails, the agent stays a draft that can be tried only in the Copilot Studio test pane. Nobody has yet chatted with a published copy of this agent in any environment, so whether an end user can use it is unproven. Options:
   - **A.** Ship 1.0.3.2 with the agent unchanged and INSTALL telling the administrator not to publish it, and to block the entry if the import published it. Honest and cheap, but the product's agent cannot be offered to end users, which is a sales blocker.
   - **B.** Redesign how the topics read the register. Not recommended without a design review; any redesign must keep the end user's own identity.
   - **C.** One controlled experiment first (retest 7), then a single rebuild that includes what it teaches. Recommended if end users must be able to chat with the agent. The second install shows that the publish itself can succeed; what no test has shown is whether an end user can then use the published agent.
2. **When to rebuild.** One rebuild after decision 1 (recommended), or a documentation-only 1.0.3.2 now (changes 1 to 5) and another build later.
3. **Approve retests 1 to 6** in one fresh environment plus one upgrade, once the rebuilt package exists. They need a new environment and imports, and no additional licence. They should cost no Copilot Credits if no capacity is linked to the environment and no file is uploaded, but a flow that is On and has capacity can spend credits (Daily recompute runs every day), so the plan must say which flows are switched off again afterwards. Retest 8 needs a second licence and credits and stays a separate decision.
4. **Where these files live.** This repository is public, so this draft pull request is visible to anyone. The checklist describes open product weaknesses. Keep it here, or move it to private storage and merge only the INSTALL proposal and the script.

## 6. What this change does not do

It does not rebuild, publish or deploy anything. It does not touch the published 1.0.3.1 package, `config/products.json`, the stored bundle, the public dossier PDF, application code or CI. It carries no tenant data: no environment names, identifiers or e-mail addresses.
