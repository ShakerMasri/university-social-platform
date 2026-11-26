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

## Building for real users

The platform will be deployed for real students and teachers. Build everything to production quality, not demo quality:

- Accessibility: target WCAG 2.2 AA (contrast, visible focus, labels, full keyboard use, zoom to 400%, reduced motion).
- Every interface works in English and Arabic (RTL, logical CSS properties), in light and dark themes, and from 320px phones to desktop.
- Every page handles loading, empty, error and denied states with clear messages in both languages.
- Performance: no heavy UI libraries without a reason, paginate growing lists, keep client JavaScript small.

## Assets, licences and originality

On top of the dependency and licence rules in AGENTS.md:

- Use only original work or assets with a clear permissive licence (MIT, ISC, Apache-2.0, SIL OFL). No copied designs, logos, illustrations, icons or code snippets without a verified licence.
- Self-host fonts; record every third-party asset and its licence in `THIRD-PARTY-NOTICES.md`.
- Icons: our own SVGs, or one permissively licensed set chosen deliberately and recorded. Don't mix sets.
- No real university names or branding, and no imitation of another platform's look.

## Current work: UI rebuild (`feat/ui-redesign`)

The old UI was only a test harness for the server features; it is being rebuilt, not modified. Before any UI work, read `docs/design/ui-direction.md` (visual direction, rebuild rules, requested features) and `docs/plans/ui-redesign.md` once it exists.

- Don't reuse the old UI's layout, flows, wording or CSS. Read old pages only to learn which data, actions and states exist.
- Server logic, permissions and approved product decisions stay unless the owner approves a change. New features, server changes and route changes are owner decisions.
- Rewrite browser tests with each stage, keeping every security case (cross-user, denied, revocation). Existing URLs and notification links must keep working.
- The branch merges into main once at the end; merge main into it regularly.

## Replies

Keep replies short: start with a one-line result (done / blocked / needs a decision), then at most 5 bullets. Put details in files or give them only when asked. Ask questions as a short numbered list.
