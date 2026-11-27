# New UI direction — "Clear Campus"

Status: direction selected by the owner on 2026-11-26 (light and dark). This is the visual reference for the UI redesign plan (`docs/plans/ui-redesign.md`). It describes the look only; behavior, permissions and approved product decisions in `docs/project-brief.md` still apply.

Reference mockups in `docs/design/mockups/` are design-tool source (inline styles and a template runtime). They will not render on their own; read them for structure, spacing and colors. Do not copy their markup into the app. Implement with the project's own components and CSS tokens.

- `clear-campus-light.dc.html`: home feed, English, light
- `clear-campus-dark.dc.html`: home feed, English, dark
- `clear-campus-arabic.dc.html`: home feed, Arabic, RTL, light

## Rebuild, not modify

The existing pages were built to exercise the server features, not as the product's interface. The redesign is a rebuild:

- Page structure, navigation, user flows and routes are designed fresh for the best experience. Pages may be merged, split or added.
- The old UI is a source of facts only: which server capabilities exist (data, actions, APIs) and which states must be handled (loading, empty, error, denied). Not a source of layout, wording or flow.
- Known bad UX is fixed, not ported, and missing pieces users need are added (see "Features added with the redesign").
- What stays: server behavior, permissions and the approved product decisions in the brief, unless the owner approves a change. Browser tests are rewritten for the new UI, keeping every security case (cross-user, denied, revocation).

## Principles

