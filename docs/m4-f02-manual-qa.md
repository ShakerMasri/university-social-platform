# M4-F02 For You manual QA and M4-F01 regression

The current focused regression uses SEEDED run `166a7f61d505`. See [Focused Manual Regression](#focused-manual-regression). The November 21 banner below is retained as a historical record of the earlier run, which is closed.

**Windows SEEDED run active · 2026-11-21.** Run `fe67cc690116` is at `http://localhost:3201` on the reviewed snapshot. Branch `feat/m4-feed`, worktree `.cache/worktrees/m4-feed`, base HEAD `4695eb613ce511f746d74d44df7f0dd56917f3e0`. Totals are **32 PASS, 0 FAIL, 0 BLOCKED, 1 NOT RUN**. FY-26 remains **NOT RUN** with privacy acceptance unresolved. The [current handoff](project-brief.md#m4-f02-active-seeded-qa-handoff--2026-11-21) lists the next cases.

## Windows setup and shutdown

1. From the Feed worktree, export to a new same-drive directory and record the printed lowercase SHA-256 after reviewing the manifest. The export excludes credentials, dependencies, caches and Git metadata. Retain the digest alongside the sanitized run record.

   ```powershell
   node tools/testing/feed-qa-snapshot.mts inspect
   node tools/testing/feed-qa-snapshot.mts export ../m4-f02-manual-windows
   Set-Location ../m4-f02-manual-windows
   $env:FEED_QA_MANIFEST_SHA256 = 'paste the reviewed lowercase digest here'
   node tools/testing/feed-qa-snapshot.mts verify $env:FEED_QA_MANIFEST_SHA256
   ```

2. Use Node `24.21.0` and npm `11.19.0`. Stage the lockfile's Windows dependencies into this snapshot as ordinary local files. Run `npm.cmd ci --offline` if the cache is complete, or copy a previously installed Windows `node_modules` tree after checking that its lockfile SHA-256 matches the snapshot. Run `npm.cmd run db:generate` in the snapshot. Use fresh temporary Chromium profiles. Open Docker Desktop on the local `desktop-linux` context. Its cached PostgreSQL 18.6 image must resolve by the exact digest-only reference in [the database target guard](../tools/database/targets.ts). Setup refuses a missing image, an occupied PostgreSQL port, or an existing manifest. It creates a fresh labeled container and volume on loopback port `55434`. Windows uses the shared Desktop daemon, so existing resource metadata may be inspected and Docker Desktop startup may incidentally affect Wasel. The campaign opens only its own registered PostgreSQL targets.
3. In a clean PowerShell in the snapshot, with the same digest set in each shell, run the empty phase first. The application listens on both loopback address families at **http://localhost:3201**. Keep the supervisor terminal open. Use a second terminal for status and authenticated stop. Confirm the status command reports no registered session before starting the seeded phase. Each start validates the snapshot and builds before creating its fresh, marked database.

   ```powershell
   npm.cmd run qa:feed:windows:setup
   npm.cmd run qa:feed:windows:empty
   # From a second PowerShell in the same snapshot, with the digest set:
   npm.cmd run qa:feed:windows:status
   npm.cmd run qa:feed:windows:stop
   npm.cmd run qa:feed:windows:status
   npm.cmd run qa:feed:windows:seeded
   ```

4. Follow the checklist and [browser quick start](#browser-quick-start). Use the seeded phase's `observer-reference.json` to check initial IDs, timestamps and order. Reset by closing the temporary Chromium profiles, stopping the phase, verifying status and opening a new phase. After the last phase, run the same status/stop/status sequence, then `npm.cmd run qa:feed:windows:cleanup`. It accepts only the idle Windows campaign scaffold from that snapshot. It refuses an active phase, unexpected registrations, an occupied app port or active database clients. Leave unrelated Docker resources alone.
5. On a guard failure, save the sanitized output and check status. If a phase is registered, use the same snapshot and the Windows stop command for recovery. Preserve resources for inspection if identity or shutdown cannot be verified. Keep the recorded snapshot and use an ordinary retry only if Next.js reports its built-in advisory retry. A recurring build failure blocks the phase. Do not edit the resource manifest, remove a lock or kill a process to clear the guard.

## Existing VMware guest procedure

These commands document the separately guarded guest path. The current campaign uses the Windows commands above. A guest campaign requires explicit owner approval for the named VM, source digest, both fixture phases and browser run. Use Ubuntu 24.04 x86-64 VMware, its own Docker Engine, Node `24.21.0`, npm `11.19.0`, the lockfile, the pinned guest PostgreSQL 18.6 reference in [the database target guard](../tools/database/targets.ts), and fresh Chromium profiles.

1. Export the review snapshot from the M4 worktree using a **new** destination on the same drive outside the worktree. The resulting tree combines the reviewed HEAD with the approved unstaged changes and explicit untracked files. `FEED-QA-SHA256.json` records HEAD, changed/untracked paths and each file hash. Review the file inventory and contents before transfer. Keep the printed manifest SHA-256 separately for approval. The export skips ignored files and excludes Git metadata, credentials, local databases, dependencies and host caches. Use byte-preserving transfer into a new guest directory.

   ```powershell
   node tools/testing/feed-qa-snapshot.mts inspect
   node tools/testing/feed-qa-snapshot.mts export ../m4-f02-review-snapshot
   Get-FileHash ../m4-f02-review-snapshot/FEED-QA-SHA256.json -Algorithm SHA256
   ```

2. Before disconnecting external dependency access, verify the source, install pinned npm dependencies and check that Prisma generation completes. Install Chromium and full Linux browser dependencies with `npx playwright install --with-deps chromium` if automated browser execution is also planned. Install guest Chromium for manual work. Pull the exact image reference in Compose into the **guest** daemon and confirm it resolves by the full reference locally. Use guest-local Docker and a Compose plugin compatible with the repository's strict resolved-config check. Any offline build download, image miss or Compose refusal blocks execution. Stage the missing approved dependency separately and reverify isolation.
3. Confirm in VMware that shared folders, copy/paste and drag/drop, host devices and disks, and forwarded sockets are absent. Confirm in the guest that the default Docker context is its own `unix:///var/run/docker.sock`, data is on its own disk, and the engine inventory is empty before setup. Detach transfer media and disconnect the VM NIC, disable its guest interface if needed, and inspect routes and mounts. Use a clean non-root shell with access to the guest Docker socket. The loader rejects active or addressed external links, default routes, and shared/remote mounts, including desktop FUSE mounts. Use a guest session with none of these mounts. Guest checks supplement the VMware checks. Stop if any retained resource or route to it is present. Reserve guest ports `55432`, `3201`, and the supervisor's conflict-check ports `3000`, `3100`, and `3200`.
4. Only after approval and isolation checks, use these commands in the guest. Set the **same lowercase owner-approved digest** in each supervisor/status/stop shell. The guest build runs before target allocation. The preflight binds the source manifest and checks the owned engine inventory, container labels, expected volume and loopback binding. The supervisor creates a new test database, adds its creation marker, applies checked-in migrations and opens the preview at **http://localhost:3201**. The guest development scaffold receives no fixture. The historical `qa:manual` commands remain pinned to their own M4 campaign.

   ```sh
   export FEED_QA_MANIFEST_SHA256='paste the approved lowercase SHA-256 here'
   node tools/testing/feed-qa-snapshot.mts verify "$FEED_QA_MANIFEST_SHA256"
   npm run db:setup
   npm run qa:feed:empty
   # After FY-01 and FY-02, in a second guest shell with the same digest:
   npm run qa:feed:status
   npm run qa:feed:stop
   npm run qa:feed:status
   # Then start the deterministic fixture in a new disposable test database:
   npm run qa:feed:seeded
   ```

5. The seeded supervisor prints the location of `observer-reference.json` containing synthetic aliases, community and post IDs, timestamps and expected page orders. Reset by closing temporary Chromium profiles, running `npm run qa:feed:stop`, confirming no active registration with `npm run qa:feed:status`, and starting the desired phase again. Each phase gets a fresh named database. No in-place reset or seed-on-existing-target command exists. Stop on any guard failure and preserve the guest and its evidence. After confirmed shutdown, preserve sanitized results and discard the approved guest or remove only its owned scaffold with `npm run db:cleanup`.

## Browser quick start

Open Chromium on the Windows host for the Windows campaign. Use exact `localhost` for the manual preview. Create separate temporary Chromium profiles for O, R and N, plus a clean anonymous profile. Multiple incognito windows in the same profile share cookies. Label the windows before testing membership changes.

| Page | English | Arabic |
| --- | --- | --- |
| Sign in | `http://localhost:3201/en/signin` | `http://localhost:3201/ar/signin` |
| Profile and Log out | `http://localhost:3201/en/profile` | `http://localhost:3201/ar/profile` |
| Your communities | `http://localhost:3201/en/feed` | `http://localhost:3201/ar/feed` |
| For you | `http://localhost:3201/en/feed/for-you` | `http://localhost:3201/ar/feed/for-you` |
| Explore communities | `http://localhost:3201/en/communities` | `http://localhost:3201/ar/communities` |
| Search the archive | `http://localhost:3201/en/archive` | `http://localhost:3201/ar/archive` |

1. Enter the synthetic email for that profile. Click **Request a sign-in link → Open local confirmation → Confirm sign-in** in that browser. Confirmation opens the localized profile. The seeded phase supplies the O and R display names already. In the empty phase leave N's name unsaved. There are no passwords, real email links, or pre-seeded sessions. Use fresh browser profiles for each phase and keep N and L profileless.
2. Work in this order: access and empty data → seeded ordering and paging in both languages → voting → membership changes → DevTools and account-switch cases. Run F01-01 and F01-02 before changing the baseline memberships. Run F01-04 alongside the private removal case. Run the rate-limit case last in its dedicated account. Restore any temporary request blocking, throttling, zoom, and membership changes between cases.
3. Before each row, confirm account alias, route, and fixture phase. For **S** use the prepared seed and expected order sheet. **M** requires separate account profiles unless the case specifically calls for two windows sharing a profile. **D** requires DevTools. **A** requires a screen reader and a working voice for the tested language. A missing fixture, profile, or tool is **Blocked** for that row. Save plain notes as you go.

## What the current app does

- The global **Your communities** link opens `/feed`. The **Feeds** landmark links both feeds, and the language switch preserves the current feed route. `Next posts` replaces the page, `Refresh feed` returns to page one, and leaving the tab clears cards. After returning, use `Refresh feed`. The `Community posts` heading receives focus after manual loads and failures. A changed cursor gives the restart message, while a `401` or `403` gives **Reopen feed**.
- For You shows current `MEMBER` posts in public and private communities, plus public nonmember posts. It ranks by publication time plus 72 elapsed hours for current members, descending, then ID descending. Your Communities includes current `MEMBER` posts only, descending by unboosted publication time then ID. Both expose original publication dates. All four post types and eligible own posts are included. The community and **Open post** links use IDs obtained from the fixture or existing UI, never guessed.
- On the manual preview, the API endpoints are `GET http://localhost:3201/api/feed` and `GET http://localhost:3201/api/feed/for-you`. Optional pagination uses `?after=<next>` on the API only. Pages contain `ok`, `items`, `next`, and `viewer`. For You adds `coldStart` and each item has `reason: joined` or `public`. Visible cards include the community and a vote summary. Success and handled errors are `private, no-store`. Expected errors are `400` malformed parameters, `401` missing/expired/revoked session, `404` missing or inaccessible anchor, `409` invalid signature or changed scope when the anchor is still eligible, `429` exhausted read budget, and `503` disabled or operational failure. Each feed has its own 30-attempt/15-minute budget per viewer. Valid-shaped failed cursor requests count. Treat cursors and viewer values as opaque in reports.
- Voting uses the existing `PUT /api/communities/{communityId}/posts/{postId}/vote` with `value` of `1`, `-1`, or `0`. Use the arrow buttons for normal testing. The UI disables both for a public nonmember or the post author. Other eligible members can vote with a verified session even without a saved name. Direct private post reads remain separately authorized. A private community can appear in Explore Communities without granting access to its posts.
- Arabic labels include **مجتمعاتك**, **لك**, **قوائم المنشورات**, **المنشورات التالية** and **تحديث المنشورات**. The exact English explanations are **From a community you joined** and **Recent public post**. The Arabic equivalents are **من مجتمع انضممت إليه** and **منشور عام حديث**.

## Deterministic fixture specification

These are proposed test aliases and synthetic data, not credentials or an already-seeded environment. Configure four isolated communities with O as creator and `MEMBER`. The initial state contains exactly 30 posts visible to R in For You, and exactly 23 in Your Communities. H supplies one extra private sentinel excluded from both. Leave votes empty. Use actual UUIDs recorded by the preparer. For same-time comparisons, assign the three indicated post UUIDs exactly and keep the rest distinct.

| Alias | Synthetic email | Display name | Initial memberships |
| --- | --- | --- | --- |
| O · Owner | `feed-qa-owner@university.test` | `Owner جامعة` | J, P, D and H, all `MEMBER` |
| R · Reader | `feed-qa-reader@university.test` | `Reader CE101` | J and P, both `MEMBER` |
| N · Newcomer | `feed-qa-new@university.test` | Leave unsaved | None |
| L · Rate-limit account, optional | `feed-qa-limit@university.test` | Leave unsaved | None |

| Code | Community name | Visibility | Synthetic content |
| --- | --- | --- | --- |
| J | `QA Joined CE101 مجتمع` | Public | J01–J21; R is a non-owner member |
| P | `QA Private CE102 مجتمع` | Private | P01–P02; R is an approved non-owner member |
| D | `QA Discovery CE103 استكشاف` | Public | D01–D07; R and N start as nonmembers |
| H | `QA Unrelated CE104 خاص` | Private | H01 with title `H01 QA private sentinel`; neither R nor N has access |

Use titles beginning with their code. Give J01 the mixed title `J01 CE101 مؤشرات`, and P01 a mixed body such as `CE102 خطوات المراجعة · R2-D2`. J01 is a question, J02 a discussion, J03 a resource, and J04 an announcement authored by O. Assign a long inert literal HTTPS link such as `https://example.invalid/CE101/very-long-reference-identifier-CE101-CE101-CE101` to J03 for wrapping checks. Keep a short, nonempty synthetic body on every post. R authors J21. O authors all other rows. Use UTC timestamps and keep original milliseconds.

| Post | Publication timestamp (UTC) | Rank time for R or required tie ID |
| --- | --- | --- |
| J01–J18 | `2026-11-11T12:00:00.000Z` minus `(index − 1)` minutes | Each becomes three days later. J01 is newest of these. |
| J19 | `2026-11-10T11:00:00.000Z` | `2026-11-13T11:00:00.000Z` |
| **J20** | `2026-11-10T12:00:00.000Z` | `2026-11-13T12:00:00.000Z`, ID `00000000-0000-4000-8000-000000000020` |
| J21 | `2026-11-06T12:00:00.000Z` | `2026-11-09T12:00:00.000Z` |
| P01 / P02 | `2026-11-10T10:00:00.000Z` / `2026-11-10T09:00:00.000Z` | November 13 at 10:00 / 09:00 UTC |
| **D01** | `2026-11-13T12:00:00.001Z` | 1 ms above J20 |
| **D02** | `2026-11-13T12:00:00.000Z` | Ties J20, higher ID `00000000-0000-4000-8000-000000000030` |
| **D03** | `2026-11-13T12:00:00.000Z` | Ties J20, lower ID `00000000-0000-4000-8000-000000000010` |
| **D04** | `2026-11-13T11:59:59.999Z` | 1 ms below J20 |
| D05 / D06 / D07 | `2026-11-13T08:00:00.000Z` / `2026-11-12T18:00:00.000Z` / `2026-11-10T13:00:00.000Z` | Public, same as publication time |
| H01 | `2026-11-18T00:00:00.000Z` | Newer unrelated private sentinel, excluded for R and N |

| Baseline | Page 1 in order | Page 2 in order |
| --- | --- | --- |
| R · For You | J01–J18, D01, D02 (20) | J20, D03, D04, J19, P01, P02, D05, D06, D07, J21 (10) |
| R · Your Communities | J01–J18, J20, J19 (20) | P01, P02, J21 (3) |
| N · For You | D01–D06, J01–J14 (20) | J15–J18, D07, J20, J19, J21 (8) |
| N · Your Communities | Empty | No next page |

Check counts in the API response in DevTools or by counting titles. On the UI, the date is formatted in UTC and displays only a date. To check milliseconds, use the authorized response `createdAt` or the card's `<time datetime>` in Elements. Do not infer rank from visible date text.

## Checklist

Write observed results in the **Actual Result** column. **Pass** means the full expectation was observed. **Fail** means something differed. **Blocked** means an unmet prerequisite or an execution obstruction. **Not Run** means there was no attempt. Repeat key checks in AR and record separate outcomes when they differ.

### Access, recommendations and controls

| Test ID | Preconditions | Steps | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| FY-01 Anonymous | Empty or seeded preview, clean profile. D optional. | 1. Open both feed pages in EN and AR. 2. In the same anonymous profile, visit the two API URLs without parameters. | Pages go to the corresponding localized sign-in. GET replies `401` with `ok: false`, no items and private/no-store. | Owner reported all expected outcomes matched in EN and AR. | PASS | [Owner-reported EMPTY results](#owner-reported-empty-results). |
| FY-02 Empty and profileless | Fresh EMPTY database with no posts. N signed in without saving a name. | 1. Open For You EN then AR. 2. Read the empty state. 3. Follow **Explore communities**, return, then follow **Search the archive**. | General public guidance plus accessible localized empty message. Both destinations use the selected locale. No cards or Next. Refresh remains available. | Owner reported all expected outcomes matched in EN and AR. | PASS | [Owner-reported EMPTY results](#owner-reported-empty-results). |
| FY-03 Feed navigation | S, R. | 1. From profile select global **Your communities**. 2. In **Feeds**, select **For you**. 3. Switch to Arabic using **العربية**, then back via **English**. 4. Select **Your communities** in **Feeds**. | `/feed` remains the default. Both tabs and current-page marker follow the selected feed. Language changes keep the feed path and change locale. | Owner reported PASS in EN and AR. | PASS | [Owner-reported SEEDED results](#owner-reported-seeded-results). |
| FY-04 Mixed eligibility and labels | S, R. | 1. Open For You. 2. Compare both pages with R's order sheet. 3. Check labels on a J, a P and a D item. 4. Open a permitted community and post from their links. | J/P say joined and D says recent public, correctly localized. H01 is absent. All four post types and R's own J21 appear in the traversal. Links resolve to the matching source. | Owner reported PASS in EN and AR. | PASS | [Owner-reported SEEDED results](#owner-reported-seeded-results). |
| FY-05 Exact 72-hour boundary | S, R, D. | 1. Inspect page 1's last cards and page 2's first cards. 2. Read timestamps for D01–D04 and J20. 3. Repeat after **Refresh feed**. | D01 ranks above the exact tie. D02 ends page 1, J20 starts page 2, then D03 and D04. J20 shows the original November 10 publication date. Refresh preserves this order. | Owner reported PASS in EN and AR. | PASS | [Owner-reported SEEDED results](#owner-reported-seeded-results). |
| FY-06 Next and exhaustion | S, R. | 1. Record page 1 titles. 2. Scroll without activating Next. 3. Activate **Next posts**. 4. Compare page 2 and then refresh. | Scrolling alone adds no cards. Next replaces the first 20 with the last 10, with no duplicates or omissions. End status is shown, Next is gone, and Refresh returns the original first page. | Owner reported all expected outcomes matched in EN and AR. | PASS | D optional for final `next: null`. [Run evidence](#owner-reported-seeded-resume-results). |
| FY-07 Seeded cold start | S, N profileless. | 1. Open For You in EN and AR. 2. Verify both pages using N's order sheet. 3. Follow both discovery links. | N sees only 28 public posts in chronological order without boosts, `coldStart: true`, and public explanations and cold-start guidance. No P or H content. | Owner reported all expected outcomes matched in EN and AR. | PASS | Leave N's name unsaved. [Run evidence](#owner-reported-seeded-resume-results). |
| FY-08 Vote controls and stable ranking | S, R, D optional. | 1. On J01, Upvote, switch to Downvote, then press Downvote again. 2. Refresh at each step if checking persistence. 3. Check D01 and own J21. | Counts go 1/0 → 0/1 → 0/0 from a clean vote fixture. Pressed state and feedback match. Ranking stays the same. D01 and J21 vote buttons are disabled. | Owner reported all expected outcomes matched in EN and AR. | PASS | Optional P01 check while R is a member. Restore vote to neutral. [Run evidence](#owner-reported-seeded-resume-results). |
| FY-09 Member-only vote enforcement | S, M, D. | 1. As R confirm successful `PUT` for J01. 2. As R use the controlled same-origin vote probe below on public D01 and own J21. | J01 returns `200`. Nonmember and self-vote probes both return `403`. Subsequent reads show no vote changes on denied targets. | Owner reported PASS. Individual HTTP status codes were not supplied in the final report. | PASS | Use only fixture IDs. Never copy any session cookies. [Run evidence](#owner-reported-seeded-pause-results). |

### Membership, session and failures

| Test ID | Preconditions | Steps | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| FY-10 Private stranger, pending, rejected | S, M, N and O. D optional. | 1. As N check absence of P01/H01. 2. Try P01's known post URL from the fixture. 3. From Explore request to join P. Recheck. 4. As O open P → **Membership management** → **Reject request** for N. Recheck N. | P may be discoverable, but no private cards at any stage, and N's direct private post remains unavailable. Rejection clears the pending request. N remains cold-start because pending is not membership. | Owner reported all expected outcomes matched. | PASS | The direct post GET is `404` if checked in Network or by visiting its API path. [Run evidence](#owner-reported-seeded-continuation-results). |
| FY-11 Private removal and rejoin | S, M, O and R; clean R baseline. D for old cursor replay. | 1. Leave R on first page and record its cursor privately. 2. As O remove R from P via Membership management. 3. In R's still-visible window activate **Next posts**. 4. Refresh and traverse again, then try P01 directly. 5. R requests again, O approves; refresh. 6. Replay the original cursor in R's own profile. | Next gives restart and clears cards (`409` with the baseline public D02 anchor). Fresh results exclude P and have 28 posts. Direct P01 is unavailable. Approval restores P's 2 joined posts and original ranking. Old cursor gives `409` even after rejoin. | Owner reported all expected outcomes matched. | PASS | Arrange two visible windows. If R was hidden, Refresh can be required before a Next test. Keep cursor out of evidence. [Run evidence](#owner-reported-seeded-continuation-results). |
| FY-12 Public join and leave | S, R baseline after FY-11, M optional. | 1. On D01's community link select **Join community**. 2. Return to For You and refresh. 3. Locate D01, vote if desired then clear, and leave D. 4. Refresh and compare with baseline. | D shifts from public discovery to joined and gains the boost. Joined D01 ranks above J01 in this fixture, is vote-eligible for R, and appears in F01. After leaving, D stays readable in For You, loses boost and voting eligibility, and disappears from F01. | Owner reported PASS. | PASS | Do not run while recording baseline pages. [Run evidence](#owner-reported-seeded-pause-results). |
| FY-13 Request in progress | S, R, D. | 1. On For You page 1 open Network and select a slow throttling profile. 2. Activate **Next posts**. 3. Inspect results while the fetch is pending, then let it finish and restore network. | Existing cards clear while loading, results expose `aria-busy=true`, and a loading message is visible. Once complete, page 2 and focused results heading appear. | Owner reported PASS. | PASS | Throttle only enough to observe loading. The client aborts at 15 seconds. [Run evidence](#owner-reported-seeded-pause-results). |
| FY-14 Recoverable feed error | S, R, D. | 1. Load first page. 2. Block only the For You API request in DevTools or choose Offline temporarily. 3. Activate Next. 4. Observe error and focus, then restore the network and activate **Retry**. | Error is distinct from no results. Old cards are cleared. Retry succeeds with the same page boundary and focuses the results heading. | Owner reported all expected outcomes matched. | PASS | Record transport failure as transport, not as a server `503`. Repeat AR for error labels. [Run evidence](#owner-reported-seeded-session-results). |
| FY-15 Tab departure and refresh | S, R. | 1. Show P01 on page 2. 2. Switch to another tab in the same window, then back. 3. Activate Refresh. | Old private cards are cleared on tab departure. The paused state requests a refresh. Fresh results start at page 1 after authorization. | Owner reported all expected outcomes matched. | PASS | Record actual focus on return. [Run evidence](#owner-reported-seeded-session-results). |
| FY-16 Logout during an open view | S, R, M (two windows using R's profile), D optional. | 1. Keep one feed window visible. 2. Log out from `/en/profile` in the other window. 3. Refresh the feed using its button, then activate **Reopen feed**. | A subsequent read sees `401`, clears cards and shows unavailable. Reopen redirects to localized sign-in. If the feed paused when hidden, use its Refresh first. | Owner reported PASS. Individual HTTP statuses were not supplied. | PASS | No assertion of instant revocation for a continuously visible already-delivered page. [Run evidence](#owner-reported-seeded-read-budget-and-logout-results). |
| FY-17 Account replacement and held response | S, M, D, R and N in two windows of a dedicated shared profile. O stays in a separate profile. | 1. Follow the held-response procedure below. 2. Confirm B's cold-start page in the original document. 3. Release A's held P01 payload. | After the viewer change renders, P01 never reappears, even transiently. The replacement page remains populated with N's public posts. | Owner reported that N's public results remained visible and P01/P02 did not reappear after release. | PASS | This tests a rendered viewer change. The companion diagnostic below covers the cookie-only gap. [Run evidence](#owner-reported-seeded-held-response-result). |
| FY-18 Malformed and incompatible cursors | S, M, D, R and O. | 1. Open `/api/feed/for-you?after=bad`, `?after=&after=`, and `?unknown=1`. 2. Privately take R's valid first-page For You cursor and change one hex character in the signature only. 3. Try R's unmodified cursor on `/api/feed` and as O on `/api/feed/for-you`. | Step 1 gives `400`. The modified signature and foreign-viewer replay give `409` while D02 is eligible. Cross-feed replay gives `404` if D02 is ineligible for that viewer, otherwise `409`. No error includes cards, anchor metadata or internal fields. | Owner reported PASS. | PASS | Use each browser's own session. Record status only, URLs without the actual cursor. [Run evidence](#owner-reported-seeded-cursor-and-switch-results). |
| FY-19 Read budget, optional | S, L, D. Quiet 15-minute window. | 1. From an already-open profile or guest page, make exactly 31 sequential valid `GET /api/feed/for-you` requests with the read probe below. 2. Check `/api/feed` once. 3. If checking UI throttle, open For You and observe, then stop. | Calls 1–30 return `200`, call 31 returns `429`. L's F01 read still succeeds. The For You UI shows the localized too-many-requests error with Retry. After the normal window, a fresh read can succeed. | Owner reported PASS. Individual HTTP statuses were not supplied. | PASS | Dedicated alias. Do not rapidly retry or alter counters. [Run evidence](#owner-reported-seeded-read-budget-and-logout-results). |
| FY-20 Ordinary startup, optional | D optional. Approved isolated ordinary production build on loopback port 3100, synthetic preview disabled for this pass. | 1. Facilitator starts `npm run start -- --hostname 127.0.0.1 --port 3100` after the separate approval. 2. Visit `http://127.0.0.1:3100/en/feed/for-you` and `/ar/feed/for-you` on that origin. 3. Visit `/api/feed/for-you` there. | Localized feed error, no cards. API returns `503` and private/no-store. No synthetic sign-in or mailbox is available on ordinary startup. | Owner reported PASS on the approved isolated Windows ordinary server. Individual HTTP response evidence was not supplied. | PASS | Run in a clean profile. Stop only the verified ordinary foreground server afterward. [Run evidence](#owner-reported-windows-ordinary-startup-results). |
| FY-25 Normal account switch | S, M, R and N. Use a throwaway profile for the switch. | 1. As R, open For You and locate P01 on page 2. 2. Open Profile, log out, then sign in as N in the same profile. 3. Open For You and F01. | N sees only public cold-start cards, no R private content or retained page position. F01 is empty for N. | Owner reported PASS. | PASS | No DevTools or response hold required. [Run evidence](#owner-reported-seeded-cursor-and-switch-results). |
| FY-26 Cookie-only session change before rendering, diagnostic | Original Feed tab remains visible with an authorized response pending, and no app session broadcast is received. | See the evidence and acceptance decision below. | A session check that sees the new session withholds the previous viewer's response. | — | Not Run | Keep separate from FY-17 and the app broadcast tests. |

### Accessibility and responsive checks

| Test ID | Preconditions | Steps | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| FY-21 Keyboard and focus | S, R, EN then AR. | 1. Use Tab/Shift+Tab from the top, activate skip link and feed navigation. 2. Reach a community link and vote actions. 3. Use Enter or Space on Next and Refresh. 4. Run error/retry with keyboard if D is available. | Focus stays visible, follows a sensible order and never traps. The skip link reaches main content. The results heading receives focus after manual load/failure; one Tab from the populated heading reaches the first community link. Disabled vote controls are not keyboard stops. | Owner reported all expected outcomes matched. | PASS | Record focused control after each action. [Run evidence](#owner-reported-seeded-session-results). |
| FY-22 RTL and narrow layout | S, R, D for exact width. | 1. Open `/ar/feed/for-you` and then `/en/feed/for-you`. 2. Check document `lang` and `dir` in Elements. 3. At 320 CSS px and a typical mobile width, inspect headings, J01/J03, vote controls, and Next/Refresh. | `ar`/`rtl` and `en`/`ltr`. Arabic layout reads naturally, mixed IDs and literal URL remain readable, no page-level horizontal scrolling or clipped actions. | Owner reported all expected outcomes matched. | PASS | Use browser device toolbar for CSS viewport widths. [Run evidence](#owner-reported-seeded-session-results). |
| FY-23 Native zoom | S, R, EN and AR. | 1. Turn off device emulation. 2. Use the browser's Zoom menu at 200% then 400%. 3. Read a mixed card and activate Next or Refresh at each setting. Restore 100%. | Text and controls remain operable, focus remains visible, no horizontal scrolling at approximately 320 CSS px on a 1280 px baseline. Record effective viewport to qualify other widths. | Owner reported all expected outcomes matched. | PASS | Browser zoom, not operating-system scaling. [Run evidence](#owner-reported-seeded-session-results). |
| FY-24 Spoken feedback | S, A; D for a controlled load/error. | 1. With the screen reader on, use landmarks, headings and Tab through both feeds. 2. Trigger loading, error/retry and exhaustion; read the cold-start or empty state. 3. Repeat with an Arabic voice if available. | Feed navigation and current page are understandable. Buttons, vote pressed state, status and errors are announced intelligibly. Focus gives a clear continuation point. | Owner reported all expected outcomes matched. | PASS | Record reader/version, voice, locale and actual announcements. Mark missing voice Blocked for that language. Reader name/version, voice, tested locale and actual announcements were not supplied. [Run evidence](#owner-reported-seeded-session-results). |

### Focused M4-F01 regression

| Test ID | Preconditions | Steps | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| F01-01 Default, chronology and paging | S, R. | 1. Use global **Your communities** in EN and AR. 2. Check both pages against R's F01 order. 3. Refresh. | `/en/feed` or `/ar/feed`; 20 then 3, with original time order and J20 before J19 on page 1. J/P only, no D/H or recommendation labels, no cold-start message. Own J21 remains visible. End and Refresh work. | Owner reported all expected outcomes matched. | PASS | Baseline before membership changes. [Run evidence](#owner-reported-seeded-continuation-results). |
| F01-02 Profileless empty | S, N, or empty phase. | 1. Open EN and AR F01. 2. Check empty message and follow Explore. | Localized F01 empty message, no posts or Next even though public discovery exists in seeded For You. Explore remains reachable. | Owner reported all expected outcomes matched. | PASS | Verify profileless access. [Run evidence](#owner-reported-seeded-continuation-results). |
| F01-03 Public leave and rejoin | S, R with J/P baseline. | 1. Leave J through its community page. 2. Refresh both feeds and find J01. 3. Rejoin J and refresh F01. | F01 contains only P01/P02 after leaving J. For You still includes public J with public reason and no vote eligibility. Rejoin restores original F01 scope and chronology. | Owner reported PASS. | PASS | Capture the difference before rejoining. [Run evidence](#owner-reported-seeded-pause-results). |
| F01-04 Private revocation and stale cursor | S, M, O/R; arrange alongside FY-11. D for replay. | 1. Record an F01 first-page cursor in R's profile before removal. 2. After O removes R, use Next on the still-visible F01 page or replay its cursor. 3. Refresh and page to the end. | Old cursor rejects safely (`409` for still-eligible J19); no private cards or stale page remain. Fresh F01 contains 21 J posts over two pages, no P. After approval the original cursor still rejects. | Owner reported all expected outcomes matched. | PASS | For live Next and FY-11 arrange separate visible windows or restore baseline in a new run. [Run evidence](#owner-reported-seeded-continuation-results). |
| F01-05 Retry, tab departure and keyboard | S, R, D for error. | 1. Trigger a Next transport failure on F01. 2. Restore network and keyboard-activate Retry. 3. Switch away from page 2, return and refresh. | F01 clears cards while retrying, focuses heading, loads the last three, and clears content on tab departure. Refresh starts again at page one. | Owner reported all expected outcomes matched. | PASS | Remove the feed request block afterwards. [Run evidence](#owner-reported-seeded-session-results). |
| F01-06 Voting, no-store and cursor scope | S, R, D. | 1. As R verify a J01 vote is enabled, and own J21 is disabled. Clear any vote. 2. Inspect a successful `/api/feed` response for private/no-store. 3. Replay the F01 cursor on R's `/api/feed/for-you`. | Existing voting rules and counts apply. API remains private/no-store. Cross-feed replay returns `409` because J19 remains eligible in For You but the feed namespace differs. | Owner reported all expected outcomes matched and explicitly observed HTTP `409` on the cross-feed replay. | PASS | Use only the fixture's authorized cursor. [Run evidence](#owner-reported-seeded-continuation-results). |
| F01-07 Ordinary startup, optional | Approved FY-20 isolated ordinary server. | 1. Visit `http://127.0.0.1:3100/en/feed` and `/ar/feed` on that origin. 2. Visit `/api/feed` there. | Both localized pages show the feed error and no cards. API returns `503` and private/no-store. | Owner reported PASS on the approved isolated Windows ordinary server. Individual HTTP response evidence was not supplied. | PASS | Run together with FY-20. [Run evidence](#owner-reported-windows-ordinary-startup-results). |

## DevTools procedures for marked cases

Use DevTools only against the approved synthetic preview for the current campaign. In Network filter by `feed`, and clear the log before sign-in or confirmation. For a cursor check, use the current fixture account's API `next` locally, append it to that API's `?after=` for replay, then close that result tab. The app intentionally rejects page query strings. Use no credential or cookie copies. For direct private post evidence, its GET is `/api/communities/{communityId}/posts/{postId}` with IDs taken from the prepared P01 mapping. Expected denial uses the normal browser's session.

For FY-09, from an approved preview page in R's authenticated window, use the fixture values in this same-origin probe. It prints only the status. For FY-19 use the separate optional L profile, count `200` and `429` from Network, and stop after exactly 31 feed calls.

```js
// FY-09 only. Substitute the IDs of the indicated synthetic community and post.
const response = await fetch('/api/communities/{communityId}/posts/{postId}/vote', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ value: 1 }), cache: 'no-store'
});
console.log(response.status);

// FY-19 only. In L's clean window before any For You reads.
for (let attempt = 1; attempt <= 31; attempt++) {
  const result = await fetch('/api/feed/for-you', { cache: 'no-store' });
  console.log(attempt, result.status);
}
console.log('F01', (await fetch('/api/feed', { cache: 'no-store' })).status);
```

**FY-17 held response.** This one requires precise timing. Open R's For You first page in window A and open a second window B in the same disposable browser profile. Keep both visible side by side. In A's Console, install the following temporary probe, substituting the **P01 UUID** from the fixture. It holds only the next For You response body and reports booleans, never card content or authorization material.

```js
(() => {
  const selector = '#post-{P01_UUID}';
  const original = window.fetch;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const state = { held: false, hidden: false, resurfaced: false };
  const visibility = () => { if (document.hidden) state.hidden = true; };
  document.addEventListener('visibilitychange', visibility);
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node =>
      node instanceof Element && (node.matches(selector) || node.querySelector(selector))))) {
      state.resurfaced = true;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.qaFeedRace = {
    state, release,
    clean() { release(); window.fetch = original; observer.disconnect();
      document.removeEventListener('visibilitychange', visibility); delete window.qaFeedRace; }
  };
  window.fetch = async (...args) => {
    if (!String(args[0]).startsWith('/api/feed/for-you')) return original(...args);
    window.fetch = original;
    const response = await original(...args);
    const read = response.json.bind(response);
    response.json = async () => {
      const body = await read();
      state.held = body.items?.some(item => '#post-' + item.id === selector) === true;
      await gate;
      return body;
    };
    return response;
  };
})();
```

1. In A activate **Next posts**. Check `qaFeedRace.state` reports `held: true`. The held page includes P01. In B open `/en/signin` on the preview and sign in as N using the normal local confirmation flow. Both windows share the replacement session.
2. In A use **Feeds → Your communities**, wait for N's empty F01, then use **Feeds → For you** and wait for N's general public results. Keep A in the same document. If `qaFeedRace` disappeared or `state.hidden` is true, record **Blocked** for the intended account race and note the reload or tab-clear confounder.
3. In A run `qaFeedRace.release()`. Observe the current cards and `qaFeedRace.state.resurfaced`; they must stay public with `resurfaced: false`. Run `qaFeedRace.clean()` when finished. If the countdown or fixture blocks arranging both windows, use the prepared Playwright case after automated execution is separately approved.

**FY-26 evidence and acceptance.** App-confirmed sign-in and sign-out publish a local notification. Tests show that this aborts a pending session check. A cookie-only change with no notification is distinct from that case and from FY-17, where the replacement viewer has already rendered. Both feeds require a fresh authenticated session check after parsing a response and before applying cards, and deny a mismatch or a failed check. If the server sees the new cookie on that check, source review indicates the response will be withheld. Direct browser evidence for the exact no-broadcast timing remains **Not Run**. A silent cookie change after the check has authenticated cannot be detected before rendering without another observation. A subsequent request, lifecycle recheck or app notification can clear the view. Already delivered content cannot be remotely erased.

The owner can accept that residual timing limitation for the local milestone with FY-26 still recorded as **Not Run**, or hold final privacy acceptance for a stronger session design and further evidence. This decision is pending. It does not prevent the owner from collecting the unrelated manual results.

## Owner-reported EMPTY results

- Run `6fd304d7cee2`, fixture **EMPTY**, test date **2026-11-18**. Exact testing time was not supplied.
- Chromium **157.0.8103.79** in **English and Arabic**.
- Reviewed snapshot SHA-256 `d4c2d5848b165d514fbbd647a483578e55e19dcd7a3cede1337aa698a3cd682d`.
- Evidence is owner-reported manual observation. All expected outcomes in the two rows above matched, and the owner reported no additional issues. No independent manual or automated rerun was performed.

## Owner-reported SEEDED results

- Run `33da82ee35e3`, fixture **SEEDED**, test date **2026-11-18**. Exact testing time was not supplied.
- Chromium **157.0.8103.79** in **English and Arabic**.
- Reviewed snapshot SHA-256 `d4c2d5848b165d514fbbd647a483578e55e19dcd7a3cede1337aa698a3cd682d`.
- The owner reported **PASS** for FY-03, FY-04 and FY-05, with no additional issues. Evidence is owner-reported manual observation. No independent manual or automated rerun was performed.

## Owner-reported SEEDED resume results

- Run `fdcacf8f5bef`, fixture `m4-f02-manual-v1`, Chromium **157.0.8103.79** in **English and Arabic**. Exact testing time was not supplied.
- Reviewed snapshot SHA-256 `d4c2d5848b165d514fbbd647a483578e55e19dcd7a3cede1337aa698a3cd682d`.
- FY-06, FY-07 and FY-08 were **PASS** according to the owner. All expected outcomes matched, with no additional issues. No independent manual or automated rerun was performed.

## Owner-reported SEEDED continuation results

- Run `dc45d8641a3a`, fixture `m4-f02-manual-v1`, reviewed snapshot SHA-256 `d4c2d5848b165d514fbbd647a483578e55e19dcd7a3cede1337aa698a3cd682d`.
- The owner reported **PASS** for FY-10, F01-01, F01-02, F01-06, F01-04 and FY-11. The F01-06 report explicitly included a `409` response from For You when using a valid F01 cursor. The owner also observed disabled voting controls for FY-09. Its direct API checks are pending. No case was independently rerun.
- A separate read-only fixture check confirmed R's original J/P memberships are restored and R has no other membership. The next batch begins after FY-09 is resolved.

## Owner-reported SEEDED pause results

- Run `dc45d8641a3a`, fixture `m4-f02-manual-v1`. Report received 2026-11-20.
- The owner reported **PASS** for FY-09, FY-12, F01-03 and FY-13. Individual FY-09 HTTP status codes were not supplied. No case was independently rerun.
- The owner confirmed FY-14, F01-05, FY-15 and FY-16 were not executed. A separate read-only pre-shutdown check confirmed R is a member of J and P only, with no D membership.

## Owner-reported SEEDED session results

- Run `fe67cc690116`, fixture `m4-f02-manual-v1`, Windows Chromium. Report received 2026-11-21. Chromium version and exact test times were not supplied.
- Reviewed snapshot SHA-256 `d4c2d5848b165d514fbbd647a483578e55e19dcd7a3cede1337aa698a3cd682d`.
- The owner reported **PASS** for FY-14, F01-05, FY-15, FY-21, FY-22, FY-23 and FY-24. All expected results matched according to the owner, who reported no additional issues. No case was independently verified.
- FY-24 remains an owner-reported PASS. The screen reader name and version, working voice or voices, tested locale or locales, and actual announcements were not supplied.
- Totals are 25 PASS, 0 FAIL, 0 BLOCKED and 8 NOT RUN. FY-26 remains NOT RUN with privacy acceptance unresolved.

## Owner-reported SEEDED cursor and switch results

- Run `fe67cc690116`, fixture `m4-f02-manual-v1`. Follow-up report received 2026-11-21.
- The owner reported **PASS** for FY-18 and FY-25. This follow-up supplied case verdicts without individual HTTP statuses or detailed UI observations. Neither case was independently verified.
- FY-17 was not attempted because the held-response setup needed clarification. FY-17, FY-19 and FY-16 remain **NOT RUN**. FY-20, F01-07 and FY-26 also remain **NOT RUN**. FY-26 privacy acceptance is unresolved.
- Totals are **27 PASS, 0 FAIL, 0 BLOCKED, 6 NOT RUN**. FY has 21 PASS and five NOT RUN. F01 has six PASS and one NOT RUN.

## Owner-reported SEEDED held-response result

- Run `fe67cc690116`, fixture `m4-f02-manual-v1`. Follow-up received 2026-11-21. The owner used two Chromium windows sharing a profile and reported **PASS** for FY-17. The test was not independently verified.
- The held response contained P01. Before release, the probe showed `held=true`, `hidden=false`, and `resurfaced=false`. N's public feed rendered after the account switch. The owner then released the original response.
- After release, the probe showed `held=true`, `hidden=false`, and `resurfaced=false`. Only N's public posts remained visible. P01 and P02 did not reappear, and `qaFeedRace.clean()` completed.
- The browser logged `GET /api/feed/session net::ERR_ABORTED 403 (Forbidden)`. The sanitized message was preserved as an observation. Its cause was not established.
- Totals are **28 PASS, 0 FAIL, 0 BLOCKED, 5 NOT RUN**. FY-16, FY-19, FY-20, FY-26 and F01-07 remain **NOT RUN**. FY-26 privacy acceptance is unresolved.

## Owner-reported SEEDED read-budget and logout results

- Run `fe67cc690116`, fixture `m4-f02-manual-v1`. Follow-up received 2026-11-21.
- The owner reported **PASS** for FY-19 and FY-16 and reported no additional issues. Individual HTTP status codes and detailed observations were not supplied. Neither case was independently verified.
- FY-17 was already recorded as owner-reported PASS. Its sanitized observations remain in the preceding section.
- Totals are **30 PASS, 0 FAIL, 0 BLOCKED, 3 NOT RUN**. FY has 24 PASS and two NOT RUN. F01 has six PASS and one NOT RUN. FY-20, F01-07 and FY-26 remain **NOT RUN**. FY-26 privacy acceptance is unresolved.

## Owner-reported Windows ordinary startup results

- Approved isolated Windows server at `http://127.0.0.1:3100`, built from the same verified 464-file snapshot. The owner reported **PASS** for FY-20 and F01-07 and reported no additional issues. The owner also reported that synthetic sign-in was disabled. That observation supports both cases and is not a separate numbered result.
- The owner did not supply individual HTTP response evidence. Neither manual case was independently verified. The separate startup verification covers process ownership, loopback binding and disabled synthetic identity.
- The verified ordinary Next.js listener was PID `33408`. Its recorded foreground session was interrupted, and the ordinary batch-exit prompt was confirmed in that session. All recorded ordinary processes exited and port `3100` was released. Startup and shutdown records and the isolated copy were retained. SEEDED `fe67cc690116` remained running with its owned database and authenticated supervisor verified.
- Totals are **32 PASS, 0 FAIL, 0 BLOCKED, 1 NOT RUN**. FY has 25 PASS, and F01 has seven PASS. FY-26 remains **NOT RUN** with privacy acceptance unresolved.

## Focused Manual Regression

Recorded November 22, 2026 (Asia/Hebron) for fresh SEEDED run `166a7f61d505`, fixture `m4-f02-manual-v1`, at `http://localhost:3201`. The active export uses the verified 468-file snapshot with manifest SHA-256 `b0fbdabd4cda1ccd47f4d5e08734e1dda185e14f28649aed73e7dedee4a0ff13`. The guarded Windows status command verified the running supervisor, authenticated application control, and owned phase database.

### Batch 1 owner report

| Case | For You EN | Your Communities EN | For You AR | Your Communities AR |
| --- | --- | --- | --- | --- |
| REG-01 Successful periodic renewal | PASS | PASS | PASS | PASS |
| REG-02 Normal logout and keyboard focus recovery | PASS | PASS | PASS | PASS |
| REG-03 Session check failure and Retry | PASS | PASS | PASS | PASS |

The owner reported no additional issues. These 12 browser observations were owner-reported and have not been independently verified. The report supplied no individual HTTP statuses, exact timings, screenshots, browser versions, or focus element IDs. No Batch 1 repeat is needed based on the report.

### Batch 2 owner report

| Case | For You EN | Your Communities EN | For You AR | Your Communities AR |
| --- | --- | --- | --- | --- |
| REG-04 Hidden tab and visibility restoration | PASS | PASS | PASS | PASS |
| REG-05 Feed switching | PASS | PASS | PASS | PASS |
| REG-06 Keyboard accessibility and RTL | PASS | PASS | PASS | PASS |

The owner reported all 12 checks PASS on run `166a7f61d505` and reported no additional issues. These are owner-reported browser observations. The report supplied no individual HTTP statuses, exact timings, screenshots, browser versions, or focus element IDs. No independent browser observation was recorded for this batch.

| Focused regression | PASS | FAIL | BLOCKED | NOT RUN |
| --- | ---: | ---: | ---: | ---: |
| Batch 1 | 12 | 0 | 0 | 0 |
| Batch 2 | 12 | 0 | 0 | 0 |
| Total | 24 | 0 | 0 | 0 |

Focused regression is **24 PASS out of 24 planned**. No REG case needs repeating based on the owner's current observations. The official FY/F01 checklist remains **32 PASS, 0 FAIL, 0 BLOCKED, 1 NOT RUN (FY-26)**. The owner decision on the residual silent session change window remains open.

### Batch 2 instructions used

Use reader sign-in `feed-qa-reader@university.test` in the temporary Chromium profile and the normal local confirmation flow at `http://localhost:3201/en/signin` or `http://localhost:3201/ar/signin`. Clear any DevTools request blocking, Offline mode, or throttling from Batch 1. Run each case once from each of the four starting routes below.

| Feed | English | Arabic |
| --- | --- | --- |
| Your Communities | `http://localhost:3201/en/feed` | `http://localhost:3201/ar/feed` |
| For You | `http://localhost:3201/en/feed/for-you` | `http://localhost:3201/ar/feed/for-you` |

1. **REG-04 Hidden tab and visibility restoration.** Start with populated cards. Switch to another tab in the same window for about 35 seconds. Return without reloading or signing out. PASS if cards stay cleared on return, the localized refresh prompt appears, and activating **Refresh feed** loads cards again. This checks visibility behavior without repeating the renewal, logout, or failure cases.
2. **REG-05 Feed switching.** Use **Next posts** on the starting feed and verify P01 is on page two. Use the **Feeds** navigation to open the other feed in the same locale, then switch back. PASS if each switch shows the destination's first page and the old page-two cards do not reappear before, during, or after the new load. For You's first page includes D01 and D02. Your Communities excludes them.
3. **REG-06 Keyboard and RTL.** With the feed visible and the session healthy, use Tab and Shift+Tab to reach the **Feeds** navigation and a card link. Tab to **Refresh feed** and press Enter. PASS if focus is visible and follows a usable order, card controls have meaningful localized names, and focus lands on **Community posts** / **منشورات المجتمعات** after refresh. The next Tab should reach the first community link. In Arabic also verify RTL layout and that mixed Latin/Arabic titles remain readable. Use the unavailable and Retry results from Batch 1 without repeating those cases.

Mark PASS when all stated outcomes match. Mark FAIL for an observed mismatch with the setup met. Mark BLOCKED if sign-in, fixture, browser tooling, or an unrelated navigation problem prevents a valid observation. Record case, feed, locale, verdict, observed behavior, and browser version if available. Use the normal browser UI and sanitized notes. Leave cookies, confirmation links, headers, and raw traces out of the report.

## Evidence and handback

- Record run ID, source inventory/hash, fixture version, host and browser version, UTC time, account alias, locale, CSS viewport, zoom, and screen reader/voice if relevant. A retry or a changed setup gets a new attempt entry. Document whether the tester needed help.
- Take screenshots of the rendered app only, named like `FY-05-en-attempt1-page2.png`. Capture the focused control or message and enough surrounding context to see the outcome. Crop address bars, other tabs, alias details when unnecessary, and private fixture bodies. Never capture verification pages, browser cookie panels, or credentials.
- For a console error, record timestamp, exact sanitized message, source location and the action that triggered it. Note intentional Offline/request blocking and any unrelated browser extension. In Network record method, safe path without query values, status, timing, `Cache-Control`, and summary counts or `next present/null`. Record normal private fields as absent or present without dumping payloads. Do not share raw HARs, traces, `Cookie`/`Set-Cookie`, confirmation URLs or payloads, browser profiles, cursors, viewer IDs, connection strings, or full private responses.
- Store sanitized evidence outside the tracked workspace. Share only the sanitized result table and evidence files the owner requests. Stop on unexpected access to private content or an unrecognized account, resource identity or listener.

Copy this per attempted row:

```text
Run ID / snapshot / fixture version:
Test ID | Preconditions | Steps performed | Expected Result | Actual Result | Status | Notes
Browser/version, locale, viewport/zoom, account alias:
Evidence filename(s) and sanitized response summary:
```

Implementation references: [feed page](../src/app/%5Blocale%5D/feed/feed-page.tsx), [client states](../src/app/%5Blocale%5D/feed/list.tsx), [bilingual labels](../src/i18n/feed.ts), [F02 API](../src/app/api/feed/for-you/route.ts), [F01 API](../src/app/api/feed/route.ts), [ranking](../src/server/feed/for-you-policy.ts), [F02 service](../src/server/feed/for-you-service.ts), [F01 service](../src/server/feed/service.ts), [browser cases](../tests/e2e/feed.spec.ts), [ordinary-start case](../tests/e2e/feed-disabled.spec.ts), [database cases](../tests/database/feed.test.ts), and [checkpoint evidence](project-brief.md#m4-f02-for-you-feed--2026-11-18).
