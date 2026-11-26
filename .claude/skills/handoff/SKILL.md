---
name: handoff
description: End-of-session handoff. Records what this session did, the checks actually run, decisions and the next step in the plan file so a fresh session can continue. Run as /handoff [plan file].
disable-model-invocation: true
argument-hint: [docs/plans/<file>.md]
---

1. Identify the plan file: "$ARGUMENTS", or the one used in this session. If the work had no plan file, skip to step 4.
2. Collect facts instead of recalling them: `git status`, `git diff --stat`, current branch and short HEAD sha. List only checks you actually ran in this session, with their exact results; everything else is "not run".
3. Add a dated entry at the top of the plan file's "Progress log", update its `Status:` line, and mark finished sessions:

   ```markdown
   ### <YYYY-MM-DD> — Session <N> — <short title>
   - **State:** done / partial / blocked · branch `<branch>` at `<sha>` · uncommitted: <files or none>
   - **Done:** what changed and why, with file paths
   - **Decisions:** owner decisions made this session, briefly quoted
   - **Checks:** `command` -> result (one per line); not run: ...
   - **Open issues / risks:**
   - **Next step:** the single smallest next step, precise enough for a fresh session
   ```

4. If this session reached a checkpoint (a planned session finished, an owner decision, a review result, a publication), add a short dated section at the top of `docs/project-brief.md`, right after the title and "Updated" paragraph: at most about 10 lines with the outcome, evidence summary and a link to the plan file. Update the "Updated:" date. Keep details in the plan file; the brief is already very large.
5. Reply briefly: what was recorded, a suggested commit message (conventional style, no tool branding) if the work is ready, and the next step (usually `/review-checkpoint` before committing). Do not commit.
