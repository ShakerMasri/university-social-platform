---
name: plan-feature
description: Write a multi-session plan file for a large feature or fix, then stop for the owner's approval. Run as /plan-feature <feature or fix>.
disable-model-invocation: true
argument-hint: <feature or fix>
---

Plan this work: $ARGUMENTS

Do not edit application code in this command.

1. Inspect: current branch, `git status`, the last few commits. Read the "Updated" paragraph at the top of `docs/project-brief.md`, grep its headings (`grep -n '^#' docs/project-brief.md`) for related sections, and read only those. Check `docs/plans/` for an existing plan on the same topic and extend it instead of creating a duplicate.
2. Inspect the affected code with targeted searches: routes, Server Actions, Prisma models and migrations, tests, EN/AR dictionaries.
3. Write `docs/plans/<kebab-case-name>.md` from the template below. Keep it concrete and short; it is a working document, not a report.
4. Reply with: the plan file path, the decisions the owner must make (each with a recommended option and its tradeoff), a suggested branch name (`feat/...`, `fix/...` or `chore/...`), and stop. Wait for approval before implementing.

## Template

```markdown
# <Title>

Status: Planned (<YYYY-MM-DD>) · Branch: <suggested> · Milestone: <M?/B?>

## Goal

## Owner decisions needed

| # | Decision | Recommended | Tradeoff |
| --- | --- | --- | --- |

## Scope and out of scope

## Permissions and data
Who may do what, where the server enforces it, schema/migration impact. Omit if nothing changes.

## Acceptance criteria
Numbered and testable. Include failure, cross-user and revocation cases, EN/AR/RTL and keyboard where relevant.

## Sessions

### Session 1 — <name>
- Steps:
- Checks to run:
- Done when:

### Session 2 — <name>

## Verification plan
Unit / database / browser / manual, and what will remain unverified.

## Risks

## Progress log
Newest first; filled by /handoff and /review-checkpoint.
```
