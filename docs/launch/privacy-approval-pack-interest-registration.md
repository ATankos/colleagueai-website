# Privacy approval pack: "Register your interest" (Gate B)

**For:** Marek Těšitel (co-founder), with counsel where marked.
**Prepared:** 26 Nov 2026.
**Decision needed:** approve, or approve with changes, the processing below and the privacy notice text. Then record the authorisation that opens Gate B.

**Current state:**
- Collection is **off** in production (`INTEREST_COLLECTION_ENABLED` unset). This was verified on production commit `0355c524`: `GET /api/interest?status` returns `{"enabled":false}`, a submission is refused with 503 `interest_collection_disabled`, and the page shows no form.
- Nothing is collected until the founder sets the variable after the steps in section 9.

## 1. What the feature does

A visitor viewing an agent that is not yet on sale ("Coming soon") can leave business contact details. ColleagueAI then follows up about that agent and measures demand per agent.

- No release date is promised.
- There is no automated decision-making and no profiling of individuals.

## 2. Data collected

| Field | Required | Purpose |
|---|---|---|
| Work e-mail | yes | Reply about the agent |
| Company | yes | Business context |
| Role | no | Qualify the enquiry |
| Agent | set by the page | Which product the interest concerns |
| Intended use, industry, Microsoft environment, timeframe, other requirements | no | Qualify the enquiry; prioritise development |
| Consent record (version `interest-2026-11-26`, time, scope "follow-up about this agent") | yes | Evidence of consent |
| Marketing opt-in (version `marketing-2026-11-26`, time) | no, unticked by default | Separate consent for product news |
| Notification state, sales qualification | system / staff | Operations (section 6) |

**Not asked for on the form:** name, phone number or postal address.

### Network information: not stored as an IP address, but still processed

The service does **not store a raw IP address** in its own database. It does, however, **process** network information. That information is personal data, so the privacy notice must say so.

