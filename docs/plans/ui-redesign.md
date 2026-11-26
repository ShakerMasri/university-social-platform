# UI rebuild — "Clear Campus"

Status: Planned, decisions approved (2026-11-26) · Branch: feat/ui-redesign · Milestone: UI rebuild (after M5-04 closure)

## Goal

Replace the test-harness UI with a product interface that students and teachers can use daily. Follow [ui-direction.md](../design/ui-direction.md) for the look (light and dark, EN/AR). Server behavior, permissions and approved decisions stay unchanged unless the owner approves a change. Add the requested features, each with its own permissions and tests:
- unified search
- share
- save
- messages unread
- community new counts

The assistant is **on hold** (decision 12), and no assistant UI is built in this branch. The target is WCAG 2.2 AA, EN/AR/RTL and widths from 320px to desktop.

## Owner decisions (approved 2026-11-26)

All twelve decisions were answered by the owner on 2026-11-26:

| # | Decision | Outcome |
| --- | --- | --- |
| 1 | Home for verified users | As recommended: Home is the feed; `/feed` and `/feed/for-you` redirect to `/?tab=…` |
| 2 | Unified search | As recommended, with tabs per decision 4. No typeahead. |
| 3 | Community search | As recommended: new bounded server search returning only what discovery shows |
| 4 | Archive and People navigation | **Owner choice:** no separate Archive or People nav items. `/search` is the only search page, with tabs **All, Posts, People, Communities**. `/archive` and `/people` redirect to the matching tab with their query preserved. |
| 5 | Mobile navigation | As recommended: bottom bar with Home, Communities, Search, Messages, More |
| 6 | Composer on Home | As recommended: community picker; Announcement only in communities the user created |
| 7 | Theme storage | As recommended: `theme` cookie with server-rendered `data-theme` and no script |
| 8 | Messages unread badge | **Owner choice:** not deferred. Add per-conversation read tracking and the badge in Stage 5 (see C6). |
| 9 | Avatars | As recommended: initials only |
| 10 | Share | As recommended: copy link plus Web Share; "send in a message" is a stretch goal |
| 11 | Saved posts after access loss | As recommended: hide them, restore if access returns |
| 12 | Assistant | **On hold (owner, 2026-11-26):** the owner, their partner and the instructor will decide how to implement it. Until then there is no assistant UI: no card, no page, no navigation item, and no assistant API route. The layout only keeps room to add it later. This replaces the earlier "evidence finder" approval. |

**Priority if time runs short:** unified search > share > save > messages unread > community new counts.

The original recommendations and their tradeoffs are kept below for the record.

