# Guided evaluation — 30 minutes, test tenant, synthetic contracts

What it is: a labelled walk-through of release 1.0.3.6 in **our test tenant (CAI-TEST)** on **synthetic contracts** from `docs/cai-l4-ci-001/test-fixtures/`. It is not a live demo on the prospect's data and not a production system; say so in the first minute and in the follow-up e-mail. Nothing shown is a promise beyond the product facts block on the catalogue page and INSTALL section 10.

Before the call (15 min): CAI-TEST has Copilot Studio capacity (billing plan CAICopilotPAYGCH); the seven flows are On; Daily recompute may stay Off; one reviewer account is a member of the owner team; the 19 Nov screenshots from the evidence ZIP are open as a fallback if a run is slow. No customer data is uploaded during the call, ever.

| Min | Step | Show | Say (and the limit) |
|---|---|---|---|
| 0–3 | Framing | Catalogue page → the facts block of CAI-L4-CI-001 | "Test tenant, synthetic contracts, release 1.0.3.6, controlled release. Each user sees only their owner team's contracts." |
| 3–8 | Upload | Upload `SYN-COST-003_Master-Services-Agreement.pdf` to the contract library | "Within about two minutes a row appears as *Pending review* and the reviewer gets a Teams card. Every extraction is Copilot Credits billed by Microsoft to you — INSTALL 1a has our estimates and their uncertainty." |
| 8–14 | Review card | The Teams card: values and excerpts labelled as AI-extracted and unverified; approve it | "The reviewer reads the source contract — schedules, amendments, small print — before confirming. The product never shows a deadline a human has not confirmed (INSTALL 9a)." |
| 14–19 | Notice deadline | Open `SYN-N09.pdf` (already approved earlier, or upload it as a second file) and the deadline card with the red *confirm notice period* banner | "6-month notice counted on the calendar; unconfirmed → *Deadline not verified — human review required*, no date." |
| 19–24 | Ask the agent | Copilot Studio **test pane** (not Teams): *Which notice deadlines fall in the next 400 days?* | "As-of date and time zone are stated; only approved contracts of this user's team. The agent is not published to Teams by default — the admin decides (INSTALL 7)." |
| 24–27 | Correction + failure path | Correct an effective date on a second card; show one *Contract file could not be read* message (fixture from 9b) | "Corrections to notice period / effective date apply at once; anything else goes to *Needs correction*. Every failure is reported in the register and in Teams, never silent." |
| 27–30 | What happens next | START-HERE "Before you install: four things"; the onboarding checklist | "Your Microsoft tenant, your capacity, your DPIA decision. We install nothing in your tenant; your admin imports one managed solution in ~60 minutes with INSTALL.pdf." |

Questions to answer only with the documented text: costs (INSTALL 1a), limitations (INSTALL 10 / facts block), security reporting (`/security/disclosure` once published; until then: hello@ and the procedure under counsel review), licence terms (`/license`, pending counsel approval of the first-customer wording), support period (facts block). Anything else: "I'll confirm in writing."

Do not: upload a prospect's contract; publish the agent to Teams; show CAI-A6-CLEAN (no capacity); quote prices other than the catalogue price; call it a "live demo".
