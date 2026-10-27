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

**Nothing is deployed.** Live university email is not connected. Post editing/deletion, comments, voting, notifications, direct messages, archive search and AI are still pending. See the [project brief](docs/project-brief.md#current-status-and-checkpoint-evidence) for decisions and test evidence.

## Run locally

Use **Node.js 24.21.0** and **npm 11.19.0**. Run commands from the repository root. Initial installation needs internet access.

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

Open [English](http://localhost:3000/en) or [Arabic](http://localhost:3000/ar). Stop with Ctrl+C. On Linux/macOS, use `npm` and `npx` instead of `npm.cmd` and `npx.cmd`.

**Normal startup shows the application shell; identity and community database flows stay disabled.** Use the manual localhost preview below for hands-on M2–M3 testing, or the guarded automated runners.

If you already have the matching portable Node runtime, activate it for this PowerShell session:

```powershell
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
```

`.tools/` is not included in a fresh checkout. Use a version manager, or obtain the matching ZIP from the [official Node release](https://nodejs.org/dist/v24.21.0/) and verify its SHA-256 against `SHASUMS256.txt` before extracting it there.

## Manual localhost preview

For hands-on sign-in, profiles, communities and posts, use the explicit local preview rather than ordinary dev/start:

```powershell
Set-Location 'D:\university-social-platform'
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
npm.cmd run preview:local
```

Docker's Linux engine must be running. This command creates a fresh guarded project setup if none exists, validates an existing setup's ownership, reviews/applies migrations, builds the current application and starts the preview. It restarts a stopped, verified project-owned PostgreSQL container and preserves its data. After a crash/reboot, it removes only a matching manual-preview control file whose recorded PID and control listener are both absent. Live/reused PIDs, occupied control ports, malformed or changed files, and automated-runner files still require inspection; it never stops another service to free a port.

Open [English sign-in](http://localhost:3200/en/signin) or [Arabic sign-in](http://localhost:3200/ar/signin). Use that exact localhost host. The server binds only IPv4/IPv6 loopback; LAN/public access and alternate Host headers are refused.

1. Enter a made-up address such as `alice@university.test`.
2. Click **Request a sign-in link**, then **Open local confirmation**.
3. Click **Confirm sign-in**, enter a display name and save it.
4. Open Communities to create/join a community and test posts. Use another browser/incognito window with `bob@university.test` for a separate user.

No real email is sent. The preview-only button can retrieve only the live synthetic message bound to the requesting browser. It does not consume the link or create a session; normal confirmation, expiry, reuse, CSRF, session and membership checks still apply. Tokens stay out of terminal output, traces and screenshots. This is not verification of a real university mailbox.

Preview profiles, communities, posts and sessions use the owned **development database**, so they remain across normal preview restarts. The in-memory synthetic mailbox is cleared on shutdown; request a new link after the normal cooldown if you stopped before confirming.

To stop from another terminal in this repository:

```powershell
npm.cmd run preview:stop
```

If no manual preview control file exists, preview:stop reports that no preview is registered and exits successfully without touching Docker, database records or other processes. It does not stop a separate npm run dev or automated test runner.

Stopping retains development data. This command also clears a confirmed stale manual-preview file after a crash, using the same ownership/PID/listener checks as startup; it does not delete database records. `npm.cmd run db:cleanup` removes that setup's development data/container/volume/operational credentials and refuses while a preview is active. Stop the preview before rebuilding, changing the port or cleaning its database.

The default is port **3200**, leaving ordinary development on 3000 and browser tests on 3100 separate. To select another free port, set the validated `USP_LOCAL_PREVIEW_PORT` before launch; 3100 is reserved for automated checks. For example, use 3000 only after stopping your own ordinary dev server. No host/network binding override is provided. Ordinary `npm.cmd run dev` and `npm.cmd start` remain unchanged and do not enable this synthetic flow.

For automated preview verification, build first, ensure the guarded database setup exists and run `npm.cmd run test:preview:local`. It uses a fresh disposable test database and port 3201 by default, then removes its own test database/control file. Keep the manual preview stopped while rebuilding or running that check. This is separate evidence from the ordinary/synthetic browser suites.


## Check the application

Install Chromium once. The three npm browser-test commands automatically reuse `.cache/ms-playwright` when that folder exists and no `PLAYWRIGHT_BROWSERS_PATH` override is supplied. An explicit override is respected; without the project cache, Playwright uses its standard cache (including CI). Direct `npx playwright` calls still follow Playwright's normal environment settings. To install browsers into the project cache:

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

The browser runner uses `http://127.0.0.1:3100`, synthetic `@university.test` addresses and an in-memory test mailbox. It covers sign-in, profile, logout and communities, including adversarial access, forged sessions/authority and stored-script checks, then stops its servers. Ordinary development mode does not offer a working sign-in flow.

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
| `/{locale}/communities/{id}/posts/{postId}` | Read one permitted post |

Protected flows require the explicit localhost preview or synthetic runner. Check both languages, Arabic RTL, keyboard focus, validation messages and mobile widths. `/fr` should return 404; the current generic 404 page is English.

## Security and release limits

- Profile access is owner-only. Community/post APIs recheck sessions, membership and creator permissions on the server.
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