| # | Decision | Recommended | Tradeoff |
| --- | --- | --- | --- |
| 1 | What `/[locale]` shows to a verified user | Home **is** the feed (tabs Your communities / For you, plus composer). `/feed` and `/feed/for-you` redirect to `/?tab=…`; old links keep working. Anonymous visitors get a short landing page with Sign in. | Moves the canonical feed URL (a route change). Keeping `/feed` as the home would avoid the change but makes "Home" an extra hop. |
| 2 | Unified search shape | Header field submits to a new `/search?q=` overview: top 5 posts, top 5 people, top 5 communities, each with "See all" linking to `/archive?q=`, `/people?q=` and `/communities?q=`, where filters live. No typeahead. | Adds one route. Typeahead would spend the 30-per-15-minute search budgets on every keystroke. One overview search costs one attempt from each of three budgets. |
| 3 | Community search (needed by 2) | New bounded server search over community name and description, reusing the archive's Arabic/Latin normalization. Returns what current discovery already shows: verified users see private communities' names and descriptions, with a lock badge, but no posts. | Server work and a new rate budget. Without it, the Communities tab can only list communities, not search them. |
| 4 | Archive and People in navigation | Keep both nav items, as in the mockup. `/archive` becomes the posts search with community/type filters, and `/people` becomes the people search. Both are the "See all" pages for unified search. Their old separate search bars are removed. | Two entry points to search. Merging them into `/search` would mean redirecting their URLs and losing the filter pages. |
| 5 | Mobile navigation | Bottom bar with 5 items: Home, Communities, Search, Messages, More. "More" opens a sheet with People, Archive, Assistant, Saved, Profile and settings. The header shrinks to logo, notifications and avatar. | Uses vertical space on small phones. A hamburger drawer hides the main destinations. |
| 6 | Composer on Home | The composer opens the post form with a community selector, listing only the user's MEMBER communities. Post types other than Announcement are always available. The Announcement chip appears only for communities the user created, matching the current rule. The existing posts API is used unchanged. | Posting outside a community page is a new flow. Without it, the home composer in the mockup has nothing to post to. |
| 7 | Theme preference storage | Use a `theme` cookie (`light`/`dark`; absent means follow the system). The layout sets `data-theme` on the server, and CSS `prefers-color-scheme` handles the system case. Needs no script and causes no flash. | Reading the cookie makes the locale layout dynamic. A tiny inline head script with localStorage would keep pages static but adds an inline script. |
| 8 | Messages unread badge (in the mockup, not in the requested list) | Defer it. Messages has no read-tracking today, and adding it is new server work. Show the badge only on Notifications, which already has unread state. | The nav won't match the mockup exactly until read-tracking is planned separately. |
| 9 | Avatars | Initials only (deterministic colors from the direction). Profile pictures and bio stay in their own planned checkpoint, which needs an upload/storage decision. | Less personal now, but no upload or storage provider enters this branch. |
| 10 | Share: "send in a message" | Stage 3 ships **copy link**, plus the device share sheet (Web Share API) where available. Sending a post into a direct message is a stretch goal after Save. | The in-app share path comes later. In return, no change to the messaging composer or its tests. |
| 11 | Save: posts the user can no longer read | Keep the saved row but hide it from the list and counts while access is lost; it reappears if access returns. The user can always remove their own saved row. | Keeps a row the user cannot see. Deleting it on revocation would need cascade hooks on membership changes. |
| 12 | Assistant (card and Stage 7) | No AI provider is selected, and sending private content to an external AI still needs a privacy decision. Build the card and `/assistant` as an **evidence finder**: a prepared question returns cited, permission-checked sources from the existing M5 retrieval service, labelled as sources rather than an answer. Generated answers wait for the provider/privacy decision. | Not the full assistant. Needs one new API route over existing server code. The alternative is to hide the card until the provider decision. |

## Scope and out of scope

**In scope:**
- New tokens, fonts, theme and components.
- A rebuilt page for every existing feature: identity, home/feed, communities, posts, comments, replies, votes, people, profile, messages, archive and notifications.
- Five requested features: C1–C4 and C6. C5 (the assistant) is on hold.
- Browser tests rewritten stage by stage.
- Self-hosted IBM Plex, recorded in `THIRD-PARTY-NOTICES.md`.

**Out of scope unless the owner approves:**
- Editing or deleting content.
- Profile pictures and bio.
- Read receipts shown to the other participant. Read tracking (C6) is private to each user.
- Email sharing.
- All assistant UI and assistant API work (on hold, decision 12), including the AI provider.
- Teacher roles or course authority.
- User ratings.
- Realtime push or polling for counts.
- New ranking.
- Any change to existing permissions, budgets or cursors.

## A. Main user tasks and current UX problems

**Student, most frequent first:**
1. See what's new in my courses since I last looked.
2. Ask a question in a course community and get notified of replies.
3. Find an earlier answer, including last year's, before asking.
4. Reply and vote on helpful answers.
5. Find and join a community (or request to join a private one).
6. Find a classmate or teacher and message them.
7. Save a useful resource for later and share a post with a classmate.

**Teacher:**
1. Create a course community (public or private) and approve join requests.
2. Post announcements (creator-only today) and know members are notified.
3. Answer questions and see unanswered ones.
4. Find old discussions to reuse.

Teachers currently have no extra global privileges. Any special teacher authority stays a separate owner decision.

**UX problems in the current app.** These come from reading the source, not from user testing. Stage 1 confirms them in a walkthrough; Stage 8 tests with users.
- **P1** Home is a landing page. A signed-in user must click "Communities", and the feed lives at a separate `/feed`.
- **P2** The header is a project title, a language list and 7 flat text links. Nothing shows unread notifications or new posts until the page is opened.
- **P3** Archive and People each have their own search bar. Communities cannot be searched, only listed.
- **P4** Posting is only possible from inside a community page.
- **P5** Posts have no avatars and no visual post-type distinction. Votes and replies are hard to scan in lists.
- **P6** There is no theme choice, system fonts only, and the 404 page is English only.
- **P7** The own profile is a settings form. Notification preferences sit on the notifications page instead of with the other settings.
- **P8** Messages uses two separate pages on desktop (inbox, then thread) instead of side by side.

