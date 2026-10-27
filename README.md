# University Social Learning Platform

A Computer Engineering graduation project for university students and teachers to share discussions, find communities and preserve academic knowledge. Search, messaging and an AI assistant with source citations are planned baseline features.

## Current progress

| Checkpoint | What it adds | Status |
| --- | --- | --- |
| M1a | Next.js/TypeScript, English/Arabic, RTL and testing tools | Implemented and tested; dependency exceptions recorded |
| M1b | PostgreSQL/Prisma, persistence and guarded database tooling | Implemented and tested locally |
| M2 | Email-link confirmation, sessions, own profile and logout | Implemented and tested with synthetic local email |
| M3, first slice | Public/private communities, discovery and membership management | Implemented and tested locally |
| M3, posts slice | Create/read questions, discussions, resources and creator-only announcements | Implemented and tested locally |
| M3, comments slice | Flat plain-text comments, immediate publication feedback, scrolling post/comment lists and safe retries | Implemented and tested locally |
| Local development | Interactive synthetic sign-in through posts with hot reload and persistent data | Implemented and tested locally |

**Nothing is deployed.** Live university email is not connected. Post/comment editing/deletion, voting, notifications, direct messages, archive search and AI are still pending. See the [workflow checkpoint](docs/project-brief.md#interactive-development-workflow--2026-10-27) and the [approved comments checkpoint](docs/project-brief.md#createread-comments--approved-2026-10-27) for verification.

## Run locally

Use **Node.js 24.21.0** and **npm 11.19.0**. Run commands from the repository root. Initial installation needs internet access.

If you already have the matching portable Node runtime, activate it for this PowerShell session before running the commands:

```powershell
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
```

`.tools/` is not included in a fresh checkout. Use a version manager, or obtain the matching ZIP from the [official Node release](https://nodejs.org/dist/v24.21.0/) and verify its SHA-256 against `SHASUMS256.txt` before extracting it there.

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

Open [English sign-in](http://localhost:3000/en/signin) or [Arabic sign-in](http://localhost:3000/ar/signin). Stop with Ctrl+C or `npm.cmd run dev:stop` from another terminal. On Linux/macOS, use `npm` and `npx` instead of `npm.cmd` and `npx.cmd`.

**`npm run dev` is the interactive synthetic application with hot reload.** Docker Desktop's Linux engine must already be running. Startup validates/prepares the owned database and reviews/applies migrations, then starts Next in development mode without a production build. The first page compilation can take longer. Use the exact `localhost` host; IP/alternate Host headers are refused. No email provider or paid service is used.

1. Enter a made-up address such as `alice@university.test`.
2. Choose **Request a sign-in link**, **Open local confirmation**, then **Confirm sign-in**.
3. Save a display name, open Communities and create/join a community to publish posts and comments.
4. Use another browser/incognito window with `bob@university.test` for a separate account.

Posts and comments load more as you scroll, with a **Load more** button for keyboard access and retry. Confirmed comments appear beside the composer immediately, including in long threads; their **Just published** entries join the ordinary list as scrolling reaches them. Comments read oldest first; posts read newest first. Dedicated “For you” and “Your communities” feeds remain a discovery-design decision.

English and Arabic use the same flow. Edit application files under `src/` to see hot reload. Restart after changing launcher code under `tools/`, package scripts or operational configuration. Normal `npm run build` / `npm start` still leave synthetic identity disabled; they never install the launcher's in-memory context. A production `NODE_ENV` in the shell is refused by `npm run dev`.

Profiles, communities, posts and sessions survive normal restarts in the existing owned **development database**. Startup never adopts an unrelated database or resets data. If no guarded setup exists, it creates a fresh one. A stopped verified project-owned PostgreSQL container is resumed; unrelated containers/processes are untouched. Shutdown closes only this application and retains PostgreSQL/data. The in-memory synthetic mailbox clears on shutdown; request a new link after the cooldown if confirmation was interrupted.

Dev and manual preview share the private `.cache/m2-preview.json` registration: run only one at a time. `dev:stop` and `preview:stop` both authenticate that registration and stop only its matching owned server. An absent file is a successful no-op, not proof that an unregistered process is absent. After a crash, startup/stop recover a matching file only when its PID and control listener are both absent and a second check finds unchanged state. Live/reused PIDs, occupied ports, malformed/changed files or automated-runner files require inspection. Startup never kills a process to free port 3000. Do not remove an uncertain control file to bypass these checks. `db:cleanup` deletes development data and refuses while an interactive server is registered; it is not a normal shutdown command.

## Manual localhost preview

For an optional production-mode rendering check of the synthetic application, use the retained preview command after stopping dev:

```powershell
Set-Location 'D:\university-social-platform'
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
npm.cmd run preview:local
```

This uses the same guarded setup, development data, registration and synthetic confirmation flow as dev, but builds the application and runs without hot reload.

Open [English sign-in](http://localhost:3200/en/signin) or [Arabic sign-in](http://localhost:3200/ar/signin). Use that exact localhost host. The server binds only IPv4/IPv6 loopback; LAN/public access and alternate Host headers are refused.

No real email is sent in either interactive mode. The local confirmation button retrieves only the live synthetic message bound to the requesting browser. It does not consume the link or create a session; normal confirmation, expiry, reuse, CSRF, session and membership checks still apply. Tokens stay out of terminal output and automated traces/screenshots. This does not verify a real university mailbox.

To stop from another terminal in this repository:

```powershell
npm.cmd run preview:stop
```

This also stops a registered `npm run dev`, since they share one interactive registration. It does not stop an automated runner. Stop dev/preview before production rebuilds, changing the preview port or database cleanup.

The preview default is port **3200**; dev always uses **3000**, and browser tests use 3100/3201. To select another preview port, set validated `USP_LOCAL_PREVIEW_PORT` (1024–65535, excluding 3100). Dev ignores that preview override. No host/network binding override is provided. Both interactive launchers bind only IPv4/IPv6 loopback and retain the same session, CSRF, membership, ownership and private-content checks. Development HMR websocket upgrades also require the exact localhost Host/Origin and loopback peer.

For automated preview verification, build first, ensure the guarded database setup exists and run `npm.cmd run test:preview:local`. It uses a fresh disposable test database and port 3201 by default, then removes its own test database/control file. Keep the manual preview stopped while rebuilding or running that check. This is separate evidence from the ordinary/synthetic browser suites.

For the hot-reload workflow check, stop dev/preview and run `npm.cmd run test:dev:local`. No production build is needed. This reuses the preview browser checks in development mode against a disposable database, then verifies hot reload, forged websocket Host/Origin denial and session/profile/post persistence across a server restart. It temporarily edits and restores `src/app/[locale]/identity-shell.tsx`; avoid concurrent edits to that file during this command. Traces, screenshots and videos are disabled. Automated tests never use the development database.


## Check the application

Install Chromium once. All npm browser-test commands automatically reuse `.cache/ms-playwright` when that folder exists and no `PLAYWRIGHT_BROWSERS_PATH` override is supplied. An explicit override is respected; without the project cache, Playwright uses its standard cache (including CI). Direct `npx playwright` calls still follow Playwright's normal environment settings. To install browsers into the project cache:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.cache\ms-playwright"
npx.cmd playwright install chromium
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

`test:e2e` starts and stops its own production server at `127.0.0.1:3100`; keep that port free. It checks the shell and that protected flows remain disabled. On Linux, install browsers with `npx playwright install --with-deps chromium`.

For a local production preview, run `npm.cmd start` after building. This also leaves M2–M3 disabled. GitHub CI runs installation, lint, typecheck, unit tests, build and ordinary browser tests; database and synthetic M2–M3 tests are separate local checks.

## Test M2–M3 with a local database

You need Docker with a running Linux engine. The scripts use pinned PostgreSQL 18.6 and Prisma 7.10.1; they do not install or start Docker Desktop.

1. If `.cache/m1b/manifest.json` exists, run `npm.cmd run db:status` and inspect any failure. Otherwise, create a fresh isolated setup with `npm.cmd run db:setup`.
2. Complete the build and Chromium installation above. Review the SQL in [prisma/migrations](prisma/migrations), then run:

   ```powershell
   npm.cmd run db:validate
   npm.cmd run db:generate
   npm.cmd run db:review
   npm.cmd run db:migrate
   npm.cmd run db:guard-check
   npm.cmd run db:test
   npm.cmd run test:e2e:identity
   ```

3. When finished, optionally run `npm.cmd run db:cleanup`. **This deletes this setup's local development data, container, volume and credentials.** Keep the setup if you need its data.

`db:review` replays migration history in a disposable database and compares it with the schema. `db:migrate` applies reviewed history to this setup's development database. Database tests and the M2–M3 browser runner create and remove their own test databases.

Comments use the additive `20261027000000_m3_comments` migration. Generate the client with `npm.cmd run db:generate`, review with `npm.cmd run db:review`, then apply locally with `npm.cmd run db:migrate`; `npm run dev` also performs guarded migration preparation on startup. Restart an already-running dev server with `npm.cmd run dev:stop` followed by `npm.cmd run dev` after this schema/client change: the launcher retains its Prisma client in memory. Existing user/community/membership/post data is retained. The runtime role receives only comment SELECT/INSERT privileges. `db:test` verifies populated forward upgrade and reapplication on disposable databases; `test:e2e:identity` includes bilingual comments and access-removal checks. No development-data reset is needed.

The browser runner uses `http://127.0.0.1:3100`, synthetic `@university.test` addresses and an in-memory test mailbox. It covers sign-in, profile, logout, communities and posts, including adversarial access, forged sessions/authority and stored-script checks, then stops its servers.

Use the guarded scripts rather than direct Compose commands or database resets. They refuse mismatched ownership. Keep `.cache/m1b/` and `.cache/m2-browser.json` private: they contain local operational credentials. If cleanup refuses a target, inspect it before retrying.

## Pages to review

Replace `{locale}` with `en` or `ar`:

| Route | Purpose |
| --- | --- |
| `/` | Redirect to `/en` |
| `/{locale}` | Home and language switching |
| `/{locale}/signin` | Request a sign-in link |
| `/{locale}/verify` | Confirm the link |
| `/{locale}/profile` | Save your own name and log out |
| `/{locale}/communities` | Discover and create communities |
| `/{locale}/communities/{id}` | View a community, manage membership and create/read posts |
| `/{locale}/communities/{id}/posts/{postId}` | Read one permitted post and its comments; eligible members can comment |

Protected flows require interactive dev, the explicit localhost preview or a synthetic runner. Check both languages, Arabic RTL, keyboard focus, validation messages and mobile widths. `/fr` should return 404; the current generic 404 page is English.

## Security and release limits

- Profile access is owner-only. Community/post APIs recheck sessions, membership and creator permissions on the server.
- Comments are plain text (1–4,000 Unicode code points), oldest first in pages of 20. Publishing requires a verified session, saved profile and current membership, including comments on announcements. Verified nonmembers can read public comments; private comments require current membership. Retries recheck access; changed text under the same request ID conflicts. Comments have their own durable limit of 30 attempts per user per 15 minutes and a 32 KiB request cap. No editing, deletion, nesting, voting, uploads or reply notifications are included.
- Posting requires current membership and a saved profile; announcements are creator-only. Public posts are readable by verified users, private posts by current approved members. Resource links are HTTP/HTTPS; no uploads or previews. Post feeds show 20 entries per page; posting is limited to 30 attempts per user per 15 minutes.
- Verified users can discover private community names/descriptions; private spaces require current membership. A saved profile is required to create a community. Teachers receive no automatic privileges.
- Test sign-in links expire after ten minutes, are single-use and are bound to the requesting browser. Sessions last seven days; logout revokes them. HTTP cookies are a loopback test exception, not deployed HTTPS security.
- The 2026-10-25 full and production-filtered audits report no affected package entries after supported updates. This does not establish zero vulnerabilities or clear native/bundled licensing and release requirements. The historical braces advisory was withdrawn. Reassess by **2026-11-09** or on exposure changes; see the [current security checkpoint](docs/project-brief.md#dependency-security-and-regression-checkpoint--2026-10-25).
- Tests currently cover Chromium. Live email delivery, real-user usability, screen readers and deployment remain unverified.

Before real-user use, resolve provider, privacy, account lifecycle, teacher/moderation and hosting decisions, and complete the [release checklist](docs/project-brief.md#before-public-release). Third-party notices are an incomplete inventory; shipped artifacts still need license and attribution review.

## Project documents

- [Abstract](docs/abstract.md): minimum feature scope and specified stack.
- [Project brief](docs/project-brief.md): decisions, permissions, acceptance criteria and test history.
- [Latest idea notes](docs/graduation-project-notes.txt): proposed refinements and later work.
- [AGENTS.md](AGENTS.md): instructions for coding agents.
- [Third-party notices](THIRD-PARTY-NOTICES.md) and [manifest](docs/third-party-licenses/manifest.json): collected licenses, sources and hashes.
- [Maintenance notes](docs/project-brief.md#maintenance-notes-retained-from-readme--2026-10-10): Unicode generation, audit commands and historical diagnostics.
