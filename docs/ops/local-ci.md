# Local CI and release control for the private repository

This applies once the repository is private on GitHub Free. While it is public, GitHub Actions runs everything as before.

## Why

GitHub Free gives a private repository 2,000 Actions minutes and 500 MB of artifact storage a month.

- November 2026 used 5,672 minutes and 4.25 GB of artifacts.
- Measured per push or PR, the jobs cost about 18 billable minutes: e2e about 9.5, Lighthouse 4, test 2.6 and CodeQL 2.2.
- The account's $0 budgets mean that going over the limit stops Actions rather than charging.
- Private repositories on Free have no rulesets or required reviews.
- Code scanning on a private repository needs paid Code Security, which is not authorized.

## What runs where

| Check | GitHub Actions (private) | Locally, before review |
|---|---|---|
| Lint, integrity, unit and node tests (CI `test` job) | Every PR and push to `main` (about 2.6 min) | `node scripts/ci-local.mjs test` |
| Build, static QA, Playwright e2e incl. axe accessibility (CI `e2e` job) | Manual dispatch only | `node scripts/ci-local.mjs e2e` |
| Lighthouse thresholds | Manual dispatch only | `npm run lhci` |
| Dependency vulnerabilities | Not run | `npm audit` (must report 0 high or critical) |
| Secrets in history | Not run | Pattern scan of `git rev-list --all` (see the release record) |
| CodeQL | Not available | Semgrep or ESLint security rules locally, if adopted |

Artifacts are kept 3 days. On a private repository they are uploaded only when a step failed.

## Running it

```bash
npm ci
npx playwright install --with-deps chromium   # once
npm i --no-save js-yaml@4.1.0                 # once, for the runner
node scripts/ci-local.mjs                     # test + e2e; writes tests/results/ci-local-<sha>.json
npm run lhci
npm audit
```

The runner executes every `run:` step of `.github/workflows/ci.yml`, in order. It writes one JSON evidence file for the exact commit. A step marked `continue-on-error` in the workflow is reported but does not block. Today the only such step is the go-live readiness check, which fails by design while commerce is disabled.

## Release control (replaces the rulesets)

1. **Every change goes through a PR.** Nobody pushes to `main` directly. This rule cannot be enforced on Free; it is recorded, and checked in step 5.
2. **Evidence on the PR.** The author attaches the local evidence file for the PR's head SHA:
   - `ci-local-<sha>.json`, with 0 blocking failures;
   - the Lighthouse result;
   - the `npm audit` summary.
   A new commit means new evidence.
3. **Independent human approval.** A named reviewer, who is not the author and not an AI model, submits an *Approve* review on that head SHA.
   - In a personal-account repository, a collaborator always has write access.
   - The reviewer is therefore asked never to push or merge. Merging is the founder's.
4. **Merge** by the founder, in the GitHub UI, only after steps 2 and 3.
5. **Manual production promotion.**
   - Vercel's automatic assignment of the production domain is switched off. Each merge to `main` then builds a staged production deployment, which serves nothing until promoted.
   - The founder checks that the staged deployment's SHA equals the approved merge commit, then promotes it.
   - Only Vercel team members can promote, and the reviewer is not one.
6. **Release record.** The PR keeps:
   - the evidence;
   - the approval;
   - the promoted deployment ID;
   - the time of promotion.
7. **Commercial switches stay as they are.** This procedure does not change `CHECKOUT_ENABLED`, `COMMERCIAL_LAUNCH_ENABLED`, interest collection or Continuous Certification sales.

If a reviewer's approval is missing, or the evidence's SHA differs from the merged SHA, the staged deployment is not promoted.
