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

Docker must already be running with a supported local Linux engine. The guarded scripts use the pinned PostgreSQL image and Prisma versions; they do not start Docker Desktop. Container PostgreSQL remains on port **5432**, exposed only on **127.0.0.1**.

### New contributor

After these reviewed changes are integrated, clone the shared repository and use the pinned Node/npm versions:

```powershell
git clone https://github.com/ShakerMasri/university-social-platform.git
Set-Location -LiteralPath university-social-platform
npm.cmd ci
```

Normal `npm.cmd run dev` shows the application shell; live email and community database flows remain disabled outside the explicit synthetic launcher. Optional database tooling is a separate workflow.

The baseline PostgreSQL host port for a **new ordinary setup** is **55432**. If that port is unavailable or excluded on your machine, configure a different local port without changing shared source or using a QA-specific directory name. [local-database.example.json](local-database.example.json) shows the shape; its root placeholder must be replaced. Prefer this exclusive-create generator, run from your checkout:

```powershell
$taskPostgresPort = Read-Host 'PostgreSQL host port for this checkout'
@'
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateLocalDatabaseConfig } from "./tools/database/local-database.ts";
const settings = validateLocalDatabaseConfig({
  version: 1, root: resolve("."), postgresPort: Number(process.argv[2])
});
writeFileSync("local-database.json", JSON.stringify(settings, null, 2) + "\n",
  { flag: "wx", mode: 0o600 });
console.log("Created local settings; no resources provisioned");
'@ | node --input-type=module - $taskPostgresPort
if ($LASTEXITCODE -ne 0) { throw 'Local configuration refused; inspect without overwriting existing settings' }
git check-ignore local-database.json
```

`local-database.json` is optional, ignored and bound to the absolute checkout root; copied, malformed, linked or unreadable files are refused. It contains only local configuration, never credentials. Do not sync or commit it. The generator does not overwrite an existing file; Windows file permissions inherit from your checkout, while the protected credential runtime keeps its independent strict ACL policy. Configuration does not reserve a port.

Port selection follows these rules:

| Situation | Behavior |
| --- | --- |
| Fresh ordinary checkout, no local settings | Use baseline 55432 |
| Fresh ordinary checkout with local settings | Use the explicitly validated port |
| Existing ownership manifest | Keep its recorded port/owner/database; never replace it with the default |
| Isolated QA profile | Keep its configured identity and port |
| Local settings disagree with isolation or an existing manifest | Refuse with `LOCAL_PORT_CONFLICT`; no automatic port/database change |

Recorded ports **15432**, **15433** and **55432** remain supported. Existing installations do not need an override just to keep their manifest's port. To change an existing resource's port requires a separate reviewed operation; editing the local override does not migrate it.

Before provisioning on Windows, setup reads both active IPv4 and IPv6 TCP excluded-port tables with read-only [netsh show commands](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-interface), then performs a loopback bind/close check. An unavailable/ambiguous exclusion query, excluded port, occupied port or failed closure refuses setup before credential/resource creation. POSIX uses the same loopback binding check without Windows commands. Setup never picks another port or changes exclusions/Registry. Preflight is not a reservation; a later collision may still cause provisioning to fail and require inspection.

First run `npm.cmd run db:compatibility`. If it reports blocking legacy markers, follow the Existing contributor workflow. A clear result is only metadata guidance, not resource/ACL/ownership proof. For a new, separately authorized local setup, run each step only after its predecessor succeeds:

```powershell
npm.cmd run db:setup
npm.cmd run db:status
npm.cmd run build
```

Install Chromium as described above. Review migrations before using `db:review` and `db:migrate`. The separate `db:guard-check`, `db:test` and `test:e2e:identity` checks create/mutate/remove disposable test targets; they are not read-only diagnostics and must not run alongside a manual server.

The synthetic browser/manual endpoint stays **http://127.0.0.1:3100**. Do not stop another developer's server or silently change Origin to make room. Database ports and identities are independent; concurrent HTTP runners on this endpoint are unsupported. Optional manual QA/clipboard/recovery tooling currently requires Windows; ordinary application commands and existing POSIX database paths retain their own support boundaries.

