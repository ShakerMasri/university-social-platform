# UI/UX improvement plan

## Manual testing checklist

Latest UI decision — 2026-11-03: separate up/down totals, compact original filled/outline arrows, an icon-only aligned Comments action and smaller aligned composers. This replaces the earlier shared net-score display. The latest fix and earlier UI/replies work are merged into `main` through [PR #15](https://github.com/ShakerMasri/university-social-platform/pull/15) as `8fb431c`, after both CI runs passed, with [151 passing authenticated browser cases](project-brief.md#vote-failure-feedback-reflow--2026-11-03). M3's agreed local feature scope is complete; UI checkpoint 3's human evaluation remains partial. **Deployment remains unauthorized.** Partner setup is summarized in [README](../README.md#partner-review-of-the-uiux-branch).

**Read this section only to run the remaining manual tests.** Use the latest `main`. Recorded automated checks have the limits above. Manual accessibility testing and feedback from actual people remain. Test in English and Arabic. Report what fails; do not write a long report.

### 1. Start the app and create two test accounts

Start Docker Desktop, then run this in PowerShell:

```powershell
Set-Location 'D:\university-social-platform'
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
npm.cmd run dev
```

**This uses the local development database; startup can apply pending migrations and your tests add data.** If you want to leave development data unchanged, have Codex prepare the disposable preview instead; that participant launcher is not configured yet. Full setup reference: [README](../README.md#run-locally).

Open http://localhost:3000/en/signin. Use `alice@university.test`: **Request a sign-in link → Open local confirmation → Confirm sign-in → save a display name**. In an incognito window, repeat with `bob@university.test`. These are made-up accounts; no real email is sent.

As Alice, create one public and one private community, a discussion/resource and a comment. As Bob, join the public community and request the private one; Alice approves. Keep both windows open. Publish notification test events only **after Bob joins**.

### 2. Run these checks

| Check | What to do | What should happen |
| --- | --- | --- |
| Comments and replies | Click the speech-bubble icon beside the vote arrows (its tooltip/name is **Comments**). If asked, join the community/save your name. Publish a comment; click **Reply** on it. | Comments opens the compact composer section. Reply opens its compact field. Both fields and their action rows line up. A comment with no replies has no Show replies link. |
| Reply drafts and repeated Reply | Type a reply to a root comment, switch Reply to an existing reply, type a different draft, then switch back and forth. Activate Reply again by click and Enter. Cancel one draft. With a prepared long list, repeat on a newly published root and load more comments. | Each target restores its own text. Every Reply activation focuses that field. Cancel discards only that target's draft and returns focus to the root comment. Pagination keeps the new root's reply open with its draft intact. |
| Private reply access removal | With a prepared private thread containing more than 20 replies, load replies as Bob and draft a reply. Alice removes Bob; Bob activates Show more replies. | The denied read clears loaded/local replies and all composers. Reply stays unavailable until fresh authorization. Automated held-response/focus and transient-failure checks are recorded in the brief; no manual delay setup is required. |
| Notification navigation | Open a notification, then immediately visit Profile or change language. Continue using that page. | A delayed response does not send you back or move focus. Returning to Notifications retains any server-confirmed read; opening it again still works. Automated delayed-response checks are recorded in the brief. |
| Votes and notifications | As Bob, upvote Alice's post, comment and reply. Switch to downvote, click it again to clear, then upvote again. As Alice, reopen Notifications. | Separate up/down totals change 1/0 → 0/1 → 0/0 → 1/0 when Bob is the only voter. The selected arrow fills. Only the first upvote per target creates a notification. Each opens the correct content. No self-voting. |
| Upvote preference | As Alice, turn off Upvote notifications in Profile and save. Bob upvotes a new Alice post. | No upvote notification; other notification settings stay independent. Turn the preference back on afterward. |
| Keyboard and visible focus | Put the mouse aside. Use Tab / Shift+Tab, Enter and Space through Communities, a discussion, Profile and Notifications. Open a reply, then cancel it. | Every action is reachable; the focused control has a visible outline and is not covered. Reply focuses its textbox; cancel returns to the comment. |
| Back / Forward / reload | Open a discussion, scroll down, open a reply, cancel, visit Profile, then use browser Back and Forward. Reload and continue with Tab. | Correct content remains accessible; scrolling/focus lets you continue without getting stuck or unexpectedly losing your place. Note where focus lands. The known five-Tab skip/reload sequence is already recorded; no need to repeat it. |
| Failed submission and retry | In Chrome, type a comment. Press F12 → Network → choose Offline in the throttling menu. Try publishing. Change the menu back to No throttling and retry. | A readable error appears; the draft stays; retry publishes exactly once. Restore No throttling before continuing. [Chrome instructions](https://developer.chrome.com/docs/devtools/network/reference#offline). |
| Long lists and identical names | With a prepared list of over 20 items, reach Show more replies using Tab and activate it. Scrolling alone should not load additional replies. In membership management, distinguish two people with the same display name using their IDs. | Focus reaches the first newly loaded item; names/IDs/buttons remain readable and separated. **Have Codex prepare this disposable fixture first; do not create 20 accounts by hand. Mark this check not run until it is available.** |
| Arabic and narrow layout | Switch the same discussion to Arabic. Narrow the browser window. Read a mixed Arabic/English title and a long resource URL; use the forms/buttons again. | The discussion stays open, Arabic layout is RTL, identifiers/URLs remain readable, and text/actions are not clipped or overlapping. |
| Vote failure at narrow widths | During a synthetic vote transport failure, inspect a post, comment and nested reply at 320px in both languages. Restore transport and keyboard-activate Retry. | The complete failure message wraps inside its card, arrows and Retry stay visible, and the page has no horizontal scrolling. Retry applies the same choice. |

### 3. Check spoken output

On Windows, **Win+Ctrl+Enter** starts/stops Narrator. [Microsoft instructions](https://support.microsoft.com/en-gb/accessibility/windows/narrator/chapter-1-introducing-narrator).

With Narrator running, return to the app and use Tab through Profile and notification settings. Toggle a checkbox with Space and save. Then enter only spaces as the display name and choose Save profile to trigger validation. Listen for the control names, checked state, success and error messages. Repeat in Arabic if a working Arabic voice is available. Record anything missing, repeated or unintelligible. If the reader/voice is unavailable, mark this **not tested**, not passed. Use Win+Ctrl+Enter again to stop Narrator.

### 4. Let another person try it

When a consenting student or teacher is available, give them the app without explaining the buttons. Ask them to sign in, join a community, post a question, reply to someone, upvote another person's content, open a notification and change language. Ask: **“What confused you?”** Record where they needed help and their feedback. Use synthetic accounts and anonymous notes; no names or recordings. A rehearsal by you is separate from this participant feedback.

For the notification task, Alice must publish a new announcement or reply to Bob's question **after he joins/posts**; events from before joining are not backfilled. The detailed bilingual task prompts are in the reference section below if a facilitator needs them.

### 5. Send back only this

`Check number/name | English/Arabic | what you did | what went wrong`

For example, describe the actual control/message and what you expected. Say **not run** for anything you could not test. After you finish, stop the app with Ctrl+C in its terminal. No participant session or manual check is marked complete merely because this checklist exists.

<details>
<summary>Earlier plan and technical history (reference only)</summary>

Prepared: 2026-10-31. Implementation started: 2026-10-31. Status: checkpoints 1 and 2 implemented with local regression/representative visual evidence; checkpoint 3 partially verified. See [implementation evidence](project-brief.md#uiux-implementation--2026-10-31).

## Authority and scope

The owner requested a handoff for improving the existing platform's UI/UX and delegated visual choices: there are no preferred colors, reference sites or style. The direction below is an implementation recommendation, not university branding. Follow `AGENTS.md`, the canonical abstract and current owner decisions in `project-brief.md`. This plan does not authorize additional product features.

Improve the implemented home, sign-in/confirmation, profile/preferences, communities/membership, posts/comments/replies/voting and notifications screens. Keep the existing Next.js/TypeScript application and server contracts. Search, direct messaging, AI, personalized feeds, ranking, teacher authority, moderation, editing/deletion and other unimplemented features remain outside this UI checkpoint. Do not add inactive controls, fake statistics or navigation that implies those features work.

Use three reviewable checkpoints, normally across multiple sessions. They are continuity boundaries, not mandatory approval stops. Continue authorized work when capacity permits; leave a precise handoff when a session ends. Use one agent. No commit, push, merge or deployment is authorized by this plan.

## Recommended design direction

Create an original, calm academic community interface that makes discussions and useful actions easy to find. Use a light neutral canvas, white surfaces, dark readable text and a restrained deep teal/green accent. Choose final colors after contrast checks. Use color with text or shape for post type, membership and read state. Avoid decorative dashboards, oversized marketing sections, excessive gradients, ornamental imagery and unnecessary animation.

- Establish a small set of CSS tokens for color, spacing, type, border, radius, focus and content width. Build only the shared components actually needed by these screens; do not introduce a general component framework.
- Retain a system font stack initially, with Arabic-capable fallbacks and comfortable line height. Tune Arabic and Latin separately where needed, without forcing identical character widths or applying Latin letter spacing to Arabic.
- Make the content column comfortable for long discussions. Keep author/date/type metadata secondary, titles prominent and related actions grouped. Separate reply threads without adding further visible nesting.
- Provide clear access to Communities, Notifications and Profile where existing session/page behavior permits. Use a simple desktop navigation area and a compact mobile equivalent; a permanent sidebar is optional only if real content justifies it. Preserve language switching and current location. Use native controls before introducing menus or dialogs.
- Distinguish primary, secondary and consequential actions consistently. Make join/request/pending/member/owner states understandable. Preserve stable identifiers needed to distinguish membership-management targets, including identical names.
- Keep an accurate, visible local/synthetic status notice with less visual competition than the main task. Do not imply live university verification, deployment or university endorsement.
- Prefer useful empty states and actionable errors over decorative placeholders. Preserve drafts, retry information and confirmed-write feedback. Keep status announcements concise and avoid unexpected focus movement during automatic loading.

These are defaults the implementing session may refine using the actual pages. Explain material deviations in the project brief. Do not ask the owner to pick ordinary colors, spacing or routine layout details.

## Accessibility and bilingual acceptance

Target the applicable [WCAG 2.2 Level AA criteria](https://www.w3.org/WAI/WCAG22/quickref/). Normal text should meet 4.5:1 contrast, large text 3:1, and relevant UI boundaries/states 3:1. Check text resizing to 200%, reflow at 320 CSS pixels, keyboard access, visible/unobscured focus, labels, errors and status announcements. Use roughly 44px primary touch controls as a project usability target; evaluate WCAG's 24px minimum target criterion and its exceptions separately. These checks alone do not establish complete conformance.

- Test English and Arabic from the first checkpoint, including narrow screens, long Arabic labels and mixed-direction names, UUIDs, dates and resource URLs. Use logical CSS properties, correct document direction and `bdi`/appropriate directional isolation. Mirror directional navigation icons when appropriate, not all icons or identifiers.
- Preserve semantic landmarks, headings, skip links, accessible control names and DOM reading order. Avoid CSS ordering that disagrees with keyboard order. Never hide essential actions behind hover alone.
- Ensure loading, empty, error, pending, success, disabled and denied-access states remain understandable. Do not use color alone for state or replace labels with unexplained icons.
- Avoid clipped content at 320/360px; inspect tablet and desktop layouts as well. Check zoom and text spacing. Respect reduced motion; do not add motion merely for decoration.
- If a menu or dialog is genuinely necessary, implement and verify its keyboard, focus, dismissal and return-focus behavior. Prefer simpler visible navigation when it serves the same purpose.

## Copyright, licenses and assets

Do not incorporate unlicensed copyrighted material, copied proprietary templates, scraped photos, university logos, third-party branding or close reproductions of another product's distinctive design. General interaction conventions may inform original work; do not clone a reference site's appearance or copy its content/code without permission.

Prefer original CSS, original simple vector work, system fonts and existing reviewed assets. Third-party copyrighted material is acceptable only under verified permission/license suitable for this project. Before incorporating fonts, icons, images, snippets or templates, verify their exact source and terms, preserve required license/NOTICE/attribution and record them in the existing third-party notices. Public availability, a 'free' label or AI generation does not establish clearance. Resolve ambiguous or incompatible obligations with the owner; follow `AGENTS.md` for dependency additions and do not promise zero legal risk. Do not add an icon/font/UI package for convenience without a demonstrated need and the required review.

## Checkpoint 1 — foundation and representative screens

Status: implemented and locally verified on 2026-10-31. Representative discovery/discussion work at 320/360/768/1280px in both languages, with passing keyboard/reflow checks and selected desktop/mobile visual inspection. No permission/contract/dependency changes.

1. Reinspect Git, instructions, package versions, current runtime/control files and relevant code. Record entry state without overwriting existing changes. Inspect actual desktop/mobile English/Arabic pages using synthetic data and the guarded workflow. Treat prior test counts and runtime state as historical.
2. Make a short list of observed usability problems and map the existing tasks/navigation. Record findings in the project brief, distinguishing observations from assumptions. Do not invent user-research results.
3. Implement tokens, shared shell/navigation and a focused set of button, form, feedback and content-surface styles. Separate home/identity reading widths from discussion layouts where necessary; avoid broad selectors that accidentally style unrelated controls.
4. Apply the direction to community discovery and one post detail with comments/replies. Exercise populated, empty and failure states before extending it.

Exit evidence: representative screens work at 360px and desktop in both languages; navigation, labels and focus remain usable; no permission/contract changes; relevant lint/typecheck/build and focused browser checks pass. Record actual visual inspection and any unresolved findings. No new dependency is the default.

## Checkpoint 2 — existing screens and complete interactions

Status: implemented; all 89 existing synthetic regressions plus 2 new layout cases passed. Shared styles cover every existing screen. Review of every visual state remains checkpoint 3 work.

1. Extend the shared styles to home, sign-in/confirmation, profile/preferences, community detail and membership management, post creation/listing, discussion controls and notification inbox.
2. Preserve the four post types and creator-only announcements; current public/private visibility and membership rules; owner-only management; profile requirements; one visible reply level with direct addressee; vote eligibility and confirmed state.
3. Preserve oldest-first discussions, existing post order, cursor/legacy URLs, scrolling with keyboard Load more/retry, safe submission retries, immediate confirmed-publication feedback and draft preservation. Preserve notification deep links, preferences, read/read-all, membership removal and restoration on rejoin without backfill.
4. Preserve both reviewed fixes: obsolete pagination bodies must not update unread state after refresh, and temporary reply-read failures must retain confirmed replies/drafts while explicit access denial clears inaccessible content.

Exit evidence: every implemented screen has consistent typography, spacing, controls and states; essential tasks remain available by keyboard/mobile in English/Arabic; affected browser regressions pass. Update semantic test locators only when necessary; retain their behavioral assertions and do not substitute brittle CSS checks for them.

## Checkpoint 3 — verification and completion

Status: partially verified. Previous 85 unit/95 permanent identity/8 ordinary/build/native-zoom evidence is reused for unchanged application/permanent test sources. Subsequent evidence includes 52 bilingual geometry combinations/610 target visits, 8 transition cases/156 snapshots, 2 headed comparison cases/306 snapshots, actual owner keyboard observations in both languages, and 2 Chromium accessibility-tree cases/30 scenes. No new application defect was confirmed. Final lint/typecheck/diff checks pass after temporary-probe cleanup. The skip-reload observation is precisely bounded (five physical Tabs via browser controls, then visible skip-link re-entry; simplified English native baseline one). Actual reader speech, remaining manual history/transition/outline-clipping combinations and real-user feedback remain open. See [the latest closure record](project-brief.md#accessibility-metadata-and-resource-closure--2026-11-01); do not claim accessibility conformance or deployment.

1. Inspect real rendered screens, not only code. Use synthetic fixtures covering long titles, long discussions, mixed scripts, identical display names, empty collections, loading/failure and access loss. Use authorized browser tooling if available; otherwise record the visual-verification limitation explicitly.
2. Check navigation and focus order, visible focus, contrast, zoom/reflow, touch targets, form errors and status feedback. Record what was manually checked and what automated tests establish. Test with a screen reader when available, or report that gap; never equate a passing browser suite with a usability study or accessibility certification.
3. Derive current commands from package scripts. Expected gates at preparation time: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:e2e`, `npm.cmd run test:e2e:identity`, and `git diff --check`. Run focused checks during development and the relevant repository gates before completion. Run database tests when server/schema/transaction changes or an identified concern justify them; reuse unchanged evidence otherwise. Preserve all CI gates.
4. Review the complete diff for accidental business-rule changes, private-data serialization, unsafe rendering, lost feedback/drafts and unnecessary assets/dependencies. Update third-party notices if anything was incorporated.
5. Update this plan's checkpoint statuses and project-brief evidence with exact commands/results, remaining limitations and resource/Git state. Update README only if setup or user-facing behavior needs explanation.

Exit evidence: all affected screens and states checked in both languages; meaningful existing regressions retained; final gates recorded; unresolved limitations visible; no unauthorized publication.

## Runtime and handoff safeguards

- Activate the pinned runtime as currently documented in README; at preparation it is Node 24.21.0/npm 11.19.0. Do not upgrade dependencies as part of visual work by default.
- Inspect `.cache/m2-preview.json` and actual listeners before starting/stopping anything. Dev and preview share that registration. Use `npm.cmd run dev:stop` for guarded shutdown before builds if required; restore a server you stopped if it was running on entry and safe to restore. Do not remove uncertain control files or kill unrelated processes.
- Starting dev can migrate development. Inspect migration state before doing so; the last review reported the replies/notifications migration unapplied, but no fresh database/runtime check accompanies this plan. Prefer guarded disposable databases for automated writes and preserve development plus retained test databases ending `9384f39c7150` and `f38dab8b0c88`.
- Never expose credentials, tokens, cookies, database URLs or private content. Keep synthetic traces/screenshots/videos disabled. If visual captures are needed, use non-sensitive synthetic rendering with no tokens, credentials or private operational UI; do not weaken the protected harness to obtain screenshots.
- Preserve localhost/HMR safeguards and browser-cache discovery. Do not run real email, SSO or paid providers for visual verification.
- End each session with completed checkpoint items, changed files, actual checks, outstanding work and the next smallest task. Keep evidence in the project brief and progress in this plan rather than creating successive duplicate plans.

## Preparation evidence

On 2026-10-31, Git was clean on `feat/comment-replies-notifications` at `18bf809` (`feat: added comment replies and notifications`). Relevant shell, CSS, route and package files were inspected; W3C's WCAG 2.2 quick reference was checked. No remote/merge, live runtime, database or application-test state was verified. The owner dictionary hash matched `A2297B55829A182B0DC61126964B3EE364D2CF0E4A25F5C2D7FEB67D417927E8`; preserve existing edits, but targeted translation improvements are allowed within the UI work and must be reviewed as intentional changes. Preparation changes only this plan, its handoff and the project-brief pointer.

## Continuation handoff — 2026-10-31

- Work is unstaged/uncommitted on `feat/ui-ux-foundation`, based on `18bf809`; the pre-existing planning documents were preserved. No publication is authorized.
- Implemented files: shared CSS/header/shell, bilingual `interface.ts` copy, discovery/forms, community detail, post cards/composer, comment cards/composer, vote presentation, profile/preferences and inbox cards. `tests/e2e/ui-layout.spec.ts` adds behavioral layout/focus checks and is scoped to the guarded identity suite in `playwright.config.ts`.
- Exact checks, fixture corrections, contrast ratios and visual limitations are recorded in the project brief. The final one-rem logout separation reused synthetic behavior evidence and passed final lint/typecheck/build/ordinary browser checks. Temporary HTML-export code was removed from permanent tests; ignored sanitized rendering artifacts remain in `.cache/ui-review/`.
- Runtime is stopped as on entry; the owned PostgreSQL container was resumed for tests and stopped afterward. Development data and retained databases ending `9384f39c7150` and `f38dab8b0c88` are preserved. Development still ends at migration `20261027010000_m3_votes`; do not bypass guarded startup or apply migrations just for screenshots.
- Next: continue checkpoint 3 with populated-notification/error/loading/pending/access-denied visual states, browser zoom and focus/target-size checks in English/Arabic. Existing automated tests cover meaningful behavior in these states; they do not replace a visual audit, screen-reader evaluation or usability study. Start from current source/status, not the original checkpoint-1 prompt.

## Independent review update — 2026-10-31

- No confirmed actionable defect found in the complete current UI diff/untracked files. Application and permanent tests remain unchanged by review. Detailed scope, checks and limits are in the [independent review record](project-brief.md#independent-uiux-review--2026-10-31).
- Fresh lint/typecheck/build, 85 unit tests, all 91 permanent synthetic Chromium cases plus 2 temporary bilingual probes, and 8 ordinary Chromium cases passed. Two focused temporary probes also passed for additional focus observations; temporary `test.only` and the entire review spec were removed from the permanent test directory. Final logout spacing is now included in fresh synthetic evidence.
- Live anchor focus/scroll/next-Tab/history, onboarding, checkbox interaction/pending/error/retry, final profile action separation, logout and populated/read inbox checks passed. Detached sanitized populated-inbox and pending/error preference renders add representative visual evidence. They do not complete all state coverage or establish live hydration behavior.
- Same-route navigation reached the skip link on first Tab. Fragment reload needed a second Tab in the application probe, unlike the plain-HTML baseline; Back focus varied. No trap or change-induced cause was established. Check this manually in a headed browser; do not replace it with a forced-focus assertion.
- Checkpoint 3 remains partial: actual browser zoom, full focus/target and state audit, screen-reader evaluation and participant feedback remain open. Next smallest step is headed bilingual zoom and reload/back focus verification, followed by the remaining denied/loading visual states.
- Runtime restored to its stopped entry state; development migration unchanged and both retained databases preserved. No publication or application fix was performed or authorized by this review.

Continuation preparation — 2026-10-31: the owner requested a new-session prompt to fix any confirmed issues and continue this plan. [The handoff](ui-ux-handoff.md) now supersedes the review-only prompt and authorizes focused in-scope fixes plus continued checkpoint 3 verification. No confirmed defect is carried forward as mandatory code work; reload/back focus remains an observation to investigate. Begin with headed bilingual zoom/focus checks, then complete remaining state coverage. No commit, push, merge or deployment is authorized. This preparation changes documentation only.

## Checkpoint 3 continuation update — 2026-10-31

- Fixed the demonstrated Arabic sign-in identifier-order defect using shared LTR isolation for the normal/local-preview hints; exact translated copy and access behavior are preserved. Two permanent bilingual character-position/reflow regressions were added.
- Two permanent native-zoom cases now verify 200%/400% browser page zoom, 640/320px reflow across all implemented route types and representative form interactions. A permission-free original test worker runs only in a disposable Chromium profile. The final synthetic suite has 95 permanent cases; lint/typecheck/build, 85 unit and 8 ordinary browser tests also passed.
- Temporary live state/focus audits passed; 60 bilingual state documents were rendered at mobile/desktop sizes, with mobile views and selected desktop states inspected. Fixed-hint live geometry and two sanitized visual documents add separate evidence. Pending/error/retry/revocation checks include membership request/approval failures and inbox pagination/read/open failures with successful retries and preserved state. These extend prior profile/preferences/inbox evidence; exhaustive combinations are not claimed.
- Discussion skip-fragment reload reproduces an out-of-document first Tab (`document.hasFocus()` becomes false), followed by the visible skip link on second Tab. Profile/direct-fragment behavior differs. No application cause/trap was established, so no autofocus fix was added. Browser-access tooling reported its host unavailable; headed focus and screen-reader interaction remain unverified.
- Checkpoint 3 remains partial. Next: headed discussion reload/history comparison when tooling returns, then comprehensive focus/target exceptions and any additional state combinations identified by that inspection. Representative inbox paging/read-action/membership-failure states now pass. Screen-reader and real-user feedback remain separate gaps. Reuse the now-established native zoom evidence unless relevant code changes.
- Temporary specs/export instrumentation/`test.only` were removed from permanent tests. Owned resources returned to stopped entry state, ten newly created disposable databases removed, development migration/data and retained databases preserved. No publication occurred. Exact evidence, initial fixture failures/corrections and limits are in the [continuation record](project-brief.md#uiux-checkpoint-3-continuation--2026-10-31).

Next-session preparation — 2026-10-31: at the owner's request, the existing [handoff](ui-ux-handoff.md) now explicitly starts the remaining focus/accessibility work, requests a compact evidence table and an owner-run usability script when participants are unavailable, and defines session exit evidence. Completed zoom/regression/state work remains reusable. This preparation changes documentation only; no new runtime inspection, application check, fix or publication is claimed.

## Accessibility and evaluation follow-up — 2026-10-31

Status: available systematic Chromium checks passed; checkpoint 3 remains **partial**. The [brief](project-brief.md#uiux-accessibility-and-evaluation-follow-up--2026-10-31) contains the evidence table, fixture correction, exact commands and limits. Fresh keyboard traversal, computed outlines, viewport/hit-test geometry, control labels/references, target-spacing exceptions and reflow passed for 13 scenes at 320/1280px in both languages. Existing contrast, native zoom, representative loading/error/revocation and permanent regression evidence is reused because those inputs are unchanged. No application/permanent-test modification was necessary. Headed browser access again returned no surfaces and an unavailable-host error; a screen-reader session could not be exercised through the available tools.

Remaining checks have concrete closure conditions:

Tooling recheck — 2026-11-01: headed access remains unavailable. Docker's Linux engine is also unavailable (named pipe absent in the selected `desktop-linux` context), so no new transition tests were run. Source inspection is not live verification. Start the owner-managed Docker Desktop engine before resuming ownership-checked disposable testing; do not repeat completed zoom/target checks as a substitute. No runtime or database state was changed. Checkpoint 3 remains partial; details are in the [brief](project-brief.md#uiux-tooling-recheck--2026-11-01).

Subsequent continuation — 2026-11-01: the owner resolved Docker availability and agreed to perform the headed checks. Eight new guarded keyboard transition cases passed in EN/AR at 320/1280px; 156 snapshots extend the earlier state evidence. A disposable headed Chromium session is active for owner observations; a visible window launched by the test harness does not restore the unavailable browser-control host or supply human observations by itself. The live manual result is pending. See the [brief](project-brief.md#uiux-keyboard-transitions-and-guided-review--2026-11-01) and the active-run note at the top of the handoff before operating resources. Checkpoint 3 remains partial.

Headed comparison/retry — 2026-11-01: after the first manual session expired without observations, the owner requested an autonomous attempt before further guidance. Two headed automated comparison cases passed across discussion/profile/native HTML and navigation/fragment/history variants (306 snapshots). The known discussion-only first-Tab document blur still reproduces; page diagnostics cannot identify the browser-toolbar target, so that specific human observation remains open. A fresh disposable owner-operated retry is now positioned after the skip-link reload. Refer to the current handoff note and [comparison evidence](project-brief.md#headed-focus-comparison-and-owner-retry--2026-11-01); do not treat the expired attempt as passed usability work or the automated comparison as screen-reader/human verification.

Owner evidence update — 2026-11-01: English physical-key observation now identifies Tab Search → View site info and eventual return to the visible skip link on the fifth Tab after skip activation/reload. The simplified native baseline reaches its skip link on the first Tab before and after reload. The English session ended cleanly and its database was removed; a fresh Arabic manual run is active as described at the top of the handoff. The automated second-Tab return differs from actual toolbar traversal and is not equivalent evidence. Root cause, Arabic physical behavior, remaining reader and participant checks stay open; no blanket autofocus fix is warranted from this observation alone.

Bilingual keyboard result — 2026-11-01: Arabic physical reproduction is now confirmed too: first Tab after skip activation/reload goes to Tab Search; four additional Tabs return to the visibly focused Arabic skip link. Both languages therefore take five physical Tabs in the observed discussion sequence. The English native baseline takes one. The formerly unknown toolbar target/count is established; application cause/UI-diff regression remains unestablished and no trap was observed in these bounded sequences. The brief's owner-evidence table records scope. This closes that narrow manual observation, not all headed history/outline/transition checks or checkpoint 3. Next available check is screen-reader behavior if the owner has a reader available; real-user pilot evidence is still unperformed.

Final continuation status — 2026-11-01: the owner preferred autonomous work and reported no reader familiarity. Native browser/app access and reader audio remain unavailable, so actual speech could not be evaluated. Two fresh Chromium accessibility-tree probes passed 30 bilingual scenes, checking computed names/roles, checked/pressed/disabled states, reply/cancel focus, descriptions and polite/assertive live metadata; no speech result is inferred. All temporary specs/filters are removed, final lint/typecheck/diff checks pass, 12 newly created disposable databases were removed, preserved development/retained targets were verified, and the owned container is restored to stopped. No active manual session remains. See the [final evidence/resource record](project-brief.md#accessibility-metadata-and-resource-closure--2026-11-01). Next: an actual reader session when usable tools/audio or a human tester is available, then the prepared formative pilot and remaining broader manual combinations. Keep checkpoint 3 partial; no speculative focus fix or unchanged-suite rerun is queued.

| Gap | Method and evidence needed to close it |
| --- | --- |
| Discussion fragment reload and history | In a headed Chromium window, repeat fresh entry, same-route navigation, unfragmented reload, direct `#main-content`, skip-link activation then reload, and Back/Forward in both languages. Record before/after hydration, active document element, `document.hasFocus()`, scroll position and the visibly focused browser/document control for the first two Tabs and reverse Tab. Compare profile and a plain-HTML anchor baseline. Establish impact and application cause before a fix; no forced focus. |
| Additional focus/state combinations | Inspect keyboard-origin pending-to-success/error transitions for membership, vote, post/comment/reply and inbox read/open actions; focus after manual pagination; denied/revoked refresh; long membership lists with identical display names and IDs. Prior behavioral tests cover many of these transitions, but the new complete Tab walks cover the named seeded scenes only. Check ring clipping and visual legibility in the headed window, including reduced motion and text spacing. |
| Screen-reader behavior | Record actual reader/browser/OS/voice versions; use working English/Arabic speech. Navigate landmarks/headings, then forms and error descriptions; check language names, mixed identifiers, checkboxes, pressed vote states, reply/cancel focus, new pagination items, and success/error/busy announcements. Observe automatic scroll loading for unwanted focus or speech interruption. Record missing/duplicate announcements and access-loss behavior. DOM checks do not substitute for this session. |
| Usability feedback | Run the pilot below with actual consenting participants, record observed results, address confirmed blockers and retest affected tasks. Include each language with a reader comfortable in it; include keyboard use. Report the actual small convenience sample and its limits. No participant count or result is claimed in advance. |

### Owner-run usability pilot — prepared, not performed

Preparation update — 2026-11-02: the owner confirmed that no other participant is available yet and asked to prepare the pilot. The bilingual script, facilitator sequence and blank recording forms below are prepared; **no participant session has started**. Previous owner keyboard checks remain functional observations, not participant pilot results. Record actual future observations in the [pilot record](project-brief.md#usability-pilot-preparation--2026-11-02).

Use a short moderated session of roughly 20–30 minutes, with synthetic data only. Explain that this is a local graduation-project prototype, there is no real university email verification, and the participant can stop. Do not collect names, personal email addresses, recordings or unnecessary demographic data. This preparation does not authorize recruitment or messages.

Before inviting a participant, the owner deliberately prepares a nonproduction environment using the [README workflow](../README.md#run-locally). Dev/preview startup can apply the still-pending replies/notifications migration to development: review that migration and preserve needed data before intentionally choosing that environment. This session did not start either launcher or migrate development. Prefer an owned disposable manual-review target if one is prepared through the guarded harness; do not change operational registrations, reuse automated database credentials in a browser or bypass localhost protections. The ordinary production server leaves synthetic identity disabled and cannot host this pilot.

Prepare two separate temporary browser profiles with made-up `@university.test` accounts: participant and facilitator. The participant starts signed out, so T1 really exercises sign-in/profile creation. The facilitator creates a public study community, a private community, a resource post, a discussion and a top-level comment by a different author. Use original synthetic mixed-script text, such as `CE-101 — مبادئ التزامن`, and an illustrative resource URL such as `https://example.com/ce-101`; the task need not open that external URL. Do not give either account an unverified teacher badge or extra authority. Review fixture setup before the session; do not seed retained databases through ad hoc SQL. Use the documented local-confirmation buttons, never expose verification tokens. Stop the owned launcher afterward using the documented stop command; retain/delete test data only through the agreed guarded lifecycle.

The **live participant launcher is not configured or verified yet**. Inspection on 2026-11-02 confirms that `npm.cmd run test:preview:local` creates guarded disposable data with the local confirmation flow, but currently runs only `tests/preview/local-preview.spec.ts` under a short automatic-test timeout. It is not a ready participant session command. Earlier identity-review windows used preauthenticated accounts and cannot establish T1. Before the first participant arrives, prepare/review a headed manual fixture through the maintained preview harness, exercise the full synthetic sign-in once on disposable data, seed the facilitator context, verify the two browser contexts and cleanup, then leave the participant context fresh. Preserve localhost, ownership, capture and cleanup guards. No harness change or runtime launch is made merely to hold a window open while participants are unavailable. Record fixture verification separately from usability results; keep actual working commands in README if a maintained launcher is later added.

Use this short introduction in the participant's comfortable language, then record only their willingness to continue. Do not require a signature or identifying information.

- English: “We are trying the interface, not testing you. This is a local graduation-project prototype using made-up accounts; it sends no real university email. You may skip any task or stop. I would like to take anonymous notes, with no recording. Is it okay to continue?”
- العربية: «نحن نختبر سهولة استخدام الواجهة، وليس قدراتك. هذا نموذج محلي لمشروع تخرج يستخدم حسابات وهمية، ولا يرسل بريدًا جامعيًا حقيقيًا. يمكنك تجاوز أي مهمة أو التوقف في أي وقت. أود تدوين ملاحظات دون اسمك ومن دون تسجيل صوت أو فيديو. هل توافق على المتابعة؟»

If they decline, stop without collecting task results. Use anonymous session codes only for actual consenting sessions. Note whether the person is an owner/teammate or a new tester, their chosen language, viewport and input method; do not treat an owner rehearsal as independent user feedback.

Read goals without naming the button to press. Let the participant try, record help only when given, and avoid coaching until a blocker is observed. Ask them to think aloud if comfortable. Repeat key tasks in the other language with a suitably fluent participant; let them use their usual device/input method, then try one task with Tab/Shift+Tab/Enter/Space only.

| Task | English goal | الهدف بالعربية | Observable success |
| --- | --- | --- | --- |
| T1 | “Enter this local prototype and choose a display name.” | «ادخل إلى هذا النموذج المحلي واختر اسمًا يظهر للآخرين.» | Requests local sign-in, opens/confirms it in the same browser and saves a synthetic profile; understands the local notice. |
| T2 | “Find a study space and join it. Ask to enter the private space.” | «ابحث عن مجتمع للدراسة وانضم إليه، ثم اطلب الانضمام إلى المجتمع الخاص.» | Discovers/opens the public community, joins it, requests private membership and recognizes pending status. Facilitator approves; participant recognizes access. |
| T3 | “Share a question, then respond to this discussion.” | «انشر سؤالًا، ثم شارك بتعليق في هذا النقاش وردّ على أحد التعليقات.» | Chooses question type, publishes once, comments, opens replies and replies to the intended addressee. Finds confirmed content. |
| T4 | “Support this other person's contribution, then undo that choice.” | «أيّد هذه المشاركة التي كتبها شخص آخر، ثم تراجع عن تأييدك.» | Adds/removes an eligible upvote and understands the confirmed state without treating votes as proof. |
| T5 | “Find the new update and change which future updates you receive.” | «اعثر على التحديث الجديد، ثم غيّر أنواع الإشعارات التي تريد تلقيها مستقبلًا.» | Opens inbox, follows the intended notification, returns, marks all read and saves preferences; understands future-event scope. |
| T6 | “Change language and continue this discussion using the keyboard.” | «غيّر لغة الواجهة وتابع هذا النقاش باستخدام لوحة المفاتيح.» | Retains the discussion location, reads mixed Arabic/English/URL content, uses skip/reply/cancel and can identify focus. Also try reload and Back without giving a workaround. |

The facilitator's event sequence matters; notifications are not backfilled:

| When | Facilitator action | What to observe without coaching |
| --- | --- | --- |
| Before T1 | Prepare only the facilitator account/content; leave a fresh participant context signed out | Participant gets the real synthetic local sign-in task, not an already-confirmed account |
| During T2 | Wait for the actual private join request, then approve that specific synthetic account | Participant distinguishes pending membership from granted access |
| After public membership in T2 and the participant's question in T3 | Publish a **new** announcement and add a comment/reply to the participant's question, using the facilitator account | Both events occur while the participant is eligible; do not expect an announcement created before joining to appear later |
| Before T4 | Identify an existing facilitator-authored contribution as the task target | Participant is not asked to upvote their own content, which is ineligible |
| During T5 | Let the participant find the new events and save preferences; log the event timing | Preferences affect future events; a deliberate opt-out is not a missing-notification defect |
| During T6 | Let the participant use their usual keyboard sequence, including any browser-toolbar traversal | Record their experience; do not coach the known five-Tab sequence or rerun the technical focus audit as a substitute for usability observation |

After each task ask “What was unclear?” / «ما الذي لم يكن واضحًا؟» and “What did you expect next?” / «ما الذي توقعت حدوثه بعد ذلك؟». Finish with “Which one change would help you most?” / «ما التغيير الواحد الذي سيساعدك أكثر؟». A facilitator may later simulate one recoverable failure in an owned test environment, disclose it as a simulation, and observe retry/draft understanding; do not interrupt actual networks or services used by others.

Record one row per actual task attempt in the existing project brief, using anonymous session codes and task IDs. Use **unassisted** when the observable task goal is achieved without procedural help; **assisted** when it is achieved after help (record exactly what help); **not completed** when an attempted task ends without its goal (record the reason); **not attempted** when it was skipped. A broken fixture is a setup limitation until an application defect is reproduced. Keep observed behavior separate from explanations or proposed fixes. Measure elapsed time only if deliberately timed; do not estimate it afterward. Record blockers that prevent completion, help that was needed and lesser confusion in concrete terms rather than assigning severity from a guess.

Use the blank session/task/issue forms in the existing [pilot record](project-brief.md#usability-pilot-preparation--2026-11-02). Do not convert prepared tasks into passed results, infer statistics from an unrecorded denominator or claim a representative sample. Keep any quoted feedback anonymous and optional. After actual sessions, group repeated observations, recommend focused fixes, reproduce suspected defects and retest affected tasks. The pilot is formative evaluation, not statistical validation or accessibility certification.

</details>
