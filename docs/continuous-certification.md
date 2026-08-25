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

## 5. Covered Scope — the boundary of the obligation

**This is the clause with teeth.** Everything else in this document describes a
subscription; this section decides how much engineering work a regulator, a
standards body or Microsoft can compel Colleague AI to do for a fee already
collected. An open-ended scope is an open-ended obligation.

A scope is only bounded if all four limiters below hold. Each one is a separate
question for counsel (section 8).

### 5.1 Limiter one — a closed list of instruments

The obligation attaches to these instruments and no others:

| # | Instrument | Anchor |
| --- | --- | --- |
| I-1 | Regulation (EU) 2024/1689 (EU AI Act), **as amended and in force on the subscription start date**, and any later amendment added under 5.4 | Art. 50 transparency obligations apply from 2 Aug 2026; Annex III standalone high-risk deferred to 2 Dec 2027; Annex I embedded high-risk to 2 Aug 2028 (Digital Omnibus on AI) |
| I-2 | ISO/IEC 42001, **only** those controls the Colleague AI Certified standard cites by number in its control map | Includes the EN adoption of the same standard where its text differs |
| I-3 | The Colleague AI Certified standard itself | Colleague AI's own document, versioned |
| I-4 | Microsoft Copilot Studio and Power Platform **breaking** platform changes | Only where a shipped connect package stops functioning as documented |

"And its amending acts" without a date anchor was the defect in the previous
draft: it silently imported every future amendment, including ones with a
compliance burden nobody has seen. The anchor plus 5.4 replaces that with
prospective, notified additions.

### 5.2 Limiter two — a closed list of package characteristics

Even for an in-scope instrument, the obligation touches only these
characteristics **of the standard, unmodified agent package as shipped**:

- **C-1** its CAI tier classification and the basis recorded for it
- **C-2** its human-oversight design (where a named human must act, and the
  points at which the agent must stop)
- **C-3** the audit-trail fields it emits and their retention shape
- **C-4** the transparency disclosures it surfaces to end users
- **C-5** the documentation set shipped with it (dossier, control map, tier
  rationale)

Nothing else. Not model quality, accuracy, latency, cost, security patching,
compatibility with the Subscriber's other systems, or anything about the
Subscriber's own deployment, data or configuration.

### 5.3 Limiter three — a materiality trigger, not "any change"

A release is owed only where **all** of the following are true:

1. a change occurs in an instrument listed in 5.1, **and**
2. it takes legal effect (or, for I-3/I-4, is published) during the
   subscription term, **and**
3. in Colleague AI's reasonable, documented assessment the standard package as
   shipped would, because of that change, no longer meet the Colleague AI
   Certified standard in respect of a characteristic listed in 5.2.

Where a change is assessed as **not** triggering a release, Colleague AI
publishes that assessment against the certificate. That is the discipline that
keeps "reasonable assessment" from reading as "whenever we feel like it" — and
it is also the evidence a subscriber's auditor will ask for.

### 5.4 Limiter four — how the scope itself changes

The scope list may be extended **only prospectively**, by notice, effective at
the subscriber's next renewal. It is never extended retroactively inside a paid
term. If Colleague AI narrows the scope, the subscriber may terminate and take
a pro-rata refund of the unused term.

### 5.5 Delivery bound