### Existing contributor

Preserve your current operational files and Docker/database resources before adopting the new tooling. Do not copy credentials into a new checkout, recreate containers, delete a manifest/lock/control, or run setup/cleanup/recovery to repair an upgrade.

Run this **metadata-only** diagnostic from the checkout being assessed:

```powershell
npm.cmd run db:compatibility
```

It inspects only the existence/type of known paths under `.cache`, without reading manifest/session/control contents, checking live Docker/process state, or modifying anything. Exit **0** means no blocking marker was observed (or the legacy Windows rule is not applicable on POSIX); **2** means preserve state and review; **1** means diagnostic failure/invalid arguments. It has no `--force`, migration or cleanup option. Repeating it is non-mutating, not a migration retry.

On POSIX, `.cache` remains the supported runtime layout, subject to ownership/private-mode checks. On Windows, new protected runtime data lives in `%LOCALAPPDATA%/usp-runtime-<checkout-id>`. Existing Windows `.cache/m1b`, manual-session/control, lifecycle lock/gate or ambiguous/linked legacy metadata **blocks** database/manual operations with `LEGACY_RUNTIME`. This intentionally preserves the old resources; it does **not** provide a compatible migration of an older installation.

For a previously prepared protected runtime at the same checkout root, inspect with `npm.cmd run db:status` after a clear compatibility result. Its recorded ownership/port remain authoritative; invalid ACLs, mismatched resources and conflicting local settings refuse. A missing manifest is not permission to provision over existing or uncertain resources.

**Legacy decision C: separate reviewed transition required.** No opt-in migration command is implemented. Old development metadata cannot safely be treated as inactive when old tooling supplied no lifecycle lease. Legacy QA running/stopped/interrupted labels, a reboot report, PID absence or a free port do not establish missing historical process identity. The diagnostic does not inspect those private labels or claim they are clean. Interrupted/ambiguous transfer artifacts remain preserved; repeated diagnostics never adopt them.

Before a future transition is authorized, prepare a concrete plan for that developer's exact checkout/owner/resource IDs: verify a protected recoverable backup, establish that all operators/old tools are quiescent using adequate evidence, validate existing/destination ACLs and exact Docker/database markers, fence concurrent work, journal copy/verification without deleting the source, and define interruption/retry/rollback. Never reset a database, alter existing ACLs, reuse old control credentials, infer missing run history or overwrite another target. If trustworthy evidence is unavailable, stop and preserve the installation. Real transition and native Windows verification need separate approval on disposable fixtures before use on an existing installation.

Use the guarded scripts rather than direct Compose commands. Compose's bootstrap-secret path is supplied from the validated private runtime, not inherited ambient configuration. If eventual cleanup is explicitly chosen, `db:cleanup` deletes the entire owned setup; it is not an upgrade or compatibility step.

## Isolated Manual QA checkout

A normal fresh checkout does not need an isolation profile for unit tests, typechecking or building. Its optional `local-database.json` selects a local PostgreSQL port without QA-specific naming. The existing `qa-isolation.json` remains a separate stricter policy; if both files exist, their ports must agree. A checkout whose directory ends in `-qa-isolated` **requires** its own valid `qa-isolation.json`; missing, unreadable, malformed or copied configuration is refused without falling back to another owner or database.

[qa-isolation.example.json](qa-isolation.example.json) is a deliberately invalid template. The actual `qa-isolation.json` is machine-local and Git-ignored. Never commit it, force-add it, copy a source manifest, or import another checkout's private runtime files. The existing local profile is preserved. Historical machine-specific setup notes remain in [the project brief](docs/project-brief.md#isolated-manual-qa-option-b---2026-10-17); the [manual report](docs/qa/MANUAL-QA-REPORT.md) records owner-reported results separately.

For a new isolated checkout, choose a path exactly equal to the absolute source checkout path plus `-qa-isolated`. Run the following **only from that new checkout**, after confirming the source's non-secret owner ID/port and choosing a distinct PostgreSQL port. The generator validates the inputs and exclusively creates the local file; it refuses to overwrite an existing profile. It does not provision a database.

