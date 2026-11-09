<!--
INSTALL.md of bundle CAI-L4-CI-001 1.0.3.2. Every statement about what the import, the flows, the role or the
agent do was read from real installs of 1.0.3.1, from the connection and publishing test of 9 Nov 2026 and from
the clean install of 1.0.3.2 on 9 Nov 2026 (bundle revision 2 records what that install showed).
-->

# Installation guide: ColleagueAI Contract Intelligence & Register

**SKU** CAI-L4-CI-001 · **Release** 1.0.3.2 · **Bundle revision** 2

> **Release status: controlled test release. Not for production use.**
> Who sees which contracts is controlled by Dataverse **owner teams** (section 6). A user sees only the contracts owned by their team.
> **This guide does not publish the agent.** Publishing is a separate decision that your administrator takes (section 7).

**Who this guide is for:** your Power Platform administrator.
**Time needed:** about 60 minutes, plus a few minutes for the first test contract.

---

## 1. Before you start

Tick off each item before you import.

| ✓ | What you need | Notes |
|---|---|---|
| ☐ | **A Power Platform environment with Dataverse** | At least 1 GB of free database capacity. A Sandbox works well for a first install. |
| ☐ | **System Administrator** role in that environment | For the person who installs. Also use an account with this role for the connections: the flows run as this account and must be able to assign contracts to a team. |
| ☐ | **Copilot Studio capacity (mandatory)** | Either prepaid Copilot Credits, or a Copilot Studio **pay-as-you-go billing plan** linked to the environment (Power Platform admin center → Licensing → Copilot Studio → Manage billing plans). **Without capacity, none of the flows run.** |
| ☐ | **A cost alert** | Microsoft bills Copilot Studio usage separately from your ColleagueAI licence. Set an Azure budget with email alerts before the first upload. A budget alerts you; it does not stop spending. |
| ☐ | **A SharePoint document library** for incoming contracts | One library, used only for contracts that this product should read. |
| ☐ | **A team name and its members** | The people who may see the contracts in this library, for example a team called `Contracts - Legal`. You create the team in section 6. |
| ☐ | **Two named people** | A **reviewer**, who approves each extraction in Teams, and an **admin**, who is alerted if the daily job fails. Both need Microsoft 365 with Teams. |
| ☐ | **Access to the Microsoft 365 admin center → Agents** | You check there that the agent has not been made available to your organisation (section 7). |
| ☐ | **One test contract** | Any text-based (not scanned) PDF contract in English, for the first test. |

## 2. What gets installed

One managed solution, `CAIContractIntelligence` version 1.0.3.2, which contains:

- **Four Dataverse tables:** Contracts, Reviews, Field evidence and Job runs.
- **Five processing flows:** extract on upload, review in Teams, content version, effective terms and daily recompute. They run as the installing account. The daily recompute recalculates only contracts whose dates can move within the next 90 days (setting), with a full pass once a week (setting), so its Copilot Studio usage stays roughly flat as the register grows.
- **Two compute flows** used by the agent: they have no connection of their own and only work on data the asking user is allowed to read.
- **One Copilot Studio agent:** *CAI Contract Intelligence Assistant*. You do not publish it (section 7). When it is used, it reads the register **with the signed-in user's own identity**.
- **One security role:** *CAI Contract Reader*. For contract data it is **read-only**: Read on Contracts and Field evidence, limited to records owned by the user's team, and nothing else on any ColleagueAI table. It also carries the read-only platform basics every Dataverse role carries. On a fresh import Dataverse may add two more standard platform privileges to the role, Create and Write on its private *SharePoint Data* system table. Every standard role in the environment, including Basic User, already holds both; they apply to that private table, not to the contract tables, and need no action. In our tests both fresh imports showed 11 privileges and an upgrade showed 9.

Nothing is installed outside the environment you choose.

## 3. Collect five values

You will be asked for these during the import. Write them down first. **All five are required:** the import screen does not continue while one is empty.

