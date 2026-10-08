# University Social Learning Platform — Project Brief

Updated: 2026-10-08. This is the decision and progress record; [AGENTS.md](../AGENTS.md) contains the working and security rules.

## Sources and scope

The [abstract](abstract.md) defines the minimum scope. The [latest notes](graduation-project-notes.txt) supersede older idea files and refine the project's direction; their proposals do not silently replace the baseline. “Maybe” and “not sure” indicate unresolved ideas. The sections below distinguish requirements, settled direction, proposed implementation details, and extensions. These documents do not establish departmental approval or university endorsement.

## Problem and objectives

Academic communication is scattered across general social media. Students struggle to find relevant communities and answers, miss announcements, and repeat questions because earlier discussions are difficult to retrieve.

The project will organize academic interaction, help students discover relevant content, retain reusable discussions across academic years, support direct communication, and offer assistance grounded in accessible sources. Iterative design, functional testing, usability feedback, access-control evaluation, and citation evaluation will provide evidence for the graduation report.

## Baseline requirements and acceptance criteria

These are required outcomes, not claims of implementation. Exact permissions and test cases must be recorded before implementing the affected flow.

| ID | Requirement | Acceptance evidence to collect |
| --- | --- | --- |
| B1 | University email ownership verification and profiles | Complete verification and profile persistence; reject invalid, expired, or replayed verification attempts and unverified protected access. Email ownership alone grants no teacher status or enrollment claim. |
| B2 | Public and private communities, creatable by students and teachers | Exercise creation and agreed discovery, membership, and read rules for both user types; deny unauthorized private access, including metadata and access after membership removal. |
| B3 | Questions, discussions, resources, and announcements | Create and retrieve each of the four types under agreed posting permissions; reject invalid types and unauthorized writes. Resource links versus uploads remains a design decision. |
| B4 | Comments and voting on content | Persist authorized comments and the agreed vote behavior; enforce one vote per user/eligible target and verify duplicate, concurrent, and unauthorized operations. Targets and vote semantics are unresolved. |
| B5 | Discovery relevant to users' studies | Demonstrate relevant results using recorded study-related examples, without leaking inaccessible communities or content. Feed and ranking design is unresolved. |
| B6 | In-app notifications for announcements and replies | Deliver to the agreed recipients; test retries, unread/read behavior, and loss of access before delivery or opening. |
| B7 | Direct text messaging | Persist and retrieve messages for authorized participants; deny cross-user reads/delivery and test retry behavior and agreed blocking rules. |
| B8 | Searchable archive across academic years | Retrieve synthetic discussions from multiple academic years in English and Arabic; preserve attribution/context and enforce current access after edits, deletion, or revocation under the agreed policy. |
| B9 | AI assistant using permitted platform content and selected trusted university sources | Show accessible citations supporting claims and insufficient-evidence responses; evaluate English/Arabic retrieval, prompt injection, conflicting evidence, private/cross-user access, revocation, latency, and cost. Authorize retrieval before model input and recheck citation access on delivery. |
| B10 | Iterative requirements, UI/database design, implementation, functional/usability testing, and feedback-led improvement | Retain designs, test cases, actual results, real usability feedback, and resulting changes; trace B1–B9 to evidence and distinguish mocked, database, browser, provider, and deployment checks. |

English, Arabic, RTL, and keyboard accessibility are additional requirements from AGENTS.md. For each affected interface, check mixed-direction identifiers, labels, focus, keyboard operation, validation, and loading/error/empty states. No usability participants or results have been recorded yet.

## Specified stack and settled decisions

- Next.js and TypeScript for frontend and backend, PostgreSQL storage, and Prisma data access are specified by the abstract. React and the Next.js App Router are the preferred approach in AGENTS.md. Strict TypeScript and server-side authorization apply.
- Both students and teachers can create communities. The four post types, direct text messaging, in-app notifications, archive, and grounded AI assistant are baseline scope; they are not optional extensions.
- The latest notes settle the direction that everyone participates equally in the shared social space, while teachers have additional authority within their own course communities. Teacher verification and the exact community powers still need definition; this does not grant global authority or automatic priority across the platform.
- University email ownership must be verified. The notes' suggestion that a typed student ID or email proves student status conflicts with the identity rules: neither a typed ID nor a matching domain establishes ownership, current enrollment, or teacher status.
- AI uses authorized content, cites supporting sources, and indicates insufficient information. Teacher identity and popularity alone do not establish truth. Private messages are excluded from retrieval by default; external AI use of private community content needs an explicit privacy decision.
- Complete and evaluate the minimum baseline before implementing later extensions. No service provider, hosting choice, or vector infrastructure has been selected. M1a runtime and application/tool versions are recorded in README and the lockfile.
- M1a uses `/en` and `/ar`, with `/` temporarily redirecting to English. This initial default is reversible; browser-language negotiation is deferred. No separate app name is selected.