```powershell
$taskSourceRoot = Read-Host 'Absolute source checkout path'
$taskSourceOwner = Read-Host 'Source owner ID (12 lowercase hex characters)'
$taskSourcePort = Read-Host 'Source PostgreSQL port'
$taskIsolatedPort = Read-Host 'New distinct PostgreSQL port'
@'
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateIsolationProfile } from "./tools/database/isolation.ts";
const [sourceRoot, sourceOwner, sourcePort, postgresPort] = process.argv.slice(2);
const profile = validateIsolationProfile({
  version: 1, root: resolve("."), sourceRoot, sourceOwner,
  sourcePort: Number(sourcePort), owner: randomBytes(6).toString("hex"),
  postgresPort: Number(postgresPort)
});
writeFileSync("qa-isolation.json", JSON.stringify(profile, null, 2) + "\n", { flag: "wx" });
console.log("Created a validated local isolation profile; no resources provisioned");
'@ | node --input-type=module - $taskSourceRoot $taskSourceOwner $taskSourcePort $taskIsolatedPort
if ($LASTEXITCODE -ne 0) { throw 'Profile generation refused; stop and inspect' }
git check-ignore qa-isolation.json
```

The owner is independently random; validation rejects source-owner reuse. Setup checks existing container/volume names, project/ownership labels and loopback binding before creating resources. Check Windows IPv4/IPv6 excluded port ranges and availability when choosing the port; a successful check is not a reservation. No fixed example port is guaranteed available. The HTTP endpoint remains **http://127.0.0.1:3100**; if it is occupied, defer testing instead of stopping another server.

Runtime paths are derived from the absolute checkout path. Every manifest read rechecks the configured root/owner/port before callers use credentials. Existing Docker context/container-ID/labels/volume/binding checks, database markers, process incarnation checks and private ACL requirements remain mandatory.

For separately authorized first execution on disposable resources, run sequentially from the isolated checkout:

```powershell
npm.cmd run check:native-typescript
npm.cmd run build
npm.cmd run db:setup
npm.cmd run manual:prepare
npm.cmd run manual:status
npm.cmd run manual:start
```

Run each command only after its predecessor exits successfully; stop on any refusal and retain partial state. Do not use setup to repair an existing session. Keep the start terminal open; use the manual workflow below for separate synthetic accounts and Postman cookie isolation. Never reuse source cookies or its token helper.

The native TypeScript check parses the tooling's runtime import graph with Node's strip-only parser; it does not execute lifecycle entrypoints or verify Windows ACL, CIM, clipboard, IPC or database behavior. It is necessary in addition to Vitest/Next transforms. No native lifecycle experiment was run during the 2026-10-19 remediation.

## Manual Postman QA tooling - verification boundaries

The six `manual:*` commands support synthetic local QA. The owner-reported 30-case results are recorded in the [manual QA report](docs/qa/MANUAL-QA-REPORT.md), with the original and isolated runs distinguished. They are historical functional evidence, not native crash-recovery verification. Crash recovery has mock-based verification only and has not been run against the retained session. Database/browser gates and native recovery behavior require separate verification. This is tooling for synthetic local accounts, not production authentication. Postman sends application requests; a separate local helper retrieves confirmation tokens. It is not an entirely Postman-only workflow.

### Prerequisites and preparation (later, after approval)

Use the pinned Node/npm versions above, a running local Docker Linux engine, and a production build. No new dependencies or Chromium installation are needed for the manual workflow itself. If dependencies are not installed, `npm.cmd ci` installs from the lockfile and generates Prisma. The existing `db:generate` command is available if generation is needed separately.

```powershell
npm.cmd run db:validate
npm.cmd run build
```

If `m1b/manifest.json` exists in the private runtime directory, inspect with `npm.cmd run db:status`; otherwise use `npm.cmd run db:setup`. Never use setup to overwrite a failed existing setup. Manual preparation reuses the guarded local PostgreSQL container but creates its own **registered test database**. It does not migrate or use the development database for application requests. Do not run `db:migrate` as a manual-QA preparation step.

