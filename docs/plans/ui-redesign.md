# UI rebuild — "Clear Campus"

Status: Stage 0 done (2026-11-26); Stage 1 done (2026-11-27, `1cd7eb2`, pushed); two review P3s open; Stage 2 next · Branch: feat/ui-redesign · Milestone: UI rebuild (after M5-04 closure)

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

### Stage 0 — Foundations (done 2026-11-26, `e12c629`)
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

### Stage 1 — App shell, sign-in, onboarding (done 2026-11-27, `1cd7eb2`)
- Steps:
  - Build the header with the unified search field, the navigation (desktop and mobile per decision 5), the language and theme switches, and the notifications button with its preview.
  - Add `/search` with All, Posts and People tabs (the Communities tab comes in Stage 2).
  - Redirect `/archive` and `/people` to the matching tab, then remove the old archive and people search pages.
  - Rebuild sign-in, verify and onboarding, and the localized 404 page. (The denied page moved to Stages 2 and 3, with the pages that use it.)
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
  - Denied state (moved from Stage 1, review P3-3): community pages show a localized "no access" state for private or removed access, revealing nothing about the content. Approved text: EN "You don't have access" / "This page is private, or your access has changed. If you think you should have access, ask the person who shared the link."; AR "لا تملك صلاحية الوصول" / "هذه الصفحة خاصة، أو أن صلاحية وصولك تغيرت. إن كنت تعتقد أنه يحق لك الوصول، فاسأل من شارك الرابط معك."
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
  - Vote control (up/down counts, `aria-pressed`). **Ask the owner first:** they are leaning towards changing the 2026-11-03 vote display. Proposed: show only the upvote count publicly; keep the downvote button with its pressed state; keep downvotes in ranking; possibly add a "Disputed" label on replies with many downvotes relative to upvotes (propose the rule before building it). Reason: avoid discouraging students from asking questions. Display-only change; the server already counts both. Confirm before building the vote control, and consider asking usability-test participants which version they prefer.
  - The same denied state on post pages (see Stage 2).
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

### Temporary page CSS (owner decision 2026-11-27)

Stage 1 deleted the harness CSS (`globals.css`). The owner approved keeping [legacy-pages.css](../../src/app/[locale]/legacy-pages.css) temporarily: it holds only working rules for pages not yet rebuilt, with no old layout or look. Each rule goes in the stage that rebuilds the last page using it. The file is deleted by the end of Stage 6 (AC 2). Tick each row when its rule is removed.

| Rule | Why it is needed now | Last users | Remove in |
| --- | --- | --- | --- |
| `.visually-hidden` | Screen-reader-only text | communities forms, vote control | Stage 3 |
| `.community-description` (pre-wrap) | Keeps the line breaks people typed | communities, posts, comments, message thread | Stage 5 |
| `.message-scroll` | The message history is a scroll region | message thread | Stage 5 |
| Form controls `max-inline-size: 100%` in `#main-content` | Reflow at 320px and 400% zoom | communities, post and comment forms, message composer, notification preferences | Stage 5 |
| `.community-list` (no bullets) | List reading | communities, posts, comments, feed, messages, notifications | Stage 6 |
| `.comment-replies` | Replies stay visibly nested | comment thread | Stage 3 |
| Discussion controls: `.content-actions`, `.vote-control`, `.action-icon`, `.text-action`, `.comment-action`, `.comment-composer`, `.composer-actions` | 36px targets (WCAG 2.5.8) and the compact composers approved 2026-11-03 | post card, comment card and form, vote control | Stage 3 |
| ~~`.archive-excerpt`~~ | — | none since `/search` | Removed in Stage 1 |

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

**Stage 1 (2026-11-27), measured the same way after `npm run build`:**

| Route | Baseline | First shell | After lazy-loading |
| --- | --- | --- | --- |
| Shared root chunks | 128.8 | 128.6 | 128.6 |
| `/[locale]` (Home) | 135.6 | 149.1 | 148.3 (+12.7) |
| `/[locale]/signin`, `/verify` | 140.1 | 154.8 | 149.1 (+9.0) |
| `/[locale]/communities/[id]` (largest) | 144.4 | 157.7 | 157.1 (+12.7) |
| `/[locale]/search` (new) | — | 151.2 | 150.5 |
| 404 (`[...missing]`) | — | 148.7 | 135.3 |