## Proposed implementation details

These notes-derived designs are candidates, not approved acceptance requirements:

- Course communities resembling channels, with students subscribing or being added: reconcile this with public/private membership and student-created communities before implementation.
- Voting on both posts and comments: a proposed target set; vote direction, changes/removal, self-voting, and eligibility remain undecided.
- Major-related feeds or community suggestions: one possible way to satisfy discovery; major metadata grants no permissions.
- Post-type filtering and profile biography fields: proposed interface details. Showing a user's posts on their profile remains explicitly “maybe” and must respect content access.
- A chatbot interface for the required AI assistant remains “maybe.” The assistant itself and its grounding requirements are settled.
- “Instant messages” may describe delivery expectations for baseline text messaging; transport, realtime behavior, and latency expectations remain undefined.

## Unresolved decisions

Resolve only those needed for the next flow, recording the chosen option and its tradeoffs here.

| Decision | Constraint or starting recommendation |
| --- | --- |
| Identity and initial access | Define approved university domains, account/profile fields and visibility, authentication/session flow, verification method, and provider. Recommend an expiring, single-use email challenge with generic responses; live email adds cost and setup, while a local adapter cannot prove provider delivery. |
| Teacher status and roles | Define evidence and assignment/revocation of teacher status; separate platform administration from community authority. No self-selected privilege escalation. |
| Community model and permissions | Define community/channel differences, who can discover/read/join, invitation or approval rules, public/private existence visibility, posting/announcement permissions, membership management, and teacher powers. Recommend an explicit permission matrix first; it adds design work but makes authorization testable. |
| Votes and discovery | Decide eligible vote targets and behavior, study metadata, filtering/ranking, and any teacher prioritization. The notes' broad teacher priority must be reconciled with equal participation and authority limited to their own communities before adoption. |
| Messaging, notifications, and moderation | Define participant eligibility, blocking/reporting, notification recipients/settings, moderation actions, appeals, and retry semantics before their flows. Ratings must not automatically trigger bans. |
| Archive, profiles, and resources | Define retention/deletion, attribution after account removal, profile post visibility, resource links/uploads, and file policy if uploads are introduced. Preserve cross-year knowledge consistently with privacy decisions; no retention period is selected. |
| Search and AI | Select trusted university sources and permitted ingestion, bilingual retrieval approach, assistant interface, provider, and budgets. Recommend measuring ordinary search before adding vectors. Resolve external private-content use explicitly; the notes' automatic AI trust in teachers or ratings conflicts with evidence-based grounding. |
| Environment and evaluation | M1a pins Node 24.21.0 LTS and bundled npm 11.19.0; application/tool versions are recorded in README. Database development environment and supporting services remain open. Define evaluation participants, methods, and success measures without inventing results or dates. |

## Later backlog from the latest notes

Revisit after baseline completion and evaluation; none is committed implementation scope:

- Teacher channel presentation, local teacher prioritization, and answer/post pinning, subject to the settled authority boundaries.
- Suggesting similar past discussions while composing a post, beyond baseline archive search.
- User ratings without comments: explicitly **NOT SURE**; stars are **maybe**. Reduced visibility, reduced AI trust, and temporary bans (**maybe**) are unapproved consequences needing policy and evidence review.
- Volunteer student administration/moderation, including student councils (مجالس طلابية): explicitly **maybe**; role scope and assignment remain open.
- Voice messages and sharing content by email.

Major-based discovery, filtering, profile details, and AI interface choices above refine baseline features; they are not extra baseline obligations. Older idea-file features are not imported into this backlog.

## Milestones

These are proposed checkpoints, without deadlines or completion claims. Evaluation and feedback run throughout.