All guarded Windows database/manual/browser tools share **`%LOCALAPPDATA%\usp-runtime-<checkout-id>\`**, outside the repository. The ID is the first 24 hexadecimal characters of SHA-256 of the lowercase absolute checkout path. [runtime-files.ts](tools/database/runtime-files.ts) is the authoritative resolver; PowerShell also checks the base against Windows' LocalApplicationData known folder. There is no CLI path override or permissive fallback. On POSIX, database/browser tools retain their existing `.cache/` layout; manual QA still requires Windows.

Before any credential or sensitive control-file write, tools validate the existing parent chain through the volume root, create only missing private directories with an atomic owner-only DACL, and verify the final ACL. Private directories must be owned by the current user, disable inheritance, and have explicit inheritable FullControl for that user; other allow entries are limited to the existing SYSTEM/Administrators trust boundary. Files may inherit only safe rights from these validated directories. Existing directories/files are inspected, never re-ACL'd. Owner mismatch, permissive/inherited directory ACLs, reparse points, incomplete inspection or missing required files cause refusal.

Parent directories may be readable and allow creation of unrelated children, but untrusted effective grants for Delete, DeleteSubdirectoriesAndFiles, ChangePermissions, TakeOwnership, WriteAttributes or WriteExtendedAttributes (including generic write/full control) cause refusal. Owners must be the current user, SYSTEM, Administrators, or Windows TrustedInstaller for OS ancestors only. This detects deletion/replacement and ACL/reparse tampering risks without changing the repository or any existing parent ACL. See Microsoft's [FileSystemRights definitions](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.filesystemrights) and [DirectorySecurity creation API](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.directorysecurity?view=netframework-4.8.1).

Legacy `.cache/m1b/`, `.cache/manual-identity/`, browser-control or lifecycle lock/gate state, linked paths and inspection errors block relocation on Windows. Use the metadata-only `db:compatibility` diagnostic and Existing contributor workflow. There is no automatic copying, adoption, opt-in migration or cleanup of old credentials/resources; the transition remains a separately authorized review. Administrator/SYSTEM, programs running as your own account, and concurrent ACL changes by these trusted actors remain outside this protection. A restricted agent sandbox may also be unable to inspect ancestors or have a different SID from the desktop owner; it must refuse rather than bypass those checks.

```powershell
npm.cmd run manual:prepare
npm.cmd run manual:status
npm.cmd run manual:start
```

`manual:prepare` reviews migration history on a disposable target, creates a new test database, applies migrations/grants to that target, verifies its marker/role, and only then marks the manual session prepared. A failed preparation retains incomplete state for inspection; it never resets/adopts an existing database. `manual:start` starts the existing synthetic server without Playwright and waits for matching child-process readiness. Keep this foreground terminal open. HTTP is **http://127.0.0.1:3100**; an occupied port is refused, not killed or changed.

### Accounts and confirmation in Postman

Use `qa.a.<runId>@university.test`, `qa.b.<runId>@university.test`, `qa.c.<runId>@university.test`, and `qa.d.<runId>@university.test`. Create all four through request/confirm. Save profiles for A/B/C; leave D without a profile for permission tests. No sessions or verified users are seeded by the tools.

1. POST `/api/identity/request` with `Origin: http://127.0.0.1:3100`, `Content-Type: application/json` and `{"email":"qa.a.r1@university.test","locale":"en"}`. Expect generic 202; capture `usp_m2_pending` locally. A 202 alone does not prove token issuance.
2. In a second terminal, retrieve exactly that synthetic email:

   ```powershell
   npm.cmd run manual:token -- --email qa.a.r1@university.test
   ```

