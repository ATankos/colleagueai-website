# START HERE — ColleagueAI Contract Intelligence & Register

**SKU** CAI-L4-CI-001 · **Release** 1.0.3.2 · **Bundle revision** 4 · **Tier** CAI L4 — Decide (supervised)

> **Release status: controlled test release. Not for production use.**
> Each user sees only the contracts owned by their Dataverse owner team (INSTALL section 6).

## What you have

| File | What it is | Who needs it |
| --- | --- | --- |
| `START-HERE.pdf` / `.md` | This page | Everyone |
| `DOSSIER.pdf` | What the product does and doesn't do, prerequisites and known limitations. Written for release 1.0.3.1; for running costs and limitations of 1.0.3.2, INSTALL sections 1a and 10 are current | Buyer, legal, IT |
| `INSTALL.pdf` / `.md` | Step-by-step installation, access setup, safety check and first test (about 60 minutes) | IT administrator |
| `CAIContractIntelligence_1_0_3_2_managed.zip` | The Microsoft Power Platform solution. Import this file as it is; **don't extract it** (you only extract the outer bundle) | IT administrator |
| `deploymentSettings.template.json` | Only needed when installing from the command line | IT administrator |
| `check-cai-install-readiness.mjs` | Optional read-only check after the install: flows on, values set, whether the agent got published (INSTALL section 5) | IT administrator |
| `LICENSE.txt` | Licence terms and where they are published | Buyer, legal |
| `MANIFEST.json`, `SHA256SUMS.txt` | Contents, versions and checksums of this bundle | IT administrator |

## Before you install: check these four things

1. **Microsoft environment.** A Power Platform environment with Dataverse, plus Microsoft 365 with Teams and SharePoint.
2. **Copilot Studio capacity (mandatory).** The product's flows need prepaid Copilot Credits or a Copilot Studio pay-as-you-go billing plan. Without either, nothing runs.
3. **Costs.** Every extraction, recalculation and agent answer uses Copilot Credits that Microsoft bills to you, separately from the ColleagueAI licence. The daily recompute grows with the size of the register. Read INSTALL section 1a (our cost estimates, their uncertainty, the limits of cost alerts and the recommended initial limits) and set a budget with alerts in Azure before the first upload.
4. **Data.** Contracts and extracted data stay in your Microsoft tenant (SharePoint and Dataverse). Check your environment's generative-AI region settings, and decide whether your contract data needs a data protection impact assessment (DPIA).

## Who does what

| Role | Task |
| --- | --- |
| Buyer or procurement | Read the dossier; confirm the four points above with IT |
| IT administrator | Verify the download, then follow `INSTALL.pdf` from start to finish, including **who can see contracts** (section 6) and the **mandatory agent safety check** (section 7); keep **Daily recompute** off while testing (section 5) |
| Contract reviewer | Receives a review card in Teams for every contract, and approves or corrects the extraction before anyone relies on it; makes the three checks in INSTALL section 9a |

## Verify the download

On Windows, in PowerShell or Command Prompt, in the folder that holds the file:

```
certutil -hashfile CAI-L4-CI-001_1.0.3.2.zip SHA256
```

The result must match the SHA-256 shown on your order page. Inside the bundle, `SHA256SUMS.txt` lists the checksum of every file.

## Support

Email hello@colleagueai.ai with your order email, the SKU and the release number.
