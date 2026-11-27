# Review governance: why owner merges bypass review, and the minimum fix (read-only inspection, 26 Nov 2026)

**Status:**
- Inspection only. Nothing has been changed.
- Repository permissions and rulesets change only with the founders' written authorisation.
- This note closes nothing by itself. O-REVIEW-CONTROL and R1 stay open.

## 1. What is configured today

Repository `ATankos/colleagueai-website` is owned by a personal account. The owner is always its administrator.

| Ruleset | Target | Rules | Bypass actors |
|---|---|---|---|
| **Protect main** (id 16575526, since 19 May 2026) | default branch | no deletion; no force-push; pull request required (0 approvals; conversations resolved); required checks `test`, `e2e`, `Analyze JavaScript (javascript-typescript)`, `Lighthouse`, strict (branch up to date) | **none** |
| **Protect main - required review** (id 27653464, since 19 Nov 2026 16:08 UTC) | default branch | no deletion; no force-push; pull request with **1 approving review**, stale approvals dismissed on push, conversations resolved | **Repository role "Repository admin" (actor_id 5), bypass mode `pull_request`** |

Classic branch protection could not be read with the session's token (HTTP 403). The rules that apply to `main`, read through `GET /repos/…/rules/branches/main`, are exactly the two rulesets above.

## 2. How owner bypasses remain possible

1. **The review ruleset names the Repository admin role as a bypass actor, for pull requests.** The owner account is that admin. GitHub therefore offers "Merge without waiting for requirements to be met (bypass rules)" on every pull request. Each of the 59 merges listed in R1 used it.
2. **There is no second person who could approve.** GitHub never counts an author's own approval. Every pull request so far has been authored and merged from the owner's account (including those prepared in this session). So a required approval can only come from a second account with write access, and none is set up.
3. **The status-check ruleset has no bypass actors and was honoured.** Checks passed before each merge. The gap is review only.

**Confirmed bypasses** (merged into `main` after 19 Nov 2026 16:08 UTC, by ATankos, 0 approving reviews):
- #526–#571
- #573–#578
- #580–#584
- #587
- #588 (27 Nov 2026, 05:36 UTC)

That is 59 pull requests. #579 was merged into a feature branch and is not counted. The same list is in `release-gates-abc.md` R1.

## 3. The minimum change for genuinely independent review

The changes must be applied **in this order**. Removing the bypass first would leave nobody able to merge.

| Step | Change | Why it is needed | Who |
|---|---|---|---|
| 1 | Add one independent reviewer as a repository collaborator with **Write** (not Admin) permission. For example, the second founder's own GitHub account, or the contracted independent reviewer. | An approval must come from someone other than the author. Write is enough to approve; it cannot change rulesets. | founder (owner) |
| 2 | Ruleset 27653464: **remove the bypass actor** ("Repository admin", `pull_request`), leaving `bypass_actors: []`. | This removes the "merge without requirements" route for the owner. | founder (owner) |
| 3 | Ruleset 27653464: set `require_last_push_approval: true`. | The approval must cover the last push, so nobody can add commits after an approval and merge. Stale approvals are already dismissed; this closes the gap for a push by someone other than the approver. | founder (owner) |

**Not needed for the minimum:**
- CODEOWNERS (one reviewer pool);
- moving the repository to an organisation;
- more required approvals.

**Residual limitation:** in a personal repository the owner can still edit or disable a ruleset. That cannot be removed without moving the repository to an organisation with separated administrator roles, which is not proposed. The control is detective:
- any ruleset change appears in the repository's audit and settings history;
- the founders agree that every ruleset change is recorded in this file, with the date and the reason.

## 4. Exact commands (for the owner to run after written authorisation; not run here)

```bash
# 1. invite the reviewer with write permission (replace <login>)
gh api -X PUT repos/ATankos/colleagueai-website/collaborators/<login> -f permission=push

# 2 + 3. remove the admin bypass and require approval of the last push (rules otherwise unchanged)
gh api -X PUT repos/ATankos/colleagueai-website/rulesets/27653464 --input - <<'JSON'
{
  "name": "Protect main - required review",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
      "required_approving_review_count": 1,
      "dismiss_stale_reviews_on_push": true,
      "required_reviewers": [],
      "require_code_owner_review": false,
      "require_last_push_approval": true,
      "required_review_thread_resolution": true,
      "require_extra_approval_for_unattributed_changes": true,
      "allowed_merge_methods": ["merge", "squash", "rebase"] } }
  ]
}
JSON
```

## 5. How to verify after the change
1. `GET /repos/ATankos/colleagueai-website/rulesets/27653464` shows `"bypass_actors": []`, and `current_user_can_bypass` reads `never` for the owner.
2. On an open pull request, the merge button is disabled until the reviewer approves. There is no bypass option.
3. Record the date and the authorisation in `release-gates-abc.md` (R1 and O-REVIEW-CONTROL). O-REVIEW-CONTROL closes when the first pull request is merged with an independent approval.
