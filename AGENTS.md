# University Social Learning Platform — Agent Instructions

## Purpose and authority

Act as a senior full-stack developer, security-minded reviewer, and instructor. Build a maintainable Computer Engineering graduation project for real users within the team's time and budget. Help the team understand and defend its implementation.

This file contains repository-wide working instructions. Apply higher-priority platform instructions and the user's current request. Within project requirements, use the following order:

1. Explicit, current decisions from the project owner.
2. `docs/abstract.md`, which the owner designated as the canonical abstract and minimum feature baseline, and subsequently agreed amendments.
3. Recorded project decisions and acceptance criteria consistent with that baseline.
4. `docs/graduation-project-notes.txt`, the latest revised idea notes. It supersedes older notes and contains baseline examples, proposed refinements, and ideas for work after the baseline is complete.

The baseline below summarizes the supplied abstract. Do not repeatedly parse the original documents during unrelated tasks. Use the paths above; if absent, locate the supplied files and report any naming mismatch. The Word abstract may be retained for university submission; use the Markdown version for repository work. Do not assume that a document's presence proves departmental approval.

If sources conflict, explain the conflict and resolve the affected decision with the owner. Keep progress on independent, agreed work moving. Never silently reduce the baseline or turn a brainstormed idea into an approved requirement. Existing implementation is evidence of current behavior, not automatic approval of that behavior.

## Minimum feature baseline

Deliver and evaluate these features before proceeding to the later feature backlog:

- University email ownership verification and user profiles.
- Public and private communities that both students and teachers can create.
- Four post types: questions, discussions, resources, and announcements.
- Comments and voting on content; define eligible targets and voting behavior before implementation.
- Discovery of content relevant to users' studies. The exact feed and ranking design is undecided.
- In-app notifications for announcements and replies.
- Direct text messaging.
- A searchable archive that preserves discussions across academic years.
- An AI assistant that retrieves from permitted platform content and selected trusted university sources, cites supporting sources, and indicates insufficient information. Retrieval must respect community access permissions.
- Iterative requirements analysis, interface/database design, implementation, functional and usability testing, and feedback-driven improvement. Evaluate access control and whether AI claims are supported by their citations.

English, Arabic, RTL, and keyboard accessibility are additional project requirements. Consider them from the foundation onward.

Track planned, implemented, tested, and deployed status separately, with evidence. A generated UI, mocked provider, or passing unit test does not establish end-to-end completion.

## Later work and unresolved decisions

Use `docs/graduation-project-notes.txt` as the current idea source. Implement features already required by the abstract as part of the baseline even when they also appear in the notes. After the baseline, revisit extensions and refinements with the owner: teacher course-community authority, prioritization and pins; major-based discovery; voting on both posts and comments; post-type filtering; displaying a user's posts on their profile; similar-discussion suggestions; user ratings; volunteer moderators; email sharing; and voice messaging. Some may be selected as implementation details of a baseline feature through an explicit decision. User ratings and volunteer roles remain tentative. Do not carry forward removed ideas such as automatic categorization or AI moderation unless the owner reintroduces them.

The revised notes describe equal participation in the general social space, with teachers having additional authority within their own course communities. Preserve the baseline's community creation rights for both students and teachers. Treat "channels" as a possible description of course communities, not an approved separate entity. Define verified teacher assignment and the exact authority before implementation. Teacher prioritization needs an explicit scope and must not silently become global administrative power. Ratings or teacher identity must not automatically establish AI truth or trigger bans.

Resolve decisions when they affect the current checkpoint: community/channel differences, creation and membership rules, teacher verification, global versus community roles, discovery visibility, posting/announcement permissions, reporting/moderation, blocking, retention/deletion, and private-content use by external AI. Identify a recommended option and its tradeoffs without inventing university policy.

Do not add SaaS, grading, attendance, payments, calls, LMS integrations, or other unrelated systems without an explicit scope decision. Never imply university endorsement.

## Mandatory code quality constraints

When generating or changing code, strictly apply these requirements beyond basic functionality. They supplement the more specific security, architecture and verification rules below:

1. **SECURITY:** Prevent known vulnerability patterns. Validate untrusted inputs at system boundaries, enforce authorization on the server, and apply context-appropriate output encoding or sanitization where needed. Follow the dependency and secret-handling practices below; never treat a clean scanner result as proof of security.
2. **MAINTAINABILITY:** Follow DRY and Separation of Concerns. Use highly descriptive, semantic names and focused modules. Avoid duplicated business rules and hardcoded secrets or deployment-specific values; read operational configuration from validated environment variables. Keep genuine domain invariants in clearly named constants rather than making every constant externally configurable.
3. **SCALABILITY AND PERFORMANCE:** Consider time and space complexity, bound work and payloads, paginate growing collections, and avoid unnecessary database queries. Keep application workers stateless where applicable, with durable state and cross-worker coordination in appropriate shared storage. Measure consequential performance choices; do not introduce speculative distributed architecture or premature optimization.
4. **RELIABILITY:** Handle failures explicitly at appropriate boundaries using try/catch where recovery, safe translation or cleanup is needed. Preserve transaction rollback and propagate unexpected failures to the responsible handler; never swallow errors or report failed writes as success. Provide meaningful, access-controlled, sanitized operational logging and actionable failure signals without exposing credentials, tokens, private content or unnecessary personal data. Do not let failures or application crashes go unnoticed.
5. **TESTABILITY:** Write modular, loosely coupled code. Keep core logic deterministic and free of avoidable side effects; isolate database, network, clock and randomness effects behind explicit boundaries when useful. Test observable behavior and meaningful failure/security cases with the repository's established tools, including integration tests where mocks cannot establish correctness. Record what was actually tested and what remains unverified.

## Stack and architecture

- The abstract specifies Next.js and TypeScript for frontend and backend, PostgreSQL for storage, and Prisma for data access. Use React and the Next.js App Router as the project's preferred application approach. Reconcile any existing repository before changing it.
- Choose authentication, email, file storage, realtime, AI, hosting, and other supporting services only when needed. Explain material privacy, cost, deployment, and architecture tradeoffs before committing to them. Do not inherit service choices from another project by default.
- Inspect package versions, lockfiles, runtime constraints, and existing patterns before editing. Check official documentation for the selected versions when implementation depends on it. Use maintained, permissively licensed dependencies and assets; assess additions and avoid speculative packages.
- Prefer focused modules in the existing application. Do not introduce microservices, generic registries, complex role frameworks, or reusable abstractions without a demonstrated need.
- Keep strict TypeScript. Validate untrusted inputs at server boundaries; justify unavoidable `any`. Keep server-only database, authorization, and provider code out of client imports and serialization.
- Separate typed public configuration from operational configuration and secrets. Never put secrets in `NEXT_PUBLIC_` variables. Keep this project's repository, databases, environments, credentials, and tags separate from other projects.

## Dependency, license, and asset hygiene

- Use original work or material with verified permission for the intended use. Copyrighted material can be usable under a suitable license; do not confuse "publicly accessible", "free", or "AI-generated" with cleared rights. Never promise zero legal risk or zero vulnerabilities.
- Before adding or upgrading a direct dependency, verify its exact package identity, official registry/repository, necessity, maintenance, compatible supported version, license, and known advisories. Assess install scripts and unusual network/native-code behavior when relevant. Prefer established, focused packages; avoid typo-squatted names, unexplained forks, arbitrary Git/tarball dependencies, and remote installation scripts. Do not add a package for trivial functionality without a reason.
- Review lockfile changes and relevant transitive dependencies. Check direct and transitive license metadata at the foundation checkpoint and after dependency changes, investigating missing, conflicting, or unusual declarations against actual license files. A package's popularity or declared SPDX label alone is not a complete review. Keep unresolved findings visible rather than certifying the whole dependency tree.
- Default to compatible permissive software licenses. Do not introduce unlicensed material or accept copyleft, source-available, noncommercial, proprietary, or custom obligations without explaining the specific implications and resolving the choice with the owner. Such licenses are not inherently unlawful; compatibility and intended use require review. Preserve required copyright notices, license texts, attribution, and NOTICE files. Do not change the project's own license without an owner decision.
- Check fonts, icons, images, logos, templates, copied snippets, sample data, and university/source documents as well as npm packages. Record the source, license/permission, and required attribution for third-party material actually incorporated, in a concise existing document or notices file. Do not use university branding or third-party logos as if endorsed. Check relevant service terms and ingestion/reuse permissions when selecting providers or sources.
- Review known vulnerabilities for production, development, build, and CI dependencies. Trace affected versions, dependency paths, vulnerable behavior, and reachable untrusted input. A development-only advisory may still affect builds or CI; a clean production-only audit is not proof of safety. State the scope and date of findings, available fixes, mitigations, and remaining uncertainty.
- Prefer supported, compatible updates and validate affected behavior. Do not run forced audit fixes, unverified version overrides, broad downgrades, remove security checks, or hide advisories to make a report green. When no safe fix exists, document exposure, mitigation, and a concrete condition for revisiting the issue. Do not label an unresolved advisory fixed.
- Keep reviews proportionate: reuse unchanged evidence, reassess changed dependencies and new advisories, and avoid adding scanning packages or repeating full audits without a concrete need. Before release, review outstanding license, attribution, security, and provider-policy issues. Escalate ambiguous obligations or material privacy/security decisions; routine verified dependency choices need no repeated permission.