| Setting | What to enter | Where to find it |
|---|---|---|
| **SharePoint site URL** | e.g. `https://contoso.sharepoint.com/sites/Contracts` | Open the site and copy the address up to and including the site name. Stop before `/Shared Documents`, `/Lists` or `/SitePages`. |
| **Contract library ID** | A GUID, e.g. `3f2a…-…` | Open the library, then **⚙ Settings → Library settings** (or **More library settings**). The page address contains `List=%7B…%7D`. The ID is the part between `%7B` and `%7D`. |
| **Reviewer** | The reviewer's sign-in email | For example `legal.reviewer@contoso.com` |
| **Admin for alerts** | The admin's sign-in email | For example `it.admin@contoso.com` |
| **Contract owner team** | The exact team name from section 1 | For example `Contracts - Legal`. Every new contract is assigned to this team. |

Four more settings have defaults and can stay as they are:

| Setting | Default | What it does |
|---|---|---|
| **Business time zone** | `Central Europe Standard Time` (Windows ID) and `Europe/Prague` (IANA ID) | Dates in answers and the daily job are calculated in this zone. |
| **Recompute window (days)** | `90` | The daily job recalculates a contract only when its notice deadline or term end falls within this many days, or when it has never been calculated. |
| **Full recompute day** | `Monday` | On this weekday the daily job recalculates every approved contract. Enter `Never` to switch the full pass off. |

Contracts outside the window are still recalculated the moment one of their documents changes or is approved.

**What each value switches on.** A flow turns on only when everything it needs is filled in (section 5).

| Value | Flow that needs it |
|---|---|
| SharePoint site URL, Contract library ID, Contract owner team | Extract contract on upload |
| Reviewer | Review gate (Teams) |
| Admin for alerts | Daily recompute |

## 4. Import (recommended: in the browser)

1. Go to **make.powerapps.com** and pick your environment (top right).
2. **Extract the bundle you downloaded** (right-click `CAI-L4-CI-001_1.0.3.2.zip` → *Extract All*). Inside the new folder you find `CAIContractIntelligence_1_0_3_2_managed.zip`. That inner file is the one you import, **as it is: do not extract it**.
3. Open **Solutions → Import solution → Browse**, choose that inner file, and click **Next**.
4. **Connections.** You are asked for four connection references: two for **Microsoft Dataverse**, one for **SharePoint** and one for **Microsoft Teams**. Use one System Administrator account for all of them, and create them here in the import wizard or in **Power Automate → Connections**. Pick the same Dataverse connection for both Dataverse references. The second Dataverse reference (its name starts with `cai_CAIContractIntelligenceAssistant`) belongs to the agent; when people chat, the agent reads the register with each user's own sign-in, not with this connection. **Whatever connection you pick here, the import may publish the agent on its own** (it did in one of our three installs with a connection created in the wizard, and did not in the other two; section 7 explains and tells you what to check and do right after the import). Each reference must show a connection before you continue.
5. **Environment variables.** Enter the five values from section 3, then click **Import**.
6. Wait for the green "Solution imported successfully" message. This usually takes 2–5 minutes.

**What the import leaves behind:** the solution is installed and the flows whose values and connections are complete are On, except **Review gate (Teams)**, which the import left Off in every install we made, including the 1.0.3.2 install (section 5). The agent exists and **may already be published**: go to section 7 check 1 now (Microsoft 365 admin center → Agents; Block it if it shows **Available**), then come back to section 5.

**Upgrading?** Import the same way; Power Platform upgrades the solution. Two things we saw on our upgrades:
- The wizard's **Import** button stays grey until every required value has been typed in this wizard session. A value the wizard pre-fills from your environment (shown as *Target environment value*) does not count. If Import stays grey although every field is filled, click into each pre-filled required field, select its text and type the same value again; Import then becomes available (seen twice, 9 November 2026).
- The connections step says "0 updates needed, 4 updates optional" and keeps your existing connections; leave it.
- **From 1.0.2.0:** the upgrade also removes the two old agent tools. Then do section 6, and assign your **existing** contracts and their field evidence to the team (Contracts table → select all → **Assign** → the team; then the same for Field evidence). Until you do, existing contracts are visible to nobody except administrators.
- **From 1.0.3.0 or 1.0.3.1:** nothing else to do; your team setup stays as it is.
- **In every case** an upgrade does **not** republish the agent: the version your users could reach stays the previous one until your organisation publishes again. Run the checks in section 7 anyway.

