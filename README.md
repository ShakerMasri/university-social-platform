# University Social Learning Platform

A Computer Engineering graduation project for university students and teachers to share discussions, find communities and preserve academic knowledge. Archive search and direct text messaging are implemented locally; an AI assistant with source citations remains planned.

## Current progress

| Checkpoint | What it adds | Status |
| --- | --- | --- |
| M1a | Next.js/TypeScript, English/Arabic, RTL and testing tools | Implemented and tested; dependency exceptions recorded |
| M1b | PostgreSQL/Prisma, persistence and guarded database tooling | Implemented and tested locally |
| M2 | Email-link confirmation, sessions, own profile and logout | Implemented and tested with synthetic local email |
| M3 overall | Agreed local community-interaction feature scope | Complete locally; verified and merged through PR #15; not deployed |
| M3, first slice | Public/private communities, discovery and membership management | Implemented and tested locally |
| M3, posts slice | Create/read questions, discussions, resources and creator-only announcements | Implemented and tested locally |
| M3, comments slice | Flat plain-text comments, immediate publication feedback, scrolling post/comment lists and safe retries | Implemented and tested locally |
| M3, voting slice | Member signed votes on posts/comments/replies, separate up/down totals and safe retries | Implemented and tested locally |
| M3, replies/notifications slice | Flat reply threads, in-app inbox/read actions and profile preferences | Implemented and tested locally |
| M4, first archive slice | Permission-aware English/Arabic post/comment search, community/type filters and signed pagination | Implemented and verified locally; not deployed |
| M4, profiles and People | Editable default names and discovery of all saved verified profiles across communities | Implemented and integration-tested locally; not deployed |
| M4, local messaging | Protected APIs, People contact, requests/history, recipient decisions, bilateral blocks, safe retries and scoped pagination in EN/AR | Implemented and synthetic/local tested; no realtime provider or deployment; evidence in the project brief |
| Local development | Interactive synthetic sign-in through posts with hot reload and persistent data | Implemented and tested locally |