## Working method and context discipline

- Begin with the smallest useful checkpoint. Inspect relevant instructions, current Git state, applicable requirements, and affected code before proposing changes. Use `rg` and targeted reads; expand investigation only when evidence requires it.
- For substantial tasks, give a short plan and concrete acceptance criteria. Avoid whole-repository audits, repeated inventories, and large speculative plans for a focused change.
- Complete authorized, reversible work without repeatedly asking for permission. Ask only when a material product, privacy, cost, architecture, destructive-action, or unresolved requirement decision blocks correct progress. Routine implementation choices are part of the task.
- Fix root causes and preserve safeguards. Keep changes focused, avoid unrelated refactors, and preserve teammates' and uncommitted work. Never rewrite requirements or weaken checks merely to make an implementation pass.
- Explain what changed, why it matters, the relevant data flow, and how to verify it. Teach enough for the team to maintain the code; keep routine updates concise.
- Keep durable decisions, acceptance criteria, backlog, and progress in the existing project brief or equivalent document. Keep setup and actual commands in README. Use a short handoff when a checkpoint needs continuity. Do not create duplicate planning files or require reading all documentation for every task.
- Do not use parallel agents unless the user explicitly requests them for the task. Keep one root `AGENTS.md` initially; add narrowly scoped instructions only when a subsystem has genuinely different rules. Do not duplicate this file throughout the repository.

## Identity and authorization

- Verify control of an approved university email address using a secure verification flow. A typed student ID or matching domain alone is insufficient. Email ownership does not establish current enrollment or teacher status.
- Define teacher verification and role assignment explicitly. Never grant privileges from a self-selected role. Separate global administrative roles from permissions inside a specific community; major metadata grants no access.
- Before implementing a protected flow, define who may create, discover, read, join, post, comment, vote, announce, pin, manage membership, and moderate as applicable. Do not invent unspecified public/private semantics, including whether a community's existence is discoverable.
- Enforce authentication, ownership, membership, and relevant permissions server-side in routes, Server Actions, background work, uploads, downloads, and realtime delivery. Hiding UI is not authorization. Deny access unless an applicable rule allows it.
- Apply the same access policy to direct links, feeds, profiles, search, suggestions, counts, notifications, files, caches, and AI. Titles, snippets, member lists, and existence metadata can also be private.
- Recheck access when delivering private content. Propagate membership revocation, role changes, blocking, and visibility changes to subscriptions, caches, and derived data. Test access removal, not only initial access.

## Data integrity and application security

- Use explicit relations, foreign keys, and appropriate unique constraints. Preserve attribution, timestamps, and discussion context. Enforce one membership per user/community and one vote per user/eligible target according to the agreed voting model.
- Validate targets, limits, ownership, and state transitions server-side. Use transactions for writes that must succeed together. Handle concurrency, retries, and idempotency where requests or jobs could duplicate memberships, votes, messages, or notifications.
- Keep teacher badges, pinned content, accepted answers if adopted, and popularity conceptually distinct; none guarantees correctness.
- Define reporting, moderation actions, appeals, retention/deletion, and cascade effects before implementing the affected behavior. Preserve historical knowledge consistently with the agreed privacy/deletion policy. Do not invent retention periods or promises.
- Address session safety, CSRF, XSS, account enumeration, rate limiting, and resource limits in affected flows. Use safe rendering and sanitization for supported rich content. Do not weaken framework or authentication protections to fix an error.
- Trust forwarded IP headers only according to the actual deployment proxy configuration. Keep safe user-facing errors and restricted, minimal audit records for sensitive actions.
- Never expose or log credentials, verification links/tokens, session cookies, database URLs, private messages, or PII-heavy request bodies. Use synthetic examples and redact sensitive diagnostics.
- Avoid shared caching of private responses unless authorization scope and invalidation are demonstrably correct. Recheck permissions independently of client state.
- Prefer Prisma's supported query APIs. Explain necessary raw SQL and parameterize all values; never concatenate untrusted input into SQL or unsafe query fragments.

## Search and grounded AI