3. The helper requires **explicitly disabled** Windows clipboard history and cloud clipboard settings (`EnableClipboardHistory` and `EnableCloudClipboard` under `HKCU\Software\Microsoft\Clipboard`, both zero). Missing or enabled settings fail closed. Use reviewed Windows settings/permission setup; the helper does not edit the registry. Third-party clipboard managers are not covered by these checks.
4. The helper reads the existing authenticated loopback TCP mailbox. It copies the token for 30 seconds without printing it, placing it in command arguments/environment variables, or writing it to a file. Paste into a local temporary Postman value. Keep the helper open until completion; it clears the clipboard only if its token is still present. A crash, forced termination, clipboard manager or compromised same-user process can defeat that cleanup; inspect/clear the local clipboard if delivery reports failure.
5. POST `/api/identity/confirm` with the same Origin, JSON `{"token":"<local temporary value>","locale":"en"}`, and `Cookie: usp_m2_pending=<matching pending value>`. The helper does not confirm for you. A valid confirmation returns 200, issues `usp_m2_session`, and clears pending.
6. GET `/api/identity/profile` with the session cookie to verify the intended account. Save a name through POST `/api/identity/profile` when needed.

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

Under the shared private runtime directory, state is stored at `manual-identity/session.json`; private control credentials are in `manual-identity/control.json` (or `m2-browser.json` for Playwright). On Windows, all resource-changing commands hold an exclusive OS file handle on `local-db-operation.gate` and a persisted `local-db-operation.lock` lease. The empty gate file is never deleted; its handle is released by the OS when its helper exits. Database secrets remain under `m1b/`; Compose receives only the validated absolute bootstrap-secret path, overriding ambient interpolation. Do not run database checks/migrations or the synthetic Playwright runner concurrently with the manual server. Whole-setup `db:cleanup` refuses while a retained manual session exists. Ordinary browser tests also require port 3100 free. After a crash, never delete a stale lock/control file, edit session/manifest state, adopt a database, or kill a PID just to unblock a command. There is no force/reset bypass; use the explicit recovery procedure below when its evidence is available.

### Explicit crash recovery (Windows, existing test data retained)

`manual:status` reports recorded state, so an OS shutdown can leave `running` after both processes have exited. Recovery is explicit; `manual:start` never repairs active/interrupted state automatically. New starts record the Windows boot timestamp, process creation timestamp, executable, owner SID, PID and parent PID for both server and supervisor, plus a run-scoped lease nonce. The child waits for its supervisor to persist and verify that evidence before opening listeners. No process command line or environment is collected.

For an instrumented run, after reviewing the interruption and authorizing recovery, use these commands in order:

```powershell
npm.cmd run manual:recover
npm.cmd run manual:status
npm.cmd run manual:start
```

Stop if any command refuses. Recovery requires the same private paths and restrictive ACLs, an existing ready test database registered to this session, the recorded Docker context/container ID/labels/volume/loopback binding, and a matching database identity marker. It performs only resource inspection and the existing read-only identity query: no database creation, migration, reset or Docker mutation. Both the original supervisor and server must be authoritatively absent or have a provably later incarnation. Reboot evidence must be consistent; PID absence after a failed OS query is not evidence. Unknown listeners on 3100 or the recorded control port block recovery even when the recorded processes are dead.

On manual child shutdown, listeners/connections and the in-memory mailbox are closed but its control file is retained. Only the supervisor, after an acknowledged zero exit, a persisted matching `stopping` record and current lease verification, retires the exact control bytes observed at startup. Thus supervisor loss while `running` preserves recovery evidence. A crash after retirement leaves durable `stopping` evidence. Unrequested/failed shutdown remains interrupted. This does not repair old runs that already lost evidence; a recorded `running` session without control is still refused.

