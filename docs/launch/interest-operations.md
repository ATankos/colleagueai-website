# Interest registrations: operations

These steps apply once Gate B is open. While `INTEREST_COLLECTION_ENABLED` is off, nothing is collected and nothing here is needed.

Every command:
- runs with the environment's KV credentials;
- is a dry run until you add `--apply`;
- prints ids, agents and states only, never an address or a company name.

## What is stored

| Item | Detail |
|---|---|
| Record key | `lead:interest:<id>`, kept 365 days (`lib/db.js` `saveLead`) |
| Data fields | e-mail, company; optional role, use case, industry, Microsoft environment, timeframe and requirements |
| Consent | `consent`: required, versioned, for direct follow-up about this agent only |
| Marketing | `marketing`: optional, unticked by default, versioned, kept separate from the consent |
| Notification | `notification`: `status`, `attempts`, `lastAttemptAt`, `acceptedAt`, `providerId`, `deliveredAt`, `lastError` |
| Sales qualification | `salesQualification`: only when a person records it |
| Duplicate check | `interest:seen:<hash>`: a salted hash of e-mail and agent, kept 30 days, with no plain address |
| Demand counters | `demand:<kind>:<agent>:<month>`: counts only. `demand:seen:<hash>` is a 24-hour unique-view key with no plain address or user agent |

Server logs carry the record id, the agent and the notification state only.

## Notification states

| Status | Meaning | Action |
|---|---|---|
| `accepted` | Resend accepted the message (HTTP 2xx, `providerId` recorded). This is **not** proof of delivery: no delivery webhook is configured, so `deliveredAt` stays empty | None. If the inbox has no message, check Resend's log for `providerId` |
| `failed` | Resend refused or was unreachable (`lastError` = `HTTP <code>` or an error class) | Retried automatically by `retry` after the back-off |
| `not-configured` | `RESEND_API_KEY` or `DEMO_NOTIFY_EMAIL` missing | Fix the configuration, then run `retry` |
| `gave-up` | 5 attempts failed | Read the record in KV and contact the customer manually |
| `pending` | Stored, no attempt yet | `retry` |

## Missed notifications

```
node scripts/interest-ops.mjs status            # counts by state and the ids that need attention
node scripts/interest-ops.mjs retry             # dry run: which ids are due
node scripts/interest-ops.mjs retry --apply     # send
```

Retries are safe to repeat:

- a per-registration lock prevents parallel sends;
- the Resend `Idempotency-Key` (`interest-notify/<id>`) prevents duplicate e-mails;
- an accepted registration is never sent again;
- back-off is 5, 10, 20 and 40 minutes, with at most 5 attempts.

Run `status` at least once a week while Gate B is open, and after any Resend incident.

## Sales qualification

Only a person who has spoken with the customer records this:

```
node scripts/interest-ops.mjs qualify --id <id> --stage qualified|pilot-agreed|purchase-intent|not-qualified --by "<name>" --apply
```

The demand report counts a lead as "commercially qualified" or "validated intent" only from these records. A corporate e-mail address and a near timeframe make a registration "high intent", never "qualified".

## Deletion and withdrawal of consent

When a customer asks for erasure or withdraws consent:

1. Run `node scripts/interest-ops.mjs delete --email <address>` and check `matched`.
2. Run the same command with `--apply`. It deletes every registration of that address, its index entries and its duplicate-check keys.
3. Reply to the customer within one month (GDPR Art. 12(3)). Record the date and the request reference in the privacy log. Do not record the address there.
4. The notification e-mail in the lead inbox is a copy. Delete it from the mailbox by hand.

Anonymous demand counters hold no personal data and are not affected.

## Demand report

```
node scripts/demand-report.mjs --months 6 --out demand.csv
```

The tiers are separate:

| Tier | Counts |
|---|---|
| `engagement` | Filtered, unique daily views (`botViews` shown apart) |
| `registrations` | Unique interest registrations |
| `highIntent` | Near timeframe, supported environment and a described use case |
| `qualified` | Registrations a person qualified |
| `validatedIntent` | Pilot agreed or purchase intent |

Weights and minimum signals are in `config/demand-scoring.json`. Agents below the minimum show "insufficient data" and are not ranked.

## Read-only reconciliation (closes the 26 Nov 14:03:40–14:16:02 UTC evidence gap)

Run once with the **production** KV credentials (`vercel env pull .env.prod --environment=production`, then `set -a; . ./.env.prod; set +a`).

What it does:
- It only reads, using `LRANGE`, `SCAN` and `GET`. It writes, deletes and sends nothing.
- It compares the index list `lead:index:interest` with the stored `lead:interest:*` records.
- It prints counts and record ids only, never an e-mail address or company.

Delete `.env.prod` afterwards.

```bash
node -e '
const B=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL, T=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const kv=async(...a)=>{const r=await fetch(B+"/"+a.map(encodeURIComponent).join("/"),{headers:{Authorization:"Bearer "+T}});if(!r.ok)throw new Error(r.status);return (await r.json()).result};
(async()=>{
 const idx=await kv("LRANGE","lead:index:interest","0","-1")||[];
 const keys=[];let c="0";do{const [n,k]=await kv("SCAN",c,"MATCH","lead:interest:*","COUNT","500");c=n;keys.push(...k)}while(c!=="0");
 const stored=keys.map(k=>k.slice("lead:interest:".length)), S=new Set(stored), I=new Set(idx);
 const lo=Date.parse("2026-11-26T14:03:40Z"), hi=Date.parse("2026-11-26T14:16:02Z");
 let inGap=0, st={}, ag={};
 for(const k of keys){const r=JSON.parse(await kv("GET",k)||"null");if(!r)continue;const t=Date.parse(r.receivedAt);if(t>=lo&&t<=hi)inGap++;
  const s=r.notification?.status||"none";st[s]=(st[s]||0)+1;ag[r.agentSlug||"?"]=(ag[r.agentSlug||"?"]||0)+1}
 console.log(JSON.stringify({indexEntries:idx.length,storedRecords:stored.length,
  indexWithoutRecord:idx.filter(i=>!S.has(i)),recordsNotIndexed:stored.filter(i=>!I.has(i)),
  receivedInGapWindow:inGap,notificationStatus:st,perAgent:ag},null,1))})().catch(e=>{console.error("failed",e.message);process.exit(1)})'
```

**Reading the result:**
- Zero everywhere means no registration was stored, and the gap is closed with "none".
- For any record: check `interest-ops status`, and decide under the privacy pack (keep pending Gate B, or delete). Do **not** contact the registrant before Gate B is approved.
- `indexWithoutRecord` lists ids whose record has expired or was deleted. This is harmless; trim the index only by a deliberate decision.
- `recordsNotIndexed` lists records that `listLeads` cannot see. Record each one and handle it the same way.
- Record the result (date, who ran it, the counts) in `release-gates-abc.md`, R8.
