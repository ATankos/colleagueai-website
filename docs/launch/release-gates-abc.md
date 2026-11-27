# Release sequencing: three independent gates

Each gate is opened by its own record. Opening one never opens another.

## Gate A: website deployment (Coming-soon catalogue)

**State: open since 26 Nov 2026 (PR #577; verified again on production commit `0355c524` after #578 and #580).**

- All 36 agents show "Coming soon" (`config/availability.json`, `lib/availability.js`).
- Zero agents are commercially available. No `sale.goDecision` is recorded, and `saleApproved` is false.
- Checkout and subscriptions are disabled: `CHECKOUT_ENABLED`, `CERTIFICATION_SALES_ENABLED`, the tax policy and the launch scope are unchanged.
- Interest collection is disabled (Gate B).
- Regression and security tests pass in CI.

## Gate B: interest collection (personal data)

**State: closed.**

Switch: the server-side environment variable `INTEREST_COLLECTION_ENABLED=true`, set in Vercel Production by the founder.

- No code, build step or deployment sets it.
- While it is off:
  - `POST /api/interest` refuses with `interest_collection_disabled` before reading any field;
  - `GET /api/interest?status` answers `{enabled:false}`;
  - the page shows no form, only the direct contact route (hello@ and the existing demo booking).

Turn it on in this order. A step is done only when its evidence is recorded.

**A. Preconditions** (before any authorisation):
1. The privacy approval pack (`docs/launch/privacy-approval-pack-interest-registration.md`) is approved by Marek Těšitel, with counsel's confirmation of the lawful basis and the marketing wording.
2. The Privacy Policy version covering interest registrations is published through the legal archive.
3. The DPAs for Upstash, Resend and Vercel are on file (O-DPA-SECURITY).
4. R8 is closed by the authorised read-only production reconciliation.
5. The production configuration is checked without enabling collection:
   - `RESEND_API_KEY`, `DEMO_NOTIFY_EMAIL` and `DEMO_NOTIFY_FROM` are set;
   - `INTEREST_DEDUPE_SALT` is set to a new random value, so the code's built-in fallback is never used;
   - production KV is reachable (`interest-ops status`).

**B. Founder authorisation** (documented **before** the variable is set):

6. Record the written authorisation in this file under "Gate B authorisation log", with:
   - date and time;
   - approver;
   - reference to the approval record in the privacy pack, section 10;
   - the person who will set the variable.

   Without this entry, nobody sets `INTEREST_COLLECTION_ENABLED`.

**C. Enable, then verify on Production:**

7. The named person sets `INTEREST_COLLECTION_ENABLED=true` in Vercel Production and redeploys.
8. Record the production verification evidence in the log:
   - the deployment id and commit;
   - `GET /api/interest?status` returns `{"enabled":true}`;
   - one test submission with a test address is accepted;
   - its record appears in `interest-ops status`, and its notification is `accepted` and received in the inbox;
   - the test record is deleted with `interest-ops delete --apply`;
   - checkout still answers `checkout_disabled`, and all 36 agents are still "Coming soon".
9. If any check in step 8 fails, remove the variable, redeploy and record the rollback.

### Gate B authorisation log

| Date / time | Approver | Reference | Set by | Deployment / commit | Verification evidence | Result |
|---|---|---|---|---|---|---|
| (none: Gate B closed) | | | | | | |

To turn it off again, remove the variable and redeploy. Records already stored are kept until their retention ends or are deleted on request.

## Gate C: commercialisation of one agent release

**State: closed for all 36 agents.**

Per agent and per release version, `lib/availability.js` checks (including that the release gates contain the complete mandatory set, `MANDATORY_GATES` in `lib/releaseGates.js`) the following at run time. Each is read from the record the existing framework already keeps, and must apply to **this exact release version and package**:

| Record | Requirement |
|---|---|
| `config/agents/<slug>.json` | `sale.goDecision` for this release: `{approvedBy, date, reference, release}`, not expired or revoked. `ip.status: executed` with its evidence hash |
| `config/products.json` | `saleApproved: true` and `release.status: released`. The package file, SHA-256 and size are present |
| Release record (`release.record`) | version, package, SHA-256, size, bundle revision and status equal the release in `config/products.json` |
| Release gates (`release.gates`) | `release` equals this version. Every gate is PASS. Every decision is valid under the same rule as `validate-product` (`lib/releaseGates.js`), including the written founder, accountant or counsel approvals and the verified evidence |
| `config/launch-scope.json` | names this SKU, release and bundle revision |
| `config/availability.json` | lifecycle `commercially-approved`, technical readiness `technically-approved`, certification `internally-certified`, and `releaseBlockers` an **empty list**. A missing or malformed list counts as blocked |

Any missing, unreadable, inconsistent, expired, revoked or other-version record refuses the sale. `releaseEvidenceErrors(slug)` lists the reasons.

Today, Contract Intelligence & Register 1.0.3.6 is refused for:
- 4 open release blockers;
- certification `internal-review`;
- 9 gates not at PASS;
- the IP licence (Instrument A, exclusive licence agreement), which is not executed.

Its release record matches the package.

**Early access** is independent of a sale. It needs:
- `sale.earlyAccess` for this release;
- technical readiness `release-candidate` or `technically-approved`;
- a release-blockers list;
- the release record matching the package;
- every **product-area** gate at PASS.

Today P-WORKFLOW-CLEAN is BLOCKED, so early access could not open even with an approval.

## Residual control issues recorded against Gate C (26 Nov 2026)

None of these opens a sale today. Each must be reviewed before the first per-release GO.

| # | Issue | Effect | Proposed handling |
|---|---|---|---|
| R1 | Required-review rule bypassed: #577, #578 and #580 (code) and #581, #582, #583 (documentation and the MCL test) were merged by the owner with 0 approving reviews. Also #588 (certificate integrity, code) and #586 (Continuous Certification website content in 8 languages, merged 27 Nov 2026 09:34 UTC as 2da5396e; only an automated CodeQL comment, no approving review), see `docs/launch/operational-record-2026-11-27.md` | Code that runs the commercial gate went to production without independent review; the closure and programme documents are not independently reviewed | **Open.** O-REVIEW-CONTROL stays open until an independent approving reviewer is established. No administrative bypass, including for the GO PR and the closure PR #581 |
| R2 | `MANDATORY_GATES` (`lib/releaseGates.js`) is a fixed list taken from release 1.0.3.6 | A new kind of agent or release may need gates the list does not name | Review the list as part of each new agent's onboarding (`docs/commercial-framework`) |
| R3 | Release evidence bundling verified by static trace (`@vercel/nft`) and tests, not by a live read in production (checkout is disabled, so the path never runs) | If a file were missing at run time the sale is refused (fail closed), not opened | Verify once on a Preview with checkout enabled in test mode before the GO |
| R4 | Package delivery to existing entitlements follows `saleApproved`, not the GO decision (deliberate: buyers keep what they paid for) | Revoking the GO stops new sales but not downloads by past buyers | Accepted by design; to stop delivery, set `saleApproved: false` |
| R5 | Early access opens visibility only; there is no early-access purchase or delivery path | An early-access approval cannot sell | Accepted; a paid early-access offer would need its own design and approval |
| R6 | Catalogue lifecycle, technical readiness and certification in `config/availability.json` are maintained by hand | A wrong lifecycle cannot open a sale (every gate must also agree), but can mis-describe status | Update in the same PR as each release decision; `registryErrors()` reports inconsistencies in CI |
| R7 | Interest notification "accepted" is not delivery confirmation | A notification could be lost after the provider accepted it | Gate B: weekly `interest-ops status`; a Resend delivery webhook would need a separate decision |
| R8 | Interest registrations between 14:03:40 and 14:16:02 UTC on 26 Nov (after #577, before log retention) are not reconciled | Possible unrecorded personal data | **Open.** Close only with the authorised read-only production reconciliation (`interest-operations.md`), recording the date, who ran it and the aggregate counts here. Gate B precondition A4 |
