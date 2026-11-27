# Certification impact assessment: template

`CIA-<yyyy>-<nnn>` · links to change register row `CHG-…` · MCL D06-02 to D06-05, D11-03

> **Operational record.** For an active subscriber, the published summary (section 7) is the change assessment of covered-scope limiter 5.3. Everything else here is internal.

## 1. The change
| Field | Value |
|---|---|
| Change register id | CHG- |
| Instrument or platform | (AI Act / CRA / GDPR / CAI standard / Copilot Studio / Power Platform / model change) |
| What changed, in one sentence | |
| Official source (verified text, edition, date checked, by whom) | |
| Takes effect / published on | |
| Covered scope reference (I-1 to I-4) or "provider obligation" | |

## 2. Triage (within 10 business days of logging)
Tick one class:
- [ ] **Statutory obligation on ColleagueAI as provider.** The fix is class **M** and goes to every affected licensee (D06-03), subscribed or not.
- [ ] **Change to the CAI standard or listing requirements.** The certified update is class **S**, for active subscribers (D06-05).
- [ ] **No effect on any shipped package.** Recorded and published as "no release required".

## 3. Affected packages and characteristics
| Package | Release(s) | C-1 tier | C-2 oversight | C-3 audit | C-4 transparency | C-5 docs | MCL controls affected |
|---|---|---|---|---|---|---|---|
| | | yes/no | yes/no | yes/no | yes/no | yes/no | |

## 4. Evidence
- Regression re-run (suite version, run id, critical failures = 0?):
- AI Token Economy benchmark re-run (if a model or platform change):
- Other tests:

## 5. Decision (FT; not the builder of the affected release where D17-01 applies)
- [ ] Release required → certified update or corrective release `x.y.z`. Available by **(≤ 60 days after the trigger, or before the change's own deadline)**.
- [ ] No release required → reason:
- Decided by / date:
- Independent reviewer sample (if selected): finding / none

## 6. Notices
| To | Required? | Sent on | Log reference |
|---|---|---|---|
| All affected licensees (class M) | | | |
| Active subscribers (class S) | | | |

## 7. Published summary (≤ 120 words, against each affected certificate, within 30 days)
> *What changed · whether a new certified release is required and why · when it will be available · what the holder needs to do (normally: nothing until it is published; then install at their discretion).*
