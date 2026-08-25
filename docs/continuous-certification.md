# Continuous Certification — product spec, vocabulary contract, counsel brief

Status: **draft for review**. Sections 4 and 5 are written for counsel and must
not ship as-is without legal sign-off. Everything else is the engineering
contract the code and the CI guards implement.

---

## 1. What the customer buys

Two things, sold together at checkout, with different lifetimes:

| | What it is | Lifetime |
| --- | --- | --- |
| **Agent package** | One-time licence for the agent package at its CAI tier | **Perpetual.** Never revoked because a subscription lapses. |
| **Continuous Certification** | Subscription that keeps the purchased package listed as a current Colleague AI Certified Release | **While paid.** Lapses on non-payment or cancellation. |

Prices (single source of truth: `config/pricing.json`):

| Tier | Agent package (one-time) | Continuous Certification | Annual (10 months) | Partner referral 10% |
| --- | --- | --- | --- | --- |
| L2 | $7,900 | $99 / month | $990 | $790 |
| L3 | $9,900 | $149 / month | $1,490 | $990 |
| L4 | $14,900 | $249 / month | $2,490 | $1,490 |
| L5 | $19,900 | $399 / month | $3,990 | $1,990 |

L5 has a price but **no catalogue agents yet** — the tier exists in the score
model only. Do not advertise an L5 package until one ships.

The subscription contains exactly four things, and nothing else:

1. **Active certification status** — the purchased version is listed as a
   current Colleague AI Certified Release for as long as the subscription runs.
2. **Regulatory monitoring** — Colleague AI monitors changes within the
   *covered scope* (section 5) that could affect its own certification
   requirements.
3. **Regulatory-driven updates** — if a change in the covered scope requires a
   change to the standard agent package, active subscribers receive the
   resulting certified release at no further licence fee.
4. **Certificate verification** — a Certificate ID and a public endpoint that
   confirms what it covers and whether it is currently active.

