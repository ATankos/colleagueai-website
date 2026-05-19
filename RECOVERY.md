# Colleague AI — Site Recovery & Continuity Doc

**Purpose:** if Alexandr is unavailable (vacation, illness, worse), this doc tells the co-founder how to access, recover, or hand off every account, credential, and dependency keeping `colleagueai.ai` online.

**Audience:** the second founder. Read this in full before you actually need to use it.

**Last updated:** 2026-05-18
**Maintained by:** Alexandr Tankos <alexandr.tankos@gmail.com>

> ⚠️ **This document references WHERE credentials are stored, never the credentials themselves.** Passwords belong in a password manager. If you find an actual password pasted in here, remove it and rotate the secret.

---

## 0. Recovery checklist (read this first if something is broken)

If the site is down or you need to take over operations:

1. **Is the site actually down?** Check https://status.betterstack.com for monitor history, OR run `curl -I https://colleagueai.ai` from any machine.
2. **Most recent deploy?** Vercel dashboard → project → Deployments. The top entry is live production.
3. **Need to rollback?** Vercel → Deployments → click the previous "Ready" deploy → "Promote to Production". 30 seconds, no code change needed. (See `Task 7 procedure` below.)
4. **Need to push a code fix?** Local edits → `git push` → Vercel auto-deploys in ~60s.
5. **Domain issue?** DNS is at Porkbun. See `Section 3` below.
6. **Locked out of an account?** See `Section 8 — account recovery` below.

---

## 1. People

| Role | Name | Email | Phone | Time zone |
|---|---|---|---|---|
| Founder, technical | Alexandr Tankos | alexandr.tankos@gmail.com | TODO: add phone | Europe/Prague |
| Co-founder | Marek Tesitel | marek.tesitel@seznam.cz | +420 605 591 483 | Europe/Prague |

---

## 2. Domain & DNS

