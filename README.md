# University Social Learning Platform

A Computer Engineering graduation project for university students and teachers to share academic discussions, find relevant communities, preserve knowledge across academic years, and receive source-based AI assistance.

## Project documents

- [Abstract](docs/abstract.md): minimum feature scope and specified stack.
- [Latest project notes](docs/graduation-project-notes.txt): current design ideas and revisions; supersede older idea files. Tentative statements remain tentative.
- [Project brief](docs/project-brief.md): requirements, acceptance criteria, decisions, milestones, backlog, and progress.
- [Agent instructions](AGENTS.md): repository working and security rules.

## Actual setup status

As inspected on 2026-10-08, this repository contains documentation only. There is no application scaffold, `package.json`, lockfile, runtime pin, database schema, migration, test configuration, or CI configuration. Dependencies and supporting services have not been configured in this repository. No deployment was performed during this checkpoint.

The specified stack is Next.js and TypeScript for frontend and backend, PostgreSQL, and Prisma, with React and the Next.js App Router preferred by the repository instructions. Dependency versions, the supported Node.js version, package manager, authentication, email, and other providers remain to be selected when needed.

Installed tools observed locally:

| Tool | Version | Command actually run |
| --- | --- | --- |
| Node.js | `v24.13.0` | `node --version` |
| npm | `11.17.0` | `npm.cmd --version` |
| Git | `2.48.1.windows.1` | `git --version` |

PowerShell blocked `npm --version` because the `npm.ps1` wrapper is subject to the local execution policy; `npm.cmd --version` succeeded without changing that policy. Installed versions are observations, not project runtime requirements.

Install, development, database, test, lint, typecheck, and build commands are not yet configured. Add exact commands here once the application scripts and configuration exist and the commands have been verified.

The next implementation checkpoint is a minimal application foundation, followed by the verified-email/profile flow described in the brief. This documentation checkpoint does not scaffold code, install dependencies, connect services, or deploy.
