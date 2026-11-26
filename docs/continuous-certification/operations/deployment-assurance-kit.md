# Customer Deployment Assurance Kit (v1.0)

**For:** the customer's Power Platform administrator and the agent's accountable owner.
**Use it:** at installation and after every update.
**Covers:** MCL deployment-assurance (DA) and customer-responsibility (C) controls.

> **What this kit is.**
> - A checklist and report **you** complete in your own environment.
> - Colleague AI does not access your environment and does not verify your answers.
> - The certificate covers the certified release as supplied. It never covers your deployment or your compliance.
> - Reporting the version you run (section 3) only lets your certificate page show it as "reported by the holder".
> - An optional review of your completed report is a separately quoted service, outside the subscription.

## 1. Installation matches the certified release
| # | Check | How | Done |
|---|---|---|---|
| 1.1 | The package you imported is the certified release | Compare the file's SHA-256 with `SHA256SUMS-<version>.txt` from your download | ☐ |
| 1.2 | The managed solution version and name match the release notes | Power Apps → Solutions | ☐ |
| 1.3 | No unmanaged layer was added on top of the managed solution | Solution layers view | ☐ |
| 1.4 | Connections use the least-privilege accounts the install guide names | Connections list | ☐ |
| 1.5 | The environment's data loss prevention policy places the package's connectors as the install guide recommends | Power Platform admin center → Policies | ☐ |

## 2. Your responsibilities (MCL controls, class C or deployment-related)
| MCL | Control | What you record | Done |
|---|---|---|---|
| CAI-D01-05 | Accountable human role in the package | install guide; dossier | ☐ |
| CAI-D02-03 | Customer oversight assignment | customer deployment report | ☐ |
| CAI-D03-04 | Customer notices to affected persons | customer records | ☐ |
| CAI-D04-03 | Customer retention setting | customer deployment report | ☐ |
| CAI-D08-07 | Deployer serious-incident duties | customer records | ☐ |
| CAI-D09-02 | No provider access to customer data | architecture note; licence | ☐ |
| CAI-D10-01 | Knowledge source declaration | dossier; install guide | ☐ |
| CAI-D10-05 | Customer source curation | customer deployment report | ☐ |
| CAI-D12-02 | Connector risk classification | connector table in dossier | ☐ |
| CAI-D12-05 | Customer environment policies | customer deployment report | ☐ |
| CAI-D15-01 | Rollback procedure | rollback test record | ☐ |
| CAI-D15-02 | Safe decommissioning | P-UNINSTALL evidence | ☐ |
| CAI-D15-06 | Customer backup and recovery | customer deployment report | ☐ |
| CAI-D16-05 | AI literacy material | guidance document | ☐ |
| CAI-D18-04 | Customer consumption monitoring | customer deployment report | ☐ |

## 3. Deployment report (optional, to show the version on your certificate page)
| Field | Value |
|---|---|
| Certificate ID | CAI-… |
| Version in use | x.y.z |
| Installed on | yyyy-mm-dd |
| Checks 1.1–1.5 completed (yes/no) | |
| Reported by (role, not name) | |

Send it to the support channel named in your licence. It is stored as **customer-reported** and shown that way.

## 4. After an update
Repeat 1.1–1.3 and the checks in section 2 for controls marked "event". Report the new version in use. You decide whether and when to install. Colleague AI never installs or changes anything in your environment.
