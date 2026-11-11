# B2B purchase journey

**Status:** built and tested in the Stripe sandbox (test keys only). Live sales stay closed. Every record below is written in test mode today.

## Journey

1. **Catalogue.** `/agents` and the drawers. Only a product in `config/products.json` with a release can be bought. Concept agents answer `409 not_available`.
2. **Order confirmation.** `GET /api/checkout?agent=…` shows:
   - product, release, SKU and price, and the seller's identity;
   - that the Microsoft platform is billed separately by Microsoft;
   - the four agreements, each with version and fingerprint.
   The form identifies:
   - the buyer company: legal name, registration number, country, VAT or tax ID;
   - the purchasing contact and email;
   - the person accepting, with their role.
   Three unticked boxes: authority and business purchase; acceptance of the agreements; immediate delivery.
3. **Records before payment** (`POST /api/checkout`):
   - a new order id `ord_YYYYMMDD_<hex>`;
   - the acceptance record and the order record;
   - a Stripe Customer named after the buyer company. An EU or UK VAT ID is attached so Stripe verifies it with VIES or HMRC.
   The tax policy then decides what may proceed (`docs/commerce/tax-and-invoicing.md`). A refused VAT ID, a held category or a Stripe error stops before any charge and marks the order.
4. **Stripe Checkout.** Card, Apple Pay, Google Pay or Link, or bank transfer. `client_reference_id` and `metadata.order_id` carry the order id to the session, the PaymentIntent and (when enabled) the invoice.
5. **Verified payment** (`/api/webhook`, signed). The session is checked against its order: mode, session, product, SKU, release, currency and amount before tax. A mismatch is withheld for a manual decision. A bank transfer is delivered only when Stripe reports it paid.
6. **Licence.** One entitlement per session, version-pinned. Duplicate and out-of-order events never grant twice, and never restore what a refund or dispute removed.
7. **Invoice.** Created by the adapter the approved tax policy names. Today none is created, and the order says `not_configured`. When the invoice step fails, Stripe retries the event without a second grant.
8. **Thank-you page** (`/api/success`):
   - order number, release, SHA-256 of the package;
   - download links valid for 15 minutes;
   - invoice status, installation guide and support.
   Failed, expired and held orders get their own page.
9. **Download.** The token names the buyer, product and file. A package missing in storage, or of the wrong size, is refused with `package_missing` or `package_mismatch` instead of a broken link. A buyer of withdrawn 1.0.3.2 is offered corrective 1.0.3.4.
10. **Recovery.** Reopening the thank-you link issues fresh links. `/api/recover` (off unless `RECOVERY_ENABLED=1`) emails them.
11. **After the sale.** A refund revokes the licence and creates one credit note per refund. A dispute revokes; a won dispute restores; a lost one stays revoked. A VAT ID that Stripe cannot confirm after payment is flagged for the accountant. `scripts/commerce/reconcile-payout.mjs` matches a payout to orders, invoices and credit notes.

## Order status

`lib/orders.js orderStatus` derives the status from recorded facts, never from event order. Precedence: `withheld` > `refunded` > `dispute_lost` > `disputed` > `partially_refunded` > `fulfilled` > `paid` > `payment_failed` > `expired` > `awaiting_payment` > `checkout_failed` > `checkout_open` > `created`.

## Stripe webhook events the endpoint must receive

`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `customer.tax_id.created`, `customer.tax_id.updated`, `invoice.paid`, `invoice.finalized`, and for Continuous Certification only (off) `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

## Switches

| Switch | Default | Effect |
| --- | --- | --- |
| `saleApproved` in `config/products.json` | `false` | live checkout for that release (merge only with the founder's GO) |
| `config/tax-policy.json status` | `unapproved` | live checkout (`liveTaxBlocked`), Stripe Tax, required tax ID and invoices, per the accountant's answers |
| Stripe live keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) in Production | test keys | live mode |
| `CHECKOUT_ENABLED` | on unless set to `false` | `false` takes checkout offline (kill switch) |
| `CERTIFICATION_SALES_ENABLED` | off | Continuous Certification subscriptions (stays off) |
| `RECOVERY_ENABLED` | off | email recovery of download links |
| `STRIPE_TOS_CONSENT` | off | Stripe's own terms checkbox, once a terms URL is set in Stripe |
| `TAX_POLICY_SANDBOX`, `TAX_SANDBOX_INVOICE_ROUTE` | Preview only | the sandbox tax fixture with a test key (never live) |
| `RELEASE_TEST_DELIVERY` | Preview only | test delivery of an unapproved release |

Live payment needs all of: `saleApproved: true`, an approved tax policy, live keys and webhook, and the founder's GO. Each one alone is not enough.

## Tests

`tests/purchase-journey.test.mjs` drives the real handlers through the launch scenarios. The parts are tested on their own in `order-record`, `tax-policy`, `invoicing`, `webhook`, `entitlement-concurrency`, `release-access`, `recover`, `product-release` and `legal-archive`.
