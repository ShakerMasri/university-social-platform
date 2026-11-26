---
name: review-checkpoint
description: Independent pre-commit review of the current checkpoint by the read-only checkpoint-reviewer subagent. Run as /review-checkpoint [uncommitted | branch | plan file].
disable-model-invocation: true
argument-hint: [uncommitted | branch | docs/plans/<file>.md]
---

1. Scope from "$ARGUMENTS": default is all uncommitted changes, tracked and untracked; "branch" means `git diff main...HEAD` plus uncommitted changes. Identify the plan file (from the argument, or the most recently modified file in `docs/plans/`).
2. Delegate to the `checkpoint-reviewer` subagent. Give it the scope, the plan file path, a one-paragraph statement of what the change is supposed to do, and any extra checks the owner asked for (database or browser suites only if asked). Do not give it your own opinion of the code.
3. Show the owner the reviewer's report as returned: verdict, P1–P3 findings, checks, residual risks. Do not fix anything yet.
4. Ask which findings to fix. After fixes, the owner can run `/review-checkpoint` again for a re-review.
5. Record the review outcome (date, verdict, finding count, checks) in the plan file's Progress log. Do not commit.