## B. Page map and navigation

| Page | URL | Contents | Status |
| --- | --- | --- | --- |
| Landing (anonymous) | `/[locale]` | Short intro, Sign in | Rebuilt |
| Home (verified) | `/[locale]` | Composer, tabs Your communities / For you, post cards | Rebuilt. Decision 1; `/feed*` redirect |
| Sign in / verify | `/signin`, `/verify` | Email, then link sent, then verified | Rebuilt |
| Onboarding | `/profile?welcome=1` or a step after verify | Display name (required to post and create) | Rebuilt |
| Search | `/search?q=&tab=all\|posts\|people\|communities` | Tabs: All (top 5 of each kind), Posts (community/type filters, results across years), People, Communities | **New**; the only search page (decision 4) |
| Archive (old URL) | `/archive` | Redirects to `/search?tab=posts`, keeping `q`, `community` and `type` | Redirect |
| People (old URL) | `/people` | Redirects to `/search?tab=people`, keeping `q` | Redirect |
| Communities | `/communities` | My communities, Discover list, Create; its search field opens the Communities tab | Rebuilt |
| Community | `/communities/[id]` | Header (name, visibility, join/leave/pending), composer, posts, members/requests (owner) | Rebuilt (+ marks viewed for new counts) |
| Post | `/communities/[id]/posts/[postId]` | Post, vote, save, share, comments and replies | Rebuilt |
| Saved | `/saved` | Saved posts, newest saved first | **New** |
| Person | `/people/[id]` | Name, Message button (URL unchanged) | Rebuilt |
| Profile and settings | `/profile` | Name, theme, language, notification preferences | Rebuilt (preferences move here) |
| Messages | `/messages`, `/messages/[id]` | Two panes on desktop, one on mobile; unread markers per conversation | Rebuilt (+ read tracking, C6) |
| Notifications | `/notifications` | List, mark all read | Rebuilt (+ header preview of the latest 5) |
| 404 / denied | — | Localized EN/AR | Rebuilt |

**Navigation (desktop, start side):**
- Home, Communities, Messages (unread badge).
- Then "My communities", showing the first 10 with "N new" and a "See all" link.
- People and Archive are not nav items: they are tabs of `/search` (decision 4).
- No Assistant item while decision 12 is on hold. The nav list must accept one more item later without a redesign.
- This differs from the mockup's nav list by owner decision.

**Home side panel (end side):** recent notifications (latest 5, with "See all"). The panel is a stack of cards, so a future assistant card can be added without changing the layout. On narrow screens the panel is hidden, and notifications stay reachable from the header.
- Saved sits in the avatar menu along with Profile, Settings and Sign out.

**Header:** logo, unified search field, theme toggle, language switch, notifications button (unread dot; opens the preview), avatar menu.

**Mobile:** bottom bar with Home, Communities, Search, Messages (badge), More. More opens a sheet with Saved, and Profile and settings.

**Where each feature lives:**

| Feature | Location |
| --- | --- |
| Unified search | Header field (or Search in the mobile bar) → `/search` (All tab) |
| Messages unread | Badge on Messages in nav and mobile bar; per-conversation marker in the inbox |
| Share | Post card action row and post page |
| Save | Post card and post page (toggle); list at `/saved` |
| New counts | "My communities" in nav, and on the Communities page |
| Assistant | On hold (decision 12). Not built; the nav and side panel leave room for it. |

**URL compatibility:** every existing URL keeps working, either rendering the new page or redirecting with its query preserved:
- `/archive?q&community&type` → `/search?tab=posts&…`
- `/people?q` → `/search?tab=people&q`
- `/feed*` → Home tabs

Community pages link to `/search?tab=posts&community=<id>` instead of the old scoped archive link. Notification links (`/communities/[id]/posts/[postId]#…`) keep their targets and anchors.

## C. Requested features — behavior, permissions, data, tests

Implementation priority if time runs short: **unified search > share > save > messages unread > community new counts**. The assistant (C5) is on hold.

