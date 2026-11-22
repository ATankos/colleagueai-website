# ColleagueAI Commercial Product Framework

**The principle:** the sales and delivery platform exists once. A new agent becomes sellable by adding *records*
(configuration, documents, evidence), never code. If onboarding an agent seems to need code, the platform has a gap:
fix it in the platform, for every agent, in its own PR.

Reference product: CAI-L4-CI-001 Contract Intelligence & Register 1.0.3.6, bundle revision 3.

```
 per agent (records)                         shared platform (code, built once)
 ───────────────────                         ─────────────────────────────────
 config/products.json  entry ─────┐          api/checkout.js   ── kill switch, sale gate, tax gate, launch scope
 config/agents/<slug>.json  ──────┤          api/webhook.js    ── payment, refund, dispute, revocation, idempotency
 config/packages.json  entry      ├──reads──▶ lib/fulfilment.js ── entitlement, order record, documents, e-mail
 config/launch-scope.json entry   │          api/download.js   ── signed token → private Blob, version-pinned
 PRODUCT_FACTS + RUNNING_COSTS    │          api/recover.js    ── download recovery
 scripts/cai-release/<ver>/       │          lib/invoicing.js, orderDocuments.js ── invoice, credit note, PDFs
 bundle + SHA256SUMS + dossier ───┘          lib/legalArchive.js, acceptance.js ── agreement versions, evidence
                                             scripts/release/validate-product.mjs ── says what a product lacks
```

Every agent is switched separately: `saleApproved` per product (default-deny), `release.status` per release,
launch scope per SKU and bundle revision. One platform switch closes everything: `CHECKOUT_ENABLED`.

## 1. Shared platform capabilities (built; reuse as is)

| Capability | Where | Covered by |
|---|---|---|
| Stripe Checkout, confirmation page, three unticked acceptances | `api/checkout.js`, `lib/acceptance.js` | `acceptance`, `purchase-journey`, `stripe-api-compat` tests |
| Payment webhooks: signature, idempotency, retries, async payments | `api/webhook.js`, `lib/fulfilment.js` | `webhook`, `entitlement-concurrency` |
| Customer identification, first-sale country/currency/method limits | `lib/launchScope.js`, `lib/taxIds.js`, `config/launch-scope.json` | `launch-scope`, `first-sale-payment-methods` |
| Tax policy and company-ledger invoicing | `lib/taxPolicy.js`, `lib/invoicing.js`, `config/tax-policy.json` | `tax-policy`, `invoicing`, `vat-turnover` |
| Legal agreement versions, acceptance record, archive | `config/legal.json`, `lib/legalArchive.js`, `lib/agreementPdf.js` | `legal-archive`, `legal-consistency` |
| Licences, entitlements, order records, version-pinned access, renewal coverage | `lib/db.js`, `lib/orders.js`, `lib/releaseAccess.js` | `entitlement`, `order-record`, `release-access` |
| Private package storage and signed download | `lib/storage.js`, `lib/downloadToken.js`, `api/download.js` | `product-release`, `release-access` |
| Refunds, disputes, revocation, credit notes, reconciliation | `api/webhook.js`, `lib/reconciliation.js`, `lib/invoicing.js` | `webhook`, `invoicing` |
| Order documents (agreement PDF, invoice, credit note), e-mail, recovery | `lib/orderDocuments.js`, `lib/orderMail.js`, `api/recover.js` | `order-documents`, `recover` |
| Launch controls, default-deny, kill switch (fail closed) | `lib/products.js`, `lib/checkoutSwitch.js` | `checkout-switch`, `product-release`, `sales-readiness-final` |
| Rate limits, security headers, exposure baseline, monitoring (Sentry) | `vercel.json`, `api/*` | `ratelimit`, `public-exposure`, `audit-headers` |
| Release rollback | `CHECKOUT_ENABLED=false` (instant); Vercel instant rollback (deploys); `previousBundles` keep every delivered file | runbook below |

**Known platform gap, fixed when the second agent needs it:** `scripts/release/certify-release.mjs` and
`config/release-gates.json` are written for CAI-L4-CI-001. The second agent's onboarding PR parameterises the
certifier by slug (gate list path from `config/agents/<slug>.json` → `release.gates`), with no change to the gates of
the reference product.