- Calm and readable: neutral grey page, white cards, one indigo accent. Color is for meaning (post type, state), not decoration.
- People first: every post starts with who wrote it (avatar, name), then where and when, then the content, then the actions.
- Bilingual from the start: every layout works mirrored in Arabic. Use logical CSS properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`), never left/right.
- Light and dark are one design with two token sets, not two designs.

## Layout (home feed, desktop)

- Header: logo, wide search field, theme toggle, language switch, notifications button with unread dot, user avatar.
- Three columns, max width about 1360px, 24px gaps:
  - main navigation on the start side (about 230px)
  - feed in the middle (flexible)
  - side panel on the end side (about 340px): recent notifications, built as a stack of cards so more cards can be added later
- Main navigation: Home, Communities, Messages (unread badge); then a "My communities" list. The list must accept one more item later (for example Assistant) without a redesign.
- People and Archive are not navigation items. Search lives in the header field and one search page, `/search`, with tabs All, Posts, People, Communities. `/archive` and `/people` open the matching tab (plan decision 4).
- Feed: post composer card (input and four post-type chips), feed tabs ("Your communities" / "For you"), then post cards.
- Narrow screens:
  - Columns stack, and the side panel is hidden.
  - A bottom bar holds Home, Communities, Search, Messages and More. More opens Saved, and Profile and settings.
  - The header keeps logo, notifications and avatar.
- **The mockups differ from this section**: they show People, Archive and Assistant in the navigation and an assistant card in the side panel. Follow this section, not the mockups, for navigation and the side panel.

## Design tokens

Define every color once as a CSS custom property with a light and a dark value. Components use only tokens.

| Token | Light | Dark |
| --- | --- | --- |
| bg (page) | #F5F6F8 | #0F1218 |
| surface (cards, header) | #FFFFFF | #171B23 |
| surface-muted (inputs, vote pill) | #F2F4F7 | #1F2530 |
| border | #E4E7EC | #262C36 |
| border-strong (inputs, buttons) | #D0D5DD | #353C48 |
| text | #101828 | #E8ECF2 |
| text-secondary | #344054 | #C9D1DC |
| text-muted | #475467 | #A3ADBA |
| text-subtle (small labels) | #667085 | #8B95A3 |
| accent | #4F46E5 | #818CF8 |
| accent-soft (active nav) | #EEF0FF | #252A4A |
| accent-text (links, active nav text) | #3730A3 | #A5B4FC |
| on-accent (text on accent fill) | #FFFFFF | #0F1218 |
| danger (unread dot, error icons) | #D92D20 | #F97066 |
| danger-text (error text, danger buttons) | #B42318 | #F97066 |
| control-border (input, select and chip borders) | #7D8799 | #6B7585 |
| backdrop (behind modal dialogs) | rgb(16 24 40 / 0.55) | rgb(0 0 0 / 0.7) |

Three tokens were added in Stage 0 (2026-11-26) and approved by the owner on 2026-11-27. `danger-text` exists because #D92D20 reaches only 4.47:1 on the page background, below the 4.5:1 text minimum. `control-border` exists because `border-strong` is about 1.5:1, and input boundaries need 3:1 (WCAG 1.4.11). `backdrop` keeps the dialog overlay a token too. The values live in `src/ui/tokens.css`, and `src/ui/tokens.test.ts` checks the main text and non-text pairs in both themes. Two hover-state pairs are not in the test yet: a selected post-type chip on `surface-muted`, and a pressed vote on `border`. Both pass when computed by hand (at least 6.6:1 and 7.0:1).

Post types (background / text / chip border):

| Type | Light | Dark |
| --- | --- | --- |
| Question | #EEF2FF / #3730A3 / #C7D2FE | #22264A / #A5B4FC / #3A3F7A |
| Discussion | #F0F9FF / #075985 / #BAE6FD | #0F2A3A / #7DD3FC / #1E4A63 |
| Resource | #ECFDF3 / #05603A / #ABEFC6 | #12301F / #86EFAC / #1F5236 |
| Announcement | #FFF4ED / #9A3412 / #FED7AA | #3A2414 / #FDBA74 / #5A3A1E |

Avatar initials fallback (background / text), assigned deterministically per user: #FDE2D3/#8A3A12, #DBEAFE/#1E40AF, #DCFCE7/#166534, #F3E8FF/#6B21A8 (dark: #4A2A1C/#FDBA8C, #1E2F55/#93C5FD, #173A26/#86EFAC, #352049/#D8B4FE).

Contrast must stay at least 4.5:1 for text and 3:1 for icons and focus indicators in both themes; verify any new pair.

## Typography and shape

- Font: IBM Plex Sans (Latin) and IBM Plex Sans Arabic, weights 400/500/600/700. Check the font license (SIL OFL) and record it in the third-party notices; self-host rather than load from Google at runtime if that is the project's policy.
- Sizes: body 15px, small 13–14px, post title 18px/600, section heading 16px/600.
- Radius: cards 14px, inputs and buttons 10px, pills 999px. Card border 1px `border`, no shadows.
- Spacing: 8px grid (4px half-steps inside controls).

## Components

**Post card**
1. Header row: avatar (44px circle; profile picture when available, else initials), author name (600, links to profile), then "in <community> · <time>" (13px, community name is a link). Post-type badge at the end of the row.
2. Title (18px/600), excerpt (`text-muted`, line height 1.55).
3. Action row, separated by a 1px top border: vote control, replies (speech-bubble icon + count), and Save at the far end (bookmark icon). See "Not yet backed by features".

**Vote control** (follows the approved 2026-11-03 decision)
- One pill containing two buttons: up arrow with its own up count, a thin divider, down arrow with its own down count. No net score.
- The user's current vote: that arrow is filled and uses `accent`; the other is an outline. `aria-pressed` reflects state; accessible names come from the dictionaries.
- Arrow icons are original geometric SVG (no third-party icon assets).

**Buttons and inputs**: 40–44px high; focus ring visible in both themes; labels always present (visually hidden where the design has none).

**Theme toggle**: header button (moon icon in light, sun in dark). Default follows the system preference; the user's choice overrides it and is remembered. Apply the theme before first paint so pages never flash.

## Features added with the redesign (owner request, 2026-11-26)

The owner wants the new UI to look like the mockups and to add the small features they need, alongside the redesign. These are new features, not styling: each needs its own permission rules, server work and tests, and is planned in the stage where its page is built.

- **Unified search**: one search field in the header replaces the separate search bars. It opens `/search`, which has tabs All, Posts, People and Communities. It reuses the existing permission-checked archive and People search; no private titles, snippets or counts leak to non-members.
- **Share**: at minimum, copy a link to a post. Optionally send it in a direct message. A shared link never grants access: someone who cannot see the community gets the normal denied page, and link previews must not reveal private titles or text. Email sharing stays in the later backlog.
- **Save / bookmarks**: save a post and see saved posts in one place. Access is rechecked on every read; posts the user can no longer see disappear from their saved list.
- **Per-community "N new" counts** in the navigation: requires tracking when the user last viewed each community; counts only content the user can see.
- **Messages unread badge**: per-conversation read tracking, with an unread count on Messages (plan decision 8, Stage 5).
- **Assistant: on hold.** The owner, partner and instructor will decide how to implement it. Build no assistant card, page or navigation item until then; the layout only leaves room for it.
- **Replies action**: icon plus count, as in the mockup. This replaces the 2026-11-03 icon-only Comments decision.

For each, the plan defines exact behavior, who may do what, data/schema changes, and acceptance tests, and the owner approves before implementation.