### C1. Unified search (Stage 1 page with All, Posts and People tabs; Stage 2 Communities tab)

- **Behavior:**
  - Submitting the header field opens `/search?q=` on the **All** tab. The server runs the three kind searches in parallel and shows up to 5 results per kind, each group with "See all", which switches to that tab.
  - **Posts** tab: the archive search with optional community and type filters, newest first, 20 per page.
  - **People** and **Communities** tabs: 20 per page with the signed cursor.
  - Tabs are links with `aria-current`, and the URL carries `tab`, so back/forward and shared search links work.
  - Each kind applies its own existing validation: posts allow 2–200 characters and up to 8 words; people up to 60 characters. A kind that rejects the query shows a one-line reason instead of results.
  - Empty and error states are shown per group or tab, so one failing kind doesn't blank the page.
  - With no query, Posts shows the filter form (as the archive does today), and the other tabs show a prompt.
- **Permissions:**
  - Requires a verified session.
  - Posts reuse the archive service, which rechecks private post/comment access before excerpts and on open.
  - People reuse the directory policy.
  - Communities return only what discovery already returns.
  - No private titles, snippets or counts for content the viewer cannot read. Result counts are never shown, only "See all".
- **Data:**
  - No schema change.
  - New server function `searchCommunities(db, token, input)`: parameterized SQL using the archive's normalization expression, 20 per page with the existing signed cursor pattern, its own durable `community-search` 30/15-minute budget, and the archive's 3-second statement timeout.
- **Tests:**
  - Unit: input validation and per-kind rejection.
  - Database:
    - Community search normalization (Arabic diacritics/tatweel, Latin case) and pagination bounds.
    - A private community is returned by name only, and its posts are not.
  - Browser:
    - A non-member searching a private post's unique word gets no post result, while a member does.
    - After the member is removed, the result disappears.
    - `/archive?q=…&community=…&type=…` and `/people?q=…` land on the matching tab with the same results.
    - Keyboard flow from the header to the results and across tabs.
    - EN/AR.

### C2. Share (Stage 3)

- **Behavior:**
  - "Share" on a post card or post page opens a small menu with Copy link and, where `navigator.share` exists, "Share via…".
  - The link is the canonical post URL in the current locale.
  - Copy confirmation is announced through a polite live region.
- **Permissions:**
  - A link never grants access. A viewer without access gets the normal sign-in or denied page.
  - Post pages keep generic page metadata, with no post title or body in `<title>` or OG tags.
  - An unauthenticated fetch (for example a chat app unfurling the link) gets no private content.
- **Data:** none.
- **Tests:**
  - Browser:
    - Copy link puts the exact URL on the clipboard.
    - An unauthenticated request for a private post's URL returns a page whose HTML contains neither the title nor the body.
    - A verified non-member gets the denied page.
    - Keyboard operation and focus return to the button.
    - EN/AR labels.
  - Unit: URL builder.

### C3. Save / bookmarks (Stage 3)

- **Behavior:**
  - A bookmark toggle on the card and the post page, using `aria-pressed`.
  - `/saved` lists saved posts newest-saved first, 20 per page, using the same card.
  - Empty state links to Home.
- **Permissions:**
  - Saving requires a verified session and current read access to the post: public means any verified user, private means a current MEMBER.
  - No profile is needed, and saves are private to the user.
  - Removing one's own saved row is always allowed. It reveals nothing.
  - The list and the toggle state recheck read access on every read; inaccessible posts are hidden (decision 11).
- **Data:**
  - New table `SavedPost(userId, postId, createdAt)`, primary key `(userId, postId)`, index `(userId, createdAt, postId)`, foreign keys with `Restrict`, as elsewhere.
  - One new migration, additive only.
  - Desired-state `PUT /api/communities/[id]/posts/[postId]/save` with body `{ "saved": true|false }`. It is idempotent, has its own 30/15-minute budget and a 1 KiB cap, and the parent IDs are rechecked as in votes.
  - `GET /api/saved?after=` uses a signed cursor.
- **Tests:**
  - Database:
    - Unique constraint under concurrent duplicate saves.
    - Idempotent retries.
    - Saving a private post as a non-member is denied.
    - After removal from the community, the post leaves the saved list and the count, and returns on rejoin.
    - Cross-user: A cannot read or change B's saves.
  - Browser: toggle, list, keyboard, EN/AR, empty state.