**Alternative: command line (pac CLI).**
1. Copy `deploymentSettings.template.json` to `deploymentSettings.json` and fill it in.
2. Find the connection IDs (Dataverse, SharePoint, Teams) in Power Automate → **Connections**: open a connection, and the ID is the long value in the page address after the connector name.
3. Run:

```
pac solution import --path CAIContractIntelligence_1_0_3_2_managed.zip --settings-file deploymentSettings.json --activate-plugins
```

## 5. Check that all seven flows are on (mandatory)

The import tries to turn on all seven flows. A flow that is still **Off** is either missing something (the table says what) or, in the case of **Review gate (Teams)**, was not turned on by the import: in all three of our test installs (two of 1.0.3.1, one of 1.0.3.2) it stayed Off, even when all five values were entered and no warning appeared. Turn it on by hand (step 3.2); in the 1.0.3.2 install this succeeded at the first attempt.

| Flow | It needs |
|---|---|
| Content version | the Dataverse connection |
| Effective terms | the Dataverse connection (the time zone has a default) |
| Compute – Get effective terms | nothing |
| Compute – Notice deadlines | nothing |
| Review gate (Teams) | the **Reviewer** value, the Dataverse connection and the Microsoft Teams connection |
| Extract contract on upload | the **SharePoint site URL**, **Contract library ID** and **Contract owner team** values, the SharePoint connection and the Dataverse connection |
| Daily recompute | the **Admin for alerts** value (the two time zones have defaults), the Dataverse connection and the Microsoft Teams connection |

1. Open **Solutions → CAIContractIntelligence → Cloud flows**.
2. Check the status column. Six should show **On**. **Review gate (Teams)** will probably show **Off**; turn it on in step 3. When all seven show **On**, continue.
3. If any flow is **Off**:
   1. Open **Solutions → CAIContractIntelligence → Environment variables**. Every one of the five must show a **Current value**. Add what is missing and **Save**.
   2. Select the flow and choose **Turn on**. Turn on the Off flows in this order: Content version, Effective terms, Compute – Get effective terms, Compute – Notice deadlines, Review gate (Teams), Extract contract on upload, Daily recompute.
   3. If **Turn on** fails with a message such as *Attribute 'value' was not found for environment variable 'cai_…'*, the variable named in the message has no value. Go back to step 3.1.
   4. If it fails for another reason: open the flow's **Details** page and look at **Connection references**. Each must show a green check. If one does not, open **Solutions → Connection references**, pick a working connection for it (sign in with the System Administrator account), and try again.

The **Flow checker** only says *This flow is off* for a switched-off flow; it does not tell you why. Use the table above.

**Automatic readiness check (optional, recommended).** The bundle contains `check-cai-install-readiness.mjs`. It reads your environment and reports the solution version, the five values, the four connection references, the seven flows, the security role and the agent's state; it fails when a required flow is Off and changes nothing. You need Node.js 20 or later and the Azure CLI signed in as the installing administrator:

```
set DATAVERSE_TOKEN=<token>      (PowerShell: $env:DATAVERSE_TOKEN = az account get-access-token --resource https://ORG.crmN.dynamics.com --query accessToken -o tsv)
node check-cai-install-readiness.mjs --url https://ORG.crmN.dynamics.com --expect-version 1.0.3.2 --daily-recompute off
```

Replace `ORG.crmN.dynamics.com` with your environment URL exactly as the Power Platform admin center shows it (Environments → your environment → *Environment URL*; the number after `crm` differs by region, for example `crm4` or `crm17`). The last line says `READY` or `NOT READY`.

**While you test: keep Daily recompute Off.** The daily job runs every morning at 05:30 Central European Time and uses Copilot Studio capacity for every contract it recalculates. In a test environment, select **Daily recompute → Turn off** after the import and turn it on when you go live; the readiness check accepts this with `--daily-recompute off`. Answers from the agent do not depend on the daily job: terms are recalculated the moment a document is approved or changed, and "days left" is always counted from today.

