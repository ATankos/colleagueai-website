# Local CI, security scanning and release control for the private repository

This applies once the repository is private on GitHub Free. While it is public, GitHub Actions runs everything as before; the workflow changes in this PR only take effect when `github.event.repository.private` is true.

## Why

GitHub Free gives a private repository:

- 2,000 Actions minutes a month;
- 500 MB of artifact storage;
- no rulesets or required reviews;
- no code scanning. CodeQL on a private repository needs paid GitHub Code Security.

Measured in November 2026:

- 5,672 Actions minutes.
- 4.25 GB of live artifacts.
- About 18.3 billable minutes per push or PR: e2e 9.5, Lighthouse 4.0, test 2.6, CodeQL 2.2.

The account's $0 budgets mean that going over a limit stops Actions rather than charging.

## What runs where

| Check | GitHub Actions (private) | Locally, before review |
|---|---|---|
| Lint, integrity, unit and node tests (CI `test` job) | Every PR and push to `main`, about 2.6 min | `node scripts/ci-local.mjs` |
| Build, static QA, Playwright e2e incl. axe accessibility (CI `e2e` job) | Manual dispatch only | `node scripts/ci-local.mjs` |
| Lighthouse thresholds | Manual dispatch only | `npm run lhci` |
| Dependencies, SAST and secrets (replaces CodeQL) | Not run | `node scripts/security-local.mjs` |

Artifacts are kept 3 days. On a private repository, they are uploaded only when a step failed. Superseded runs on the same ref are cancelled.

## Release evidence: `scripts/ci-local.mjs`

```bash
npm i --no-save js-yaml@4.1.0          # once
node scripts/ci-local.mjs --ref <commit> [--expect-tree <tree>]
```

The verdict is FAIL unless every rule below holds.

1. **Clean tree.** The source working tree has no modified, staged or untracked files.
2. **Exact commit.** The commit is checked out into a new, empty git worktree, so no local file can influence the result. The evidence records:
   - the commit SHA;
   - the tree hash;
   - the SHA-256 of `package-lock.json`, `package.json`, `ci.yml` and the runner itself.
3. **Dependencies.**
   - `npm ci` installs from the committed lockfile.
   - `npm ls --all` must confirm the installed tree.
   - The Node major version must equal the workflow's `node-version`. The Node, npm, OS and Playwright versions are recorded.
   - The Playwright browser for the installed Playwright version must be present.
4. **Nothing reported as passed that did not pass.**
   - Every mandatory step must run and exit 0.
   - A step that runs tests (node:test, Vitest, Playwright) must report a parsed summary with more than 0 tests and none skipped, todo, cancelled, flaky or not run.
   - Otherwise the step is reported as INCOMPLETE, UNVERIFIED, NO_TESTS or FLAKY, and it blocks.
   - Steps marked `continue-on-error` in the workflow are reported with their real status and do not block. Today that is only the go-live readiness check, which fails by design while commerce is disabled.
5. **Coverage gaps are listed and run.** Test files that no CI step runs appear in `testFilesNotRunByCi`. Unless `--ci-only` is given, they are run after the CI jobs, under the same rules, and they block. On 28 Nov 2026 there were 13 such files. CI does not gate them, so the release evidence does.
6. **Tree equivalence.** `--expect-tree` makes the verdict FAIL unless the commit's tree equals the reviewed candidate's tree. Use it to prove that the commit on `main` after merging is byte-for-byte the tree that was tested and reviewed.

Each step's full log is kept, and `SHA256SUMS` covers the logs and the evidence file.

## Security scanning: `scripts/security-local.mjs`

All three tools are free:

| Tool | Licence | Use |
|---|---|---|
| npm audit | — | Dependency vulnerabilities |
| Semgrep Community Edition 1.95.0 | LGPL-2.1 | SAST |
| semgrep-rules repository | Semgrep Rules License v1.0 | Rules for internal use |
| detect-secrets 1.5.0 | Apache-2.0 | Secret scanning |

```bash
pip install semgrep==1.95.0 detect-secrets==1.5.0 "setuptools<81"
git clone https://github.com/semgrep/semgrep-rules && export SEMGREP_RULES=$PWD/semgrep-rules
node scripts/security-local.mjs
```

The verdict is FAIL in any of these cases:

- **Missing scanner.** A scanner is not installed or produces no report.
- **Dependencies.** `npm audit` reports any high or critical vulnerability.
- **SAST findings.** An ERROR or WARNING finding is not listed in `security/semgrep-reviewed.json`. That file records:
  - each reviewed finding, matched by rule, file and code line;
  - the reason it is not a vulnerability.
- **Unparsed files.** A source file Semgrep cannot parse that is not reviewed there.
  - Semgrep 1.95 does not understand JSON import attributes, so files are scanned from a copy with only that clause removed.
  - Semgrep's default ignore skips `tests/`. Runtime code in `api/`, `lib/`, `src/` and `public/`, and the build scripts, are all scanned.
- **Secrets.** detect-secrets finds anything not in the audited `.secrets.baseline`, or anything there not audited as `is_secret: false`.

Positive controls, 28 Nov 2026:

- A planted `eval(req.query.x)` in a function: FAIL with 2 unreviewed findings.
- A planted AWS-style secret: FAIL with 3 new findings.

What this does **not** replace: CodeQL's interprocedural data-flow analysis. Semgrep CE analyses within single functions and files. This is a real reduction in assurance, accepted to stay at $0.

## Release control (replaces the rulesets): what it does and does not protect

GitHub Free cannot enforce any of the following on a private repository. They are **procedural controls**: they depend on people following them and are checked afterwards, not prevented by GitHub. A written procedure does **not** give the protection of enforced branch rules:

- nothing stops a direct push to `main`;
- nothing stops a merge without approval;
- nothing stops a force push or a branch deletion by someone with write access.

The one technical control in this procedure is Vercel's manual production promotion (step 5).

1. **Every change goes through a PR.** Nobody pushes to `main` directly.
2. **Evidence on the PR.** The author attaches:
   - `ci-local-<sha>.json` with verdict PASS;
   - `security-local-<sha>.json` with verdict PASS;
   - the Lighthouse result;
   - all for the PR's exact head SHA.

   A new commit means new evidence.
3. **Independent human approval.** A named human reviewer, who is not the author and not an AI model, submits an *Approve* review on that head SHA.
   - In a personal-account repository, a collaborator always has **write** access; read-only access does not exist there.
   - The reviewer therefore agrees in writing never to push, merge or delete branches.
   - The founder reviews the repository's collaborator list before each release.
4. **Merge** by the founder only, in the GitHub UI, after steps 2 and 3.
5. **Manual production promotion (technical control).**
   - Vercel's *Auto-assign Custom Production Domains* is switched off, so a merge to `main` builds a staged production deployment that serves no production domain.
   - Only Vercel team members can promote. The reviewer is not one.
   - The founder promotes only when all three hold:
     - the staged deployment's commit equals the merge commit;
     - that commit's tree equals the reviewed and tested tree (`--expect-tree`);
     - the evidence verdicts are PASS.
6. **After the fact.** The founder checks `main`'s history for commits that did not come through an approved PR. Any such commit is treated as an incident: not promoted, reviewed, reverted if needed.
7. **Release record.** The PR keeps:
   - the evidence files;
   - the approval;
   - the promoted deployment ID;
   - the time of promotion.
8. **Commercial switches stay as they are.** This procedure changes none of `CHECKOUT_ENABLED`, `COMMERCIAL_LAUNCH_ENABLED`, interest collection or Continuous Certification sales.