### C4. Per-community "N new" counts (Stage 2)

- **Behavior:**
  - The nav ("My communities") and the Communities page show "N new" for each MEMBER community. N counts posts by other users created after the user last opened that community. The display caps at "99+".
  - Opening the community page marks it viewed, after the posts list loads successfully; hover prefetch does not mark it.
  - Comments are not counted.
  - No polling: counts refresh on navigation.
- **Permissions:**
  - Counts only for communities where the user is currently MEMBER, recomputed on each read.
  - PENDING and left communities show no count.
  - Existence and counts of private communities are never shown to non-members.
- **Data:**
  - New table `CommunityVisit(userId, communityId, lastViewedAt)`, primary key `(userId, communityId)`.
  - The baseline when no row exists is the membership's `createdAt` (request time for private communities; this is documented).
  - `POST /api/communities/[id]/viewed` is a membership-checked upsert with a monotonic `lastViewedAt`, under its own budget.
  - The count query is bounded: at most 10 nav communities, each counting at most 100 rows via a lateral subquery.
- **Tests:**
  - Database:
    - Counts exclude own posts and posts in non-member communities.
    - Removal hides the count.
    - The cap holds.
    - Concurrent marks never move `lastViewedAt` backwards.
    - Query plan bounded on a synthetic corpus.
  - Browser:
    - A new post by B increments A's count.
    - Opening the community clears it.
    - EN/AR, including Arabic numerals per locale formatting.

### C6. Messages unread (Stage 5)

- **Behavior:**
  - Messages in the nav and mobile bar shows a badge with the number of conversations that have unread messages, capped at "99+". Its accessible name is, for example, "Messages, 3 unread".
  - The inbox marks each unread conversation with a dot and bold preview text.
  - A conversation is unread when it has at least one message from the other participant newer than my read marker.
  - Incoming pending requests count as unread until opened. Rejected conversations and conversations I have blocked are not counted.
  - Opening a thread marks it read up to the newest message actually loaded.
  - No polling: the badge refreshes on navigation and after sending or opening.
  - No read receipts: the other participant never sees my read state.
- **Permissions:**
  - Only a current participant with a live verified session can mark a conversation read or contribute to their own count, using the existing participant checks.
  - A user cannot read or change another user's read marker.
  - Marking read never changes request state, blocking or delivery.
- **Data:**
  - Additive migration: nullable `firstReadAt` and `secondReadAt` (`Timestamptz(3)`) on `DirectConversation`, matching the existing first/second participant columns.
  - The migration backfills existing conversations to the newest message time, so the upgrade creates no surprise unread badges. Local synthetic data only; there is no production data yet.
  - `POST /api/conversations/[id]/read` with `{ "upTo": <messageId> }`:
    - The server checks the message belongs to the conversation.
    - It sets the caller's marker to `GREATEST(current, message.createdAt)`, so concurrent or retried calls never move it backwards.
    - Idempotent, with its own 30/15-minute budget and a 1 KiB cap.
  - The unread count uses one bounded query over the caller's conversations (EXISTS per conversation using the existing `(conversationId, createdAt, id)` index), capped at 100.
- **Tests:**
  - Database:
    - My own messages never make a conversation unread.
    - The marker is monotonic under concurrent marks.
    - `upTo` from another conversation is rejected.
    - A non-participant cannot mark or read.
    - Blocked and rejected conversations are excluded.
    - Backfill leaves existing conversations read.
    - Bounded query plan.
  - Browser:
    - B sends to A, A's badge shows 1, and opening the thread clears it.
    - Back and refresh keep the state.
    - The other participant sees no read indicator.
    - Keyboard and screen-reader name of the badge.
    - EN/AR, including locale number formatting.
    - The existing messaging participant, block and retry suites still pass.

### C5. Assistant (on hold)

**On hold, waiting for the instructor discussion (decision 12).** Nothing in this section is to be built. It is kept only as a record of the earlier proposal for that discussion. The owner, partner and instructor decide the assistant's design, and it will get its own plan.

