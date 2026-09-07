# Partner programme — three clauses, DRAFT FOR COUNSEL

Companion to `continuous-certification.md`. Same purpose: put the commitment in
writing before it is sold, and give counsel closed questions rather than "please
review this".

Nothing here is live. `/partners` already states these things as programme
terms; the Partner Program Agreement does not, and that is the gap this closes.

---

## 1. What the programme actually is

The commercial position, because the drafting follows from it and not the other
way round.

The catalogue mean is **$9,789** (36 agents: 17 x $7,900, 13 x $9,900, 6 x
$14,900). `config/pricing.json` sets `partnerCommissionRate: 0.10`, so a
referral pays **$979**.

That is a fee for an introduction. It is not a budget for a salesperson, and no
rate we could offer would make it one: at 20% a partner earns $1,958 a deal and
must close **77 deals a year** to cover one $150k seller. Even the whole
commission pool at our own 100-agent floor — 100 x $9,789 x 20% = **$195,778**
across every partner we ever sign — funds 1.3 sellers.

So the programme buys introductions, and the partner's own revenue comes from
implementing for its own client. The agreement has to say both of those things
plainly, because a document that implies a funded sales team is a document we
will be held to.

---

## 2. The three clauses

Each extends an existing section rather than adding one, so the agreement keeps
its shape. English is the master; the seven locale pages are regenerated from it
at build time.

### 2.1 Into section 1, Partnership — the partner's own services

> Implementation, integration and support a partner performs for its own client
> are the partner's own services: the partner contracts and invoices them,
> Colleague AI takes no share of them and is not a party to them.

**What it does.** Names the money the partner can actually make, and in the same
breath puts that work outside our contractual perimeter. "Is not a party to
them" is the operative half — without it, a customer whose implementation went
badly has an argument that the work was ours because our programme sent the
partner.

**Status.** Live on `/partners` since PR #385, in eight languages. The agreement
is silent.

**One wording note.** The public page says "ColleagueAI"; the agreement says
"Colleague AI", which is how the entity is named in its own header
(Colleague AI s.r.o., ICO 29540852, DIC CZ29540852). The clause above follows
the agreement. If counsel wants the two aligned, the public page is the one to
change, not the contract.

### 2.2 Into section 3, Attribution & commission — when commission is earned, and when it is taken back

> Commission becomes payable once the customer's payment has been received and
> is no longer reversible, and is paid monthly. If a sale is refunded, charged
> back or successfully disputed, the commission for that sale is reversed and
> set off against commission otherwise due.

**What it does.** Ties payment to cleared cash rather than to signature or
invoice, and makes the reversal contractual rather than discretionary.

**Status.** `api/webhook.js` already reverses commission on `charge.refunded`
and on disputes — the code has done this longer than any document has said so.
That asymmetry is the risk: we are performing a set-off the partner never
agreed to in writing.

**Interaction with the refund policy.** `/refund` makes a delivered B2B package
non-refundable, so the realistic reversal triggers are chargebacks, disputes,
the exceptional 14-day consumer withdrawal, and the two Continuous Certification
exits added in PR #380 — scope narrowing and package discontinuation, both of
which give a pro-rata refund of the unused term.

### 2.3 Into section 4, Brand use — no authority to bind, and a bounded claim surface

> A partner has no authority to bind Colleague AI, to agree prices, discounts,
> service levels or contract terms on its behalf, or to describe an agent
> package beyond its published factsheet and the stated scope limits of
> Continuous Certification.

**This one is an addition beyond the three protections that were asked for.** It
is one sentence and it can be deleted, but it is the clause that carries the
most exposure per word.

**What it does.** Two things. First, it removes apparent authority: without it, a
partner who promises a discount or an SLA in a sales meeting may have created an
obligation we then have to honour or litigate. Second, it makes the factsheet the
contractual limit of what may be claimed — which matters because the entire
Continuous Certification vocabulary contract exists to stop *us* overclaiming,
and a partner is not bound by CI.

**Note on the vocabulary contract.** The blocked terms in
`continuous-certification.md` section 3 bind our own copy through
`tests/journey.test.mjs`. Nothing binds a partner's deck. This clause is the
only mechanism that would.

---

## 3. What is deliberately not here

Each of these was considered and left out because it costs administration we do
not have, and because a term nobody polices is worse than no term.

- **Deal registration and territory protection.** Needs someone to run a
  register and adjudicate collisions.
- **Quotas, tiers, accelerators.** These imply a funded sales team; see section 1.
- **Exclusivity of any kind.**
- **A partner tier named "Certified" or "Accredited".** "Certified" is our own
  programme name (`Colleague AI Certified Release`) and "accredited" is a
  blocked term in all eight languages. Either would break CI and, worse, blur
  scope limits that took a week to bound.
- **Commission on Continuous Certification renewals.** CC is the recurring base.
  A bounded term with churn clawback is survivable; perpetuity is selling the
  annuity to fund the acquisition. Not proposed now because nothing in the
  current programme pays on it, and adding it is a commercial decision, not a
  drafting one.

---

## 4. Questions for counsel

Closed and answerable, in priority order.

**On the set-off**

1. Is a contractual set-off of already-paid commission against future commission
   enforceable between businesses under Czech law, or does it need an express
   repayment obligation as well for the case where no future commission exists?
2. Chargebacks can arrive months after payout. Does "received and is no longer
   reversible" need a defined period to be certain enough, and if so is a stated
   number (say 180 days) better for us than the open formulation?
3. We have been reversing commission in code without a written basis. Does that
   create exposure for reversals already performed, and does the new clause need
   to be expressed as confirming existing practice rather than introducing it?

**On the partner's own services**

4. Does "is not a party to them" do the work we want against an end customer who
   sues us over a partner's implementation, or do we also need an express
   disclaimer plus an indemnity from the partner?
5. Should the partner be required to carry professional liability insurance for
   that work, and is that proportionate at this deal size?

**On authority and claims**

6. Is the no-authority sentence sufficient against **apparent** authority created
   by our own materials — we call them "partners" on a public page and issue
   partner codes — or does something have to appear on the customer-facing side
   too?
7. Is binding a partner's claims to "the published factsheet" workable given the
   factsheet is a web page we change? Does it need to be a versioned artefact
   referenced by version, as `continuous-certification.md` section 6 proposes
   for the product spec?

**On the document itself**

8. Section 3 currently says "Rates and terms are in your partner order". No
   partner order document exists. Is the agreement enforceable as it stands, and
   should the rate simply move into the agreement, given there is one rate?
9. The agreement has no governing law, no liability cap, no termination notice
   period and no data-protection terms, while partners will by definition be
   handling customer contact data. Is that a separate piece of work, and is it
   blocking the first signature?

---

## 5. What happens after sign-off

The English text above goes into `public/partner-agreement.html`, three
paragraphs appended to sections 1, 3 and 4. The seven locale pages are
regenerated from that master by `scripts/generate-global-language-pages.cjs`, so
the translations go into `scripts/i18n/reviewed-copy.json` and the restorer
applies them last to every locale page.

**Translations are deliberately not written yet.** Translating contract text
counsel is going to rewrite is waste; they follow the sign-off, not precede it.

The "Last updated" date on the page must move in the same change, in all eight
languages, or the document says it has not changed when it has.
