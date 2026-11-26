# Release sequencing: three independent gates

Each gate is opened by its own record. Opening one never opens another.

## Gate A: website deployment (Coming-soon catalogue)

**State: open since 26 Nov 2026 (PR #577).**

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

Turn it on only when every item below is done:

1. The privacy notice covering interest registrations (purpose, legal basis, 12-month retention) is formally approved and published as a new version. The draft is in `docs/legal/proposed/`.
2. The production lead storage (KV) and the notification configuration (`RESEND_API_KEY`, `DEMO_NOTIFY_EMAIL`) are verified.
3. One successful end-to-end submission, and its notification, on Production with a test address. Delete the test record afterwards.
4. The retention, deletion and missed-notification procedures are documented (`docs/launch/interest-operations.md`, done) and the operator has run `interest-ops status` on Production.
5. The founder's authorisation is recorded: date, reference and the person who set the variable.

To turn it off again, remove the variable and redeploy. Records already stored are kept until their retention ends or are deleted on request.

## Gate C: commercialisation of one agent release

**State: closed for all 36 agents.**

Per agent and per release version, `lib/availability.js` checks the following at run time. Each is read from the record the existing framework already keeps, and must apply to **this exact release version and package**:

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
- the IP instrument, which is not executed.

Its release record matches the package.

**Early access** is independent of a sale. It needs:
- `sale.earlyAccess` for this release;
- technical readiness `release-candidate` or `technically-approved`;
- a release-blockers list;
- the release record matching the package;
- every **product-area** gate at PASS.

Today P-WORKFLOW-CLEAN is BLOCKED, so early access could not open even with an approval.