Earlier proposal, not approved:
- **Behavior:**
  - A side-panel card with a short description and an "Open assistant" link.
  - `/assistant` takes a question and shows up to 5 cited sources (post or comment, community, date) with excerpts. It states when no sufficient sources were found.
  - Labelled "Sources from your communities", not as an AI answer (decision 12).
- **Permissions:**
  - Uses the existing permission-aware evidence retrieval (`retrievePreparedQuestionEvidence`) and revalidation. Private messages are excluded, as today.
  - No external AI call.
- **Data:**
  - No schema change.
  - One new `GET /api/assistant/evidence` route wrapping the existing service, its budgets and its limits.
- **Tests:**
  - Database: reuse the M5 permission cases.
  - Browser:
    - A non-member never sees private sources.
    - Revocation removes a source on the next request.
    - The insufficient-evidence state.
    - EN/AR.

## Permissions and data summary

- Schema: three additive migrations:
  - `CommunityVisit` (Stage 2)
  - `SavedPost` (Stage 3)
  - read markers on `DirectConversation` (Stage 5), with a backfill that only sets the new columns

  None of them changes existing columns or rows.
- New routes: `/search`, `/saved`.
- `/archive` and `/people` become redirects into `/search`.
- New APIs: save, saved list, community viewed, community search, conversation read.
- No assistant route or API (on hold).
- No existing permission, budget, cursor or API contract changes.
- Every new read goes through the existing `authorized`/membership checks and deny-by-default access rules.

## Acceptance criteria

1. Every existing capability is reachable in the new UI. Every existing URL and notification link resolves, either rendering or redirecting with its query preserved.
2. Old CSS and harness layout are deleted by the end of Stage 1. Components use only the tokens from ui-direction.md.
3. Light and dark themes: the system default applies, the user choice persists, and there is no flash on load (verified with a throttled reload in both themes).
4. Every page has loading, empty, error and denied states with EN and AR text. Arabic renders mirrored with logical properties only; a lint check finds no `left`/`right` physical properties in new CSS.
5. Keyboard use reaches every action. Focus is visible in both themes (at least 3:1) and returns to its trigger after menus and dialogs close. The skip link works. Pages work at 400% zoom and at 320px wide without horizontal scrolling.
6. Text contrast is at least 4.5:1 for every token pair in both themes, checked by an automated script.
7. The C1–C4 and C6 permission tests pass: cross-user, non-member, removed member, non-participant and unauthenticated link cases.
8. Rewritten browser suites keep every existing security case (cross-user, denied, revocation) and pass in Chromium.
9. Fonts are self-hosted, with no runtime requests to Google, and IBM Plex (SIL OFL) is recorded in `THIRD-PARTY-NOTICES.md`.
10. Client JavaScript does not grow beyond a recorded Stage 0 baseline without a written reason, and no UI library is added.

## Sessions

Each stage is one checkpoint: review, then commit on `feat/ui-redesign`. Main is merged in regularly. Rewritten tests for a page land in the same stage as the page.

### Stage 0 — Foundations
- Steps:
  - Add a tokens CSS file with light and dark values, plus post-type and avatar tokens.
  - Self-host IBM Plex Sans and Plex Sans Arabic as woff2 files from IBM's official release via `next/font/local`, and add `THIRD-PARTY-NOTICES.md`.
  - Add the theme cookie and server `data-theme` (decision 7).
  - Build the base components: Button, IconButton, TextField, Select, Chip, Badge, Avatar (initials), Card, Tabs, Menu, Dialog, Toast/live region, VoteControl, EmptyState, ErrorState, Skeleton. Icons are original SVGs.
  - Add a development-only component preview page at `/[locale]/dev/components`, guarded the same way as synthetic identity (not served by `npm start`).
  - Add a contrast check script.
  - Record the client JS baseline.
- Checks to run: lint, typecheck, unit tests, build, contrast script; Playwright run of the preview page in both themes and both locales, plus a no-flash check.
- Done when: the preview shows every component in light/dark × EN/AR, with keyboard and focus checked.

### Stage 1 — App shell, sign-in, onboarding
- Steps:
  - Build the header with the unified search field, the navigation (desktop and mobile per decision 5), the language and theme switches, and the notifications button with its preview.
  - Add `/search` with All, Posts and People tabs (the Communities tab comes in Stage 2).
  - Redirect `/archive` and `/people` to the matching tab, then remove the old archive and people search pages.
  - Rebuild sign-in, verify and onboarding, and the localized 404 and denied pages.
  - Delete `globals.css` harness rules and the old header.
  - Walk through the problems listed in section A.