What changed after the owner asked for lazy-loading:
- **Loaded on first use** (or when the control is hovered or focused): the notifications preview (its fetch, validation and list), the menu list (the Stage 0 Menu now ships only its trigger, for every menu), and the mobile More dialog. Measured alone, this saved 1.6 KiB on app routes (Home 149.1 → 147.5).
- **The larger saving came from imports:**
  - The 404 boundary sits above every page, and it was importing the whole shell, so every route carried all of it. The 404 page is now built on the server from client-free parts, and a small switch picks the language. The 404 header has no theme or language switch. The boundary still adds a separate 3.3 KiB chunk to every route, which is why Home ends at 148.3 rather than 147.5.
  - Sign-in and verify now import only the slim frame.

**Written reason for the remaining growth (AC 10):** on app routes, +12.7 KiB gzip is the shell that is visible on every page:
- header search (next/form, client-side navigation)
- toast live regions (they must exist from the first render to be announced)
- desktop and mobile navigation with current-page state
- theme and language switches
- the notifications and account triggers

On sign-in and verify, +9.0 KiB is the theme and language switches, plus the new identity forms built on the shared components. A further option, not taken: a plain GET form for header search (no next/form). It would save a little but reload the whole page on every search.

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

### 2026-11-27 — Session 3 — Stage 1 test rewrites, walkthrough, review
- **State:** done · branch `feat/ui-redesign` at `1cd7eb2`, pushed to `origin/feat/ui-redesign` (`c595291` docs: add replies format rule; `1cd7eb2` feat(ui): add Stage 1 app shell, unified search and entry pages; the push also carried session 2's `5d45817` tooling fix, which was committed but not yet pushed) · uncommitted: this handoff's edits to this plan and `docs/project-brief.md`.
- **Done:**
  - Votes keyboard test waits for the vote buttons to be enabled (hydration) before each key press. Then 10/10 (5 runs × EN/AR), then 10/10 again, and the whole votes spec 32/32 (4 runs).
  - New focused runner `test:e2e:focus` (`USP_E2E_SPECS`, `USP_E2E_GREP`, `USP_E2E_REPEAT`), validated input, same guarded disposable database as the other groups; recorded in README.
  - `identity.spec.ts` rewritten (see the inventory status). Sign-out is tested from both controls: header account menu (dead sessions, trigger failure with toast and focus return) and the profile page button (SELECT-revoked failure, final logout).
  - `ui-layout.spec.ts`: navigation check uses whichever navigation is visible; unique community name per run; reflow failures now name the overflowing elements. `ui-zoom.spec.ts`: `/search` tabs replace `/archive` and `/people`; fit check includes header and navigation.
  - **Bug fixed:** at 320px with 200% text and WCAG text spacing, the header's notifications and account buttons overflowed off-screen (both locales). The header row and its action group now wrap (`shell.module.css`).
  - Section A walkthrough with screenshots (EN/AR × light/dark × 320/1360; synthetic data, outside the repo; temporary spec deleted). Findings below.
- **Walkthrough (section A):**
  - P2, P3 (posts and people), P6: resolved by Stage 0–1 (header search, unread bell with preview, account menu; unified `/search`; theme, self-hosted fonts, localized 404).
  - P1: partial. Verified Home is a start page with three links; the feed on Home is Stage 2.
  - P7: partial. Notification settings now sit on the profile page, but are still unstyled (Stage 4).
  - P3 (communities search), P4, P5, P8: unchanged, planned for Stages 2, 2, 3 and 5. Post and community pages still look like the harness (expected).
  - New small findings: (a) the profile page button says "Log out" while the header menu says "Sign out"; (b) the profile page shows two near-duplicate privacy notes (directory hint and the "Only you can edit" note); (c) the mobile More sheet holds a single item (Profile and settings).
- **Checks:**
  - `npm run lint` -> passed; `npm run typecheck` -> passed; `npm test` -> 496 passed, 1 skipped
  - `npm run build` -> succeeded
  - `test:e2e:focus` identity spec -> 19/19; ui-layout -> 4/4 (after the header fix)
  - `npm run test:e2e:zoom` -> 2/2 (native 200% and 400%, EN/AR)
  - `npm run test:e2e:identity` (all groups) -> empty 1/1, main 201 passed + 1 skipped, archive 14/14, messaging 40/40, feed 18/18
  - after removing a temporary diagnostic and rebuilding: `npm run test:e2e` -> 18/18, `test:e2e:shell` -> 37/37, `test:e2e:components` -> 12/12
  - not run: NVDA, forced colors, non-Chromium browsers, client JS size re-measurement (only CSS changed since the last measurement).
- **Open issues / risks:**
  - During the first votes run the server logged `shell.notifications.failed` twice (header unread count failed; the header degrades to no count). A temporary diagnostic was added and ~300 further browser tests ran without it recurring, so the cause is unknown. The diagnostic was removed.
- **Review (`checkpoint-reviewer`, 2026-11-27, uncommitted scope):** no P1, 1 P2, 7 P3. No authorization, leak or validation regression found; server changes limited to diagnostics event names; security inventory I1–I17, A2/A4/A6/A7, P1–P10 and C1 cases confirmed present.
  - P2-1: each `(app)` render runs the profile read plus a full `listNotifications` (membership snapshot, advisory locks, a 21-item page) only for the unread count, on a 4-connection pool with Prisma's 2 s transaction wait. Hypothesised cause of the two `shell.notifications.failed` logs; a pool-wait failure on the first read would show "session could not be checked" for a healthy session. Fix needs a small read-only count function (server addition, owner decision) or a client-side count after idle.
  - P3-1: header unread count and avatar go stale after client navigation (shared layout is not re-rendered); a comment in `notifications-button.tsx` claims otherwise.
  - P3-2: the All tab applies `community`/`type` from the URL without showing them.
  - P3-3: `DeniedContent` is built but unused; Stage 1 lists the denied page.
  - P3-4: the header search landmark has no accessible name.
  - P3-5: README (search pages, 404 text, `test:e2e:shell`), project brief Stage 1 entry and the Stage 1 heading here are out of date.
  - P3-6: the "visual tour screenshots" test in `shell.spec.ts` has no assertions and runs in every shell and main run.
  - P3-7: no browser test for `/search` failure and Retry states; tab keyboard activation not tested; two unused i18n keys.
  - Reviewer checks: lint and typecheck passed; `npm test` 496 passed with Node 24.21.0 (2 environment-only failures on Node 24.13.0). No database or browser suites run by the reviewer.
  - Residual: search budgets spent per All-tab render; possible production prefetch of some ButtonLinks; removed "Local synthetic account test" label; stale `tools/testing/feed-qa-snapshot.mts` file list; manual/NVDA/forced-colours/non-Chromium checks outstanding.
  - Status: owner chose fixes (below).
- **Owner decisions on the review (2026-11-27):**
  - P2-1: "Yes. Add a small read-only count for unread notifications. It must apply exactly the same access rules as the notification list ... Keep it bounded, give it unit tests, and add a browser test that the count drops when access is revoked. Fix the stale count after client navigation (P3-1) in the same change."
  - P3-2 to P3-7: "Yes, fix all seven."
  - Walkthrough: "Use 'Sign out' everywhere and keep the clearer of the two privacy notes, in both languages." More sheet: leave until Stage 4.
  - After fixes and checks, re-review the fixes only; with no P1/P2, commit Stage 1 with the approved message, push both commits to `feat/ui-redesign`, then hand off.
- **Fixes:**
  - P2-1: `countUnreadNotifications` (server, read-only) reuses the list's `visibleNotifications` scope, so the access rules are identical; it counts at most `unreadCountLimit + 1` (99 + 1) rows. The header uses it instead of `listNotifications` and shows "99+" above the limit (EN/AR). Database tests: count equals the list's unread across removal, pending rejoin, approval, leaving and other users (public and private); the cap; the lock race after removal; 401 for an unknown session. Unit tests: viewer and label.
  - P3-1: pages tell the header directly (`shell/shell-events.ts`, same tab only): opening an unread notification from the list lowers the count; saving a display name updates the avatar. The misleading comment is corrected. Mark-all-read already refreshes the route. New notifications that arrive during client-side browsing still show on the next full load or refresh (no realtime; recorded limitation).
  - P3-2: post filters apply only on the Posts tab. P3-3: the unused denied page was removed; it moved to Stages 2 and 3 with its approved text (the reviewer's second option, to avoid changing pages those stages rebuild). P3-4: the header search landmark is named. P3-5: README routes, 404 note and `test:e2e:shell`, the project brief's Stage 1 entry and this plan updated. P3-6: the screenshot tour runs only with `USP_VISUAL_TOUR=1`. P3-7: new browser tests for a failed kind with Retry (genuine fault: comments unreadable), an unchecked session on `/search`, keyboard tab activation and All ignoring filters; unused keys removed.
  - "Log out" is now "Sign out"; the profile keeps the directory note and drops the longer duplicate.
  - New browser tests in `shell.spec.ts`: the count drops after removal from a private community and returns on readmission; the header count and avatar update without a reload.
- **Checks after fixes:**
  - `npm run lint` -> passed; `npm run typecheck` -> passed; `npm test` -> 501 passed, 1 skipped; `npm run build` -> succeeded
  - `npm run db:test` -> 179 passed, 18 skipped (skips are the gated evidence suites)
  - `npm run test:e2e:identity` -> empty 1/1, main 204 passed + 2 skipped (screenshot tour now opt-in), archive 18/18, messaging 40/40, feed 18/18
  - `npm run test:e2e:shell` -> 44 passed, 1 skipped; `npm run test:e2e` -> 18/18
  - Logged events in these runs all trace to deliberate faults (identity I6/I16, search fault test). In I16 a background session recheck on Home can be mid-render when SELECT is revoked, which logs `shell.notifications.failed` once per locale. The single occurrence in the first votes run of this session (no faults) remains unexplained.
- **Re-review of the fixes (`checkpoint-reviewer`, 2026-11-27):** no P1, no P2, 2 P3. Confirmed the count uses the list's scope, is read-only and bounded, and that P3-2 to P3-7 and the wording changes are in place. Reviewer ran lint, typecheck and unit tests (passed); no database or browser suites.
  - P3-a (open): the header can keep a count from the preview after "Mark all read" when the server value equals its last render (for example 0 at load, 3 seen in the preview, then mark all read). Fix next: have mark-all send a shell event (or reset on every server render), correct the comment in `notifications-button.tsx`, and add a browser assertion on the header after mark-all.
  - P3-b (open, needs an owner decision): opening an already-read item from an outdated list (after Back) lowers the header count again. Exact fix: the open endpoint reports whether it marked the item read (changes an existing API response). Otherwise record it as a known limitation.
  - Per the owner's instruction (no P1/P2), Stage 1 is committed and pushed with these two P3s open.
- **Decisions (this session):**
  - "Start with the vote keyboard test ... Then rewrite the identity tests and keep every security case. Do layout and zoom after that."
  - Replies rule: "Commit it now as its own docs commit ... staging only CLAUDE.md ... Don't push yet." (diff shown first; committed as `c595291`)
  - Review fixes, wording, More sheet and commit/push conditions: quoted above under "Owner decisions on the review".
- **Owner decisions after the handoff (2026-11-27):**
  - P3-b: "Yes, change the open-notification API to report whether it marked the item read. Keep it backward compatible, test both cases (unread → marked; already read → not marked), and make sure it reveals nothing about notifications I can no longer access."
  - "Next session: merge main into the branch first if it has moved, then fix both header count issues together, then start Stage 2."
- **Next step:** (1) `git fetch` and merge `origin/main` into `feat/ui-redesign` if it has moved; run lint, typecheck and unit tests after a merge. (2) Fix P3-a and P3-b together: add a field to the `POST /api/notifications/{id}/open` response that says whether this request marked the notification read (from the `updateMany` count in `notificationTarget`), keeping every existing field; inaccessible or unknown ids keep returning the same 404 with no new information. The list (`notifications-list.tsx`) and the header preview (`shell/notifications-preview.tsx`) lower the header count only when that field is true. A successful "Mark all read" sends a shell event that sets the header count to 0; correct the comment in `shell/notifications-button.tsx`. Tests: database cases for unread → marked and already read → not marked, plus removed-member and other-user 404s unchanged; browser assertions for the header after mark-all and after reopening a read item via Back. (3) Start Stage 2, first asking the owner to confirm the `CommunityVisit` migration scope.

### 2026-11-27 — Session 2 — Stage 1 shell, search and entry pages (partial)
- **State:** partial · branch `feat/ui-redesign` at `5d45817` · uncommitted: all Stage 1 work (107 status entries, 94 files vs HEAD), including the `(app)`/`(entry)` route-group moves, staged as renames.
- **Done:**
  - App shell in persistent group layouts: `src/app/[locale]/(app)/layout.tsx` (AppShell) and `(entry)/layout.tsx` (EntryFrame), so loading states keep the header. Shell code in `src/app/[locale]/shell/`: header search, primary nav, mobile bar with a lazy More dialog, account menu (lazy menu list), notifications button with a lazy preview, theme and language switches, and `loadViewer` (anonymous / unavailable / verified).
  - Localized 404 for every route, including unknown locales (`not-found.tsx`, `[...missing]/page.tsx`, `notFound()` in the group layouts so the status is a real 404). Denied page content in `shell/status-content.tsx`.
  - `/search` with All, Posts and People tabs, rendered on the server from the URL (`(app)/search/`). `/archive` and `/people` redirect (307) to the matching tab; the old search pages were removed.
  - Sign-in, verify and onboarding rebuilt (`identity-forms.tsx`, `profile?welcome=1`); Home rebuilt for anonymous, verified and unavailable viewers.
  - `globals.css` deleted. Remaining page rules live in the temporary `legacy-pages.css`, each with a removal stage (see "Temporary page CSS").
  - Lazy-loading for the notifications preview, menu list and More dialog. The 404 boundary and entry layout no longer import the whole shell. Sizes are recorded under "Client JS baseline (AC 10)".
  - New browser specs: `tests/e2e/shell.spec.ts`, `search.spec.ts`, and the helpers in `shell-navigation.ts`. Rewritten: `locales.spec.ts`, `people.spec.ts`. `archive.spec.ts` was deleted; its cases moved to `search.spec.ts`. Older suites were adjusted to the new shell. New runner group `test:e2e:shell`.
  - Local database repair: removed an orphaned not-ready manifest entry and two leftover test databases (manifest backed up to `.cache/m1b/manifest.backup-2026-11-27.json`). Tooling fix committed separately as `5d45817`: an unfinished entry now gives a named "incomplete database setup" error.
- **Decisions:**
  - "Yes, the three tokens are approved." (`danger-text`, `control-border`, `backdrop`)
  - "Keep legacy-pages.css temporarily. Track each rule's removal in the plan so the file is deleted by Stage 6."
  - "Do the lazy-loading now (notifications preview, account menu, More dialog) and record the new size."
  - "The two behaviour changes are fine": the language link keeps a profile URL as typed, and back/forward may show search results that were already displayed.
  - Database: "yes to steps 1, 2, 3 and 4. Keep the tooling fix in its own commit."
  - Votes test: fix the hydration wait "in the next session".
  - Stage 1 commit: approved ("yes") to commit as `feat(ui): add Stage 1 app shell, unified search and entry pages` once `/review-checkpoint` passes. Not approved: pushing.
- **Checks:**
  - `npm run lint` -> passed
  - `npm run typecheck` -> passed
  - `npm test` -> 496 passed
  - `npx vitest run tools/database/targets.test.ts` -> 5 passed (after the tooling fix)
  - production build used for the client JS measurement -> succeeded; Home 148.3, sign-in/verify 149.1, largest route 157.1, 404 135.3 KiB gzip
  - `npm run test:e2e` -> 18/18
  - `npm run test:e2e:shell` -> 37/37
  - `npm run test:e2e:components` -> 12/12
  - `npm run test:e2e:feed` -> 18/18 (an earlier run had 4 failures that did not reproduce)
  - `npm run test:e2e:messaging` -> 40/40, including the PostgreSQL restart case, after the database repair
  - `npm run db:status` -> passed after the repair
  - `npm run test:e2e:identity` -> 180 passed, 21 failed, 1 skipped. The 21 failures are the planned rewrites: 17 in `identity.spec.ts`, 2 in `ui-layout.spec.ts`, 2 in `ui-zoom.spec.ts`.
  - not run: `/review-checkpoint`, e2e CI suite, manual section A walkthrough, NVDA, forced colors, non-Chromium browsers.
- **Open issues / risks:**
  - `votes.spec.ts` "profileless members toggle ... by keyboard" failed once in English (aria-pressed stayed false) and passed on the rerun. Likely cause: the test focuses the vote button and presses Enter before hydration, while the button is still disabled. Fix next session: wait for `toBeEnabled()` before each focus, including after the reload.
  - Stage 1 is not yet committable as a checkpoint: three suites are red until they are rewritten.
  - Client JS is +12.7 KiB gzip over the Stage 0 baseline (reason recorded under AC 10).
- **Next step:** add `toBeEnabled()` waits to the votes keyboard test, then rewrite `tests/e2e/identity.spec.ts` against the new sign-in, verify and onboarding pages, using the "Stage 1 security case inventory" (I1–I10, I14–I16 rewrite; I11–I13 and I17 keep). Then `ui-layout` and `ui-zoom` (archive and people zoom routes become `/search`), the section A walkthrough, and `/review-checkpoint`.

### 2026-11-27 — Stage 1 security case inventory (before rewriting specs)

Each security case in the six specs Stage 1 rewrites, and where it goes. **Keep** = an API-level test that doesn't touch the UI; it moves over unchanged. **Rewrite** = drives the UI; the same assertions are rewritten against the new pages. A case is crossed off only when its new test passes.

**`identity.spec.ts`** → rewritten `identity.spec.ts`
| # | Case | Plan |
| --- | --- | --- |
| I1 | Verification token stays in the URL fragment only: never in request URLs, storage, `history.state` or the DOM; a GET (scanner) of `/verify` does not sign in; `GET /api/identity/confirm` is 404 | Rewrite |
| I2 | Browser binding: the token confirmed from another browser context returns 400 | Rewrite |
| I3 | Single use: replaying a confirmed token with the original pending cookie returns 400 | Rewrite |
| I4 | Switching language on `/verify` keeps the token in memory only and confirmation still works | Rewrite |
| I5 | Logout with an expired, revoked or absent session clears both cookies, shows sign-in, leaks no email in the page; the old cookie replayed on GET and POST profile returns 401; a repeated logout returns 200 | Rewrite |
| I6 | Logout during a database failure (trigger reject; SELECT revoked) returns 503 with no `Set-Cookie`, keeps both cookies, shows a focused failure message, does not revoke the session; a later logout succeeds | Rewrite |
| I7 | Session cookie is `HttpOnly`, `SameSite=Lax`; the profile API sends `Cache-Control: private, no-store` | Rewrite |
| I8 | After logout, the old session cookie returns 401 | Rewrite |
| I9 | Signing in again with the same email reuses the account and keeps the saved name | Rewrite |
| I10 | An expired link shows the link error (focused), also after a language switch | Rewrite |
| I11 | Profile writes reject `userId`, `email` and `role` (400); `?userId=` returns 404; a second account's cookie only reaches its own profile | Keep (API) |
| I12 | Request responses are identical for new, existing and ineligible emails (202 `{ok:true}`); no mail to ineligible addresses | Keep (API) |
| I13 | Untrusted or empty `Origin` returns 403; `DELETE` returns 405; an oversized body returns 400 | Keep (API) |
| I14 | Home sends `no-store`; reading home without a profile creates no `Profile` row; a logout in another tab shows on focus, back and reload | Rewrite |
| I15 | Home rechecks expired and revoked sessions on back and reload, without clearing the cookie on a GET | Rewrite |
| I16 | Home during a database failure: no `Set-Cookie`, an alert, neither the sign-in nor the profile link, and retry recovers | Rewrite |
| I17 | Rate limits use the real peer IP; forged `X-Forwarded-For` and `X-USP-Peer*` headers are ignored; 30 per window for request and confirm | Keep (API) |

**`locales.spec.ts`** → rewritten `locales.spec.ts`
| # | Case | Plan |
| --- | --- | --- |
| L1 | `/` redirects 307 to `/en` | Keep |
| L2 | `/_next/image` is disabled (404) | Keep |
| L3 | Unsupported locales and unknown paths return HTTP 404 (now with a localized page) | Rewrite |
| L4 | Home rechecks the server (RSC request) on focus and on back, keeping keyboard focus | Rewrite |

**`ui-layout.spec.ts`** and **`ui-zoom.spec.ts`**: no security cases. Their reflow, zoom, skip-link and focus checks are rewritten against the new shell. The community and post pages are rebuilt in Stages 2 and 3, so their layout checks stay until then. In `ui-zoom`, the `archive` and `people` routes become `/search` tabs.

**`archive.spec.ts`** → new `search.spec.ts` (Posts tab)
| # | Case | Plan |
| --- | --- | --- |
| A1 | Every new server snapshot (scoped navigation, header navigation, unchanged refresh) resets query, filters, results, cursor and retry state | Rewrite |
| A2 | After removal from a private community, a refresh clears its results and drops it from the community filter; an unscoped search then returns nothing | Rewrite |
| A3 | A response body delayed across navigation or a refresh after removal is discarded, and focus is kept | Rewrite |
| A4 | Stored HTML in titles and bodies renders inert | Rewrite |
| A5 | Changing the query cancels the in-flight request; its late response never renders | Rewrite |
| A6 | Private pagination: non-member scoped 404 and unscoped empty; pending member 404; approved member 20 + 3; another user's cursor 400; `private, no-store`; after removal the next page is 404, the UI shows "unavailable" and clears results; a direct reply link and a comment id from another post show "unavailable" | Keep the API part; rewrite the UI part |
| A7 | Duplicate keys, unknown parameters, oversized and `%`-only queries, invalid type: 400; `POST` 405; a literal `%_` query is safe | Keep (API) |

**`people.spec.ts`** → new `search.spec.ts` (People tab) plus a slimmer `people.spec.ts` for the person page and APIs
| # | Case | Plan |
| --- | --- | --- |
| P1 | Unverified accounts disappear from results, and their person page and API return 404 | Rewrite |
| P2 | Accounts without a saved profile are not listed; opening `/profile` shows a suggested name but creates no `Profile` row until saved | Rewrite |
| P3 | Results carry only `id` and `displayName`, the `id` is not the user id, and responses are `private, no-store` | Rewrite |
| P4 | There is no hiding control; a `directoryVisible` field is rejected (400) | Rewrite |
| P5 | Stored HTML in names renders inert | Rewrite |
| P6 | A caller signed out mid-search sees "unavailable" and the results clear | Rewrite |
| P7 | Results delayed across a server refresh are discarded, and the query resets | Rewrite |
| P8 | Anonymous search and detail return 401; a missing `Origin` returns 403; extra fields, wrong types and empty names return 400; short, duplicate, unknown and bad-cursor queries return 400; an unknown id returns 404 `{ok:false}` | Keep (API) |
| P9 | Both profile routes share one save budget across sessions; over the limit, 429 with no change and no `Set-Cookie` | Keep (API) |
| P10 | Control and bidi characters are rejected on both profile routes without changing the profile | Keep (API) |

New in Stage 1 (C1): a non-member searching a private post's unique word gets no result on the All or Posts tab while a member does; after removal it disappears; `/archive?q&community&type` and `/people?q` redirect to the matching tab with the same results.

**Status (2026-11-27, end of session 2):**
- Done and passing in `search.spec.ts`: A2, A4, A6 (UI and API), A7, the new C1 cases, the redirects, and P1, P5, P6. `people.spec.ts` keeps P2, P3, P4 and P8–P10, plus the typo-matching case.
- A1, A3, A5 and P7 guarded client-held search state: snapshot resets, delayed bodies, cancelled requests. `/search` renders results on the server from the URL, so no such state exists. Each render rechecks access, and each page is a URL. Covered instead by the reload-after-removal, cursor and redirect cases in `search.spec.ts`.
- L1–L4: done in the rewritten `locales.spec.ts`.
- ~~Still to rewrite: I1–I10 and I14–I16 in `identity.spec.ts`, plus `ui-layout` (2) and `ui-zoom` (2).~~ Done in session 3: I1–I10 and I14–I16 rewritten against the new sign-in, welcome step, header account menu and Home; I11–I13 and I17 unchanged; all 19 pass. `ui-layout` and `ui-zoom` rewritten (zoom now visits the `/search` tabs, and its fit check covers the header and navigation).

- 2026-11-27: Owner approved the three Stage 0 tokens (`danger-text`, `control-border`, `backdrop`): "Yes, the three tokens are approved." This closes the Session 1 open issue. Owner said to start Stage 1 by listing the security cases of the specs being rewritten, then continue.

### 2026-11-26 — Session 1 — Stage 0 foundations
- **State:** done · branch `feat/ui-redesign` at `e12c629` (pushed) · uncommitted: this log entry, the brief entry and the `ui-direction.md` wording fix
- **Done:**
  - Tokens and base styles: [src/ui/tokens.css](../../src/ui/tokens.css) holds light, dark and system-dark sets; [src/ui/base.css](../../src/ui/base.css) is scoped to `.ui-root` until Stage 1.
  - Three tokens added: `danger-text`, `control-border` and `backdrop`, recorded in [ui-direction.md](../design/ui-direction.md).
  - Fonts: IBM Plex Sans and Plex Sans Arabic are self-hosted from IBM's npm tarballs in [src/ui/fonts/](../../src/ui/fonts/). [src/ui/fonts.ts](../../src/ui/fonts.ts) defines three families limited by unicode-range, with no preload. The OFL text and file hashes are in `THIRD-PARTY-NOTICES.md` and the licence manifest.
  - Theme cookie (decision 7): the layout reads it in [src/ui/server-theme.ts](../../src/ui/server-theme.ts) and sets `data-theme` on `<html>`.
  - Components in [src/ui/components/](../../src/ui/components/), with our own icons in [src/ui/icons.tsx](../../src/ui/icons.tsx): Button/ButtonLink/IconButton, TextField, Select, Chip/ChoiceChips, Badge/CountBadge/DotBadge, Avatar (initials), Card, link-based Tabs, Menu, Dialog (native `<dialog>`), Toast, VoteControl, EmptyState/ErrorState, Skeleton and ThemeToggle. Strings are in `src/i18n/ui.ts`.
  - Dev-only preview at [/[locale]/dev/components](../../src/app/[locale]/dev/components/page.tsx). It is guarded by the synthetic local context, so ordinary `next start` returns 404.
  - Tooling: the `test:e2e:components` group and the `size:client-js` script ([tools/ui/client-js-size.mts](../../tools/ui/client-js-size.mts)). The baseline is recorded under "Client JS baseline (AC 10)".
  - Review fixes after `/review-checkpoint`:
    - Dialog reports each close once and survives a fast Escape-then-reopen.
    - Toast moves focus on dismiss, its pause can't get stuck, and each toast keeps its own countdown.
    - Preview toasts render inside `.ui-root`.
    - Skeleton's label sits outside the busy region and is filled after mount.
    - Font preload removed.
    - Telemetry wording in the notices corrected.
- **Decisions:** Owner: "Fix the medium one and minor 1, 2, 3, 4 and 6 (use the safer markup for 6). Record minor 5 at /handoff." Earlier: "start stage 0". The three added tokens have not yet been explicitly approved by the owner.
- **Checks (final code unless noted):**
  - `npm run lint` -> pass, 0 warnings
  - `npm run typecheck` -> pass
  - `npm test` -> 44 files passed, 1 skipped; 458 tests passed, 1 skipped (112 new in `src/ui`: contrast, logical properties, helpers)
  - `npm run db:validate` -> valid (before the review fixes; `prisma/` unchanged)
  - `npm run build` -> success; `.next/server/next-font-manifest.json` lists no preloaded woff2
  - `npm run test:e2e:components` -> 12/12 passed (themes × locales, no-flash with JS off, toggle persistence, keyboard/focus return, close counter, toast focus, 320px, same-origin fonts)
  - `npm run test:e2e` -> 12/12 passed, including `dev-preview-disabled` (404 under ordinary start)
  - `npm run size:client-js` -> every existing route equals the baseline (largest `/[locale]/communities/[id]` 144.4 KiB gzip)
  - `npm run test:e2e:identity` -> passed before the review fixes: empty 1; main 185 passed, 1 skipped; archive 14; messaging 40; feed 18
  - Not run: `test:e2e:identity` after the review fixes; `db:test`; manual NVDA, forced-colors and non-Chromium checks; visual EN/AR × light/dark pass
- **Review minor 5, recorded here:**
  - The Stage 0 evidence is the check list above.
  - The `ui-direction.md` sentence now says the contrast test covers the main pairs. It names the two hover pairs not yet in the test (both computed at 6.6:1 or more).
- **Open issues / risks:**
  - The owner has not explicitly approved the three added tokens.
  - Fonts have no preload. In Stage 1, measure whether to preload the Regular Latin file.
  - During the Latin swap period, English text may render in the Arabic family's metric-adjusted Arial fallback. This is unmeasured.
  - The preview guard checks only that the local context exists, not its full origin/peer validation. The page holds synthetic constants only.
  - The SkeletonGroup announcement has not been verified with a screen reader.
  - Full `test:e2e:identity` has not been rerun after the review fixes, which touch only the shared components, the preview and font loading.
- **Next step:** start Stage 1. Build the app header (unified search field, desktop navigation and mobile bottom bar per decision 5, language and theme switches, notifications button) using `src/ui/components`. Move `ui-root` to `<body>` and delete `globals.css` once the shell replaces the old header. Begin by listing the security cases of the `identity`, `locales`, `ui-layout`, `ui-zoom`, `archive` and `people` specs that will be rewritten.

- 2026-11-26: Stage 0 independent review (`checkpoint-reviewer`, uncommitted scope). Verdict: 6 findings, 0 P1, 1 P2, 5 P3, and no security, authorization or data-loss issues. The P2 is that Dialog calls `onClose` twice. The P3s are font preload weight, toast focus and pause, preview toasts outside `.ui-root`, telemetry wording in the notices, and the SkeletonGroup announcement; the Stage 0 evidence entry and the token-pair wording are left for /handoff. The reviewer ran lint, typecheck and `npm test` (all passed), verified font provenance against IBM's tarballs, and confirmed client JS matches the baseline. Before the review, the implementer had run build, `test:e2e:components` (12/12), `test:e2e` (12/12) and `test:e2e:identity`. The identity groups passed: empty 1, main 185 with 1 skipped, archive 14, messaging 40, feed 18. Fixes are pending the owner's choice.

- 2026-11-26: Owner put the assistant on hold (decision 12) pending a discussion with the partner and instructor. All assistant UI and API work is removed from the stages, Stage 7 is marked on hold, and `ui-direction.md` is aligned with decisions 4 and 12.
- 2026-11-26: Owner approved all twelve decisions. Decisions 4 and 8 differ from the recommendations: `/search` is the only search page, with tabs, and Messages read tracking is added in Stage 5. Priority is now unified search > share > save > messages unread > community new counts. Next step: Stage 0.
- 2026-11-26: Plan written. No application code changed. Entry state: `feat/ui-redesign` at `07830ec`, clean.