The shared OS gate excludes overlapping start/stop/cleanup/recovery operations. Only an exactly matching, proven-dead `manual-start` lease (or the matching interrupted recovery worker's lease) can be retired. A foreign, legacy, live or ambiguous lease is refused. Control metadata must match session/run/database/PID and recorded port. Before retiring its exact file, recovery atomically records `recovering` and an interruption audit (old process evidence, run ID, timestamp, boot proof and a hash of the control file, never its key). It then writes `recovered`, clearing the old active PID/run. This is not a clean `stopped` acknowledgement. `manual:start` creates a fresh run and key while retaining the same test database and audit history.

After a partial failure, an authorized `manual:recover` retry rechecks all proofs, exact files and the pending audit. A completed retry does not duplicate the interruption record. If `recovering` was committed and only the final rename failed, the deterministic final write can reuse its exact complete temporary file. If the first journal rename failed, a new invocation cannot trust its uncommitted timestamp/ID: competing `session.next*` files cause refusal and remain untouched. A corrupt, foreign or legacy temporary write is never adopted or silently deleted. Fresh preparation also refuses such residue. Corrupt/ambiguous metadata, legacy temporary writes, unavailable CIM/process evidence, insecure ACLs, clock regression or a full 32-record history require inspection; no automated deletion or guessed repair occurs. Failures before a committed journal leave the old control file intact. A power failure or storage fault can still require manual review; Windows handle/CIM behavior and filesystem durability need separately authorized native verification on disposable data.

**Legacy sessions:** sessions created before process-incarnation tracking remain readable for status but are not eligible for automatic recovery. A free port, an absent PID and an operator's reboot report do not supply missing historical process identity or bind an old lease to that run. The currently reported pre-change session falls into this category; do not run the sequence above on it expecting recovery. There is no `--force` flag.

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

1. Approve the exact disposable checkout, operator account, ownership ID, database names and test actions. Use a **new** checkout/path-derived runtime, independent of both existing QA checkouts; use the pinned Node/npm versions. Generate its own local profile and independently verify its PostgreSQL port and port 3100 are available. Do not stop an existing listener to make room.
2. Verify restrictive ACLs and ancestor policy before reading/creating private test files. On disposable fixtures only, check refusal of foreign grants/owners, reparse points, unreadable files and legacy metadata. Do not repair existing ACLs or change Registry settings. Confirm FileShare.None contention blocks a second worker, and that OS-handle release after termination never bypasses lease identity checks.
3. With separately authorized setup/prepare/start, create synthetic accounts and a small known dataset. Record non-secret row counts/IDs and resource identity. Verify normal stop/restart preserves rows, clears the mailbox, retires the old control credential and generates a fresh run/key. Never print or export keys, cookies, token values or database URLs.
4. Terminate **only the explicitly identified disposable supervisor incarnation**, with the agreed test action. Observe real IPC disconnect and child HTTP/control shutdown; confirm persisted running plus retained control. Explicit recovery must prove both incarnations dead, preserve data, record one interruption and retire the exact old control. Check a fresh start uses fresh credentials. Test child failure and interrupted startup/shutdown separately.
5. Test missing/changed control, foreign Docker identity/marker, occupied port, live process and concurrent recovery/start/cleanup refusals using disposable fixtures. Observe real CIM SID/executable/creation/parent/boot evidence. Reboot and PID-reuse tests need their own approved disposable Windows environment; never reboot the user's current session as an implicit test.
6. Inject write/rename failure on disposable state: an uncommitted journal must cause safe refusal on a new process; a committed journal plus exact final temporary write must retry without duplicate history. Verify partial deletion/write and lease-release failures preserve evidence and never touch unrelated resources.
7. Exercise clipboard transport only after explicit authorization using synthetic tokens under the existing history/sync policy; skip/refuse unsafe policy instead of changing settings. Run `db:guard-check`, `db:test`, ordinary browser tests and the synthetic identity browser runner only against this disposable setup, sequentially with no manual server active. These are not part of the source-only remediation.
8. Capture exact commands, OS/runtime versions, exit codes, state transitions and non-secret before/after database/resource evidence. Keep failed/ambiguous state for inspection. Authorize narrow cleanup separately after reviewing the exact disposable target; do not use whole-setup cleanup on either existing QA environment.

Compatibility-specific native checks must also use disposable Windows fixtures: observe both localized netsh exclusion tables and new-setup refusal before writes; check the local-config generator and conflicting profile/manifest paths; verify metadata-only diagnostics preserve unreadable/reparse/legacy gate/transfer artifacts. No actual legacy migration command exists, so this plan cannot certify migration commit/retry/rollback until a separate reviewed design is implemented.

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