| Checkpoint | Deliverable and exit evidence |
| --- | --- |
| M0 — Documentation foundation | Source hierarchy, baseline, decisions, acceptance criteria, and actual setup recorded; source files preserved and documentation links checked. |
| M1a — Application foundation | Pin compatible runtime/package versions; provide the English/Arabic shell, locale routing, RTL, keyboard access, focused tests, and CI configuration. Record observed local checks in README separately from GitHub CI. |
| M1b — Database foundation | Review the initial data model and permission-dependent decisions, select a local/disposable PostgreSQL setup, and introduce Prisma with reviewed migrations and database checks. No authentication or provider integration is implied. |
| M2 — Verified user and profile | Resolve B1 identity/provider decisions and deliver the first end-to-end flow below with negative-path evidence. |
| M3 — Community interaction | Resolve permissions, votes, and retention; implement B2–B4 and B6, including private access and revocation tests. |
| M4 — Discovery, archive, and messaging | Deliver B5, B7, and B8 with bilingual retrieval, participant authorization, and duplicate/revocation evidence. |
| M5 — Grounded assistance and baseline evaluation | Deliver B9 and consolidate B10 evidence; assess citation support, access boundaries, usability feedback, latency/cost, and limitations. |
| M6 — Deployment readiness and later scope review | Decide deployment strategy and obtain authorization; verify operational readiness separately. Review later extensions with the owner only after baseline evaluation. |

## First end-to-end flow

Proposed first vertical slice (M2): a new user submits an approved university email, completes an ownership challenge, establishes a session, saves a minimal profile, and returns to their persisted profile. The challenge is validated server-side before protected access; it does not assign teacher privileges.

Acceptance: a second account cannot edit the first profile; invalid/expired/reused challenges and unverified access fail; session termination prevents protected access; English/Arabic and keyboard paths work. Record database and browser results using disposable identities. A local email adapter is preliminary evidence only; separately verify real delivery when provider integration is deliberately authorized. Profile fields, visibility, domains, authentication, and email choices must be resolved first.

## Current status and checkpoint evidence

M0 inspection found documentation only on `main` at `ef30470`. M1a re-inspection on 2026-10-08 confirmed the reviewed documents were still uncommitted. They were preserved and committed alone as `bd2f778` (`docs: establish project documentation foundation`) on `feat/application-foundation`. Runtime/package-manager pins, manifest, lockfile, and ignores were committed as `00c2e4c` (`chore: pin application runtime and dependency lockfile`); application/config/test/CI and README/brief changes remain uncommitted for review. Existing whitespace in the source notes was preserved. Remote freshness was not checked.

| Scope | Planned | Implemented | Tested | Deployed |
| --- | --- | --- | --- | --- |
| Documentation foundation (M0) | Defined here | Brief and README written | Source hashes, local links, scope review, and whitespace checked | Not applicable |
| Application foundation (M1a) | Locale shell and checks defined | English/Arabic shell, runtime pins/lockfile, scripts, tests, and workflow implemented | Clean npm ci, lint, typecheck, 19 unit tests, build, six Chromium tests, and dev/start HTTP smoke checks passed locally; mobile screenshots reviewed. GitHub CI not run | Not deployed |
| Database foundation (M1b) | Separate next checkpoint | Not implemented | No database checks run | Not deployed |
| B1–B10 | Baseline and draft acceptance criteria preserved; affected designs remain open | Features not implemented | No feature, database, provider, or usability evaluation performed | Not deployed |
| Later extensions | Candidates only | No implementation present | Not tested | No deployment evidence |

M1a adds an application foundation only. Its server-side locale allowlist controls dictionary selection and document language/direction; it is not user authorization. No private data or protected feature exists yet. There is no database, authentication, provider, service connection, migration, push, merge, or deployment. Exact setup/check commands and limitations are recorded in [README](../README.md).

Limits: Chromium-only coverage, no interactive manual browser session, no screen-reader audit or usability evaluation, and a generic English 404 page. A development-only transitive `braces` advisory remains unpatched upstream; full npm audit reports four affected dependency entries, while the production-only audit reports zero. Source hashes confirm AGENTS.md and both source documents are preserved; automatic Next.js agent-rule generation is disabled to keep AGENTS.md unchanged.

Next smallest implementation checkpoint: M1b, the reviewed PostgreSQL/Prisma foundation with disposable database checks. Resolve only decisions affecting its initial schema and setup, then proceed to the B1 choices for M2. Suggested M1a implementation commit: `feat: add bilingual application foundation`.
