# Releasing the next agent (reuse, don't rebuild)

For each new agent package (e.g. the next 2–3 catalogue agents). Everything below already exists for CAI-L4-CI-001;
a new agent adds records and documents, not code. If a step seems to need new code, stop and ask why.

## 1. Product (engineering)
- [ ] Release candidate built in CAI-DEV, clean import into a fresh test environment, workflow run end to end (tenant log).
- [ ] `scripts/cai-release/<version>/`: `release-candidate.json`, dossier builder, README; bundle from
      `scripts/cai-release/build-bundle.py` with START-HERE, INSTALL, LICENSE (Licence §5 periods), MANIFEST, SHA256SUMS.
- [ ] Reproducible build (two builds, same SHA-256); bundle uploaded to Blob under `agents/<slug>/`; earlier files untouched.
- [ ] `config/products.json` entry: sku, tier, price, release (package, sha256, bytes, bundleRevision),
      `saleApproved: false`, status `controlled-test`; tests `tests/cai-<sku>-release-candidate.test.mjs` copied from 1.0.3.6.
- [ ] Factsheet facts in `public/agents.html` PRODUCT_FACTS: what it does, Microsoft runtime costs, what the price
      includes (support 24 months; security support period), exclusions; `npm run build`.
- [ ] Certifier: `node scripts/release/certify-release.mjs --bundle <zip> --audit` all automated gates PASS.

## 2. Commercial (reuse as is)
- [ ] Legal set: the published Terms / Licence / Privacy / Refund cover any Agent Package; a change of terms is a new
      versioned set (`docs/legal/proposed/README.md`), never an edit in place.
- [ ] Launch scope: add the slug to `config/launch-scope.json` only with the founder's decision.
- [ ] Tax policy: no change while the product is the same kind of supply (licence of an electronically supplied
      product); otherwise accountant first.
- [ ] Invoicing (company ledger), order documents, e-mail, recovery, refunds: no change.
- [ ] IP: add the agent's works to Schedule A/B by a signed schedule update (Instrument §2) before sale.

## 3. Test and GO
- [ ] One Stripe TEST purchase on the launch-check Preview for the new slug (only if checkout or delivery changed;
      otherwise the existing suites cover it).
- [ ] GO PR for that slug only, as `docs/launch/go-live-cai-l4-ci-001.md`: `saleApproved: true` + `released`, with
      its evidence. Production needs no new variables.
