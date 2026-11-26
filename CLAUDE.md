@AGENTS.md

# Claude Code additions

AGENTS.md (imported above) is the shared rulebook, also used by Codex, and wins on any conflict. This section only adapts it to Claude Code.

## Reading the project docs without filling the context

- `docs/project-brief.md` is ~700 KB, latest-first, with very long lines. Never read it whole. List its sections with `grep -n '^#' docs/project-brief.md`, then read only the relevant section by line range. Its first paragraph ("Updated: ...") and the newest dated sections describe the current state.
- Stable reference sections sit near the end of the brief: "Baseline requirements and acceptance criteria", "Unresolved decisions", "Later backlog from the latest notes", "Milestones". Locate them with grep; line numbers move.
- `docs/abstract.md` and `docs/graduation-project-notes.txt` are short; read them only when a requirement question needs them.
- Per-feature plans and their session logs live in `docs/plans/<feature>.md`. Older ones: `docs/ui-ux-plan.md`, `docs/ui-ux-handoff.md`.

## Session workflow (owner's commands)

Large work is split across sessions. The owner drives it with these commands; don't start them on your own:

| Command | When |
| --- | --- |
| `/plan-feature <name>` | Start of a large feature or fix: write the plan file, then stop for approval |
| `/resume [plan]` | Start of each new session: rebuild context from git and the plan file, propose the next step |
| `/handoff [plan]` | End of each session: record what was done, checks actually run, and the next step |
| `/review-checkpoint [scope]` | Before committing: independent review by the read-only `checkpoint-reviewer` subagent |

Running `/review-checkpoint` counts as the owner explicitly requesting an agent under the AGENTS.md rule on parallel agents. Do not start other subagents unless asked.

For substantial tasks outside these commands, give a short plan with acceptance criteria (or use plan mode) before editing, as AGENTS.md requires.

## Environment (Windows)

- The owner works on Windows; README commands use PowerShell `npm.cmd`. In Claude Code's shell use `npm run ...` and `npx ...`.
- If `node --version` is not 24.21.0, put the portable runtime first on PATH for that command: `export PATH="$PWD/.tools/node-v24.21.0-win-x64:$PATH"` (Git Bash).
- Cheap checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:validate`. Database and browser suites (`npm run db:test`, `npm run test:e2e*`) need Docker Desktop running and take longer; run them when the change warrants it and say so.
- `npm run dev` is long-running: start it only when asked, in the background, and stop it with `npm run dev:stop`.
- Run from `D:\` with an uppercase drive letter. A lowercase `d:\` path makes Vitest load twice and fail with 'failed to find the runner'. If the local database is stopped, `npm run db:resume` restarts it.

## Git

- Never commit, push, merge or open a PR unless the owner asks in this session. Suggest the branch name and commit message instead.
- No tool or agent branding in branch names, commit messages or PR text. Attribution is disabled in `.claude/settings.json`; don't add it by hand either.
