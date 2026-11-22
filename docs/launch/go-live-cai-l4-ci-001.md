# GO: Contract Intelligence & Register (CAI-L4-CI-001 1.0.3.6, bundle revision 3) only

This PR opens sale of one product. It sets:
- `saleApproved: true` and release status `released` in `config/products.json` and the release record;
- catalogue status "Commercial release";
- the storefront master flag `checkoutEnabled: true`.

The storefront opens the buy path only for products whose status is `released` (`caiSaleOpen`, from #567). Concept
agents keep "Request access". Other products, foreign buyers, bank transfer and certification stay refused: default
deny, plus `config/launch-scope.json`.

**This PR is red on purpose until the evidence exists.** `tests/product-onboarding.test.mjs` fails while any for-sale
check fails:
- the IP instrument is executed and its SHA-256 recorded in `config/agents/contract-intelligence-and-register.json`;
- every gate in `config/release-gates.json` is PASS;
- `sale.goDecision` (approvedBy, date, reference) is filled with the founder's written GO.

Locally, `npm run validate:products -- --for-sale` lists what is still missing.

## Order (platform steps: `docs/launch/production-activation.md`)

1. Platform preconditions A1–A8 evidenced; Production variables and the live webhook set, with
   `CHECKOUT_ENABLED=false`.
2. #567 merged (fail-closed switch and per-product storefront). Tax-approval PR merged.
3. This PR: fill `sale.goDecision` and the IP hash, update the gates with their evidence; CI green; mark ready.
4. Founder sets `CHECKOUT_ENABLED=true` in Production. It takes effect only with the next deployment.
5. Merge this PR. The deployment it triggers opens the API and the storefront together: one step is the GO.
6. Controlled first live order and checks: production-activation.md §D7.

**Rollback:** `CHECKOUT_ENABLED=false` + redeploy (all sales), or revert this PR (this product).
