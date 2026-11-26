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

**Not collected:** name, phone number, address or IP address. Rate limiting uses a salted daily hash, not the address.

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
| Unique-view key (salted hash, no plain IP or user agent) | 24 hours |
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

1. Marek approves sections 3–8, and counsel confirms the lawful basis (section 3) and the marketing wording (section 4).
2. Publish the new Privacy Policy version through the existing legal-archive process.
3. File the DPAs for Upstash, Resend and Vercel (gate O-DPA-SECURITY).
4. Decide the inbox-copy retention rule (section 5) and note it in `interest-operations.md`.
5. Production configuration check: `RESEND_API_KEY`, `DEMO_NOTIFY_EMAIL` and `DEMO_NOTIFY_FROM` are set, and `INTEREST_DEDUPE_SALT` is set to a new random value.
6. Set `INTEREST_COLLECTION_ENABLED=true` in Vercel **Production** and redeploy.
7. Run one end-to-end test with a test address:
   - submit the form;
   - check the record in `interest-ops status`;
   - check that the notification is `accepted` and appears in the inbox;
   - delete the test record with `interest-ops delete --apply`.
8. Record the authorisation: date, approver, reference, and who set the variable (`docs/launch/release-gates-abc.md`, Gate B).

**To roll back:** remove the variable and redeploy. Stored records stay until their retention ends or until erasure.

## 10. Approval record (to complete)

| Item | Decision | By | Date | Reference |
|---|---|---|---|---|
| Lawful basis (section 3) | | | | |
| Marketing consent wording (section 4) | | | | |
| Retention incl. inbox copies (section 5) | | | | |
| Privacy notice version published (section 8) | | | | |
| DPAs filed (section 7) | | | | |
| Gate B opened (section 9, step 6) | | | | |
