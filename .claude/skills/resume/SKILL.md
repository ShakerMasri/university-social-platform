---
name: resume
description: Start-of-session pickup. Rebuilds context from git and the latest handoff, then proposes the next step. Run as /resume [plan file or topic].
disable-model-invocation: true
argument-hint: [docs/plans/<file>.md or topic]
---

1. Run `git status`, `git branch --show-current` and `git log --oneline -8`. Treat uncommitted work as possibly the owner's; preserve it.
2. Find the plan: "$ARGUMENTS"; otherwise the most recently modified file in `docs/plans/`; otherwise the newest dated section at the top of `docs/project-brief.md`. From the plan, read the Goal, Acceptance criteria, the Sessions list and the newest Progress log entry. Do not read the whole brief.
3. Check the handoff against reality (branch, sha, changed files) and report any mismatch.
4. Reply with: where things stand (3–5 lines), the next step from the handoff, any owner decision blocking it, and the checks you plan to run. Then wait for the owner's go, unless they already said to continue.
