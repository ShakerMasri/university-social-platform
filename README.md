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
- Source preservation hashes, local documentation links, workflow YAML syntax, ignore rules, and changed-file whitespace were checked. GitHub CI has **not** run.

`next dev` initially appended framework guidance to AGENTS.md. Its exact original bytes were restored and verified, and the documented [`agentRules: false`](https://nextjs.org/docs/app/api-reference/config/next-config-js/agentRules) setting prevents regeneration. A subsequent dev startup preserved the source; affected lint/typecheck/build checks passed again.

Known dependency limitation: `npm.cmd audit --json` reports four high-severity development dependency entries along `@next/eslint-plugin-next → fast-glob → micromatch → braces`. The underlying [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no patched release as checked on 2026-10-08. These are one advisory propagated through its dependency chain, not four separate defects. The shell does not accept user-supplied glob patterns; this narrows exposure but does not fix the dependency. `npm.cmd audit --omit=dev` reported zero vulnerabilities. No forced downgrade, override, audit suppression, or rule suppression was used. Recheck upstream remediation before adding untrusted-pattern tooling or deployment.

Manual review checklist for teammates: tab to the visible skip link, activate it, use language links by keyboard in both directions, inspect Arabic reading order, narrow the viewport, and visit `/fr` for 404. This is a focused foundation check, not a full accessibility audit or user study. Browser coverage is Chromium only, and the framework's generic 404 page is currently English.

Next checkpoint: M1b, the separately reviewed PostgreSQL/Prisma database foundation. All baseline feature and permission decisions remain in the brief.
