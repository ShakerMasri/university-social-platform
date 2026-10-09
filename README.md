# University Social Learning Platform

A Computer Engineering graduation project for university students and teachers to share academic discussions, find relevant communities, preserve knowledge across academic years, and receive source-based AI assistance.

## Project documents

- [Abstract](docs/abstract.md): minimum feature scope and specified stack.
- [Latest project notes](docs/graduation-project-notes.txt): current design ideas and revisions; supersede older idea files. Tentative statements remain tentative.
- [Project brief](docs/project-brief.md): requirements, acceptance criteria, decisions, milestones, backlog, and progress.
- [Agent instructions](AGENTS.md): repository working and security rules.

## Foundation and runtime

M1a provides a minimal Next.js App Router shell at `/en` and `/ar`, with typed translations, English LTR, Arabic RTL, keyboard-accessible language links, and plain responsive CSS. `/` temporarily redirects (HTTP 307) to `/en`: an initial, reversible default in `src/i18n/locales.ts`, without browser-language detection or stored preferences. Unsupported locales return 404. No separate product name has been chosen.

Use **Node.js 24.21.0 LTS and its bundled npm 11.19.0**, pinned by `.node-version`, `package.json`, and strict engine checking. Versions were checked on 2026-10-08 against the [official Node release index](https://nodejs.org/dist/index.json). Use a version manager or an official portable distribution; no global tooling or PowerShell policy change is needed.

Direct dependencies are pinned, with transitive versions captured by `package-lock.json`: Next.js 16.4.0, React/React DOM 19.3.0, TypeScript 6.0.3, ESLint 10.12.0, Vitest 5.0.3, and Playwright 1.64.0. TypeScript 7 exceeds the lint parser's declared support (`<6.1`). The stock Next.js lint preset pulls in plugins supporting only ESLint 9, which is [end-of-life](https://eslint.org/version-support/). Instead, ESLint 10 uses compatible JS/TypeScript recommended rules, the official Next.js recommended/Core Web Vitals plugin, and React Hooks recommended rules. JSX accessibility is checked in the focused browser/manual review; no JSX accessibility lint plugin is configured. Direct dependencies use MIT or Apache-2.0 licenses; no external assets, fonts, or UI libraries are added.

References used: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [locale layouts](https://nextjs.org/docs/app/guides/internationalization), [ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint), [React versions](https://react.dev/versions), [TypeScript setup](https://www.typescriptlang.org/download/), [Vitest](https://vitest.dev/guide/), and [Playwright CI](https://playwright.dev/docs/ci). Exact compatibility ranges were checked using official npm registry metadata.

PostgreSQL and Prisma are the specified database stack for M1b. The isolated local foundation below adds persistence and database tests; no authentication, live email, provider integration or deployment is included. The shell itself needs no service account. Initial dependency, engine and browser installation requires internet access.

## Fresh-checkout setup

From the repository root, activate the pinned Node version and confirm `node --version` is `v24.21.0` and `npm --version` is `11.19.0`. Then:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000/en` or `http://localhost:3000/ar`. Stop the server with Ctrl+C.

On Windows PowerShell, use `npm.cmd` and `npx.cmd` to avoid the execution-policy restriction on their `.ps1` wrappers:

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

For the repository-local portable runtime used in this checkpoint, prepend its directory to **this shell only** before running commands:

```powershell
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
```

`.tools/` is ignored and is not part of a fresh checkout. If using this option, obtain the matching Windows x64 ZIP from the official Node distribution, verify its SHA-256 against that release's `SHASUMS256.txt`, and extract under `.tools/`. Otherwise activate the same version with your existing version manager.

For repository-local browser downloads, also set this in the same PowerShell session before installing Chromium and running browser tests (as done for this checkpoint):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.cache\ms-playwright"
npx.cmd playwright install chromium
```

## Verification and production preview

| Purpose | Command | Windows equivalent |
| --- | --- | --- |
| Reproducible installation | `npm ci` | `npm.cmd ci` |
| Lint | `npm run lint` | `npm.cmd run lint` |
| Generate route types and typecheck | `npm run typecheck` | `npm.cmd run typecheck` |
| Locale unit tests | `npm test` | `npm.cmd test` |
| Production build | `npm run build` | `npm.cmd run build` |
| Install Chromium once | `npx playwright install chromium` | `npx.cmd playwright install chromium` |
| Production browser checks | `npm run test:e2e` | `npm.cmd run test:e2e` |
| Production preview after build | `npm start` | `npm.cmd start` |

Run the checks in the listed order. `test:e2e` requires a completed build and launches/stops its own production server at `127.0.0.1:3100`; keep that port free. On Linux, browser installation may require `npx playwright install --with-deps chromium`. Tests use only Chromium, not live email, AI, or a database. Generated types, build output, browser diagnostics, caches, portable tools, and `.env*` secrets are ignored.

`.github/workflows/checks.yml` uses the pinned runtime, verifies bundled npm, runs `npm ci`, lint, typecheck, unit tests, build, installs Chromium with Linux dependencies, and runs the browser checks. Creating the workflow is not evidence that GitHub CI has run.

Local Windows results on 2026-10-08, using the pinned portable runtime:

- `npm.cmd ci --no-fund`: successful clean lockfile installation.
- `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build`: passed. Build prerendered `/en` and `/ar`.
- `npm.cmd test`: 19 tests passed. An initial sandbox process-spawn restriction required rerunning with worker permissions; the test/configuration checks were preserved. The Vitest configuration uses `.mjs` to avoid a CommonJS/ESM loader warning.
- `npx.cmd playwright install chromium`: completed; `npm.cmd run test:e2e`: six production-server Chromium checks passed, including keyboard skip/language links and focus, `lang`/`dir`, redirect, 404, and 360px layouts without horizontal overflow. A terminal color-environment warning did not affect results.
- `npm.cmd run dev -- --hostname 127.0.0.1 --port 3000`: started successfully. A temporary local HTTP diagnostic (`node .cache/dev-smoke.mjs`, not shipped) confirmed `/en` and `/ar` return 200 with correct `lang`/`dir`, `/` returns 307 to `/en`, and `/fr` returns 404. Its first inline invocation failed because PowerShell stripped argument quotes; the file-based diagnostic passed. The server was stopped after checks.
- `npm.cmd start -- --hostname 127.0.0.1 --port 3200`: started the final production build. `node .cache/dev-smoke.mjs http://127.0.0.1:3200 production` confirmed the same locale attributes and HTTP responses; the server was stopped afterward.
- Manually reviewed the English/Arabic mobile screenshots: readable content, mirrored alignment and border placement, and usable language links. Interactive manual browser review was unavailable because no browser surface was connected; keyboard behavior was verified by Playwright. No screen-reader audit or usability study was performed.
- Source preservation hashes, local documentation links, workflow YAML syntax, ignore rules, and changed-file whitespace were checked. GitHub CI was not verified during that local checkpoint; subsequent evidence is recorded below.

GitHub evidence inspected on 2026-10-09: the private repository's [Application checks run for `263da4f`](https://github.com/ShakerMasri/university-social-platform/actions/runs/37801738234) completed successfully on `ubuntu-latest`. The job records successful checkout, pinned Node/npm verification, `npm ci`, lint, typecheck, unit tests, build, Chromium installation with Linux dependencies, and production browser tests. This provides fresh Linux CI execution evidence for that exact implementation commit, not an independent manual Linux setup or a result for later uncommitted documentation changes.

`next dev` initially appended framework guidance to AGENTS.md. Its exact original bytes were restored and verified, and the documented [`agentRules: false`](https://nextjs.org/docs/app/api-reference/config/next-config-js/agentRules) setting prevents regeneration. A subsequent dev startup preserved the source; affected lint/typecheck/build checks passed again.

## Recorded dependency risk

The [2026-10-09 M1a resolution attempt](docs/project-brief.md#m1a-dependency-resolution-attempt--2026-10-09) rechecked the current merged tree. `npm ls braces --omit=dev` is empty; both rebuilt server traces omit braces/Vite. The dev lint chain and Vite's bundled copy remain vulnerable: upstream still lists no patched braces version, and `^3.0.3` would select the same affected version. No ineffective override, forced downgrade or lockfile change was made. The production audit now exits 1 with four high-severity entries in Prisma's shared dependency tree (three advisories already recorded by M1b); the earlier zero-entry foundation-only audit below is historical. Dev-only classification and unused request paths are not a dependency fix or final-artifact exclusion proof.

The 2026-10-08 review traced two copies of vulnerable `braces@3.0.3`. The [GHSA-vfj7-8cjw-p6xm advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) describes stack exhaustion from deeply nested patterns; the character-length limit does not bound nesting depth. No patched release was available at that review. This follow-up reuses that investigation; it does not claim a new full audit.

| Copy and call path | Current configuration-based mitigation |
| --- | --- |
| `@next/eslint-plugin-next@16.4.0 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3` | The Next lint helper calls glob expansion only for `settings.next.rootDir`, which is not configured. Instrumented lint of the locale page/layout observed the dependency being loaded but no glob or brace calls. |
| `Vitest@5.0.3 → Vite@8.3.4 → bundled Chokidar@3.6.0 → bundled braces@3.0.3` | Vite's published `dist/node/chunks/node.js` contains the second copy. Chokidar's glob watch helper calls `braces.expand()`. The configured `vitest run` disables watching; Vite defaults to `disableGlobbing: true`. |

Vulnerable code remains installed and bundled: these restrictions are mitigations, not a dependency fix. No request-controlled path to these sinks was identified in the shell's development, build, test, CI, or runtime flows. The recorded full npm audit reports four high-severity entries along the first chain, representing one advisory propagated through dependencies. It does not inventory Vite's bundled copy. The recorded production-only audit reports zero vulnerabilities; that is not comprehensive security evidence.

The latest upstream versions checked during the review retained the affected code: the Next lint plugin was 16.4.0, Vite 8.3.4, micromatch 4.0.8, braces 3.0.3, and fast-glob 3.3.3 still depended on micromatch. No supported version-only fix was established. Reassess when upstream ships a fix or removes the copy; when changing these dependencies, lint root settings, watch/glob options, scripts, or CI; before accepting external patterns; and before release. Do not pass untrusted patterns to these helpers. No forced audit fix, unsupported override, downgrade, or advisory/rule suppression was used.

## License and asset review

The owner's current strategy permits MIT, Apache-2.0, BSD-2/3-Clause and ISC only, rejects GPL/AGPL, and prefers supported removal of unused components. It supersedes the earlier unresolved blanket MPL/LGPL acceptance question; current-tree compliance is **blocked**, not waived. The requested `npx license-checker --production --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC"` exits 1 at caniuse-lite's CC-BY-4.0. Other installed terms and the unresolved client-only notice are recorded in the [brief's per-item dispositions](docs/project-brief.md#m1a-dependency-resolution-attempt--2026-10-09). The verified transient checker was run with install scripts disabled; no scanner was added to application dependencies. Metadata scanning does not establish complete bundled/native coverage or change the private project's own license.

The follow-up [third-party notices and source references](THIRD-PARTY-NOTICES.md) collect authentic texts for the currently identified components, with exact versions, sources and hashes in the [manifest](docs/third-party-licenses/manifest.json). This is **incomplete coverage**, not a final-artifact inventory or release clearance. The one focused published-archive check left client-only's original MIT notice unresolved and found partial OG source-map evidence that does not match Next's bundled JS; native/source and final website/mobile checks remain open. See the [brief's follow-up](docs/project-brief.md#notice-collection-follow-up--2026-10-09). Application/dependency/packaging files are unchanged; the recorded security and refresh findings below remain separate.

The 2026-10-08 foundation review checked declarations for all 267 lockfile package entries, including platform-specific optional packages; none lacked a license declaration. Fourteen direct dependencies declare MIT or Apache-2.0. Their installed license texts were checked, except that `@next/eslint-plugin-next` omits a license file from its package: its MIT declaration was reconciled with the [Next.js 16.4.0 repository license](https://github.com/vercel/next.js/blob/v16.4.0/license.md). This is a scoped review, not legal clearance or a complete audit of every bundled component.

| Relevant material | Evidence and requirements to retain |
| --- | --- |
| Next.js, React/React DOM and ordinary MIT/ISC/BSD dependencies | Preserve applicable copyright notices, license texts, and disclaimers when distributing copies. Next also ships per-component licenses under `dist/compiled`; do not strip them from distributed artifacts. |
| Apache-2.0 tooling, including TypeScript and Playwright | Preserve licenses and applicable notices. Playwright ships a `NOTICE` identifying derived Puppeteer code. |
| `Next.js → optional sharp@0.35.5 → @img/sharp-* / sharp-libvips@1.3.4` | The installed Windows package's `LICENSE` covers Apache-2.0, but its `README.md` also identifies LGPLv3 native libraries, Cairo under MPL-1.1, and other component/patent terms. The combined lockfile declarations reflect additional obligations. The actual [LGPL-3.0 text](https://www.gnu.org/licenses/lgpl-3.0.txt) was read: distribution may require library notices, license/source material and a suitable replacement/relinking mechanism depending on the artifact. The upstream [Sharp licensing guidance](https://sharp.pixelplumbing.com/install/#licensing), component notices and exact native versions must accompany a release-specific redistribution assessment; Apache-2.0 alone is insufficient. |
| `Vitest → Vite → lightningcss@1.33.0` and native packages | Actual package licenses contain MPL-2.0. Preserve covered-source notices; distribution of covered binaries requires access to corresponding MPL source. MPL applies to covered files rather than automatically relicensing unrelated application files. See the [Mozilla FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/). |
| `caniuse-lite@1.0.30001815`, through Next.js/Browserslist | Actual license is CC-BY-4.0. Preserve attribution and license/source information if its data is redistributed; this package's data is not a permissive software license merely because it is used by a tool. Source: [caniuse-lite](https://github.com/browserslist/caniuse-lite). |
| ESLint/TypeScript lint tooling → `minimatch@10.2.6` | Actual `LICENSE.md` contains BlueOak-1.0.0, a permissive license with a requirement to provide its license text or link with copies. |
| Vite/Vitest bundled dependencies, including braces | Their aggregate `LICENSE.md` files include component notices and license texts. Preserve those files when distributing these tools. |
| Next's bundled `@vercel/og@1.0.1` | Its actual `dist/compiled/@vercel/og/package.json` and `LICENSE` declare MPL-2.0. The shell does not use OG generation, but this copy is part of the installed Next package and must be considered if shipped. The same MPL source/notice requirements apply. |
| Next's bundled Geist fonts | Next includes Geist WOFF2 files in its development tools and `Geist-Regular.ttf` in its OG component. The TTF's embedded copyright/license fields identify the Geist Project Authors and SIL OFL-1.1, reconciled with the upstream [Geist OFL text](https://github.com/vercel/geist-font/blob/main/OFL.txt). Preserve the font copyright and OFL text with redistributed fonts; font modifications and standalone sales have additional restrictions. These are framework assets, not app-selected fonts. |
| Application fonts, icons, images, templates and copied code | No external font files, icons, images, logos or templates were found in tracked application files. CSS references locally available Arial/Tahoma and a generic fallback; it does not distribute font binaries. No identifiable third-party copied snippet was found, but repository inspection alone cannot certify authorship. The abstract and idea notes are owner-supplied sources, not evidence of university endorsement or independently verified redistribution permission. |

Of 209 installed package entries, nine lack a separate top-level license file. Embedded source/README notices resolve `esrecurse` (BSD-2-Clause) and `imurmurhash` (MIT); `natural-compare`'s author attribution/link was checked against the author's actual [MIT text](https://lauri.rooden.ee/mit-license.txt). Next-family declarations were checked against the upstream MIT text. Rolldown's native binding declaration was reconciled with the installed parent MIT text, the exact [1.2.13 upstream license](https://github.com/rolldown/rolldown/blob/v1.2.13/LICENSE), and its MIT [Rollup/esbuild notices](https://github.com/rolldown/rolldown/blob/v1.2.13/THIRD-PARTY-LICENSE); this does not certify every native build input. `@humanfs/types` source/authorship has been corroborated against its exact release source and upstream README, which identifies Nicholas C. Zakas and Apache-2.0. Its package still omits a LICENSE; original attribution and authentic supplemental Apache text are retained in the scoped collection, while applicable source notices and release-specific redistribution checks remain open. `client-only` declares MIT without an included copyright/license file; its authentic applicable MIT notice remains unresolved for redistribution. Optional binaries for other platforms were checked through lockfile metadata, not every binary's contents; all Sharp native component license/source obligations remain a release-specific check.

Intended delivery is recorded in the [brief](docs/project-brief.md#delivery-intent-and-license-follow-up): a private source repository, hosted website and future mobile app. At the earlier notice checkpoint, MPL/LGPL owner acceptance was unanswered and no scanner had been installed. The current strict strategy and requested transient scan above supersede that decision state; exact artifacts and redistribution obligations remain unknown. No dependency or project license was changed by either review. Before distributing build output, containers, native binaries or browser bundles, identify the components actually shipped and preserve their applicable licenses, notices, attribution and source-access requirements. Do not assume backend/tooling dependencies are included in the future mobile app.

## Refresh follow-up — owner reports resolved

The owner's continuous-refresh report was reproduced on the existing `next dev` server at `http://localhost:3000` on 2026-10-08. With no source edits during a 30-second observation, installed Chromium made 261 document requests for `/en` and 263 for `/ar`, repeatedly replacing their JavaScript execution contexts and document time origins. Both retained the correct translated shell. Browser HMR frames repeatedly sent `turbopack-message` with `type: restart` for the same shared entry chunk; the server log repeatedly reported compilation and new browser React DevTools messages. No page JavaScript errors or source-file change events were observed; the file monitor saw development-log writes. This is actual full-document reloading, not ordinary idle HMR traffic.

Source-equivalent isolated copies using the existing dependencies were observed on free ports 3300/3400, with a separate generated-output directory in each copy and an explicit shared Turbopack root solely to resolve the dependency junction. Both locales stayed at one initial document request during each 20-second control: pinned Node 24.21.0, system Node 24.13.0, a restart retaining the system control's output, and a pinned-to-system runtime transition. Node mismatch and ordinary warm-output reuse alone therefore do not reproduce the issue. The existing production build on port 3200 also stayed at one initial document request per locale for 20 seconds, with no console errors or HMR socket. Development-control and production keyboard switching `en → ar → en` passed `lang`/`dir` and URL checks, with ten idle seconds after each step and no additional document requests during those idle windows.

The original port-3000 process subsequently disappeared before a targeted restart was authorized. Stop requests were issued only to diagnostic servers on ports 3200/3300/3400; why the original process exited is unknown. After verifying port 3000 was free, the entire existing `.next/dev` directory was copied to `.cache/refresh-original-dev-backup` before starting a diagnostic server in the original project directory. Without manually clearing output or changing application files, `/en` and `/ar` each made one initial document request over 30 idle seconds, first with pinned Node 24.21.0 and then after restarting the diagnostic server with the original system Node 24.13.0. Both original-path servers also passed keyboard switching and ten-second idle windows at each `en → ar → en` step, with stable document time origins, correct `lang`/`dir`, and no page errors. Restart is associated with recovery; it does not establish the underlying cause or a durable fix. Next performs normal generated-output maintenance at startup, so these checks do not completely separate process state from output state.

Ignored diagnostics used the already installed Chromium and wrote local evidence under `.cache/`; no browser or scanner was installed:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.cache\ms-playwright"
node .cache/refresh-diagnostic.mjs http://localhost:3000 30 .cache/refresh-before.json
node .cache/refresh-diagnostic.mjs http://127.0.0.1:3300 20 .cache/refresh-pinned.json
node .cache/refresh-diagnostic.mjs http://127.0.0.1:3400 20 .cache/refresh-system.json
node .cache/refresh-diagnostic.mjs http://127.0.0.1:3400 20 .cache/refresh-warm.json
node .cache/refresh-diagnostic.mjs http://127.0.0.1:3300 20 .cache/refresh-runtime-transition.json
node .cache/refresh-diagnostic.mjs http://127.0.0.1:3200 20 .cache/refresh-production.json
node .cache/refresh-switch.mjs http://127.0.0.1:3400 .cache/refresh-switch-dev-control.json
node .cache/refresh-switch.mjs http://127.0.0.1:3200 .cache/refresh-switch-production.json
node .cache/refresh-diagnostic.mjs http://localhost:3000 30 .cache/refresh-original-path.json
node .cache/refresh-switch.mjs http://localhost:3000 .cache/refresh-switch-original.json
node .cache/refresh-diagnostic.mjs http://localhost:3000 30 .cache/refresh-original-system.json
node .cache/refresh-switch.mjs http://localhost:3000 .cache/refresh-switch-original-system.json
```

These scripts are local diagnostic evidence, not shipped regression tests or fresh-checkout commands. The actual browser-diagnostic invocations used `.tools/node-v24.21.0-win-x64/node.exe`. Dev servers used that pinned runtime or, for the system-runtime controls, `C:/Program Files/nodejs/node.exe`, invoking `node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port <port>`. The production comparison invoked the existing Next binary with `start` on port 3200 against the existing build. All diagnostic servers were stopped afterward; no stop request targeted the owner's original process. No source, routing, HMR, cache configuration, dependencies or lockfile were changed to mask the symptom. The triggering restart messages are established, but why the affected server produced them is not established. No root-cause fix or M1a acceptance is claimed. If the loop recurs, retain the first terminal output and browser console/network evidence from that session, together with the exact launch command and URL, before restarting it.

The owner subsequently checked localhost and reported the refresh problem fixed on 2026-10-08. The symptom is owner-confirmed resolved; the earlier investigation established recovery without proving a durable root-cause code fix. No further refresh experiment is needed without recurrence/new evidence.

Follow-up shipping changes affect documentation only. `git diff --check`, local README/brief link checks, and `node --check` for both ignored diagnostic scripts passed. Application, manifest, lockfile, configuration, tests and workflow were unchanged; the previously passing installation/lint/typecheck/unit/build/production-browser gate evidence above was reused rather than rerunning the suite. The successful GitHub/Linux CI evidence for `263da4f` is recorded above; newer changes require their own CI result before merge.

Manual review checklist for teammates: tab to the visible skip link, activate it, use language links by keyboard in both directions, inspect Arabic reading order, narrow the viewport, and visit `/fr` for 404. This is a focused foundation check, not a full accessibility audit or user study. Browser coverage is Chromium only, and the framework's generic 404 page is currently English.

The earlier blanket MPL/LGPL acceptance question is superseded by the owner's strict allowlist strategy; implementing it remains blocked by the recorded dependency checks/provenance. M1a is open. Refresh recovery retains its unknown cause/durable fix; website packaging and mobile checks remain separate release gates. M1b's subsequent local implementation/review evidence is recorded below; no baseline live feature or deployment is implied.

## M1b isolated local preparation — 2026-10-09

**Implemented and tested locally; not deployed.** The owner approved whole-address lowercasing for the separate email matching key, preservation of trimmed original spelling/dots/plus suffixes, a 254-Unicode-code-point storage/input bound, and nonblank self-reported display names of at most 60 code points. A user can exist without a profile. No domain or naming pattern grants teacher permissions.

`prisma/schema.prisma`, the reviewed initial migration and server-only user/profile/challenge modules are implemented. Prisma CLI/client/adapter 7.10.0 are pinned. Under the owner's clarified standard of current risk and free permitted use, the [scoped dependency assessment](docs/project-brief.md#m1b-dependency-selection-review--2026-10-09) found no reachable exploit path for the reported advisories in this guarded local PostgreSQL checkpoint. Vulnerable CLI dependencies remain; flat trusted config and no MySQL/Studio use are mitigations, not fixes. Preserve the tooling's EPL license and Studio NOTICE/branding; do not embed Studio or use hosted Prisma services through this setup. Existing MPL/LGPL decisions and release clearance remain open.

The reviewed Prisma preinstall checks Node compatibility; engines postinstall downloads the official schema engine with checksums. npm 11.19 skips unapproved dependency install scripts: `allowScripts` permits only the exact reviewed `prisma@7.10.0` and `@prisma/engines@7.10.0` versions. Root postinstall generates the ignored client from the local schema so clean installation/typecheck/build need no database. Do not approve all scripts or accept unreviewed future versions. The new dependency delta adds 128 authentic packaged/supplemental notice files to the existing collection. `@prisma/dev@0.24.17` declares ISC but lacks an established original notice/source reference; it is unused, and conveying a CLI/builder artifact containing it needs that question resolved. The final website/mobile artifacts are still unreviewed.

The independent `pg@8.23.1` driver and `@types/pg@8.23.1` are pinned. Exact identities, official repositories, compatibility, scripts and license texts were checked; the isolated candidate audit identified no advisory for this driver set. Fifteen new lockfile entries were reviewed, all MIT/ISC; the two packages lacking standalone license files (`pg-types`, `pgpass`) contain authentic MIT texts in their preserved READMEs. New notices and source/integrity/hash references extend [the existing collection](THIRD-PARTY-NOTICES.md). Existing foundation dependency versions were preserved. No old full license inventory/security audit or refresh experiment was repeated.

The approved local environment uses official `postgres:18.6-bookworm`, pinned to image index digest `sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c`. This is local tooling; the container OS/native distribution is not cleared for release. `compose.m1b.yaml` is managed through the guarded scripts, with a random project/container/volume identity, a free loopback-only port 55432 and ignored operational files under `.cache/m1b/`. Node's file mode is not a Windows ACL guarantee: keep that local directory private and do not share credentials or manifests.

Use the pinned runtime in a project-root PowerShell session:

```powershell
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
docker --version
docker compose version
docker info --format '{{.ServerVersion}}'
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:setup
npm.cmd run db:status
npm.cmd run db:review
# Inspect prisma/migrations/20261009000000_m1b_foundation/migration.sql, including custom checks.
# Also inspect prisma/migrations/20261009010000_m1b_email_case_contract/migration.sql.
npm.cmd run db:migrate
npm.cmd run db:guard-check
npm.cmd run db:test
npm.cmd run db:cleanup
```

These are configured local commands. `db:setup` refuses an existing manifest/resource and does not install or start Docker Desktop. If the engine is unavailable, resolve that environment decision first. Do not run Compose directly against guessed names. Do not adopt another project's database. Cleanup validates ownership markers/labels/container identity before removing only this setup's exact container and volume; it does not stop Docker Desktop or prune other resources. Preflight rejection removes only the three operational files created by that attempt, before any Docker mutation. Incomplete provisioning after startup is preserved for inspection rather than automatically reset.

`db:review` invokes `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output .cache/m1b-reviewed-generated.sql`, passing a guarded local migration URL through the environment without printing it. This exact Windows engine requires a datasource argument even for this diff; an invocation without one exited 0 without producing SQL. The wrapper uses the owned development target and reads its identity marker; the diff applies no schema/data change and needs no shadow database. It removes stale output, requires a fresh complete artifact and compares the generated tables/indexes/foreign keys with history. Custom checks, the forward case-mapping function/constraint and transaction wrappers require separate SQL review; Prisma's generated base comparison does not cover them. `db:migrate`/`db:test` repeat the base comparison before applying history; no ambient `DATABASE_URL`, reset, schema-push or remote/shared target is allowed. The test runner creates three fresh owned databases: two replay complete Prisma history and one tests the reviewed SQL's populated forward upgrade/refusal directly, without fabricated migration records. It verifies populated-history reapplication and removes only these databases after connections close.

Every usable target must match the ignored manifest's exact host, port, database and selected role, then pass a read-back check of a bootstrap-owned database marker. Migration and runtime roles have no superuser/role-creation/database-creation privileges. Runtime has no DDL privilege or access to change the marker. The migration grants runtime only relevant record/column permissions; email changes and deletions have no runtime permission or API. The challenge transition locks the bound row before sampling the database clock, then conditionally consumes and verifies in one transaction. Static parameterized SQL is used only for clock/row-lock queries, since Prisma has no row-lock API. No raw token is stored; issuance returns a random token in memory for a future approved delivery adapter. Internal functions still require caller authorization before any M2 public endpoint is introduced.

Original checkpoint evidence (before the review corrections below):

| Exact command/check | Outcome |
| --- | --- |
| Git branch/HEAD/upstream/status | Matched `feat/application-foundation`, `6796fe31e33da7aa3b8af903fcacb9d1c38a76c9`, matching upstream ref, only unstaged AGENTS.md at entry. AGENTS.md SHA-256 remains `3ddaf22c6219cc904a96609645531f2b2145d57599cccf33717b1506f9021551`. |
| [GitHub run 37853461907](https://github.com/ShakerMasri/university-social-platform/actions/runs/37853461907) | Authenticated read verified exact head SHA `6796fe31…`, completed success, successful install/lint/typecheck/unit/build/Chromium gates. Earlier CI is not substituted for this result. This run does not cover these uncommitted M1b changes. |
| `docker --version`, `docker compose version`, `docker info` | CLI 29.8.1 / Compose 5.5.1 present; Linux engine initially unavailable. Owner separately approved starting installed Docker Desktop; subsequent engine check reported 29.8.1. No software installed. |
| `npm.cmd install --save-exact pg@8.23.1 --ignore-scripts --no-audit --no-fund --offline=false --cache .cache/npm` and corresponding `--save-dev @types/pg@8.23.1` | Passed; no install scripts executed during dependency selection. |
| `npm.cmd install --save-exact @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 --ignore-scripts --no-audit --no-fund --offline=false --cache .cache/npm` and corresponding `--save-dev prisma@7.10.0` | Passed after the scoped assessment; prior foundation versions retained. |
| `node node_modules/@prisma/engines/scripts/postinstall.js`, `node node_modules/prisma/build/index.js validate`, `node node_modules/prisma/build/index.js generate` | Passed with the pinned runtime; official schema engine downloaded, schema validated and ignored client generated. |
| `npm.cmd run db:validate`, `npm.cmd run db:generate` | Passed through the configured scripts after database cleanup; these commands need no database. |
| `npm.cmd run db:setup`, `npm.cmd run db:status` | Passed: new owned container/volume and empty database, loopback-only target, database marker and limited role identity verified. |
| Second `npm.cmd run db:setup` | Expected exit 1: refused existing manifest, with no reset/adoption. |
| `npm.cmd run db:guard-check` | Passed real-PostgreSQL missing/wrong marker rejection and runtime DDL/marker-write denial. Owned disposable guard-test databases removed afterward. |
| `npm.cmd install-scripts approve prisma @prisma/engines`, `npm.cmd install-scripts ls --json` | Exact-version approvals recorded only for the two reviewed lifecycle scripts; no pending approvals. No global configuration change. |
| `npm.cmd ci --no-audit --no-fund --offline=false --cache .cache/npm` | Final clean installation passed (353 packages), including automatic client generation and permitted reviewed scripts. An earlier install skipped those two scripts and warned; the final run has no such warning. Unchanged full audit deliberately not repeated. |
| `npm.cmd run db:review`, `npm.cmd run db:migrate` | Passed generated-base SQL comparison and guarded application of the separately reviewed custom checks/atomic migration. No shadow/reset/schema-push workflow. |
| `npm.cmd run db:test` | Final 13 tests passed on two fresh real PostgreSQL databases; replay/reapplication retained synthetic records, and test databases were removed. First run had three test-oracle failures (catalog internal-char decoding and RESTRICT SQLSTATE); corrected without changing schema constraints. Lock-wait test now observes actual blocking before expiry. |
| `npm.cmd run db:cleanup` | Passed twice across preparation/completion. Final owned container `usp-m1b-18f74c15fd6b-postgres`, volume `usp-m1b-18f74c15fd6b-data`, migrated development database and operational credentials/manifest removed. Other resource names match the initial inventory. Docker Desktop remains running; the pinned image remains cached. |
| `npm.cmd test -- src/server/database/validation.test.ts` | 21 passed after sandbox `spawn EPERM` startup was rerun with worker permissions; no check weakened. |
| `npm.cmd test` | 44 passed: existing 19 locale tests, 21 input policy tests and 4 target-guard tests. No mocked result is presented as database persistence evidence. |
| `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` | Passed after clean installation. |
| `npm.cmd run test:e2e` with `CI=1`, `PLAYWRIGHT_BROWSERS_PATH=$PWD/.cache/ms-playwright`, `NEXT_TELEMETRY_DISABLED=1` | All 6 existing Chromium production-shell tests passed with the already-installed browser; test-owned server stopped. No new browser flow or refresh experiment. |
| Browser output marker check (`rg -l 'M1B_|EmailOwnershipChallenge|usp_m1b|postgresql://' .next/static`) | No matching files. This focused check is not a final artifact/license inventory or comprehensive secret scan. |
| `git diff --check`, `node .cache/check-m1b-docs.mjs` (pinned runtime; ignored local evidence helper) | Passed 66 local links/anchors, 143 new notice hashes/original-byte comparisons where available, exact reviewed identities/integrities for 144 new lockfile entries and prior-version preservation. `.gitattributes` protects original license-evidence bytes from line-ending conversion. Authentic upstream formatting retained. |
| Email/provider/authentication/session/mobile/deployment verification | Not implemented or tested in this checkpoint. Synthetic challenges do not establish real email ownership. Database checks are local Windows evidence; no new database GitHub job or fresh Linux execution was performed. |

M1b has no HTTP endpoint or changed browser flow. No real email ownership, enrollment, teacher identity, complete baseline feature, production security, final website/mobile artifact clearance or M1a closure is established. At this implementation checkpoint all changes were unstaged; no commit, push, merge or deployment had been performed. The subsequent independent review and Git authorization are recorded below and in the brief.

### M1b review corrections — 2026-10-09

Two confirmed findings are fixed. `tools/database/compose.ts` clones the subprocess environment, removes inherited `M1B_*` and `COMPOSE_*` controls case-insensitively, and supplies the validated manifest's owner/container/volume/port. `db:setup` runs read-only `docker compose config --format json` with this same environment and compares the complete resolved specification with the expected service, image, loopback binding, ownership labels, volume and secret path before `up`. Resource-absence checks use those same names. Unexpected mounts, external storage, services or configuration fail closed. The environment of the calling shell is unchanged. The exact normalized shape was verified with Compose 5.5.1; review differing output before changing that comparison on a future Compose upgrade.

Email keys now use a fixed **Unicode 17 default full lowercase contract** in both TypeScript and PostgreSQL. PostgreSQL 18's built-in Unicode data is [16.0](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/include/common/unicode_version.h), and [pg_unicode_fast](https://www.postgresql.org/docs/18/collation.html) uses that major version's full case mapping. Keeping its unmodified mapping would leave the newly recognized U+A7CE/U+A7CF pair with different keys. The shared generated data preserves that pair and the other 27 additions, contextual Greek sigma and Turkish İ expansion, without excluding Unicode input or introducing an extension/dependency. `normalizeEmail` still trims/preserves original spelling, lowercases the entire key, retains dots/plus suffixes and bounds both stored values to 254 code points. This is lowercase mapping, not provider rewriting, Unicode normalization, casefolding or deliverability validation.

`email-case-generate.mts` derives TypeScript data and `20261009010000_m1b_email_case_contract/migration.sql` from hash-pinned official UnicodeData/SpecialCasing/DerivedCoreProperties. `email-case.ts` and SQL `public.usp_email_lower_v17(text)` use the same 1,487 single-character mappings, expansion and context properties. The forward migration retains all email checks and changes the equality check to that function. It preserves the initial migration bytes. The function is immutable/invoker-only with a fixed `pg_catalog` search path; PUBLIC execution is revoked and guarded migration grants only the local runtime role execution. Existing keys that would change cause an atomic refusal requiring a separately reviewed collision/foreign-key migration; there is no automatic account/key merge. Compatible user/profile/challenge records survive the upgrade. Future case-data changes require a versioned function and new reviewed migration; never rewrite applied history.

The official data's permissive Unicode-3.0 license was reviewed for free use/modification/redistribution. Its authentic [copyright and permission text](docs/third-party-licenses/Unicode-17.0.0-LICENSE.txt) is preserved with [source hashes and attribution](THIRD-PARTY-NOTICES.md#m1b-shared-email-case-mapping-data--2026-10-09). Preserve it with conveyed derived data/SQL. No npm dependency, lockfile, runtime, Prisma version or PostgreSQL image changed for these fixes. Existing audits/notice inventories/Chromium evidence were reused.

Generation/check commands actually used (ordinary setup uses the checked-in generated artifacts and needs no Unicode download):

```powershell
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
$reviewDirectory = Join-Path $PWD '.cache/m1b-unicode17-review'
New-Item -ItemType Directory -Path $reviewDirectory -Force | Out-Null
foreach ($file in @('UnicodeData.txt', 'SpecialCasing.txt', 'DerivedCoreProperties.txt')) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://www.unicode.org/Public/17.0.0/ucd/$file" -OutFile (Join-Path $reviewDirectory $file)
}
Invoke-WebRequest -UseBasicParsing -Uri 'https://www.unicode.org/license.txt' -OutFile (Join-Path $reviewDirectory 'LICENSE.txt')
node tools/database/email-case-generate.mts --write
node tools/database/email-case-generate.mts
```

The generator is offline and rejects input hash changes or unexpected special-casing rules. The first generation attempt hit an empty locale-specific lower field; parsing was corrected before any artifact/migration was produced. Read-only comparison also downloaded official Unicode 16 UnicodeData to `.cache/m1b-unicode17-review/UnicodeData-16.txt`; its SHA-256 is recorded in the brief. Downloaded source/review files remain ignored; the operational database directory was removed.

| Actual pinned-runtime command/check | Review-correction outcome |
| --- | --- |
| `docker --version`, `docker compose version`, `docker info --format '{{.ServerVersion}}'` | 29.8.1 / 5.5.1 / 29.8.1; engine available after sandbox access permission. No engine activation or software installation needed. |
| `npm.cmd test -- src/server/database/email-case.test.ts src/server/database/validation.test.ts tools/database/compose.test.ts` | 27 passed; synthetic configuration/environment regressions and full scalar/context mapping coverage. |
| `npm.cmd run db:validate` | Passed. Prisma schema itself is unchanged. |
| `npm.cmd test` | 50 passed. Case mapping matches pinned Node Unicode 17 for all 1,112,063 non-NUL Unicode scalar values; context samples cover new pairs/properties and existing Turkish/Greek/Arabic behavior. |
| `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build` | Passed. Initial typecheck found the synthetic environment missing Next's required NODE_ENV; corrected without weakening strict types. |
| `npm.cmd run db:setup` | Initial strict preflight refused before provisioning because the fixture omitted Compose's null command/entrypoint and absolute secret target. Verified no resource existed, removed only that attempt's three files, corrected the expected shape. Retry passed with owned `usp-m1b-b3aadaec8855-postgres` / `usp-m1b-b3aadaec8855-data` / `usp_m1b_b3aadaec8855_dev`. |
| `npm.cmd run db:migrate` | Passed generated-base comparison and application of both reviewed migrations to the owned development database. |
| `npm.cmd run db:guard-check` | Passed real marker/permission guards and read-only resolved-config regression with inherited synthetic owner/container/volume/port, lowercase-variable and Compose-control overrides. No synthetic unowned target was provisioned. |
| `npm.cmd run db:test` | Final 16 passed across three fresh owned databases. All 28 pairs persist and match for duplicate/lookup/challenge consumption/replay; 1,488 mapped scalars plus 93 context samples match Node/server/SQL. Forward-upgrade refusal rolls back and compatible records survive. Existing FK, expiry, rollback and concurrent single-use tests pass; populated Prisma-history reapplication preserves records. First run passed 13/15: synchronous validation needed a synchronous rejection assertion, and lock observation needed fresh activity snapshots. Corrected polling retains proof of blocking before expiry. All test databases removed. |
| `node tools/database/email-case-generate.mts`; focused Unicode notice hash check | Generated data/SQL match all three reviewed input hashes; the authentic 1,995-byte Unicode license matches SHA-256 `e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96`. |
| `npm.cmd run db:cleanup` | Passed; exact owned container/volume/development database and manifest/password/env files removed. Unrelated container/volume names match the pre-run inventory. Docker Desktop/image cache remain. |
| `git diff --check`; focused local documentation/source/notice check | Passed 72 local links/anchors, changed-source whitespace checks, and the new Unicode license's hash/original-byte equality. Prior 143 dependency notices and unchanged package inventory were reused. |

At the correction checkpoint no fresh CI/Linux, Chromium, deployment, provider or live email test was claimed. The existing six Chromium shell tests were prior evidence; no browser flow changed. Synthetic persistence tests establish neither delivery nor email ownership. M1a, existing dependency/license findings, final website/mobile release review and M2 product/provider decisions remain open. The correction checkpoint retained branch/HEAD/upstream `feat/application-foundation` / `6796fe31e33da7aa3b8af903fcacb9d1c38a76c9` / `origin/feat/application-foundation`, with all changes unstaged and AGENTS.md entry bytes preserved.

Subsequent [independent review](docs/project-brief.md#m1b-independent-review-and-git-authorization--2026-10-09) verified both fixes and reran 50 unit tests, 16 real PostgreSQL tests, migration/Compose/identity guards, schema validation, lint, typecheck, build and Unicode artifact comparison successfully. Review-owned database resources were cleaned up; the previously approved Docker Desktop engine was started for the review and remains running. The owner now authorizes commit, push and merge of this local checkpoint after fresh CI and PR review, with publication evidence in the PR/Git history. Database CI remains a follow-up; deployment and M2 protected/provider flows are not authorized.