| Processing | What is used | What is kept, and for how long |
|---|---|---|
| Delivering the request (hosting) | The visitor's IP address, request headers and user agent are received by Vercel's infrastructure for every request, as on any website | Vercel's function and request logs, kept for Vercel's log retention period (runtime logs are visible to us for 1 hour on the current plan; counsel to confirm Vercel's own retention from its DPA); Vercel acts as processor |
| Rate limiting a submission | The IP address is read in memory, combined with the date and hashed with a secret salt (HMAC-SHA-256) | Only the hash, as the counter key `rl:interest:<hash>`, which expires after 1 hour |
| Unique-view counting (demand measurement) | The IP address, user agent, agent and date are hashed with the salt | Only the hash, for 24 hours. The counter itself holds counts only |
| Duplicate check | Work e-mail and agent (no network data) are hashed with the salt | Only the hash, for 30 days |

**Points for the decision:**
- A salted hash is **pseudonymised**, not anonymous, data (GDPR recital 26). Whoever holds the salt and a candidate address could match it.
  - The salt is a production secret (`INTEREST_DEDUPE_SALT`). It must be set before Gate B, so that the code's built-in fallback value is never used.
  - The hash keys must not be described as "anonymous". The demand **counts** may be.
- Lawful basis for this processing: legitimate interest (Art. 6(1)(f)) in protecting the service against abuse and in operating it. This is separate from the consent for follow-up.
- Privacy notice: row (a2) now says that network information is processed for security and rate limiting and is kept only as short-lived salted hashes. The hosting and log row already names Vercel and its log period.

## 3. Lawful basis (decision for Marek, counsel to confirm)

**Implemented: consent, Art. 6(1)(a) GDPR, for follow-up about the agent.** It is withdrawable at any time.

An alternative is legitimate interest (Art. 6(1)(f)) for a business enquiry, as already used for the demo form. Consent was chosen because the form invites interest in a future product rather than answering a request. **Question for counsel:** keep consent, or move to 6(1)(f) to match the demo form? Either way, the notice must say which.

## 4. Marketing consent (kept separate)

- Product news is sent only with the separate, unticked opt-in.
- Required by Czech law no. 480/2004 Sb. (§ 7) and ePrivacy rules for e-mail marketing to people who are not customers.
- Every marketing message must include an unsubscribe link.
- **No marketing sending tool is set up today.** Opt-ins are only recorded. Using them needs a separate decision and a processor entry.

## 5. Retention and deletion

| Data | Retention |
|---|---|
| Registration record | 365 days, removed automatically by the store, or earlier on withdrawal or erasure |
| Duplicate-check key (salted hash of e-mail and agent) | 30 days |
| Rate-limit key (salted daily hash of the IP address) | 1 hour |
| Unique-view key (salted hash of IP address, user agent, agent and date; no plain IP address or user agent stored) | 24 hours |
| Hosting logs at Vercel (may contain the IP address) | Vercel's log retention period (see above) |
| Demand counters | Counts only (no personal data), 25 months |
| Copy of each registration in the lead inbox (notification e-mail) | **Needs a retention rule.** Proposed: delete after 12 months, or at erasure |

**Erasure and withdrawal:**
1. Dry run: `node scripts/interest-ops.mjs delete --email <address>`
2. Delete: run it again with `--apply`. This removes every record, index entry and duplicate key for that address.
3. Delete the inbox copy by hand.
4. Answer within one month (GDPR Art. 12(3)).

The full procedure is in `docs/launch/interest-operations.md`.

## 6. Notification operations

- **What is sent:** one e-mail per registration to the lead inbox (`DEMO_NOTIFY_EMAIL`, sent through Resend). The state is recorded on the registration.
- **Accepted is not delivered:** "accepted" means Resend accepted the message. No delivery webhook is configured.
- **Retries:** idempotent (lock plus provider idempotency key), with back-off, at most 5 attempts.
- **Logs:** ids and states only, never an address.
- **Weekly check:** `interest-ops status`, then `retry --apply` for anything due.

## 7. Processors and transfers

These are already listed in the privacy notice draft, section 4.

| Processor | Role | Location |
|---|---|---|
| Upstash | database | EU, Dublin |
| Resend | e-mail | EU, Ireland |
| Vercel | functions and logs | United States |

All three are US companies, which raises EU–US transfer questions under the Data Privacy Framework (notice section 5).

**Open, blocks Gate B:** DPAs on file for Upstash, Resend and Vercel. This is the same item as gate O-DPA-SECURITY.

## 8. Privacy notice text

The draft `docs/legal/proposed/privacy-2026-11-21-draft.md` has:
- row **(a2)**: the interest registration;
- the retention row "Interest registrations";
- row **(a3)**: optional marketing news (added with this pack).

These must be approved and published as a **new version** of the Privacy Policy. The accepted version is never edited in place, and the legal-archive process records the version and fingerprint.

## 9. Gate B activation steps (in order)

The binding sequence is in `docs/launch/release-gates-abc.md`, Gate B (parts A–C). In summary:

1. Marek approves sections 3–8, and counsel confirms the lawful basis (sections 2 and 3) and the marketing wording (section 4).
2. Publish the new Privacy Policy version through the existing legal-archive process.
3. File the DPAs for Upstash, Resend and Vercel (gate O-DPA-SECURITY).
4. Decide the inbox-copy retention rule (section 5) and note it in `interest-operations.md`.
5. Close R8 with the authorised read-only production reconciliation.
6. Check the production configuration without enabling collection:
   - `RESEND_API_KEY`, `DEMO_NOTIFY_EMAIL` and `DEMO_NOTIFY_FROM` are set;
   - `INTEREST_DEDUPE_SALT` is set to a new random value.
7. **Founder authorisation, documented first.** The founder records a written authorisation in the Gate B authorisation log (date, approver, reference, the person who will set the variable). Nothing is enabled before this entry exists.
8. The named person sets `INTEREST_COLLECTION_ENABLED=true` in Vercel **Production** and redeploys.
9. **Production verification evidence**, recorded in the same log:
   - deployment and commit;
   - the status check returns `{"enabled":true}`;
   - one test submission is accepted, appears in `interest-ops status`, and its notification is `accepted` and received;
   - the test record is deleted with `interest-ops delete --apply`;
   - checkout is still disabled, and the agents are still "Coming soon".
10. If verification fails, roll back immediately and record it.

**To roll back:** remove the variable and redeploy. Stored records stay until their retention ends or until erasure.

## 10. Approval record (to complete)

| Item | Decision | By | Date | Reference |
|---|---|---|---|---|
| Lawful basis (section 3) | | | | |
| Marketing consent wording (section 4) | | | | |
| Retention incl. inbox copies (section 5) | | | | |
| Privacy notice version published (section 8) | | | | |
| DPAs filed (section 7) | | | | |
| Network-information processing and its wording (section 2) | | | | |
| R8 reconciliation completed (section 9, step 5) | | | | |
| Founder authorisation to enable Gate B (section 9, step 7) | | | | |
| Production verification evidence recorded (section 9, step 9) | | | | |
