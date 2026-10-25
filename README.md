# University Social Learning Platform

A Computer Engineering graduation project for university students and teachers to share discussions, find communities and preserve academic knowledge. Search, messaging and an AI assistant with source citations are planned baseline features.

## Current progress

| Checkpoint | What it adds | Status |
| --- | --- | --- |
| M1a | Next.js/TypeScript, English/Arabic, RTL and testing tools | Implemented and tested; dependency exceptions recorded |
| M1b | PostgreSQL/Prisma, persistence and guarded database tooling | Implemented and tested locally |
| M2 | Email-link confirmation, sessions, own profile and logout | Implemented and tested with synthetic local email |
| M3, first slice | Public/private communities, discovery and membership management | Implemented and tested locally |

**Nothing is deployed.** Live university email is not connected. Posts, comments, voting, notifications, direct messages, archive search and AI are still pending. See the [project brief](docs/project-brief.md#current-status-and-checkpoint-evidence) for decisions and test evidence.

## Run locally

Use **Node.js 24.21.0** and **npm 11.19.0**. Run commands from the repository root. Initial installation needs internet access.

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

Open [English](http://localhost:3000/en) or [Arabic](http://localhost:3000/ar). Stop with Ctrl+C. On Linux/macOS, use `npm` and `npx` instead of `npm.cmd` and `npx.cmd`.

**Normal startup shows the application shell; identity and community database flows stay disabled.** Use the synthetic test runner below, or the manual QA tooling after its separate verification gate, to exercise M2–M3.

If you already have the matching portable Node runtime, activate it for this PowerShell session:

```powershell
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
```

`.tools/` is not included in a fresh checkout. Use a version manager, or obtain the matching ZIP from the [official Node release](https://nodejs.org/dist/v24.21.0/) and verify its SHA-256 against `SHASUMS256.txt` before extracting it there.

## Check the application

Install Chromium once. Keep the same browser-cache setting when running browser tests:

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

You need Docker with a running Linux engine. The scripts use pinned PostgreSQL 18.6 and Prisma 7.10.0; they do not install or start Docker Desktop.

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

The browser runner uses `http://127.0.0.1:3100`, synthetic `@university.test` addresses and an in-memory test mailbox. It covers sign-in, profile, logout and communities, then stops its servers. Ordinary development mode does not offer a working sign-in flow.

Use the guarded scripts rather than direct Compose commands or database resets. They refuse mismatched ownership. Keep `.cache/m1b/` and `.cache/m2-browser.json` private: they contain local operational credentials. If cleanup refuses a target, inspect it before retrying.

### Existing contributor

Option B preserves the traditional workflow above, including `.cache/m1b/manifest.json`, `.cache/m2-browser.json`, existing registered ports, ownership checks and narrowly identified cleanup targets. Ordinary `db:*` scripts and synthetic browser tests do not read `qa-isolation.json`, `local-database.json` or `manual-qa.json`; they do not require LOCALAPPDATA, QA ACLs, QA leases, FileShare helpers or CIM. A directory name ending in `-qa-isolated` no longer imposes QA configuration on ordinary commands.

Historical POSIX directories at 0755 retain current-main behavior; no chmod/chown is performed. This preserves main's permission policy, not the stronger private QA policy. Keep operational files private. No existing resources, credentials, ports or runtime files are migrated, recreated or adopted by QA. `MANIFEST_MISSING` and `MANIFEST_JSON` provide fixed redacted diagnostics; unknown operational errors stay generic. A missing manifest never proves that resources are absent or authorizes provisioning over uncertain state.

`db:compatibility` remains an optional metadata-only **legacy inventory**, not a prerequisite or operational gate for ordinary commands. Exit 2 requests preservation/review of the older shared-runtime design; it does not mean the restored traditional tooling refuses a valid main-compatible manifest. It reads known path metadata only, not contents, live processes or Docker. Never delete state to make this diagnostic clear.

The owner selected Option B on 2026-10-25. Earlier recommendations to accept a breaking change are superseded for traditional development. Existing `local-database.json` / `qa-isolation.json` files and their example/helper modules remain preserved as historical material; they are not consulted by the corrected command entrypoints. Do not use their old generators as current setup instructions.

## Isolated Manual QA checkout

Manual QA is optional and now owns separate Docker/SQL/control resources even when run in the same checkout. A separate checkout is still recommended for a test campaign. No particular directory suffix or source-owner profile is required. Do not copy source credentials, manifests, cookies or sessions. The [manual report](docs/qa/MANUAL-QA-REPORT.md) remains unchanged and records historical tester-reported outcomes, not execution of this corrected architecture.

| Resource | Traditional workflow | Optional Manual QA |
| --- | --- | --- |
| Docker project/container/volume | `usp-m1b-<owner>` namespace | `usp-qa-<owner>` namespace; independently generated owner |
| SQL roles/databases | `usp_m1b_<owner>_*` | `usp_qa_<owner>_*` |
| Docker ownership label | `edu.usp.m1b.owner` | `edu.usp.qa.owner` |
| Manifest / secret runtime | `.cache/m1b` | `%LOCALAPPDATA%/usp-runtime-<checkout-id>/m1b` |
| Browser/control | `.cache/m2-browser.json` | Protected `manual-identity/control.json` |
| HTTP | Synthetic browser 3100; normal dev 3000 | 3200, fixed loopback Origin |
| New PostgreSQL setup | 55432 | 55433 by default; optional explicit independent port |
| Application build/cache | `.next` | `.next-manual` via `manual:build` |
| Lock / process identity | Main's established behavior | Private QA-only gate, lease and CIM |
| Prisma configuration | `prisma.config.ts` | `prisma.manual.config.ts`, explicit `--config` |

Each namespace validator rejects the other, even with the same owner value. No QA database URL or manifest can authorize traditional cleanup, and QA cleanup accepts only its registered QA test target. Compose uses bridge networking without creating/deleting shared project networks. QA setup inspects published-port metadata for **all containers including stopped ones**, refuses conflicts/unknown inventory and the ordinary default 55432, then performs Windows exclusion and loopback bind/close checks. It never stops an existing listener/container or changes ports automatically. Preflight is not a reservation; a later collision must fail without adoption. Select a port distinct from all existing development targets.

Optional `manual-qa.json` contains exactly `version` (1), `root` (this absolute checkout path) and `postgresPort` (integer 1024`65535, independent of existing targets). It is ignored, contains no credentials, and is unnecessary if default 55433 is suitable. Copy [manual-qa.example.json](manual-qa.example.json) only to a new ignored config, replace the root placeholder and choose the port before first QA setup. Never overwrite an existing config or edit it to migrate an existing QA resource. A configured/recorded port mismatch refuses. Old profiles are not silently converted.

The protected runtime path remains deterministic per checkout. If it already contains a prior shared-runtime manifest/session, the new `usp_qa_` validator or lifecycle evidence checks refuse it; do not delete it or run preparation to repair it. Retain it for a separately authorized transition review. A fresh independent QA checkout can create fresh independent QA resources without changing the old installation. No migration tool is implemented.

## Manual Postman QA tooling - verification boundaries

The manual lifecycle commands plus the separate build command support synthetic local QA. The owner-reported 30-case results are recorded in the [manual QA report](docs/qa/MANUAL-QA-REPORT.md), with the original and isolated runs distinguished. They are historical functional evidence, not native crash-recovery verification. Crash recovery has mock-based verification only and has not been run against the retained session. Database/browser gates and native recovery behavior require separate verification. This is tooling for synthetic local accounts, not production authentication. Postman sends application requests; a separate local helper retrieves confirmation tokens. It is not an entirely Postman-only workflow.

### Prerequisites and preparation (later, after approval)

Use the pinned Node/npm versions, Windows PowerShell/CIM and a running supported local Docker Linux engine. Clipboard delivery additionally requires the disabled-history/sync policy below. No Chromium installation is needed for Manual QA itself. Ordinary application development requires none of this QA setup.

For separately authorized first execution on disposable resources, run sequentially:

```powershell
npm.cmd run manual:build
npm.cmd run manual:prepare
npm.cmd run manual:status
npm.cmd run manual:start
```

`manual:build` only builds source into `.next-manual`; it does not resolve the private runtime or provision resources. It uses a dedicated TypeScript config and leaves the ordinary `.next` build/cache separate. See [Next.js distDir](https://nextjs.org/docs/app/api-reference/config/next-config-js/distDir). `USP_MANUAL_BUILD` is set only in the QA build/server child; do not export it in your development shell.

`manual:prepare` creates a fresh QA-owned container/volume/roles/manifest if no QA manifest exists, then reviews and applies migrations only within the QA resource namespace and prepares its test target. Do not run `db:setup` or `db:migrate` as a Manual QA preparation step. Other commands never provision a missing setup.

Only QA operations resolve `%LOCALAPPDATA%/usp-runtime-<checkout-id>`. Imports remain lazy; no QA environment is needed for normal Prisma config loading/generation/validation. The path hash and LocalApplicationData known-folder check retain their existing policy. Private Windows paths have no permissive fallback. Manual QA transport remains Windows-only; the private POSIX helper also refuses group/other permissions on QA directories.

Before any credential or sensitive control-file write, tools validate the existing parent chain through the volume root, create only missing private directories with an atomic owner-only DACL, and verify the final ACL. Private directories must be owned by the current user, disable inheritance, and have explicit inheritable FullControl for that user; other allow entries are limited to the existing SYSTEM/Administrators trust boundary. Files may inherit only safe rights from these validated directories. Existing directories/files are inspected, never re-ACL'd. Owner mismatch, permissive/inherited directory ACLs, reparse points, incomplete inspection or missing required files cause refusal.

Parent directories may be readable and allow creation of unrelated children, but untrusted effective grants for Delete, DeleteSubdirectoriesAndFiles, ChangePermissions, TakeOwnership, WriteAttributes or WriteExtendedAttributes (including generic write/full control) cause refusal. Owners must be the current user, SYSTEM, Administrators, or Windows TrustedInstaller for OS ancestors only. This detects deletion/replacement and ACL/reparse tampering risks without changing the repository or any existing parent ACL. See Microsoft's [FileSystemRights definitions](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.filesystemrights) and [DirectorySecurity creation API](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.directorysecurity?view=netframework-4.8.1).

Ordinary `.cache/m1b` or browser state does not gate fresh independent QA resources. Existing contents of the protected QA runtime are never re-ACL'd, migrated or overwritten. A foreign/old shared manifest, ambiguous session, unsafe ACL or untrusted path still refuses within QA. Administrator/SYSTEM and same-user tampering remain outside this protection; a restricted agent sandbox must refuse unavailable checks instead of bypassing them.

```powershell
npm.cmd run manual:prepare
npm.cmd run manual:status
npm.cmd run manual:start
```

`manual:prepare` reviews migration history on a disposable target, creates a new test database, applies migrations/grants to that target, verifies its marker/role, and only then marks the manual session prepared. A failed preparation retains incomplete state for inspection; it never resets/adopts an existing database. `manual:start` starts the separate supervised synthetic server without Playwright and waits for matching child-process readiness. Keep this foreground terminal open. HTTP is **http://127.0.0.1:3200**; an occupied port is refused, not killed or changed.

### Accounts and confirmation in Postman

Use `qa.a.<runId>@university.test`, `qa.b.<runId>@university.test`, `qa.c.<runId>@university.test`, and `qa.d.<runId>@university.test`. Create all four through request/confirm. Save profiles for A/B/C; leave D without a profile for permission tests. No sessions or verified users are seeded by the tools.

1. POST `/api/identity/request` with `Origin: http://127.0.0.1:3200`, `Content-Type: application/json` and `{"email":"qa.a.r1@university.test","locale":"en"}`. Expect generic 202; capture `usp_qa_pending` locally. A 202 alone does not prove token issuance.
2. In a second terminal, retrieve exactly that synthetic email:

   ```powershell
   npm.cmd run manual:token -- --email qa.a.r1@university.test
   ```

3. The helper requires **explicitly disabled** Windows clipboard history and cloud clipboard settings (`EnableClipboardHistory` and `EnableCloudClipboard` under `HKCU\Software\Microsoft\Clipboard`, both zero). Missing or enabled settings fail closed. Use reviewed Windows settings/permission setup; the helper does not edit the registry. Third-party clipboard managers are not covered by these checks.
4. The helper reads the existing authenticated loopback TCP mailbox. It copies the token for 30 seconds without printing it, placing it in command arguments/environment variables, or writing it to a file. Paste into a local temporary Postman value. Keep the helper open until completion; it clears the clipboard only if its token is still present. A crash, forced termination, clipboard manager or compromised same-user process can defeat that cleanup; inspect/clear the local clipboard if delivery reports failure.
5. POST `/api/identity/confirm` with the same Origin, JSON `{"token":"<local temporary value>","locale":"en"}`, and `Cookie: usp_qa_pending=<matching pending value>`. The helper does not confirm for you. A valid confirmation returns 200, issues `usp_qa_session`, and clears pending.
6. GET `/api/identity/profile` with the session cookie to verify the intended account. Save a name through POST `/api/identity/profile` when needed.

The QA transport uses `usp_qa_pending` and `usp_qa_session` externally. It strips traditional `usp_m2_*` credentials from incoming QA requests, maps QA credentials to the app internally, and renames only QA response cookies (including logout/expiry). This prevents same-host cookie replacement across ports without changing production authentication logic. The traditional browser helper keeps its original cookies. Historical report cookie names describe its earlier execution.

Keep A/B/C/D pending and session values separate. When using explicit Cookie headers, disable automatic cookie-jar sending for those requests; switching environments alone is not cookie isolation. Do not mix cookies with the same name. Keep credentials out of shared/synced environments, collection exports, console output, screenshots and reports. Existing Origin checks, browser binding, session revocation, peer attestation and rate limits are unchanged. All local users share the loopback IP limit. A confirmation carrying an existing session can revoke that previous session, so do not accidentally send A's cookie while confirming B.

### Stop, resume, inspect and narrowly clean

Type `stop` followed by Enter in the `manual:start` terminal, or press Ctrl+C. The supervisor requests shutdown over its child IPC channel. It waits for confirmed HTTP/TCP closure, Prisma disconnect and removal of matching control metadata. It never kills unrelated processes. An unconfirmed shutdown retains the lock while the child remains alive; interrupted state requires inspection.

```powershell
npm.cmd run manual:status
npm.cmd run manual:start
```

Restart preserves database data, sessions and limits, but the in-memory mailbox is lost; request a new confirmation when needed. Status reports persisted lifecycle state and target identity, **not proof of a live healthy HTTP server**. Verify in Postman: unauthenticated profile GET should return 401 in the synthetic server (503 indicates disabled/unavailable operation), then complete a fresh request/confirm/profile flow.

After a confirmed stop, remove only this session's database:

```powershell
npm.cmd run manual:cleanup
npm.cmd run manual:status
```

Cleanup checks the stopped/prepared/recovered state, the recorded test target, resource ownership and database marker again. It uses DROP without FORCE; remaining connections prevent deletion. It preserves development databases, other test databases, the container, volume and shared credentials. If DROP or manifest persistence fails, the retained `cleaning` state blocks automatic retries until inspection. It never invokes `db:cleanup`.

Under the QA-only private runtime, state is `manual-identity/session.json` and private control is `manual-identity/control.json`. Every resource-changing QA command holds the exclusive `local-db-operation.gate` handle and a persisted `local-db-operation.lock` lease. The gate file is never deleted; OS handle release alone does not authorize stale-lease recovery. Secrets remain under `m1b` in this protected QA runtime; Compose receives only that validated bootstrap path. An unrelated QA lease cannot block ordinary DB commands.

Traditional browser tests retain port 3100, their original mailbox/control contract and their own main-compatible resources. QA uses port 3200 and a separate production build, so neither workflow cleans the other's controls, databases, containers or volumes. Do not run two QA operations against the same QA namespace concurrently; its gate must refuse that attempt. `manual:cleanup` leaves the QA container, volume, internal database and credentials retained for later QA sessions; it never calls ordinary `db:cleanup`. Whole-QA-infrastructure disposal is not implemented by these lifecycle commands and needs a separate reviewed maintenance plan. Never point ordinary cleanup at QA files.

### Explicit crash recovery (Windows, existing test data retained)

`manual:status` reports recorded state, so an OS shutdown can leave `running` after both processes have exited. Recovery is explicit; `manual:start` never repairs active/interrupted state automatically. New starts record the Windows boot timestamp, process creation timestamp, executable, owner SID, PID and parent PID for both server and supervisor, plus a run-scoped lease nonce. The child waits for its supervisor to persist and verify that evidence before opening listeners. No process command line or environment is collected.

For an instrumented run, after reviewing the interruption and authorizing recovery, use these commands in order:

```powershell
npm.cmd run manual:recover
npm.cmd run manual:status
npm.cmd run manual:start
```

Stop if any command refuses. Recovery requires the same private paths and restrictive ACLs, an existing ready test database registered to this session, the recorded Docker context/container ID/labels/volume/loopback binding, and a matching database identity marker. It performs only resource inspection and the existing read-only identity query: no database creation, migration, reset or Docker mutation. Both the original supervisor and server must be authoritatively absent or have a provably later incarnation. Reboot evidence must be consistent; PID absence after a failed OS query is not evidence. Unknown listeners on 3200 or the recorded control port block recovery even when the recorded processes are dead.

On manual child shutdown, listeners/connections and the in-memory mailbox are closed but its control file is retained. Only the supervisor, after an acknowledged zero exit, a persisted matching `stopping` record and current lease verification, retires the exact control bytes observed at startup. Thus supervisor loss while `running` preserves recovery evidence. A crash after retirement leaves durable `stopping` evidence. Unrequested/failed shutdown remains interrupted. This does not repair old runs that already lost evidence; a recorded `running` session without control is still refused.

The QA-only OS gate excludes overlapping start/stop/cleanup/recovery operations. Only an exactly matching, proven-dead `manual-start` lease (or the matching interrupted recovery worker's lease) can be retired. A foreign, legacy, live or ambiguous lease is refused. Control metadata must match session/run/database/PID and recorded port. Before retiring its exact file, recovery atomically records `recovering` and an interruption audit (old process evidence, run ID, timestamp, boot proof and a hash of the control file, never its key). It then writes `recovered`, clearing the old active PID/run. This is not a clean `stopped` acknowledgement. `manual:start` creates a fresh run and key while retaining the same test database and audit history.

After a partial failure, an authorized `manual:recover` retry rechecks all proofs, exact files and the pending audit. A completed retry does not duplicate the interruption record. If `recovering` was committed and only the final rename failed, the deterministic final write can reuse its exact complete temporary file. If the first journal rename failed, a new invocation cannot trust its uncommitted timestamp/ID: competing `session.next*` files cause refusal and remain untouched. A corrupt, foreign or legacy temporary write is never adopted or silently deleted. Fresh preparation also refuses such residue. Corrupt/ambiguous metadata, legacy temporary writes, unavailable CIM/process evidence, insecure ACLs, clock regression or a full 32-record history require inspection; no automated deletion or guessed repair occurs. Failures before a committed journal leave the old control file intact. A power failure or storage fault can still require manual review; Windows handle/CIM behavior and filesystem durability need separately authorized native verification on disposable data.

**Legacy sessions:** sessions created before process-incarnation tracking, or under the prior shared-resource namespace, are not automatically upgraded/adopted; compatible metadata may be inspected for status but cannot supply missing recovery proof. A free port, an absent PID and an operator's reboot report do not supply missing historical process identity or bind an old lease to that run. The currently reported pre-change session falls into this category; do not run the sequence above on it expecting recovery. There is no `--force` flag.

Legacy review is a separate, explicitly authorized maintenance task: suspend other operators/runners; review ownership, restrictive ACLs, non-sensitive OS/process evidence and the exact retained test target; arrange and verify a backup under separate authorization; then prepare a dedicated reviewed migration tool and a concrete plan bound to the protected metadata's snapshot digest, repository/owner/session/database and exact obsolete files. The owner must authorize that specific plan, including how it resolves the missing historical proof, before it can mark the legacy run interrupted and retire metadata. If the ambiguity cannot be resolved, stop and preserve all resources. Do not use ad hoc PowerShell edits/deletions, infer proof from PID alone, or recreate the database. No such legacy migration is implemented or executed here.

Existing PostgreSQL-backed session cookies may remain valid until their fixed expiry or revocation, because the database and credentials are retained. Verify each account using its own cookie in Postman; a restart does not renew a session. The in-memory mailbox is lost, so a new browser-bound request/challenge is needed for a new confirmation. Do not include tokens, cookies or control keys in diagnostics.

### Separate verification gate

Source-only checks (no database lifecycle):

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run check:native-typescript
npm.cmd run build
git diff --check
```

Unit suites use synthetic data and mocked runtime/OS/resource boundaries. Native child processes in unit tests exercise the parser, side-effect-free diagnostic imports, and recovery retry using a serialized virtual filesystem. The retry fixture uses Node's experimental module mocks only in the test worker; operational CLI commands keep their normal runtime flags. Build/typecheck write generated application artifacts, not the protected runtime. These checks do not establish Windows lifecycle reliability.

#### Native Windows verification plan - pending separate approval

This plan is **not executed** by the PR #8 source remediation. Use a disposable Windows VM/account and independent Docker engine/context with no network, mounts, credentials or routes to the current development databases. Approve exact targets and fault-injection actions before starting. Create new independent disposable traditional and QA checkouts; neither may be an active checkout. No suffix or copied profile is required. Use the pinned Node/npm versions, a newly generated unique QA owner ID distinct from the disposable base identity, and a distinct explicitly selected PostgreSQL port. If needed, create a fresh manual-qa.json with its own explicit independent port; copy no existing profile, manifest, runtime secret or database. Use only synthetic data and independently named/labeled containers/volumes. Leave ambiguous failures intact for review.

1. Record the approved checkout/revision, operator, QA identity, exact Docker context/endpoint, container/volume IDs and database names. Independently verify the PostgreSQL port and HTTP 3200 are available, including active IPv4/IPv6 Windows exclusions. Do not stop an existing listener to make room. Add an unrelated synthetic Docker sentinel container/volume in this disposable engine and record its identity/state/data digest for later preservation checks.
2. Verify restrictive ACLs and ancestor policy before reading/creating private test files. On disposable fixtures only, check refusal of foreign grants/owners, reparse points, unreadable files and legacy metadata. Do not repair existing ACLs or change Registry settings. Confirm FileShare.None contention blocks a second worker, and that OS-handle release after termination never bypasses lease identity checks.
3. With separately authorized setup/prepare/start, create synthetic accounts and a small known dataset. Record non-secret row counts/IDs and resource identity. Verify normal stop/restart preserves rows, clears the mailbox, retires the old control credential and generates a fresh run/key. Never print or export keys, cookies, token values or database URLs.
4. Terminate **only the explicitly identified disposable supervisor incarnation**, with the agreed test action. Observe real IPC disconnect and child HTTP/control shutdown; confirm persisted running plus retained control. Explicit recovery must prove both incarnations dead, preserve data, record one interruption and retire the exact old control. Check a fresh start uses fresh credentials. Test child failure and interrupted startup/shutdown separately.
5. Test missing/changed control, foreign Docker identity/marker, occupied port, live process and concurrent recovery/start/cleanup refusals using disposable fixtures. Observe real CIM SID/executable/creation/parent/boot evidence. Reboot and PID-reuse tests need their own approved disposable Windows environment; never reboot the user's current session as an implicit test.
6. Inject write/rename failure on disposable state: an uncommitted journal must cause safe refusal on a new process; a committed journal plus exact final temporary write must retry without duplicate history. Verify partial deletion/write and lease-release failures preserve evidence and never touch unrelated resources.
7. Exercise clipboard transport only after explicit authorization using synthetic tokens under the existing history/sync policy; skip/refuse unsafe policy instead of changing settings. Observe clearing of an unchanged token after the helper's 30-second clipboard window, and verify a newer unrelated clipboard value survives delayed clearing. Check token-helper refusal when the run/control identity has expired or changed. Record only presence/equality outcomes, never token values. Run `db:guard-check`, `db:test`, ordinary browser tests and the synthetic identity browser runner only against this disposable setup, sequentially with no manual server active. These are not part of the source-only remediation.
8. Capture exact commands, OS/runtime versions, exit codes, state transitions and non-secret before/after database/resource evidence. Keep failed/ambiguous state for inspection. Authorize narrow cleanup separately after reviewing the exact disposable target; do not use whole-setup cleanup on either existing QA environment.

Acceptance evidence must separately cover all twelve PR8-03 areas:

| Area | Required native observation on disposable fixtures |
| --- | --- |
| ACL enforcement | Real access attempts from a second untrusted account fail; foreign grants/owners, inheritance and reparse fixtures refuse before sensitive access. Limit any fixture ACL changes to the approved VM targets. |
| Process identity | Real CIM evidence matches SID, executable, creation, parent and boot identity; changed/unknown evidence refuses. PID reuse/reboot simulations need their separately approved VM actions. |
| FileShare locking | Two independent workers contend for the same gate; only one holds it, and OS release after worker exit does not authorize stale-lease adoption. |
| Normal supervisor lifecycle | Prepared/start/stop/restart transitions use the exact child/supervisor identities; listener closes and new run/control credentials replace the old ones. |
| IPC disconnect | Separately inject IPC loss while the disposable supervisor remains alive; child shuts down safely without treating missing IPC alone as recovery proof. |
| Unexpected supervisor termination | Terminate only the recorded disposable supervisor incarnation; observe child shutdown and retained interruption evidence, including interrupted startup/shutdown. |
| Insufficient recovery evidence | Missing/changed control, live/unknown/reused process, foreign resource marker or ambiguous journal refuses and preserves files/rows/resources. |
| Complete recovery evidence | Proven-dead child and supervisor plus exact owned target permit one recovery; retry is idempotent and a later start uses fresh credentials. |
| Concurrent operations | Race start/recover/cleanup in separate processes; only one authorized mutation occurs, others refuse, and no duplicate history or orphaned target results. |
| Clipboard lifecycle | Unchanged synthetic token expires/clears; newer clipboard content survives; unsafe history/sync policy refuses without changing settings. |
| Unrelated Docker resources | Sentinel IDs, labels, running state and synthetic volume digest remain unchanged after every lifecycle/fault case. No broad Docker cleanup. |
| Interrupted-operation data | Compare synthetic row IDs/counts and deterministic content digests before/after crash, recovery and journal retry; no loss/duplication and no development target access. |

Record each case as planned/executed/pass/fail with actual evidence and limitations. Unit/mocked success cannot fill a native result. This plan does not validate any migration of an existing installation.

Compatibility-specific native checks must also use disposable Windows fixtures: observe both localized netsh exclusion tables and QA new-setup refusal before writes; check the QA config validation and conflicting configured/manifest ports; verify metadata-only diagnostics preserve unreadable/reparse/legacy gate/transfer artifacts. No actual legacy migration command exists, so this plan cannot certify migration commit/retry/rollback until a separate reviewed design is implemented.

M2 remains open until these actual observations are recorded. The 30 owner-reported Postman outcomes and mocked regressions remain distinct evidence categories.

Operational diagnostics use fixed classifications for malformed protected manifest/session/control/lease JSON. The local CLI formats unexpected exceptions as generic database/manual failures instead of echoing raw messages. Recovery retains its fixed refusal codes. Network mailbox parsing and server/ACL/CIM boundaries already suppress raw exceptions. This is scoped tooling hardening, not a claim that every third-party CLI, application log or future diagnostic is sanitized.

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
| `/{locale}/communities/{id}` | View a community and join or manage membership |

Protected flows require the synthetic runner. Check both languages, Arabic RTL, keyboard focus, validation messages and mobile widths. `/fr` should return 404; the current generic 404 page is English.

## Security and release limits

- Profile access is owner-only. Community APIs recheck sessions, membership and creator permissions on the server.
- Verified users can discover private community names/descriptions; private spaces require current membership. A saved profile is required to create a community. Teachers receive no automatic privileges.
- Test sign-in links expire after ten minutes, are single-use and are bound to the requesting browser. Sessions last seven days; logout revokes them. HTTP cookies are a loopback test exception, not deployed HTTPS security.
- Known dependency advisories remain under recorded exceptions, with review due **2026-11-09**. Prisma is release-gated; braces is mitigated, not fixed. See the [security review](docs/project-brief.md#security-audit-and-complete-advisory-exceptions).
- Tests currently cover Chromium. Live email delivery, real-user usability, screen readers and deployment remain unverified.

Before real-user use, resolve provider, privacy, account lifecycle, teacher/moderation and hosting decisions, and complete the [release checklist](docs/project-brief.md#before-public-release). Third-party notices are an incomplete inventory; shipped artifacts still need license and attribution review.

## Project documents

- [Abstract](docs/abstract.md): minimum feature scope and specified stack.
- [Project brief](docs/project-brief.md): decisions, permissions, acceptance criteria and test history.
- [Latest idea notes](docs/graduation-project-notes.txt): proposed refinements and later work.
- [AGENTS.md](AGENTS.md): instructions for coding agents.
- [Third-party notices](THIRD-PARTY-NOTICES.md) and [manifest](docs/third-party-licenses/manifest.json): collected licenses, sources and hashes.
- [Maintenance notes](docs/project-brief.md#maintenance-notes-retained-from-readme--2026-10-10): Unicode generation, audit commands and historical diagnostics.