| Item | Value |
|---|---|
| **Domain** | `colleagueai.ai` |
| **Registrar** | Porkbun (https://porkbun.com) |
| **Registrar account** | alexandr.tankos@gmail.com |
| **Registrar 2FA** | TODO: enable Porkbun 2FA, record code location |
| **DNS hosted at** | Porkbun (same as registrar — no separate DNS provider) |
| **Auto-renew** | TODO: verify at https://porkbun.com/account/domains |
| **Expiration date** | TODO: from porkbun dashboard |
| **WHOIS privacy** | Porkbun default (enabled — registrant info hidden from public WHOIS) |
| **Marek's access** | None today. Porkbun doesn't support team accounts. Workaround: when shared password manager is set up, add the Porkbun login there so Marek can recover the domain if Alexandr is unreachable. |

### DNS records currently active (as of 2026-05-18)

These are the records Porkbun is publishing for `colleagueai.ai`:

| Type | Host | Answer / Value | TTL | Purpose |
|---|---|---|---|---|
| A | `colleagueai.ai` | `216.198.79.1` | 600 | Points root domain at Vercel |
| CNAME | `www.colleagueai.ai` | `b04174098eae0e2a.vercel-dns-017.com.` | 600 | Points www at Vercel (specific instance) |

**Verify with:** https://dnschecker.org/#A/colleagueai.ai and https://dnschecker.org/#CNAME/www.colleagueai.ai

If Vercel changes the recommended values, update both Porkbun and this doc.

---

## 3. Hosting (Vercel)

| Item | Value |
|---|---|
| **Provider** | Vercel (https://vercel.com) |
| **Plan** | Hobby (free) |
| **Project name** | `colleagueai-website` |
| **Project URL** | TODO: confirm team slug at https://vercel.com/dashboard then update full URL |
| **Production URL** | https://colleagueai.ai |
| **Fallback URL** | https://colleagueai-website.vercel.app (works even if custom domain breaks) |
| **Account owner email** | alexandr.tankos@gmail.com |
| **Login method** | GitHub OAuth (sign in to Vercel via the GitHub button) |
| **2FA** | Inherited from GitHub 2FA — see Section 4 |
| **Billing** | None (free Hobby plan). If usage scales beyond free limits, no card on file yet. |

### Shared access workaround (Hobby plan limitation)

Vercel's free Hobby plan does **not** support multiple team members. Workaround until we upgrade to Pro:

- **For routine deploys**: Marek doesn't need Vercel access. Pushing to `main` on GitHub auto-deploys via the integration. Marek already has GitHub write access (see Section 4).
- **For emergency operations** (rollback, env vars, domain config): only Alexandr can log in to Vercel today. To enable Marek to operate Vercel solo (e.g., if Alexandr is unreachable):
  1. Alexandr shares the GitHub login (used as Vercel OAuth) via shared password manager — TODO once one is set up
  2. OR upgrade to Vercel Pro ($20/mo per user) and invite Marek as a team member: https://vercel.com/teams/create
- **Recommended trigger to upgrade to Pro**: first paying enterprise customer, OR when audit trail of "who deployed what" becomes legally relevant.

### Environment variables (set in Vercel dashboard → project → Settings → Environment Variables)

| Key | Used for | Where the value comes from |
|---|---|---|
| `VITE_SENTRY_DSN` | Sentry error tracking | Sentry → project Settings → Client Keys (DSN) |

To recover env vars: log in to Vercel → project → Settings → Environment Variables. Values are masked but can be edited / re-pasted from source.

---

## 4. Source code (GitHub)

| Item | Value |
|---|---|
| **Repository** | https://github.com/ATankos/colleagueai-website |
| **Visibility** | Private |
| **Default branch** | `main` |
| **Account owner** | ATankos (`alexandr.tankos@gmail.com`) |
| **2FA** | Enabled (authenticator app), 2026-05-18 |
| **Recovery codes location** | TODO: confirm where the 16 recovery codes are saved (screenshot, printed, password manager, etc.) |
| **Collaborators** | Alexandr (owner); Marek Tesitel invited 2026-05-18 with Write role |
| **Branch protection** | `main` branch is protected by ruleset "Protect main" (Active). Direct pushes blocked; requires PR + passing Lighthouse CI check before merge. |
| **Deploy keys / actions secrets** | None today. (Added in Task 9 — update this row after.) |

### Local clone

```powershell
git clone https://github.com/ATankos/colleagueai-website.git
cd colleagueai-website
npm install
npm run dev
```

Project lives at `C:\Users\alexa\OneDrive\Documents\Claude\Projects\colleagueai-website` on Alexandr's Windows machine.

---

## 5. Third-party services in use

| Service | Purpose | Plan | Login | URL |
|---|---|---|---|---|
| **Sentry** | Error tracking + session replay | Free (Developer) | alexandr.tankos@gmail.com | https://sentry.io |
| **Better Stack** | Uptime monitoring | Free | alexandr.tankos@gmail.com | https://betterstack.com |
| **Vercel Analytics + Speed Insights** | Real-user metrics | Free (Hobby plan) | Same as Vercel account | https://vercel.com |
| **GitHub Dependabot** | Dependency security PRs | Free (built into GitHub) | Same as GitHub account | https://github.com/ATankos/colleagueai-website/security |
| **Google Fonts** | Web font hosting (Fraunces, Geist, JetBrains Mono) | Free, no account | — | — |
| **dnschecker.org** | DNS propagation checks | Free, no account | — | — |
| **securityheaders.com** | Header grading | Free, no account | — | — |

---

## 6. Where passwords live

> ⚠️ **CURRENT RISK:** Account passwords are stored in Chrome's browser-saved password manager on Alexandr's Windows laptop. If that laptop is lost, stolen, or hardware-fails, recovery requires resetting each account via email — IF you also have access to alexandr.tankos@gmail.com.

**Action item (open):** migrate to a dedicated password manager with a shared vault. Recommended: **Bitwarden** (free tier supports family sharing) or **1Password Teams**. When done, update this section with the vault location.

### Master accounts (resetting these recovers most others)

| Master account | Login email | 2FA method | Recovery method |
|---|---|---|---|
| Google (`alexandr.tankos@gmail.com`) | self | TODO: confirm 2FA enabled | TODO: phone number on file + backup codes location |
| GitHub (ATankos) | alexandr.tankos@gmail.com | Enabled (authenticator app), 2026-05-18 | TODO: confirm where recovery codes saved |

Most other services (Vercel, Sentry, Better Stack) were created via "Sign in with GitHub" — so GitHub access transitively recovers them all.

---

## 7. Hardware

| Item | Owner | Location |
|---|---|---|
| Primary dev laptop | Alexandr | Windows 11, with OneDrive sync of project folder |
| Backup of project code | Auto | Pushed to GitHub on every commit. GitHub is the source of truth. |

If the laptop is destroyed: clone the GitHub repo on any machine, run `npm install`, run `npm run dev`. Nothing critical lives only on the laptop. Env vars are in Vercel.

---

## 8. Account recovery procedures

### If locked out of Google (`alexandr.tankos@gmail.com`)
- Recovery: https://accounts.google.com/signin/recovery
- You'll need: phone number on file OR recovery email OR backup codes.
- Documented backup codes: TODO

### If locked out of GitHub
- Recovery: https://github.com/password_reset
- You'll need: email access OR 2FA backup codes.
- Documented backup codes: TODO (Section 4)

### If locked out of Vercel
- Easy: sign in with GitHub button — auth flows through GitHub.
- If GitHub OAuth also broken: https://vercel.com/help → contact support, prove ownership via DNS TXT record or domain ownership.

### If locked out of Porkbun
- Recovery: https://porkbun.com/forgot-password
- You'll need: email access on the registrar account.
- If 2FA is enabled and the device is lost: contact Porkbun support with proof of identity. Have your customer ID ready (find on past invoices in inbox).

---

## 9. Routine maintenance (what someone needs to do weekly/monthly)

- **Weekly (Monday morning)**: review and merge Dependabot PRs at https://github.com/ATankos/colleagueai-website/pulls
- **Monthly**: check Better Stack incident log for downtime patterns; check Sentry for new error spikes
- **Quarterly**: re-run `npm run check:full` locally to confirm test suite still passes; re-scan securityheaders.com
- **Annually**: confirm Porkbun domain auto-renewal succeeded (or pay manually); review what services are still in use vs. abandoned

---

## 10. Emergency contacts

| Situation | Contact |
|---|---|
| Site fully down | Better Stack already alerts via email. Manual escalation: Vercel status page https://www.vercel-status.com/ |
| Suspected security incident | Sentry dashboard for stack trace + GitHub Security tab for vulnerability alerts |
| Domain expired / hijacked | Porkbun support: https://kb.porkbun.com/article/47-contact-us |
| Vercel account compromised | Vercel support via https://vercel.com/help — request immediate token revocation |
| Need legal help | None retained yet — TODO when raising / signing first enterprise contract |

---

## Document review log

| Date | Reviewer | Notes |
|---|---|---|
| 2026-05-18 | Alexandr | Initial version. People + service emails filled in. GitHub 2FA enabled. Open TODOs: confirm GitHub recovery codes location, enable Porkbun 2FA, enable Google 2FA + save recovery codes, confirm Porkbun auto-renew + expiry, invite Marek as repo collaborator. |