The obligation is to **make an updated standard certified release available**,
within a stated window (proposed: 60 days of the trigger date under 5.3, or
before the change's own compliance deadline, whichever is later). It is not an
obligation to install it, migrate the subscriber, re-implement customisations,
retrain anyone, or support a version the subscriber declines to take.

If the subscriber does not adopt an available updated release within a stated
period, the certificate reflects the version actually in use — which is no
longer the current certified release.

### 5.6 Discontinuation

If Colleague AI withdraws a standard agent package, or elects not to produce an
updated release for one, the subscriber is notified, the subscription for that
package is cancelled, and the unused term is refunded pro rata. The perpetual
licence to the version already purchased is unaffected. **This case was missing
from the previous draft entirely**, and without it the obligation has no exit.

### 5.7 Express exclusions (must appear on the public page too)

Outside the covered scope, and never part of the update obligation:

- The subscriber's sector rules — DORA, MiFID II, HIPAA, PCI DSS, national
  implementations, supervisory guidance, and anything specific to their licence
- The subscriber's own configuration, prompts, data, connectors or environment
- Any modified version of the agent (see section 4, unmodified versions only)
- General product improvement, feature requests, performance and cost tuning
- Security patching of Microsoft's platform or of the subscriber's tenant
- Anything requiring facts about the subscriber's business that Colleague AI
  does not hold

### 5.8 Live items to resolve before the first sale

- **Article 50 is already in force** (2 Aug 2026), with a grace period to
  2 Dec 2026 for the Art. 50(2) machine-readable marking of synthetic content
  for systems placed on the market before 2 Aug 2026. If any shipped package
  produces synthetic content in scope of Art. 50, that is a trigger with a
  **date already on the calendar** — decide whether the first certified
  releases ship before it, or whether Art. 50(2) is expressly outside C-4.
- **Which agents, if any, are Annex III high-risk** when deployed as intended.
  The deferral to Dec 2027 buys time, it does not remove the question, and the
  answer changes what C-1 commits Colleague AI to.
- **The ISO/IEC 42001 control map** referenced in I-2 must exist as a
  versioned document before it can bound anything.

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

## 8. Questions for counsel — closed, answerable, in priority order

Not "please review this". These are the decisions only a lawyer can make, each
phrased so the answer is short.

**On the obligation itself**

1. Does the clause in section 4, read with the limiters in section 5, create a
   **contractual obligation to perform future development work**, and if so is
   it sufficiently certain to be enforceable under Czech law? If it is too
   uncertain, does that help us or hurt us?
2. Does "in Colleague AI's reasonable, documented assessment" (5.3) survive as
   a discretion, or will it be read against us as the drafter? Is publishing
   the assessment enough to make it defensible?
3. Is the 60-day delivery window (5.5) a firm deadline creating liability for
   delay, and should it carry an express **exclusive remedy** (pro-rata refund
   and termination, no damages)?
4. Should the whole obligation carry a **liability cap** tied to fees paid for
   the subscription — separate from the licence's own cap — and does Czech law
   permit that cap between businesses?

**On what we are saying about ourselves**

5. Is "Colleague AI Certified" safe as a **trade mark-style programme name**
   given it is not accreditation? Does the disclaimer in 5.7 and on /certified
   discharge the risk, or does the word itself need qualifying at every use?
6. Does describing our own programme as "certification" engage any Czech or EU
   rule on conformity-assessment terminology, accreditation (Regulation (EC)
   765/2008), or unfair commercial practices?
7. Does the public **certificate verification page** — which states a third
   party may rely on it — create a duty of care to that third party, and should
   it carry an express no-reliance notice?

**On the customer relationship**

8. B2B only, or could a sole trader subscribe? If the latter, which consumer
   rights attach (withdrawal, auto-renewal, price change notice), and does the
   subscription need a separate consumer flow?
9. Auto-renewal, price changes and termination: what notice does Czech law
   require, and does the current Terms text provide it?
10. On lapse we say the subscriber "must stop describing the agent as a current
    Colleague AI Certified Release". Is that enforceable, and what is the
    remedy if they do not?

**On the sale we have already published**

11. The site now states that for non-subscribers **a newer certified release is
    a new licence purchase**. Is that safe as published pricing, and does it
    need to appear in the Terms rather than only in marketing copy?
12. Prices are shown in USD by a Czech company now VAT-registered
    (DIČ CZ29540852). Do we need to state the VAT treatment on the page, and
    does the answer differ for a full plátce DPH versus an identifikovaná osoba?

## 9. What the obligation could cost — the exposure model

Counsel bounds the legal risk; this bounds the engineering one. The obligation
is per **standard package**, not per customer, which is the whole reason the
model works — but it is worth writing the arithmetic down before signing it.

```
annual cost  =  distinct standard packages needing a release
             ×  qualifying changes per year (section 5.3)
             ×  engineering cost per certified release
```

- **Distinct packages**: 36 today. A change to a shared characteristic (say the
  audit-trail fields, C-3) may hit all 36 at once; a tier-specific change hits
  a subset. The realistic unit is "one master change, applied across the
  catalogue", not 36 independent projects — but only if the packages genuinely
  share an implementation. **If they have drifted, this number is 36.**
- **Qualifying changes per year**: unknown, and the honest answer is that
  2026–2028 is unusually dense (Art. 50 live now, Annex III Dec 2027, Annex I
  Aug 2028) and later years may be quiet. Model the dense years, not the quiet
  ones.
- **Cost per release**: engineering, re-testing, re-issuing dossiers and
  control maps for every affected package, and re-cutting the certificate
  records.

Against that, revenue is `subscribers × monthly price × 12`. At $249/month an
L4 subscriber contributes $2,988 a year. **The break-even question is how many
subscribers it takes to fund one catalogue-wide certified release** — if the
answer is more subscribers than you expect to have during the dense
2026–2028 window, the price is wrong, or the scope must be narrower, or both.
That is a decision to take before the first sale, not after.