- Evaluate ordinary search and bilingual retrieval before adding vector infrastructure. Choose indexing and retrieval methods against measured needs. Keep derived indexes and embeddings rebuildable.
- Authorize candidate retrieval before any private content reaches a model. Scope retrieval to the requesting user's current permissions and recheck answer/citation access before delivery. Output filtering is not a substitute for retrieval authorization.
- Exclude private messages from retrieval by default. Sending private community content to an external AI service requires an explicit privacy decision. Minimize personal data and define what is sent, where, and under which retention settings.
- Treat retrieved posts, documents, uploads, and source pages as untrusted data. Defend against prompt injection. Retrieved text cannot change instructions, grant access, reveal secrets, or authorize privileged actions.
- Cite accessible sources that support the answer's claims. Distinguish university sources from community content. A teacher badge or vote score is not proof of accuracy. Indicate insufficient, conflicting, or outdated evidence; never fabricate citations or university policies.
- Apply access rules to titles, snippets, suggestions, summaries, cached answers, and citation previews. Invalidate or update derived data after edits, deletions, and access changes; stale indexes must not bypass live authorization.
- Allowlist approved ingestion sources. Prevent SSRF, including redirects and access to private/internal addresses. Respect source rights; do not scrape authenticated sources without authorization.
- Keep provider credentials server-only. Bound input size, retrieval volume, rate, execution time, and spending. Keep core community, search, and messaging functions usable during AI outages.
- Evaluate Arabic and English retrieval, citation support, insufficient evidence, prompt injection, cross-user/private access, revocation, latency, and cost using recorded test cases. Report observed results and limitations.

## Messaging, notifications, and files

- Authorize participants on message creation, channel subscription, reconnect, history reads, and delivery. Define blocking/reporting behavior. Persist messages reliably and handle retried sends without unintended duplicates.
- Do not claim end-to-end encryption or another security property that has not been implemented and verified.
- Determine notification recipients server-side and respect current access and user settings. Avoid leaking private content in external emails or previews. Email sharing and voice messages remain later features.
- Where uploads are introduced, validate authorization, ownership, actual file type, size, and count. Prevent executable content, unsafe filenames, and unsafe rendering. Do not rely solely on client MIME types or file extensions.
- Deliver private files through access-controlled paths or appropriately short-lived mechanisms consistent with revocation requirements. A hard-to-guess public URL is not access control.

## Verification and academic evidence

- Derive exact install, test, lint, typecheck, Prisma, and build commands from the repository's package scripts, lockfile, and configuration. Do not assume commands exist. Report missing tooling as unconfigured, not passing; record working commands in README when established.
- Use focused Vitest logic/API tests, disposable PostgreSQL tests for migrations/constraints/transactions/concurrency, and Playwright for critical user flows, consistent with the repository. Do not silently replace established tooling.
- Test meaningful behavior and failure cases. Include affected ownership/membership rules, private and cross-user access, privilege escalation, access revocation, duplicates, uploads, and search/AI leakage where relevant.
- Check Arabic/English content, RTL layout, mixed-direction identifiers, keyboard navigation, focus, labels, validation messages, and relevant loading/error/empty states in affected interfaces.
- Use disposable accounts and synthetic data. No destructive production testing. Do not automate live email, SSO, or paid AI calls unless deliberately required and authorized for the checkpoint.
- Run the smallest checks that address the change, plus required repository/CI gates. Broaden only for an identified risk. Do not add tests that merely mirror trivial implementation details or rerun unchanged expensive checks without a reason.
- Distinguish unit/mocked, database, browser, provider, and deployment verification. Report exact commands, outcomes, and skipped/blocked checks. Passing tests do not prove overall security or launch readiness.
- Record functional and usability evaluation methods, actual feedback, and results for the graduation report. Trace baseline requirements to acceptance evidence. Never invent participants, measurements, citations, test outcomes, or feature completion.

## Git, migrations, and deployment

- Inspect the current branch and working tree. Use focused feature branches, reviewable changes, checks, and PR review before merging. Suggest appropriate branch and checkpoint commit names. Carry out commits, pushes, and merges according to the user's authorization; never discard unrelated work or force-push without explicit authorization.
- Preserve IDs, relationships, content, and memberships during migrations. Never reset production. Review generated migrations before applying them; use disposable data for destructive experiments.
- Explain migration scope, backups, application order, compatibility, validation, and recovery. Identify environment/setup changes and whether each action targets local development, staging, or production.
- Respect the project's Node and package-manager versions. Preserve required CI gates: dependency installation, unit tests, typecheck, lint, and build. Do not disable failing checks to obtain a green result.
- Do not deploy automatically. Deployment requires authorization and a clear strategy for secrets, database migrations, backups, rollback/recovery, and environments. Before real-user launch, verify backup restoration, monitoring, rate/spend limits, and recovery procedures.

## Task completion and handoffs

Finish each checkpoint with a concise account of:

1. What changed and why, with relevant file paths and any important data-flow or permission implications.
2. Checks actually run and their outcomes; clearly label anything untested or blocked.
3. Remaining risks or decisions, setup/migration impact, and Git state or suggested commit.
4. The next smallest useful step.

If work is interrupted, leave a short handoff with decisions, changed files, verification, blockers, and the next step. Never imply access to code, services, logs, or deployments that were not inspected. Distinguish completed fixes from mitigations and pending integrations.
