# Continuous Certification: data separation and retention (PROPOSAL for counsel)

Status: **proposal, not approved, not published.** Prepared 27 Nov 2026 (Round 3) by the engineering assistant, which is not a lawyer.
Founder decision implemented in code: *separate minimized certification evidence from personal operational records; propose retention periods for counsel approval.*
Every period below is a proposal with the reasoning behind it. Counsel decides, and nothing is deleted automatically until counsel has approved a period and the owner has approved a deletion job.

## 1. What is now separated (implemented, tested)

| Store key | Kind | Personal data | Enforced by |
|---|---|---|---|
| `certification-evidence:<certificateId>` (append-only) | **Minimized evidence**: issuance, release adoption, payment hold/release, decisions | **None directly.** Decision-makers are opaque register ids (`{role, id}`); references must be case identifiers (`CAI-REG-12`, `INC-2026-004`); no email, name or free text | `minimizedEvidence()` allow-list in `lib/db.js`; `REFERENCE_FORMAT` in `lib/certificateState.js`; tests M1, M2 in `tests/certification-dispute.test.mjs` |
| `certification:<certificateId>` | **Personal operational record** | holder email, operational history (bounded), payment status | separate key; never published (`publicCertificate` allow-list) |
| `cert:holder:<hash>` | lookup index | pseudonymous (unkeyed SHA-256 of email + product; see §4) | — |
| `cert:pending:<subscriptionId>` | operational queue | holder email while an issuance is retried | deleted when issued or when the subscription is found ended |
| `cert:ended:`, `cert:term:`, `cert:hold:<subscriptionId>` | payment-state guards | pseudonymous (Stripe ids only) | must outlive late Stripe events (an expiry would let a delayed event revive an ended certificate) |
| `cert:evidence-repair` | operational queue | none (certificate ids) | emptied by the reconciliation |
| `config/certificate-deciders.json` | decider register | **names the persons behind the ids** (once filled) | kept in the repository; the evidence only holds the ids |

The register (who `p-fc` is) is the only place that turns an evidence entry into a person. Keeping it separate means the evidence can be kept long for audit while the link to a person can be removed sooner.

## 2. Proposed retention periods (for counsel)

| Record | Purpose | Proposed period | Reasoning to confirm |
|---|---|---|---|
| Minimized evidence | prove what was certified, when and by which role, to auditors and in disputes | **term of the certificate + 10 years** | Long-tail claims about a certification statement; to align with the 10-year objective limitation period of the Czech Civil Code and the 10-year accounting/VAT record periods already used for orders. Counsel to confirm whether a shorter period suffices for evidence that holds no direct personal data. |
| Personal certificate record (`certification:`) | deliver and verify the certification, holder lookup | **while the subscription runs + 3 years**, then remove the email and history (keep the pseudonymous record so the Certificate ID still verifies as "not current") | 3-year general limitation period for contractual claims; the public verification page needs no personal data. |
| Pending issuance (`cert:pending:`) | finish a paid issuance | **until issued or ended; alert after 7 days; hard limit 90 days** then escalate to the owner, never silently dropped | Purely operational; the daily reconciliation alerts while any entry exists. |
| Payment-state guards (`cert:ended/term/hold:`) | stop late or out-of-order events reviving an ended certificate | **same as the personal certificate record; 18 months where no certificate was ever issued** | Stripe retries events for up to 3 days, but disputes can be opened about 120 days after payment and stay open for months. |
| Decider register entries | link evidence ids to people | **as long as the evidence that names the id** | Without the link the evidence cannot show who decided; counsel to confirm the basis (legitimate interest in accountable certification decisions, Art. 6(1)(f)). |
| Commission ledger (`commission:`) | partner payouts | **10 years** (accounting records) | Same basis as invoices. |

## 3. Proposed addition to the privacy notice (draft text, not published)

> **(i) Continuous Certification.** If you subscribe to Continuous Certification we keep a certificate record (the purchasing contact's e-mail, the product and release, the subscription status and its history) to deliver the certification and to show its status on the public verification page, which never shows personal data. We keep it while the subscription runs and for 3 years after it ends, then remove the e-mail and keep only the certificate's status. Separately, we keep a permanent evidence log of what was certified and which certification decisions were taken; it contains no e-mail address or name. Legal basis: performing the contract (Art. 6(1)(b)) and our legitimate interest in being able to prove our certification statements (Art. 6(1)(f)).

Translations into the seven other languages are needed before publication, and native review as for the rest of the notice.

## 4. Open technical point for the owner

`cert:holder:<hash>` is an **unkeyed** SHA-256 of `email:product`. Like the interest marker fixed in CAI-AUD-002, it can be recomputed by anyone who guesses the email. It reveals only "this email holds a certificate for this product" and is not published, so the risk is low, but a keyed HMAC (with an environment secret) would be consistent with the rest. Changing it needs a one-time migration of existing keys; not done in this round.

## 5. What counsel is asked to decide

1. The five periods in §2 (or replacements).
2. Whether the draft privacy text in §3 is adequate and where it goes.
3. The legal basis for keeping the decider register as long as the evidence.
4. Whether a deletion job (owner-approved) should implement §2, and its schedule.
