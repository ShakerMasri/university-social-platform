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

PostgreSQL and Prisma remain the specified database stack for M1b. No database, authentication, provider, application feature, or deployment is included in M1a. No secrets or service accounts are needed to run the shell. Initial dependency and browser installation requires internet access.

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

The 2026-10-08 review traced two copies of vulnerable `braces@3.0.3`. The [GHSA-vfj7-8cjw-p6xm advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) describes stack exhaustion from deeply nested patterns; the character-length limit does not bound nesting depth. No patched release was available at that review. This follow-up reuses that investigation; it does not claim a new full audit.

| Copy and call path | Current configuration-based mitigation |
| --- | --- |
| `@next/eslint-plugin-next@16.4.0 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3` | The Next lint helper calls glob expansion only for `settings.next.rootDir`, which is not configured. Instrumented lint of the locale page/layout observed the dependency being loaded but no glob or brace calls. |
| `Vitest@5.0.3 → Vite@8.3.4 → bundled Chokidar@3.6.0 → bundled braces@3.0.3` | Vite's published `dist/node/chunks/node.js` contains the second copy. Chokidar's glob watch helper calls `braces.expand()`. The configured `vitest run` disables watching; Vite defaults to `disableGlobbing: true`. |

Vulnerable code remains installed and bundled: these restrictions are mitigations, not a dependency fix. No request-controlled path to these sinks was identified in the shell's development, build, test, CI, or runtime flows. The recorded full npm audit reports four high-severity entries along the first chain, representing one advisory propagated through dependencies. It does not inventory Vite's bundled copy. The recorded production-only audit reports zero vulnerabilities; that is not comprehensive security evidence.

The latest upstream versions checked during the review retained the affected code: the Next lint plugin was 16.4.0, Vite 8.3.4, micromatch 4.0.8, braces 3.0.3, and fast-glob 3.3.3 still depended on micromatch. No supported version-only fix was established. Reassess when upstream ships a fix or removes the copy; when changing these dependencies, lint root settings, watch/glob options, scripts, or CI; before accepting external patterns; and before release. Do not pass untrusted patterns to these helpers. No forced audit fix, unsupported override, downgrade, or advisory/rule suppression was used.

## License and asset review

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

Intended delivery is now recorded in the [brief](docs/project-brief.md#delivery-intent-and-license-follow-up): a private source repository, hosted website and future mobile app. Owner acceptance of the existing MPL/LGPL-bearing transitives remains unresolved under AGENTS.md; exact artifacts and redistribution obligations remain unknown. No dependency or project license was changed, and no scanner was installed. Before distributing build output, containers, native binaries or browser bundles, identify the components actually shipped and preserve their applicable licenses, notices, attribution and source-access requirements. Do not assume backend/tooling dependencies are included in the future mobile app.

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

M1a owner acceptance of the existing MPL/LGPL-bearing dependencies remains open. Missing license evidence and release-specific obligations remain visible; refresh resolution is recorded separately from the unproven root cause. M1b remains planned only; all baseline feature, permission and approved profile/email decisions are in the brief.