- Checks to run: lint, typecheck, unit tests, build; rewritten `identity`, `locales`, `ui-layout`, `ui-zoom` and `archive`/`people` search suites; the C1 browser tests for posts and people, including the redirects; the e2e CI suite.
- Done when: a user can sign in, onboard and move around the whole app in the new shell, even though inner pages are still unstyled.

### Stage 2 — Home, feed, communities (+ new counts, community search)
- Steps:
  - Home feed tabs and composer (decisions 1 and 6), keeping the existing feed scheduler and session revalidation behavior.
  - Communities list, discover and create; community page with membership and requests.
  - `CommunityVisit` migration and counts (C4).
  - `searchCommunities` and the Communities tab (C1).
  - Home side panel with recent notifications. No assistant card or placeholder.
- Checks to run:
  - Unit tests.
  - `db:test` and `db:test:feed`, plus the new database tests.
  - Rewritten `feed`, `communities` and `posts` browser suites.
  - The C4 tests.
  - `db:review` for the migration.
- Done when: AC 1, 4 and 5 hold for these pages, and the feed revalidation cases still pass.

### Stage 3 — Posts, comments, replies, votes (+ save, share)
- Steps:
  - Post page and post card in their final form.
  - Comments and replies with the icon-plus-count Replies action.
  - Vote control (up/down counts, `aria-pressed`).
  - Share (C2).
  - `SavedPost` migration, APIs and `/saved` (C3).
- Checks to run: `db:test` plus the save tests; rewritten `comments`, `discussion-actions`, `votes` and `replies-notifications` suites; the C2 and C3 tests.
- Done when: all existing discussion security cases pass in the new UI.

### Stage 4 — People and profiles
- Steps:
  - Final People tab result cards and the person page.
  - Own profile and settings: name, theme, language, and notification preferences moved here.
- Checks to run: rewritten `people` suite, plus a notification preferences round-trip.
- Done when: the directory policy is unchanged and preferences are reachable from Profile.

### Stage 5 — Messages (+ unread tracking)
- Steps:
  - Two-pane inbox and thread on desktop, one pane on mobile.
  - Request accept/reject, block and retry states; the existing history window behavior.
  - Read-marker migration, the read API, the unread count, the nav and mobile badge, and inbox markers (C6).
- Checks to run: `db:review` for the migration; `db:test` plus the C6 database tests; `test:e2e:messaging`; rewritten `messaging` suite; restart case; the C6 browser tests.
- Done when: every existing participant, block and retry case passes, and the C6 criteria hold.

### Stage 6 — Archive results and notifications
- Steps:
  - Final Posts tab: cross-year results, community/type filters, excerpt labels, opening rechecks.
  - Notifications list and header preview; mark all read.
- Checks to run: rewritten `archive` and `replies-notifications` suites.
- Done when: the archive access rechecks and notification recipient rechecks still pass.

### Stage 7 — Assistant UI

**On hold: waiting for the instructor discussion.** No steps are planned. When the owner, partner and instructor have decided the assistant's design, it gets its own plan, and this stage is rewritten from it. Stage 8 does not wait for Stage 7.
- Done when: sources are cited, permission-checked and labelled honestly, and insufficient evidence is shown.

### Stage 8 — Polish
- Steps:
  - Automated accessibility scan, if the owner approves a dev dependency such as axe; otherwise a manual WCAG 2.2 AA checklist.
  - Manual EN/AR × light/dark × 320/768/1360 pass.
  - Keyboard-only and NVDA pass by the owner.
  - Small usability test with real participants. Record methods and results; never invent them.
- Checks to run: the full CI gate plus all `test:e2e:*` suites.
- Done when: AC 1–10 are evidenced, and the gaps found are fixed or recorded.

## Verification plan

- **Unit (Vitest):** input validation, URL builders, theme and cookie parsing, count capping.
- **Database (disposable PostgreSQL):** the two migrations, save and visit constraints, concurrency, community search normalization and bounds, all access-removal cases.
- **Browser (Playwright, Chromium):** every rewritten suite, plus the C1–C4 and C6 security cases, the redirects, no-flash, RTL and zoom.
- **Manual:** EN/AR, both themes, mobile widths, NVDA, usability sessions.
- **Remains unverified:** non-Chromium browsers (unless added), real email delivery, production load and scale, AI answer quality (none generated), deployment.