**Nothing is deployed.** Live university email is not connected. Post/comment editing/deletion, a personalized study feed and AI are still pending. Direct text messaging works in the synthetic local application with explicit refresh. See the [profiles/People checkpoint](docs/project-brief.md#profiles-and-people-discovery--planned-before-messaging), [archive checkpoint](docs/project-brief.md#first-archive-slice--implementation-and-verification), [replies and notifications checkpoint](docs/project-brief.md#replies-and-in-app-notifications--local-checkpoint-2026-10-28), [workflow checkpoint](docs/project-brief.md#interactive-development-workflow--2026-10-27), [comments checkpoint](docs/project-brief.md#createread-comments--approved-2026-10-27) and [voting checkpoint](docs/project-brief.md#postcomment-upvotes--approved-2026-10-27) for verification.

The next main milestone is **M4: study-relevant discovery, searchable archive and direct text messaging**. Live email/recovery are M2 follow-ups; manual accessibility/usability evaluation and real-user lifecycle/release decisions remain open. See the [current M3 completion record](docs/project-brief.md#m3-completion-and-next-milestone--2026-11-03) for scope and evidence.

## Partner review of the UI/UX branch

The replies, UI-foundation and latest discussion-action fixes are merged into `main` through [PR #15](https://github.com/ShakerMasri/university-social-platform/pull/15), merge commit `8fb431c`. Use the latest `main` and follow [Run locally](#run-locally): Node 24.21.0, npm 11.19.0, Docker Desktop's Linux engine, `npm.cmd ci` on a fresh checkout, then `npm.cmd run dev`. Open `http://localhost:3000/en/signin`; `npm start` leaves synthetic sign-in disabled. Each checkout creates/uses its own guarded local database; do not copy someone else's `.cache/` or credentials. Startup can apply pending local migrations, and test data persists across restarts.

Use made-up `@university.test` addresses in a normal and an incognito window. Sign in using **Request a sign-in link → Open local confirmation → Confirm sign-in**, then save a display name. No real email is sent. Test the short [manual checklist](docs/ui-ux-plan.md#manual-testing-checklist) in English/Arabic and on a narrow window. Publish announcements/replies after the recipient joins; earlier events are not backfilled.

Direct text messaging is available locally through People and Messages. A personalized study feed and AI remain pending project features. Screen-reader speech, wider manual cases and participant feedback remain unverified; the large-list disposable fixture is not prepared. The recorded skip-link/reload behavior can traverse browser controls before returning to the page on the fifth physical Tab; its cause is unresolved. Report `steps → expected → actual`, language/browser and whether help was needed. Stop with Ctrl+C; normal shutdown retains test data. Manual evaluation remains open after the merge. Nothing is deployed.

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

Your profile suggests an editable **Member** / **عضو** name if you have not saved one. The suggestion contains no part of your email and creates no profile until saved. Existing names are preserved. Every saved profile with verified email appears in People for verified signed-in viewers; there is no hide-profile setting. Your email stays private.

Open **People** to search saved display names in either English or Arabic, including accounts with no shared community. Enter 2–60 characters; matching ignores Latin case and the archive's common Arabic marks/tatweel. Name parts can appear in any order. Letter/number words of at least three characters also match a whole name word with one missing, extra, substituted or adjacent-swapped character. Short terms, punctuation and emoji remain literal partial matches. This does not translate or transliterate names; results retain stable profile-ID order. Names may be shared by several people; each profile has its own stable destination. Results have explicit next/retry buttons, with no email lookup or member lists. Accounts need a saved name and verified email to appear. The 2026-11-07 owner decision supersedes opt-in visibility for existing and new saved profiles; the old database flag is retained without affecting discovery. Restart an existing app to load this policy; old pagination cursors require a new search. Open another saved profile to send a message request. Save your own profile first; self-contact is unavailable. Profile search/reads are limited to 30 requests per 15 minutes per account; profile saves have a separate 30-request budget.

Open **Messages** for incoming requests and existing conversations. Both accounts must be verified and profiled to send or accept; no shared community is needed. The initiator can send five messages while pending. The original recipient must explicitly **Accept request** before replying; **Reject request** stops further contact, and the recipient can accept later to reopen the same conversation. Either participant can **Block contact**; both send directions and acceptance stop until each person removes their own block. Participants retain readable history after rejection/blocking or peer verification/profile loss; an unavailable peer has a fallback label. The caller still needs a live verified session and saved profile.

Use **Refresh messages** after changes and when checking for new correspondence; there is no automatic polling or instant delivery. Decision/block confirmations ask you to refresh the permission snapshot before continuing. History reads oldest first, with **Load next messages** for the next batch of up to 20; conversation pages have **Next conversations**. Confirmed outgoing messages also appear under **Just sent** until loaded in the ordinary page. After a lost response, the draft becomes read-only: **Retry the same message** keeps the original key/text and reconciles a saved message without duplication, including a fifth pending message. Acceptance/unblocking never resends a draft. Tab departure hides history and keeps an ambiguous draft only in component memory until explicit access rechecking; views that mount while already hidden also pause without fetching and require explicit refresh after returning; navigation/reload discards component drafts/retry keys. Check history before recreating an uncertain message after navigation. No draft is stored in localStorage. No delivery/read receipts or end-to-end encryption are claimed.

Messaging accepts 1–4,000 Unicode code points of plain text with a 32 KiB JSON request cap. Contact, send, read/list, decision and block each have independent durable limits of 30 attempts per account per 15 minutes; contact also consumes send. Repeated refresh/paging can exhaust the shared read/list budget. Errors never represent a failed read as empty history or a failed write as saved. Reporting, deletion and retention decisions remain required before real-user messaging.

Home checks the current server session. Signed-in users, including those still setting up a profile, see account navigation and a Communities action. Anonymous/expired/revoked sessions see Sign in. A failed session lookup shows a retry state and preserves cookies. Home rechecks on navigation/restoration and when returning to the tab; it does not promise instant updates in an unattended tab.

Current members can use the **Upvote** and **Downvote** arrow icons on other people's posts, comments and replies. Each arrow has its own total; the selected arrow is filled and the other is outlined. Switching replaces your vote; clicking the active direction clears it. Pressed state and totals update after confirmation; **Retry vote** repeats the same choice after a lost response. A saved profile is not required for voting; authors cannot vote on their own content. Voter identities are not shown, and votes do not change list order or establish correctness. Totals and inbox contents refresh on reads/actions; realtime updates are not included.

The speech-bubble icon (**Comments**) beside the vote arrows opens the post's comment section. Commenting and replying require current membership and a saved display name; the section links to the missing step. **Reply** opens a field beneath the comment. Replies share one visible thread beneath their original top-level comment, including replies to replies. **Show replies** appears only for nonempty threads (or your newly published replies); **Show more replies** explicitly loads the next oldest-first batch of 20. Scrolling alone does not load more replies. Top-level comments still load on scroll. Profile settings separately enable announcement, comment/reply and upvote notifications, all enabled by default. Only someone's first upvote on each target can notify its eligible owner; downvotes and repeated toggles do not. Existing upvotes generate no historical notification. Eligible notifications are persisted with the content transaction. Open **Notifications** from the page header to read your inbox. Opening marks one read; **Mark all as read** affects currently accessible notifications. Leaving a community hides its notifications, including public communities; rejoining restores them with their previous read state. Events missed while away are not backfilled. Settings affect future notifications. Inbox contents/counts refresh on reads and actions; realtime or cross-tab delivery is not included.

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

## Test M2–M4 with a local database

You need Docker with a running Linux engine. The scripts use pinned PostgreSQL 18.6 and Prisma 7.10.1; they do not install or start Docker Desktop.

1. If `.cache/m1b/manifest.json` exists, run `npm.cmd run db:status` and inspect any failure. Otherwise, create a fresh isolated setup with `npm.cmd run db:setup`.
   If inspection confirms the existing owned container is stopped and its current port is free, use `npm.cmd run db:resume`, then repeat `db:status`. Resume checks the manifest, exact container ID, ownership labels, volume, binding and database identities; it starts only that container, without applying migrations/grants, recreating resources or changing retained data.
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

`db:review` replays migration history in a disposable database and compares it with the schema. `db:migrate` applies reviewed history to this setup's development database. Database tests and the M2–M4 browser runner create and remove their own test databases. `test:e2e:identity` runs the empty-directory case, main regressions and archive cases sequentially on separate guarded targets, preserving the empty-state assertion without depending on file order. Run guarded database/browser commands **sequentially**: they share a local ownership manifest.

Comments use the additive `20261027000000_m3_comments` migration. Generate the client with `npm.cmd run db:generate`, review with `npm.cmd run db:review`, then apply locally with `npm.cmd run db:migrate`; `npm run dev` also performs guarded migration preparation on startup. Restart an already-running dev server with `npm.cmd run dev:stop` followed by `npm.cmd run dev` after this schema/client change: the launcher retains its Prisma client in memory. Existing user/community/membership/post data is retained. The runtime role receives only comment SELECT/INSERT privileges. `db:test` verifies populated forward upgrade and reapplication on disposable databases; `test:e2e:identity` includes bilingual comments and access-removal checks. No development-data reset is needed.

Voting originally added `20261027010000_m3_votes`; replies/notifications added `20261028000000_m3_replies_notifications`. The signed-vote follow-up adds `20261102000000_m3_signed_votes`: existing upvotes retain +1 and their first-upvote timestamp, neutral/downvote values are supported, and the upvote notification preference defaults on. No historical notifications are generated. Runtime votes now allow SELECT/INSERT and UPDATE of value/first-upvote marker, with DELETE revoked; the first-upvote marker is immutable once set. Neutral rows contribute zero and retain that marker to prevent notification spam.

Use the same generate → review → migrate → restart sequence above. Stop the app and take a verified local backup before migrating data you want to keep. The migration preserves IDs, content, memberships, existing notifications and preferences. Older upvote-only code counts neutral/downvote rows incorrectly and may attempt forbidden deletion: recovery requires a compatible application fix while retaining schema/data, or an explicitly chosen backup restoration with its loss-of-later-writes tradeoff. Do not drop tables or reset data to roll back. No production migration/deployment is authorized.

People's historical `20261105000000_m4_people` migration adds an independent random directory UUID and `directoryVisible = false` while preserving names/timestamps/attribution. The 2026-11-07 application policy lists all saved verified profiles regardless of that legacy flag; no new migration or backfill is required. The maintained grant setup retains INSERT permission for Prisma's generated default and revokes UPDATE on that unused flag when next applied. Follow the same generate → review → migrate → restart sequence for unapplied migrations, taking a verified backup before applying to retained data. `db:test` includes a disposable populated-upgrade fixture and checks profile preservation during migration reapplication. Tests do not migrate development or the two retained targets. Recovery uses compatible code while retaining schema/data, rather than dropping columns or resetting profiles. `npm run dev` prepares pending local migrations before startup; an already-running app must be restarted after migration/client generation. No staging/production change is included.

The browser runner uses `http://127.0.0.1:3100`, synthetic `@university.test` addresses and an in-memory test mailbox. It covers sign-in, profile, logout, communities, posts, comments/replies, voting, notifications and archive search, including adversarial access, forged sessions/authority and stored-script checks, then stops its servers.

Messaging's additive `20261107000000_m4_messaging` migration introduces conversations/messages with restrictive user/history foreign keys and one canonical unordered pair. `npm.cmd run db:generate`, `npm.cmd run db:review` and `npm.cmd run db:test` generate/review/test it on disposable targets. Only deliberately run `npm.cmd run db:migrate` to apply it to retained development data after a verified backup; guarded dev startup also prepares pending migrations. This continuation did not apply it to retained targets. Restart an existing app after client/schema changes. Recovery uses compatible code while retaining correspondence; no reset, destructive down-migration or production deployment is included. The local messaging routes and UI require this migration and its runtime grants. The guarded authenticated suite migrates only fresh disposable targets before exercising them.

The local server service permits People contact without shared membership for saved verified accounts. It keeps one original initiator/recipient, up to five pending initiator messages, explicit recipient acceptance/rejection with later acceptance, each participant's own block and readable history after block/rejection. New sends and acceptance require both accounts still verified/profiled; history requires the caller's live verified/profiled session. Text is inert plain text, at most 4,000 Unicode code points; conversation and oldest-first message pages contain at most 20 rows with scoped anchors. Contact, send, read/list, decision and block attempts each have independent durable 30-attempt/15-minute budgets; contact also charges send. Messaging remains synthetic/local and is excluded from AI retrieval. HTTP boundaries and the bilingual UI are implemented locally; reporting and real-user lifecycle decisions remain future gates.

For a focused messaging check after building, run `npm.cmd run test:e2e:messaging`. The complete `test:e2e:identity` command includes the same messaging group after its empty/main/archive groups. Run database and authenticated-browser suites sequentially. The messaging runner creates and removes only its own guarded disposable target. Its final case stops its authenticated test application, refuses a PostgreSQL restart if application ports or database clients remain, rechecks exact container/volume/image/owner/binding identity, gracefully stops/resumes that container, and starts its own replacement app. Retained databases and the old interactive registration are preserved. Never run this restart check alongside another app or database user. Control keys/cookies remain in worker memory and messaging traces/screenshots/videos are disabled.

The guarded identity suite also checks real Chromium page zoom at 200% and 400%, including 320 CSS-pixel reflow and form interactions in both languages. It uses the original permission-free extension under `tests/e2e/fixtures/page-zoom` in a disposable browser profile; it does not use or install anything in a personal browser profile. Zoom factor, viewport width and pixel ratio are verified after route changes. This automated check does not replace headed browser, screen-reader or usability evaluation.

Use the guarded scripts rather than direct Compose commands or database resets. They refuse mismatched ownership. Keep `.cache/m1b/` and `.cache/m2-browser.json` private: they contain local operational credentials. If cleanup refuses a target, inspect it before retrying.

## Pages to review

Replace `{locale}` with `en` or `ar`:

| Route | Purpose |
| --- | --- |
| `/` | Redirect to `/en` |
| `/{locale}` | Home and language switching |
| `/{locale}/people` | Verified-user search of confirmed display names |
| `/{locale}/people/{id}` | Discoverable profile and message request, using its directory ID |
| `/{locale}/messages` | Incoming requests and existing conversations |
| `/{locale}/messages/{id}` | Participant history, composer, recipient decisions and own block controls |
| `/{locale}/signin` | Request a sign-in link |
| `/{locale}/verify` | Confirm the link |
| `/{locale}/profile` | Save your own name, set notification preferences and log out |
| `/{locale}/notifications` | Read your current community notifications and mark them read |
| `/{locale}/archive` | Search currently readable post/comment text in English and Arabic |
| `/{locale}/communities` | Discover and create communities |
| `/{locale}/communities/{id}` | View a community, manage membership and create/read posts |
| `/{locale}/communities/{id}/posts/{postId}` | Read one permitted post and its comments; eligible members can comment |

Protected flows require interactive dev, the explicit localhost preview or a synthetic runner. Check both languages, Arabic RTL, keyboard focus, validation messages and mobile widths. `/fr` should return 404; the current generic 404 page is English.

## Security and release limits

- Archive search requires a verified session, with private post/comment access rechecked before excerpts are returned and whenever a result is opened. Use 2–200 characters and at most eight words; all words must occur in post title/body or one comment/reply. Matching uses literal substrings, Latin case folding and common Arabic vowel/tatweel normalization; no translation, stemming or typo correction. Results show one parent post and a labeled excerpt, newest first, 20 per page. Community/type filters are optional; each community has a scoped archive link. The dropdown shows the first 50 readable communities plus an explicitly selected one. Search has its own durable 30-attempt/15-minute budget and bounded query timeout. No new migration, extension, dependency, academic-year field or retention promise was added. Database tests keep the 10,000-post synthetic archive corpus in a separate disposable target. Current measurements are local samples, not a production scale guarantee.

- Private account/email settings are owner-only; saved verified display names appear in People. Community/post APIs recheck sessions, membership and creator permissions on the server.
- Comments are plain text (1–4,000 Unicode code points), oldest first in pages of 20. Publishing requires a verified session, saved profile and current membership, including comments on announcements. Verified nonmembers can read public comments; private comments require current membership. Retries recheck access; changed text under the same request ID conflicts. Comments have their own durable limit of 30 attempts per user per 15 minutes and a 32 KiB request cap. One visible reply level is supported; server-derived thread roots and direct targets must belong to the same post. Notification records are atomic with content writes; notification lists/counts/open/read actions recheck recipient ownership and current membership. No editing, deletion or uploads are included.
- Voting requires a verified session and current membership for adding, switching or clearing a signed vote; authors cannot vote on their own content. Desired-state writes recheck parent IDs and current access, including retries, with a separate durable 30-attempt/15-minute budget and 1 KiB request cap. Leaving does not automatically erase past votes. First-upvote notifications are atomic with the vote, respect current recipient membership/preferences and expose no voter identity. No voter lists, vote-driven ranking or user reputation are included.
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