**Explicitly NOT included** (say so on the page, in these words or counsel's):
support, implementation, customisation, data processing, feature roadmap, or
any promise of periodic updates on a schedule.

## 2. Why the "no scheduled updates" framing matters

The obligation is **conditional, not periodic**. If nothing in the covered scope
changes in a given year, no release is produced and none is owed. That is what
makes the margin work, and it must be stated plainly rather than implied — a
customer who reads "updates" as "a new version every year" has been mis-sold.

## 3. Vocabulary contract (this is enforced by CI)

Rounds 1–5 of the release-gate audit retired "certified/certification"
site-wide because it read as **third-party attestation** of the customer's
compliance. Reintroducing the word for this product is a deliberate, narrowed
exception. The CI guard in `tests/journey.test.mjs` changes from "block the
stem" to "block the claim".

**Permitted — the programme's own vocabulary:**

- `Continuous Certification` (the product)
- `Colleague AI Certified Release` (a version we have certified against our own standard)
- `Colleague AI Certified — Active` (status badge)
- `Certificate ID`, `certificate`, `verify a certificate`
- `certified against the Colleague AI Certified standard`

**Still blocked — anything implying third-party assurance or a regulatory outcome:**

- `certified compliant`, `compliant with all`, `guarantees compliance`, `ensures compliance`
- `ISO/IEC 42001 certified`, `EU AI Act certified`, `DORA certified`, `independently certified`,
  `third-party certified`, `accredited`
- `Certified under CAI Score` (the retired phrasing)
- `certification framework` — the CAI Score remains a **governance and
  risk-classification framework**; the programme is a separate thing

**Required wherever the programme is named on a page:** the disclaimer that
this is Colleague AI's own programme, not third-party accreditation, and not a
legal, regulatory or compliance opinion.

## 4. The obligation clause — DRAFT FOR COUNSEL

> **Continuous Certification.** While the Subscription is active, Colleague AI
> maintains the Licensed Version's listing as a current Colleague AI Certified
> Release under the Colleague AI Certified standard, and monitors changes
> within the Covered Scope. If a change within the Covered Scope requires a
> change to the standard agent package in order for it to continue to meet that
> standard, Colleague AI will make an updated certified release available to
> Subscribers with an active Subscription at no additional licence fee.
>
> Colleague AI does not undertake to issue releases on any periodic schedule,
> and no release is owed where no change within the Covered Scope requires one.
>
> **Scope of the statement.** The Colleague AI Certified standard is Colleague
> AI's own programme. It is not accreditation, attestation or certification by
> any third party, notified body or regulator, and it is not legal, regulatory
> or compliance advice. Colleague AI makes no representation that the
> Subscriber's use of any agent package complies with any law or regulation
> applicable to the Subscriber. Compliance depends on matters outside Colleague
> AI's knowledge and control, including the Subscriber's configuration, data,
> processes, sector and jurisdiction.
>
> **Unmodified versions only.** Certification applies to the Licensed Version as
> supplied and to configuration within the documented supported parameters. If
> the Subscriber modifies the agent's logic, prompts, control flow or guardrails
> beyond those parameters, the certification ceases to apply to the modified
> version.
>
> **Termination.** On expiry, cancellation or non-payment, certification status
> lapses and the Subscriber must stop describing the agent as a current
> Colleague AI Certified Release. The perpetual licence to the agent package
> purchased is unaffected.

Counsel to confirm: consumer-vs-B2B framing, refund/cancellation rights, the
Czech-law governing clause already in the Terms, and whether the maintenance
obligation creates any warranty exposure beyond what is written.

## 5. Covered Scope — must be defined before sale

The obligation is only as safe as this list. It must be **enumerated**, not
open-ended. Proposed starting scope, for your and counsel's confirmation:

- Regulation (EU) 2024/1689 (EU AI Act) and its amending acts, as they apply to
  the classification, human-oversight, logging and transparency characteristics
  **of the standard agent package**
- ISO/IEC 42001 control expectations **as reflected in the Colleague AI
  Certified standard**
- The Colleague AI Certified standard's own revisions
- Microsoft Copilot Studio / Power Platform platform changes that break a
  shipped connect package

Anything outside this list is out of scope, and the page must say that a
customer's sector rules (DORA, MiFID, HIPAA, national implementations) are
**not** covered by the update obligation.

## 6. Engineering contract

- **Checkout**: one Stripe Checkout session, `mode: 'subscription'`, with the
  one-time agent price as an additional line item (billed on the first invoice)
  and the certification price as the recurring item. Card lane only — Stripe
  does not support `customer_balance` (bank transfer) in subscription mode, so
  the bank lane sells the agent package alone.
- **Entitlement vs certification are separate records.** Lapse must never touch
  the download entitlement. Refund of the agent package revokes the entitlement
  (existing behaviour) and cancels the subscription.
- **Certificate ID**: `CAI-<tier>-<8 hex>`, unguessable enough not to be
  enumerable, and carrying **no personal data**.
- **Verification endpoint** `/api/certificate?id=…` returns agent, tier,
  certified version, status, issued date and valid-until. It returns **no
  email, no customer name** — the holder proves possession by sharing the ID.
- **Webhook events**: `invoice.paid` extends, `invoice.payment_failed` marks
  `past_due`, `customer.subscription.deleted` lapses.

## 7. Open commercial items (not engineering)

- **VAT**: the Czech register shows no DIČ for IČO 29540852. Recurring B2B
  subscriptions across the EU raise VAT registration / OSS questions that
  one-off invoicing did not. Confirm with your accountant before the first
  subscription sale; Stripe Tax should be switched on once the position is known.
- **Renewal-rate claims** (e.g. "90–95% renewal") must not appear anywhere
  public until there is real cohort data. That is precisely the class of
  unevidenced claim the audit rounds retired.
- **The price change is a repositioning**: L4 moves from $45,000 to $14,900.
  Partner referral value per L4 deal moves from $4,500 to $1,490, and the
  worked example on /partners moves with it.