### Client JS baseline (AC 10)

Recorded 2026-11-26 on `feat/ui-redesign` at `ec5724b`, before any Stage 0 code, with `npm run build` and then `npm run size:client-js`. Each route's figure is its initial client JavaScript: the shared root chunks plus its own layout and page chunks, gzip level 9. Development-only routes are excluded.

| Route | gzip |
| --- | --- |
| Shared root chunks (every page) | 128.8 KiB |
| `/[locale]` | 135.6 KiB |
| `/[locale]/signin`, `/verify` | 140.1 KiB |
| `/[locale]/communities` | 138.6 KiB |
| `/[locale]/communities/[id]` (largest) | 144.4 KiB |
| `/[locale]/communities/[id]/posts/[postId]` | 143.5 KiB |
| `/[locale]/feed`, `/feed/for-you` | 143.7 KiB |
| `/[locale]/messages`, `/messages/[id]` | 142.3 KiB |
| `/[locale]/archive` | 140.2 KiB |
| `/[locale]/people` / `/people/[id]` | 138.1 / 140.1 KiB |
| `/[locale]/notifications` | 138.9 KiB |
| `/[locale]/profile` | 141.0 KiB |

After Stage 0 every existing route's figure is unchanged, because the new components load only on the development preview. Re-measure at each stage. Explain in writing any route that grows beyond its baseline, measuring a replaced page against the page it replaces.

## Risks

- **Size:** nine checkpoints on one long-lived branch. Mitigation: merge main into it regularly and keep each stage reviewable.
- **Losing security cases** while rewriting tests. Mitigation: before deleting an old spec, list its security cases in the stage's progress log and map each to its new test.
- **The feed revalidation scheduler is subtle.** Mitigation: restyle around it without changing its logic.
- **Search budgets:** an All-tab search costs three budget attempts; a single tab costs one. Monitor this; revisit if users hit limits.
- **Read-marker backfill** runs over every conversation. It is cheap on local synthetic data. Re-measure before any deployment migration.
- **Fonts:** self-hosting adds about 200–400 KB of woff2. Mitigation: subset to Latin and Arabic, limit to weights 400/500/600/700, and load Arabic only when needed if measurement shows it matters.
- **Mockup and approved decisions differ:** the nav drops People, Archive and Assistant (decisions 4 and 12), the side panel has no assistant card, and avatars have no pictures (decision 9). These follow the decisions, not the mockup.

## Progress log

Newest first; filled by /handoff and /review-checkpoint.

- 2026-11-26: Stage 0 independent review (`checkpoint-reviewer`, uncommitted scope). Verdict: 6 findings, 0 P1, 1 P2, 5 P3, and no security, authorization or data-loss issues. The P2 is that Dialog calls `onClose` twice. The P3s are font preload weight, toast focus and pause, preview toasts outside `.ui-root`, telemetry wording in the notices, and the SkeletonGroup announcement; the Stage 0 evidence entry and the token-pair wording are left for /handoff. The reviewer ran lint, typecheck and `npm test` (all passed), verified font provenance against IBM's tarballs, and confirmed client JS matches the baseline. Before the review, the implementer had run build, `test:e2e:components` (12/12), `test:e2e` (12/12) and `test:e2e:identity`. The identity groups passed: empty 1, main 185 with 1 skipped, archive 14, messaging 40, feed 18. Fixes are pending the owner's choice.

- 2026-11-26: Owner put the assistant on hold (decision 12) pending a discussion with the partner and instructor. All assistant UI and API work is removed from the stages, Stage 7 is marked on hold, and `ui-direction.md` is aligned with decisions 4 and 12.
- 2026-11-26: Owner approved all twelve decisions. Decisions 4 and 8 differ from the recommendations: `/search` is the only search page, with tabs, and Messages read tracking is added in Stage 5. Priority is now unified search > share > save > messages unread > community new counts. Next step: Stage 0.
- 2026-11-26: Plan written. No application code changed. Entry state: `feat/ui-redesign` at `07830ec`, clean.