## 2. Per-agent configuration (repeat for each product)

| Item | Where it lives |
|---|---|
| SKU, slug, tier, name, release, package, SHA-256, bytes, bundle revision, `saleApproved` | `config/products.json` |
| Price | `config/pricing.json` (by tier); catalogue price in `public/agents.html` `CAI_PRICING` |
| Category, capabilities, use cases, exclusions | `config/agents/<slug>.json` |
| Managed solution name, version, hash | `config/agents/<slug>.json` → `managedSolution`, equal to the release record |
| Microsoft licences, Copilot Studio capacity, install values, connections | `config/agents/<slug>.json` → `microsoft`; detail in the install guide |
| Tenant permissions, isolation, human review, governance controls | `config/agents/<slug>.json` → `tenant` |
| Support commitments (≥ Licence §5: 24 months, corrective releases, 24-month security support) | `config/agents/<slug>.json` → `support` |
| Known limitations | install guide section, linked from the agent record |
| IP: contributors, basis of rights, student work, instrument, evidence hash | `config/agents/<slug>.json` → `ip` (evidence itself kept outside this public repo) |
| Factsheet facts and Microsoft running costs | `public/agents.html` `PRODUCT_FACTS`; `scripts/generate-agent-pages.mjs` `RUNTIME` |
| Installable package list | `config/packages.json` |
| Release record, bundle, checksums, dossier | `scripts/cai-release/<version>/`, `docs/<sku>/bundle/`, `public/docs/agents/<slug>.pdf` |
| Release gates (tenant tests, approvals) | gate list named in `config/agents/<slug>.json` → `release.gates` |
| First-sale scope | `config/launch-scope.json` → `products` |
| Sale approval | `saleApproved: true` + `release.status: released` + `sale.goDecision` |

## 3. Onboarding an agent: one process

Each step ends with something the validator or a gate can see. `node scripts/release/validate-product.mjs <slug>`
prints what is still missing; `--for-sale` prints what blocks a sale.

1. **Readiness decision.** The agent meets the release definition: both test sets green, imported into a clean
   environment without manual fixes, test report, install guide, release notes. A building package is not enough.
2. **Rights first.** List every contributor in `ip.contributors`. Student or contractor work needs a signed licence
   or assignment before any sale; record the instrument and, once signed, its SHA-256 (`ip.status: executed`).
3. **Tenant evidence.** In a Microsoft test environment that is not a student's: the business workflow end to end,
   permissions and isolation with a second user, human-review gate, error paths, uninstall/upgrade. Logs go to the
   release evidence library; each becomes a PASS gate with its evidence.
4. **Package.** Versioned managed solution → bundle (`scripts/cai-release/build-bundle.py`: START-HERE, INSTALL,
   LICENSE with the §5 periods, MANIFEST, SHA256SUMS), built twice with the same SHA-256; dossier PDF.
5. **Records.** `config/products.json` entry (`saleApproved: false`, status `controlled-test`), release record,
   `config/agents/<slug>.json` from `_template.json`, `config/packages.json`, `PRODUCT_FACTS`, `RUNTIME`.
   `npm run build`; the validator prints ONBOARDED.
6. **Publish the bundle** to private Blob `agents/<slug>/` (no random suffix; ETag = MD5 of the file); earlier files
   are never replaced.
7. **Stripe TEST** on the Preview only if checkout, delivery or documents changed for this agent; otherwise the
   platform suites cover it.
8. **GO PR** for that agent alone: `saleApproved: true`, `release.status: released`, `sale.goDecision`, launch-scope
   entry, catalogue copy. CI runs `tests/product-onboarding.test.mjs`, which fails while any for-sale check fails,
   so the PR cannot go green without its evidence. Merge needs the founder's written GO.

Legal: the published Terms / Licence / Privacy / Refund cover any Agent Package. A product needs new terms only if it
changes what is sold (a service, a subscription, a different licence scope); that is a new versioned agreement set.

## 4. Candidates (22 Nov 2026)

See [candidates-2026-11.md](candidates-2026-11.md). Production activation: [../launch/production-activation.md](../launch/production-activation.md).