**Without Review gate on, uploads are extracted but no review card ever reaches the reviewer.**

If you linked the pay-as-you-go plan **after** the flows were on, turn **Extract contract on upload** and **Review gate (Teams)** off and on once. Otherwise the first upload may be skipped.

## 6. Set up who can see contracts (mandatory)

1. **Power Platform admin center → Environments →** your environment **→ Teams → + Create team.**
   - **Team name:** exactly the name you entered as *Contract owner team*.
   - **Team type:** **Owner**. Business unit: the default. Administrator: you.
2. Select the new team → **Manage security roles** → tick **CAI Contract Reader** → **Save**.
3. **Add team members:** the people who may see these contracts. Add the reviewer too if they should use the agent.
4. **Check the role.** Open **CAI Contract Reader**. On the ColleagueAI tables (Contract and Field evidence) it must show **Read** at user level and nothing else. If it shows Create, Write, Delete, Assign or Share on a ColleagueAI table, stop and contact support. (Create and Write on the platform's *SharePoint Data* table are normal, see section 2.)

How it works:
- Every new contract and its field evidence are assigned to this team when they are extracted.
- Members see them through the agent, read-only. Non-members see nothing.
- Removing someone from the team removes their access at their next question.
- If the team does not exist, **extraction stops** with the error *OwnerTeamNotConfigured* and nothing is created. Create the team and upload the file again.

## 7. The agent: you do not publish it (mandatory checks after every import)

**What the import does.** The import creates the agent *CAI Contract Intelligence Assistant* and Power Platform then **tries to publish it by itself**. Whether that succeeds is not under your control and we cannot predict it: in two of our installs (release 1.0.3.1, with connections that already existed, created earlier in the wizard or in Power Automate) the publish failed with *ConnectionNotShared* and the agent stayed a draft; in a clean install of release 1.0.3.2, with a new Dataverse connection created inside the import wizard, the publish **succeeded** and the agent was listed as **Available** (shared with nobody) within a minute. Rebinding the agent's reference to a connection created from inside Copilot Studio also led to a successful publish. Treat the agent as possibly published after every import, and look at what you actually have.

| After the import, in Microsoft 365 admin center → Agents → All agents | What it means | What to do |
|---|---|---|
| The agent is **Draft** | The automatic publish did not succeed (the message in Copilot Studio reads *ConnectionNotShared*). A draft has no published version, so it cannot be reached through any channel; only people who can open it in Copilot Studio can try it, in the test pane. | Nothing. Leave it as it is. **Do not click Publish to clear the message.** |
| The agent is **Available** | The automatic publish succeeded and the agent is listed for your organisation, shared with nobody and with no channel. In our clean 1.0.3.2 install the entry showed **Available** within a minute of the import; we blocked it. | Select the agent → **Block**. Then do checks 2 to 5 below. |

**Checks after every import, including upgrades:**

1. **Microsoft 365 admin center → Agents → All agents:** find *CAI Contract Intelligence Assistant*. There may be several entries with this name (one for each environment you have installed into), so check all of them, newest first. **Draft** or **Blocked** is what you want. If any shows **Available**, select **Block**.
2. **Copilot Studio → the agent → Channels:** no channel should be connected. Teams should show **Add channel**.
3. **Copilot Studio → the agent → Share:** only the owner is listed. *Everyone in organization* shows **No permissions, unless specified**. Close the dialog with **Cancel**.
4. **Copilot Studio → the agent → Settings → Security → Authentication:** *Authenticate with Microsoft*. This is required: the agent reads contracts with each user's own sign-in.
5. **Teams admin center → Manage apps:** no custom app for this agent.

Team membership (section 6) decides **what** each user sees; sharing, channels and publication decide **who** can talk to the agent at all.

### If you decide to publish later

Do not publish until **all** of these are true, and record who decided:

- The first test (section 9) passed.
- A second person who is a member of the owner team has used the agent in your environment and saw the right contracts, and a person outside the team saw none. ColleagueAI has not tested this end to end (section 10).
- The agent will be shared only with a named security group, never with everyone.
- *Authenticate with Microsoft* is on, and the Teams channel stays off until you have reviewed it separately.
- A cost alert is in place (section 1).

**Publishing procedure (tested once by ColleagueAI on 9 November 2026 on release 1.0.3.1, whose agent is identical).** Signed in as the installing System Administrator:

1. **Copilot Studio → the agent → Tools → + Add a tool → Microsoft Dataverse.** In the *Connection* box choose **Create new connection**, sign in with the same administrator account, wait until it shows **Connected**, then **Cancel** the dialog: do **not** add the tool. You now have a Dataverse connection created by Copilot Studio.
2. **make.powerapps.com → Solutions → CAIContractIntelligence → Connection references.** Open the reference whose name starts with `cai_CAIContractIntelligenceAssistant`, choose the connection you just created in the *Connection* box, and **Save**. Leave the other three references as they are.
3. **Copilot Studio → the agent → Publish.** Leave *Force newest version* unticked and confirm **Publish**. The header shows *Published* with today's date after about a minute. The two topics keep running with each user's own sign-in; nothing in the agent changes.
4. **Microsoft 365 admin center → Agents → All agents:** the entry now shows **Available**, shared with nobody. Select it → **Block** until step 5 is done.
5. **Copilot Studio → the agent → Share:** share with the **named security group** only. Then **Unblock** the entry in the admin center and run checks 1 to 5 again. ColleagueAI has tested steps 1 to 4 once (publish succeeded, entry blocked); step 5 and a chat session by a second user are not yet tested (section 10).

If step 3 fails with *ConnectionNotShared*, repeat steps 1 and 2 so that the reference points at the connection created in step 1.

After any publication, run checks 1 to 5 again.

### Recovery from publishing problems

| What you see | What it means | What to do |
|---|---|---|
| The agent is **Available** after an import | The automatic publish succeeded (seen in our clean 1.0.3.2 install). | Select it → **Block**; run checks 2 to 5. |
| The agent is **Available** after an **upgrade** | The previously published version stays reachable after an upgrade. | Select it → **Block**. The published version is the previous one until your organisation publishes again. |
| The agent is **Draft** although the import finished | The automatic publish failed (*ConnectionNotShared*), as in our two 1.0.3.1 installs. The agent has no published version and cannot be reached through any channel. | Nothing. Test in the Copilot Studio test pane (section 9). |
| Someone outside the owner team can talk to the agent | It was published, shared or given a channel. | Block it in the admin center; in Copilot Studio remove sharing and disconnect every channel; run checks 1 to 5; contact support. |
| You blocked the agent and now need it | Blocking is reversible. | Only after the conditions under *If you decide to publish later* are met: select the agent → **Unblock**, then run checks 1 to 5. |

## 8. Check the agent's topics

In **Copilot Studio**, open the agent, then **Topics**. These two topics should be **On**: *Get effective terms (user access)* and *Notice deadlines (user access)*. Do **not** publish the agent or add channels (section 7).

## 9. First test (about 10 minutes)

Use an account that is a **member of the contract owner team**.

1. **Upload** your test PDF to the contract library. Within about 2 minutes:
   - a new row appears in the **Contracts** table with review status *Pending review*, owned by the team;
   - the reviewer receives a **review card in Teams**.
2. **Approve** the card. The contract changes to *Approved* and its effective terms are calculated.
3. **Ask the agent** in the **Copilot Studio test pane** (not in Teams): *"Which notice deadlines fall in the next 400 days?"*
   - The first time, a **Connect to continue** card appears: click **Allow**. This lets the agent read the register as you.
   - The answer states the as-of date and time zone, and lists approved contracts of your team only.
4. **Correct** a value on a second card. It is recorded as *Needs correction*, and a follow-up card arrives.
5. **Next morning** (only if Daily recompute is On): the **Job runs** table shows the daily recompute with status *SUCCEEDED*, and its details show how many contracts the run covered.

**If you upload the same contract twice** (same contract reference, both approved), the newer approved document holds the effective terms and the older one is marked *SUPERSEDED* in its notice status. The agent answers from the newer one and the older one is not recalculated again.

If step 1 shows nothing after 5 minutes, check that:
- the environment has Copilot Studio capacity (section 1);
- all five values in section 3 are filled in, and the team exists with exactly that name (section 6);
- the flows are on (section 5).

## 10. Known limitations of this release

| Limitation | What it means for you |
|---|---|
| **The import may or may not publish the agent** | The import's own publish attempt failed in two of our installs and succeeded in one (release 1.0.3.2, clean install); we do not know what decides it. Check the Microsoft 365 admin center right after every import and block an **Available** entry (section 7). Publishing on purpose is a separate procedure (section 7), tested once. |
| **Access is per team, not per contract** | Every member of the owner team sees all of that team's contracts. All new uploads go to the one team you set in section 3; assigning by folder is planned. |
| **Second-user chat not yet tested end to end** | Per-user access was verified in Dataverse with a test user joining and leaving a team. A full chat session by a second, separately licensed user has not yet been run. |
| **Role shows 9 or 11 privileges** | All three fresh imports showed 11 and an upgrade 9. The two extra are standard platform privileges on a private system table (section 2). |
| **Daily recompute runs at 05:30 Central European Time** | The schedule can't follow the time-zone setting. Outside that time zone, edit the trigger time in the *Daily recompute* flow. It recalculates only contracts with a notice deadline or term end within the recompute window (default 90 days) and all of them on the full recompute day (default Monday). The window logic, the full pass, the *Never* setting, the SUPERSEDED exclusion, the failure report with Teams alert and the warning path were each exercised once on 9 November 2026 in a test register of 11 synthetic contracts (7 manual runs); a full scheduled week has not yet been observed. |
| **Duplicate approved masters** | When the same contract reference is uploaded and approved twice, the newer one holds the effective terms and the older is marked *SUPERSEDED*. Amendments are matched to their master by contract reference. |
| **Text-based English PDFs only** | Scanned (image-only) PDFs are not read. |
| **Processing region** | Generative-AI processing follows your environment's region settings. If *Move data across regions* is allowed, processing may happen outside your region. Check this setting if data location matters to you. |
| **Running costs** | Each contract uses Copilot Studio capacity: extraction, review, recalculation and questions. ColleagueAI will publish a measured cost per contract. Until then, start with a few contracts and watch your Azure costs. |
| **Short delay on content changes** | When a stored contract changes, its version number updates a few seconds later. |

## 11. Support

Email **hello@colleagueai.ai** with your order email, the SKU (CAI-L4-CI-001) and the release number (1.0.3.2).

---

## Appendix. Readiness checklist (tick before the first upload)

| ✓ | Check | Where | Expected |
|---|---|---|---|
| ☐ | Solution installed | Solutions | `CAIContractIntelligence`, version 1.0.3.2, Managed |
| ☐ | Connections | Power Automate → Connections | Dataverse, SharePoint and Teams, all **Connected**, owned by a System Administrator account |
| ☐ | Connection references | Solutions → CAIContractIntelligence → Connection references | Four, each with a connection |
| ☐ | Environment variables | Solutions → CAIContractIntelligence → Environment variables | Five with a current value; the two time zones, the recompute window and the full recompute day with their defaults |
| ☐ | Flows | Solutions → CAIContractIntelligence → Cloud flows | Seven, all **On** (Daily recompute may stay Off while testing) |
| ☐ | Readiness check (optional) | `node check-cai-install-readiness.mjs …` | Last line `READY` |
| ☐ | Owner team | Power Platform admin center → Teams | Name equals the *Contract owner team* value; type Owner; role CAI Contract Reader; members added |
| ☐ | Security role | Security roles → CAI Contract Reader | Read only on Contract and Field evidence; 9 or 11 privileges in total |
| ☐ | Agent status | Microsoft 365 admin center → Agents | **Draft** or **Blocked**; never **Available** |
| ☐ | Agent channels, sharing, authentication | Copilot Studio | No channel; only the owner listed; *Authenticate with Microsoft* |
| ☐ | Cost alert | Azure | A budget with email alerts |
| ☐ | First test | Section 9 | Passed with an owner-team member |
