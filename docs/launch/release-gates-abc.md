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
4. The retention and deletion procedures are documented (`docs/launch/interest-operations.md`).
5. The founder's authorisation is recorded: date, reference and the person who set the variable.

To turn it off again, remove the variable and redeploy. Records already stored are kept until their retention ends or are deleted on request.

## Gate C: commercialisation of one agent release

**State: closed for all 36 agents.**

Per agent and per release version, all of the following are needed:

- `sale.goDecision` in `config/agents/<slug>.json`, for that exact release;
- `saleApproved` and `release.status: released` in `config/products.json`;
- every gate in `config/release-gates.json` at PASS for that release;
- no release blockers;
- the legal, accounting, tax and security approvals;
- lifecycle `commercially-approved` in `config/availability.json`.

`lib/availability.js` fails closed if any of these is missing, invalid, inconsistent, expired or revoked.
