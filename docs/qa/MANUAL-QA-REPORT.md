# Manual API Quality Assurance Report

## 1. Document Information

| Field | Value |
| --- | --- |
| Project | University Social Platform |
| Report title | Manual API Quality Assurance Report |
| Version | 1.0 |
| Document status | Completed campaign report; ready for review |
| QA method | Manual API requests in Postman, with a separate local synthetic confirmation-token helper |
| Execution environments | Original local QA for cases 1–12; isolated local QA for cases 13–30 |
| Report preparation date | 2026-10-19 (Asia/Hebron); this is not an execution date |
| Result provenance | **Manually executed — tester-reported PASS** for all 30 cases |
| Execution dates and tester identity | Exact execution dates/times and tester identity not independently verified; no personal identity is included |
| Report location | `docs/qa/MANUAL-QA-REPORT.md` |
| Reviewed checkout | Isolated Manual QA checkout |
| Reviewed branch | `feat/isolated-manual-qa` |
| Source review reference | HEAD `db92e4098193817f7e49aeb63fa8570303617f8c` plus existing uncommitted changes inspected during preparation; not an immutable record of either execution build |

The supplied campaign inventory is the authority for the reported manual outcomes. Repository implementation and existing specifications were inspected to verify endpoint descriptions, response structures, validation, and permissions. This report's author did not execute the Postman cases or inspect raw Postman execution exports.

## 2. Executive Summary

The tester reported that all 30 selected scenarios passed after test configuration issues were resolved. The campaign covered the local synthetic authentication/profile slice and community creation, discovery, membership, and selected authorization/security boundaries.

| Overall metric | Final reported outcome |
| --- | --- |
| Total test cases | 30 |
| Passed | 30 |
| Failed | 0 |
| Blocked | 0 |
| Final reported pass rate | 100% (30 / 30) |

These are final reported outcomes, not counts of every request or unsuccessful setup attempt. Negative cases pass when the API rejects the operation with the expected status and applicable protected state remains unchanged.

Key findings were successful Arabic/Unicode profile updates, rejection of unsupported profile fields, session-derived community ownership, public joining, private membership approval, and denial of selected unauthorized reads and writes. Account C's incomplete-profile discovery response correctly returned `canCreate: false` after Postman session selection was corrected.

**The complete suite was not executed end-to-end against a single database.** Cases 1–12 belong to the original environment; cases 13–30 belong to the isolated environment. A shared HTTP address does not make their data, accounts, or sessions interchangeable.

No raw Postman collection/run export, screenshots, or request-level response archive was located in the inspected repository sources. The reported 100% pass rate supports this selected campaign only; it does not establish that the entire application is bug-free, comprehensively penetration-tested, or ready for production.

## 3. Testing Objectives

- Check the sign-in challenge, confirmation, authenticated profile, and idempotent logout contracts.
- Verify profile validation for Arabic, Unicode, emoji, empty/overlong names, and unauthorized fields.
- Confirm that community ownership comes from the authenticated session and that creation includes owner membership.
- Exercise public and private access rules through non-member, pending, and approved-member states.
- Check owner-only membership management and rejection of selected identity/authority injection attempts.
- Check invalid/absent sessions and the untrusted-Origin rejection path.
- Retain a reviewable account of results, configuration issues, source corroboration, and evidence gaps.

## 4. Scope and Coverage

| Area | Included in the reported campaign | Coverage boundary |
| --- | --- | --- |
| Authentication | Challenge request, successful confirmation, invalid-session rejection, unsupported locale, logout without a session | Synthetic local delivery; no live university mailbox/provider verification |
| Profile management | Own-profile read, Arabic/Unicode updates, name bounds, field allowlist, query rejection | API behavior; no manual keyboard, screen-reader, or RTL layout evaluation |
| Community discovery | Authenticated listing and incomplete-profile creation eligibility | Private community existence/name/description are deliberately discoverable to authenticated verified users |
| Community creation | PUBLIC and PRIVATE creation, owner and owner membership | No ownership transfer, deletion, or visibility-change campaign |
| Membership lifecycle | Public join, private request, pending denial, owner approval, approved access | Removal, leave, revocation, retries, and concurrency are not established by these 30 cases |
| Authorization | Anonymous denial, private direct-read denial, owner-only listing and approval | Selected object/action boundaries; not every route, actor combination, or state |
| Selected security | Session validation, IDOR/BOLA denial, mass assignment, Origin validation, identity injection | Not a comprehensive penetration test or a complete CSRF/browser assessment |

Posts, comments, voting, study-content discovery/ranking, notifications, direct messages, archive search, files, and grounded AI are outside this campaign. These baseline features are not declared complete by this report.

The approved community policy in the [project brief](../project-brief.md) permits verified users to discover both visibility types, including private-community metadata. Reading a private community space requires current membership (or ownership in the service check). Only creation requires a saved profile. Ownership is community-scoped and does not imply teacher or global administrator privileges.

## 5. Test Environment

### 5.1 Original and isolated environments

| Attribute | Original local QA | Isolated local QA |
| --- | --- | --- |
| Case numbers | 1–12 | 13–30 |
| Repository | Original local QA checkout | Isolated Manual QA checkout |
| Reported branch | `feat/manual-postman-qa` | `feat/isolated-manual-qa` |
| PostgreSQL resource ownership | Original environment owner (local ID omitted) | Independent isolated environment owner (local ID omitted) |
| PostgreSQL host port | 15432 recorded as the source port in isolation configuration; not live-verified here | 15433 in supplied context and isolation configuration |
| API base URL | `http://127.0.0.1:3100` documented for the original harness; exact historical run URL not independently verified | `http://127.0.0.1:3100` supplied by the tester and documented |
| Data/session continuity | Original database and sessions | Independent database and newly established accounts/sessions |
| Evidence | Tester-reported results, supported by historical README statements for the first 12 cases | Tester-reported results; configuration and source reviewed |

The environments use distinct locally managed PostgreSQL resource ownership IDs, which are omitted from this published report; they are not application user IDs. The locally inspected `qa-isolation.json` pins distinct checkout paths, owners, and PostgreSQL ports; it is machine-local and excluded from Git. The shared [configuration template](../../qa-isolation.example.json) documents its shape, not evidence of an executed run. The [README](../../README.md) records separate runtime namespaces derived from checkout paths and forbids importing original manifests/cookies into the isolated checkout.

Both harnesses use the same HTTP port, so their HTTP servers cannot occupy it simultaneously. Separate PostgreSQL ports and storage allow database isolation. Neither live containers nor private runtime manifests were inspected for this report, and exact executed test-database names were not independently verified.

### 5.2 Tools and application configuration

| Component | Repository-verified configuration | Evidence limitation |
| --- | --- | --- |
| Postman | Manual request client identified by the tester | Version/build not supplied |
| Operating environment | Windows/PowerShell manual tooling documented | Exact Windows execution build not independently verified |
| Node.js / npm | Node 24.21.0; npm 11.19.0 in package metadata; Node also pinned in `.node-version` | Configured versions, not freshly measured execution versions |
| Application | Package version 0.1.0; Next.js 16.4.0 App Router; React 19.3.0; TypeScript 6.0.3 | Source/lockfile evidence, not an execution-build fingerprint |
| Data access | Prisma client/adapter 7.10.0; `pg` 8.23.1 | No database connection performed during report preparation |
| PostgreSQL | Compose pins `postgres:18.6-bookworm` with an image digest; container port 5432 | Image configuration, not a live server version check |
| Docker | Docker Linux engine/Compose required by the documented local workflow | Campaign Docker/Desktop/Compose versions not independently verified |
| Existing automated tooling | Vitest and Playwright specifications are present | Inspected as specifications; not executed for this report |

The synthetic launcher installs the local identity context in memory and supplies an authenticated peer boundary. Normal application startup does not enable these database-backed identity/community flows. The local adapter uses synthetic `@university.test` identities and a local mailbox helper; it does not establish real university email delivery.

POST requests use JSON and, except the deliberate negative Origin scenario, the exact Origin `http://127.0.0.1:3100`. The loopback HTTP cookie configuration uses HttpOnly and SameSite=Lax; Secure is false for this local harness. No deployed HTTPS/session-security result is claimed.

## 6. Test Methodology

The tester manually exercised positive and negative requests in Postman and compared returned statuses and relevant response fields with the intended scenario. The supplied inventory records final PASS outcomes. “Reported actual HTTP” below reproduces that account and is not independently captured network evidence.

Session isolation was essential: each account needed its own pending challenge state and session. A Postman environment selection alone does not isolate the Cookie Jar. The documented approach disables automatic cookie sending when explicit private Cookie headers are used and checks the authenticated profile before actor-sensitive requests.

Confirmation requires a live challenge and the matching pending browser cookie. Tokens expire after ten minutes, are single-use, and can be revoked/replaced; the helper only retrieves them and does not confirm sign-in. Generic `202` responses do not by themselves prove challenge issuance or email delivery.

Community testing followed the supplied A/B lifecycle: A created both communities; B joined the public community, requested private membership, remained denied while PENDING, and gained private access after A approved the request. The discovery check used C without a saved profile.

The tester also reported follow-up checks, where relevant, that rejected operations did not modify protected data. Individual before/after payloads and the exact follow-up requests were not supplied, so this report does not invent per-case database evidence. A rejected membership write may legitimately consume an attempt in the separate rate-limit counter; “unchanged protected data” does not mean every database row remained unchanged.

For this documentation task, repository review supplied a separate evidence layer: routes define methods/statuses; policies define input allowlists; services define session-derived actors and state transitions; existing tests corroborate expected contracts. Source inspection does not independently verify historical execution.

## 7. Test Case Results

**Evidence label for every row: Manually executed — tester-reported PASS.** Each numbered case appears once in the matrix. The supplied test IDs intentionally repeat for scenario variants; the number is the unique campaign key. Endpoint mappings are verified against current implementation. Exact original request bodies are unavailable; placeholders identify resource roles without exposing account or credential values.

### 7.1 Group A — Authentication and Profile (original environment)

| # | Test ID | Category | Test scenario | HTTP method and endpoint | Expected HTTP | Reported actual HTTP | Final result | Verification notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | USP-M2-001 | Authentication | Request sign-in challenge | POST `/api/identity/request` | 202 | 202 | PASS | Generic `ok: true`; pending state issued/retained. Acceptance alone does not prove issuance. |
| 2 | USP-M2-010 | Authentication | Confirm sign-in token | POST `/api/identity/confirm` | 200 | 200 | PASS | Matching token/pending state; `ok: true`, session issued and pending cleared. |
| 3 | USP-M2-020 | Profile | Read authenticated profile | GET `/api/identity/profile` | 200 | 200 | PASS | Own `email` and `displayName` projection with `ok: true`; actor comes from session. |
| 4 | USP-M2-021 | Profile | Update Arabic display name | POST `/api/identity/profile` | 200 | 200 | PASS | Arabic text accepted; update returns `ok: true`, not the updated profile payload. |
| 5 | USP-M2-021 | Profile | Update Unicode and emoji display name | POST `/api/identity/profile` | 200 | 200 | PASS | Name length uses Unicode code points, not UTF-16 code units. |
| 6 | USP-M2-022 | Profile validation | Reject empty display name | POST `/api/identity/profile` | 400 | 400 | PASS | Empty or whitespace-only text is rejected after trimming. |
| 7 | USP-M2-022 | Profile validation | Reject display name exceeding 60 characters | POST `/api/identity/profile` | 400 | 400 | PASS | Limit is 60 Unicode code points after trimming. |
| 8 | USP-M2-023 | Profile authorization | Reject unauthorized profile fields | POST `/api/identity/profile` | 400 | 400 | PASS | Only `displayName` is allowed; extra authority/identity fields are rejected. |
| 9 | USP-M2-017 | Session validation | Reject invalid session cookie | GET `/api/identity/profile` | 401 | 401 | PASS | Invalid/ineligible session yields `ok: false`; no own-profile response. |
| 10 | USP-M2-023 | Profile authorization | Reject unauthorized userId query parameter | GET `/api/identity/profile?userId={otherUserId}` | 404 | 404 | PASS | Any query string is rejected by this GET route; not a lookup of the requested user. |
| 11 | USP-M2-004 | Locale validation | Reject unsupported locale | POST `/api/identity/request` | 400 | 400 | PASS | Mapped to challenge request; only `en`/`ar` accepted. Confirm also validates locale; original request not archived. |
| 12 | USP-M2-025 | Authentication | Logout without an active session | POST `/api/identity/logout` | 200 | 200 | PASS | Idempotent success with empty JSON body; clears local auth cookies if database access succeeds. |

### 7.2 Group B — Community Creation and Ownership (isolated environment)

| # | Test ID | Category | Test scenario | HTTP method and endpoint | Expected HTTP | Reported actual HTTP | Final result | Verification notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 13 | USP-M3-002 | Community creation | Create PUBLIC community | POST `/api/communities` | 201 | 201 | PASS | A is the session-derived owner; response is `{ ok: true, id }`. |
| 14 | USP-M3-002 | Community creation | Create PRIVATE community | POST `/api/communities` | 201 | 201 | PASS | A owns the private community; creation atomically inserts owner membership. |
| 15 | USP-M3-003 | Ownership | Verify community ownership and owner membership | GET `/api/communities/{id}`; GET `/api/communities/{id}/memberships` | 200 | 200 | PASS | Detail/discovery uses `isOwner: true`, `membership: MEMBER`; owner-list row uses `isOwner: true`, `status: MEMBER`. Both checks belong to this one case. |

### 7.3 Group C — Communities and Membership Authorization (isolated environment)

| # | Test ID | Category | Test scenario | HTTP method and endpoint | Expected HTTP | Reported actual HTTP | Final result | Verification notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 16 | USP-M3-005 | Discovery | Discover communities as authenticated account C | GET `/api/communities` | 200 | 200 | PASS | C had `displayName: null`; correctly isolated session returned `canCreate: false`. |
| 17 | USP-M3-006 | Public access | Read PUBLIC community as non-member B | GET `/api/communities/{publicId}` | 200 | 200 | PASS | Valid verified session is sufficient for public detail access. |
| 18 | USP-M3-007 | Private access | Deny PRIVATE community details to non-member B | GET `/api/communities/{privateId}` | 404 | 404 | PASS | Direct read denied before B's private membership request. |
| 19 | USP-M3-008 | Public membership | Join PUBLIC community as B | POST `/api/communities/{publicId}/memberships` | 200 | 200 | PASS | `action: join`; B became MEMBER. Write response itself contains only `ok: true`. |
| 20 | USP-M3-009 | Private membership | Request PRIVATE community membership as B | POST `/api/communities/{privateId}/memberships` | 200 | 200 | PASS | `action: join`; B initially became PENDING, with no private detail access. |
| 21 | USP-M3-007 | Private access | Deny PRIVATE access while membership is PENDING | GET `/api/communities/{privateId}` | 404 | 404 | PASS | PENDING does not satisfy the MEMBER requirement. |
| 22 | USP-M3-010 | Owner approval | Owner A approves B's membership | POST `/api/communities/{privateId}/memberships` | 200 | 200 | PASS | `action: approve`, target B's user ID; existing request becomes MEMBER. |
| 23 | USP-M3-007 | Private access | Read PRIVATE community after approval | GET `/api/communities/{privateId}` | 200 | 200 | PASS | B can read as an approved current member. |
| 24 | USP-M3-016 | Owner authorization | Reject membership management access by non-owner | GET `/api/communities/{id}/memberships` | 403 | 403 | PASS | B's membership does not grant access to the owner-only member/request list. |

### 7.4 Group D — Security and Authorization (isolated environment)

| # | Test ID | Category | Test scenario | HTTP method and endpoint | Expected HTTP | Reported actual HTTP | Final result | Verification notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 | SEC-001 | Authentication boundary | Reject anonymous access to communities | GET `/api/communities` | 401 | 401 | PASS | No valid session; authenticated discovery is required. |
| 26 | SEC-002 | IDOR/BOLA | Prevent unauthorized private community access | GET `/api/communities/{privateId}` | 404 | 404 | PASS | Requires an authenticated non-member of the target. Exact actor/target not supplied; approved B would be authorized for A's private community. |
| 27 | SEC-003 | Owner authorization | Reject approval operation by non-owner | POST `/api/communities/{id}/memberships` | 403 | 403 | PASS | Non-owner submits `action: approve` with a syntactically valid target user ID; owner check rejects it. |
| 28 | SEC-005 | Mass assignment | Reject mass assignment of ownerId | POST `/api/communities` | 400 | 400 | PASS | `ownerId` is outside the creation allowlist; owner derives from the session. |
| 29 | SEC-008 | CSRF Origin validation | Reject profile modification with untrusted Origin | POST `/api/identity/profile` | 403 | 403 | PASS | Origin mismatch is rejected before profile mutation; no browser-wide CSRF conclusion. |
| 30 | SEC-012 | Membership identity | Reject membership identity injection through userId | POST `/api/communities/{id}/memberships` | 400 | 400 | PASS | Self-action `join`/`leave` must omit `userId`. Exact submitted self-action not archived; owner `approve`/`remove` legitimately requires it. |

### 7.5 Category totals

| Group | Cases | Total | Passed | Failed | Blocked | Reported pass rate |
| --- | --- | --- | --- | --- | --- | --- |
| A — Authentication and Profile | 1–12 | 12 | 12 | 0 | 0 | 100% |
| B — Community Creation and Ownership | 13–15 | 3 | 3 | 0 | 0 | 100% |
| C — Communities and Membership Authorization | 16–24 | 9 | 9 | 0 | 0 | 100% |
| D — Security and Authorization | 25–30 | 6 | 6 | 0 | 0 | 100% |
| **Overall** | **1–30** | **30** | **30** | **0** | **0** | **100%** |

Group A contributes 12 original-environment outcomes; groups B–D contribute 18 isolated-environment outcomes. Repeated test IDs, supporting profile reads, setup attempts, and follow-up checks do not add cases to these totals.

## 8. Security Testing Results

| Control | Reported manual evidence | Source corroboration and limit |
| --- | --- | --- |
| Session validation | Invalid-session profile read and anonymous discovery denied | Session service checks token shape, database record, revocation, expiry, and verified user; this campaign does not prove every session transition. |
| Unauthorized private access | Non-member and pending reads denied; approved member read allowed | Private detail requires owner/current MEMBER; authenticated discovery intentionally still exposes approved metadata. |
| IDOR/BOLA | Selected unauthorized private-object read returned 404 | Object identifier possession does not itself grant access. Actor/target detail for the security-specific case is unavailable. |
| Mass assignment | Unauthorized profile fields and supplied community owner rejected | Strict field allowlists precede writes; profile/owner actors derive from the live session. |
| CSRF Origin validation | Untrusted-Origin profile write returned 403 | Exact configured Origin is required for POST. This does not independently demonstrate all browser, proxy, or deployed CSRF conditions. |
| Membership authorization | Non-owner listing and approval denied; injected self-action identity rejected | `userId` is forbidden for self join/leave and required for owner approve/remove. Checks run server-side. |
| Protected-data integrity | Relevant rejection follow-ups reported by tester | Raw before/after evidence absent. Transactional service logic corroborates intended protection; no database inspection was performed here. |

Routes use generic `{ ok: false }` error bodies and private/no-store response headers. These source-level observations are not additional manual test results. The selected checks do not establish general resistance to XSS, SQL injection, denial of service, token theft, infrastructure compromise, or all authorization bypasses.

## 9. Issues Encountered and Resolutions

| Issue | Classification | Evidence, resolution, and remaining limit |
| --- | --- | --- |
| Postman Cookie Jar interference | Test-client configuration | Automatic cookies can conflict with explicitly selected account cookies. The supplied campaign reports correction of session selection; README prescribes independent account state and disabling automatic cookie sending for explicit headers. No application authorization defect is established by this incident. |
| Expired or mismatched confirmation-token attempts | Test-state/authentication precondition | The task identifies unsuccessful attempts but supplies no request archive or precise root-cause trace. Source rejects expired, consumed, revoked, or browser-mismatched challenges with 400. Use a valid fresh challenge with its matching pending state; final confirmation passed as reported. The exact cause of each earlier attempt is not independently verified. |
| Clipboard helper behavior | Tooling behavior and operational prerequisite | The helper copies privately for 30 seconds, requires explicitly disabled Windows clipboard history/cloud settings, and clears only its unchanged value. Waiting while the helper remains active is expected. Exact observed clipboard failures/settings and their remediation were not supplied; no registry change or helper execution was performed for this report. |
| Incomplete-profile permission check | Session-selection problem, resolved as reported | The earlier `canCreate: true` was obtained under incorrect Postman session selection. C's correctly isolated request had `displayName: null` and `canCreate: false`. Current source derives eligibility from the authenticated user's saved profile; no application defect is established by the corrected result. |
| Legacy Manual QA lifecycle recovery | Documented tooling limitation; unresolved for the legacy session | Historical metadata lacked process-incarnation and run-scoped lease evidence required by newer guarded recovery. Absent PIDs/free ports are insufficient proof. The isolated continuation avoided dependence on legacy recovery; it did not repair or validate recovery of the original session. |
| Isolated QA environment preparation | Environment isolation and campaign continuity | Repository records describe an independent checkout, resource owner, PostgreSQL port, and private runtime namespace. The tester reports cases 13–30 completed there. Preparation/build evidence alone does not establish runtime success; raw execution evidence is unavailable. |
| Node.js native TypeScript strip-only compatibility | Confirmed tooling code defect, historically corrected | The 2026-10-18 project-brief entry records a parameter property in `RecoveryRefusal` incompatible with the native strip-only path. Current code explicitly declares/assigns `code`; a native parser check and focused tests were added. Earlier transformed Vitest/Next success had not verified native CLI compatibility. Historical regression/check results are documented, not rerun here; runtime lifecycle verification is separate. |

The supplied final campaign reports no remaining failed or blocked selected cases. That does not close the legacy recovery limitation or convert historical mock/tooling checks into live lifecycle evidence.

### 9.1 Reconciliation with repository documentation

- Existing README/project-brief preparation entries say isolated runtime/Postman work had not yet been executed. They describe earlier checkpoints. This report records the newer tester-reported outcomes while preserving those historical limitations.
- README setup examples save profiles for A/B/C and reserve D for incomplete-profile testing. The supplied campaign instead uses C without a profile. This report follows the campaign; account letters are fixture labels, not permission rules.
- The ownership case combines two projections: community detail/discovery returns `membership`, whereas membership-list entries return `status`. Expecting a `membership` property inside a list entry would not match the code.
- No pre-existing `USP-M2-*`, `USP-M3-*`, or `SEC-*` inventory was located in the inspected source documentation/tests. IDs come from the supplied inventory; existing automated tests use descriptive names. Repeated IDs are retained intentionally.
- No supplied expected HTTP status conflicts with the reviewed implementation under the stated prerequisites. Where exact request details are missing (unsupported-locale operation, security-case actor/target, injected self-action), the matrix marks the mapping or limitation explicitly.

## 10. Evidence and Limitations

| Evidence source | Available basis | What it establishes |
| --- | --- | --- |
| Owner-supplied task/campaign inventory | Thirty scenarios, expected statuses, final PASS confirmation, environment split, and selected observations | Tester-reported manual results; not independent execution evidence |
| README and project brief | Setup contracts, approved permissions, historical tooling issues and checks | Documented design/context and historical evidence with its original scope |
| API routes, services, policies, Prisma schema | Read-only inspection of the isolated working tree | Current intended status/response/access behavior and persistence constraints |
| Existing unit/database/browser test source | Related specifications inspected | Expected automated coverage design; no fresh automated result |
| Raw Postman artifacts | No relevant run exports/collection evidence located in inspected non-ignored repository files | Request-level independent verification unavailable |
| Live environment | Not accessed during report preparation | No current server, database, container, or provider-health conclusion |

Exact execution times, Postman version, request IDs, complete request/response payloads, immutable build identifiers, screenshots, and measured performance were not supplied. Private/ignored runtime files were not searched for credentials or used as evidence. Absence of an artifact from the inspected files does not prove none exists elsewhere.

The report was checked as documentation: case count/numbering, supplied IDs/statuses, category totals, environment separation, source consistency, Markdown structure/link targets, and accidental credential-like content. Git whitespace checks and before/after source hashes were used to verify the documentation-only change. No new unit, database, browser, Postman, live API, build, or deployment test result is claimed.

## 11. QA Summary and Recommendations

The selected manual campaign is complete according to the tester: 30 passed, 0 failed, 0 blocked. Current source corroborates the expected contracts, with the response-field and fixture clarifications recorded above.

1. Review this report against the tester's local notes, especially the actor/target used for the private security read and any unarchived request variants.
2. In a separately authorized campaign, rerun all 30 scenarios against one isolated database/build and record sanitized request-level evidence. Keep the original two-environment history intact.
3. Retain only non-secret evidence: case number, build reference, environment label, expected/actual status, relevant redacted fields, and protected-state checks. Exclude authentication headers, tokens, and private control data.
4. Use distinct case-variant identifiers in a future maintained test catalog while retaining this campaign's supplied IDs for traceability.
5. Extend later QA to membership removal/leave and access revocation, duplicate/concurrent operations, boundary/rate-limit behavior, and bilingual UI/RTL/keyboard usability. Existing automated specifications are useful starting points, not substitute manual execution evidence.
6. Keep native lifecycle/recovery verification and real-email/provider/deployment readiness as separate checkpoints with their own evidence and authorization.

The next smallest useful step is tester/backend review of this Markdown report. It requires no migration, dependency change, server restart, or database modification.

## 12. Final Conclusion

All **30 selected manual API cases are recorded as Manually executed — tester-reported PASS**, for a final reported pass rate of **100%**. The results cover authentication/profile scenarios in the original environment and community/membership/security scenarios in the isolated environment.

The report is ready for review and a future documentation commit. Its conclusions remain bounded by tester-reported evidence, missing raw execution artifacts, and the split across two databases. It does not certify application-wide correctness, complete security, legacy recovery success, or production readiness.

## 13. Appendix

### 13.1 Relevant API endpoint inventory

The following are source-verified contracts, not additional executed cases. Protected operations require a live verified session; POST routes require the exact local Origin. JSON body size is bounded at 8 KiB. Error payloads are generally `{ ok: false }`; unavailable local context or internal failures produce 503.

| Method | Endpoint | Input/access contract | Success response |
| --- | --- | --- | --- |
| POST | `/api/identity/request` | `email`, `locale`; local synthetic eligibility; generic acceptance and rate behavior | 202, `{ ok: true }`; pending cookie |
| POST | `/api/identity/confirm` | `token`, `locale`; matching pending state; valid live unused challenge | 200, `{ ok: true }`; session cookie and pending clearing |
| GET | `/api/identity/profile` | Own live session; any query string rejected with 404 | 200, `{ ok: true, email, displayName }`; name may be null before profile creation |
| POST | `/api/identity/profile` | Only `displayName`; trimmed, well-formed text, no NUL, 1–60 Unicode code points | 200, `{ ok: true }` |
| POST | `/api/identity/logout` | Empty JSON object; no active session required for idempotent success | 200, `{ ok: true }`; auth-cookie clearing after successful database handling |
| GET | `/api/communities` | Verified session; optional single UUID `after` cursor | 200, `{ ok: true, items, next, canCreate }` |
| POST | `/api/communities` | Saved profile; only `name`, `description`, `visibility`; no client owner | 201, `{ ok: true, id }` |
| GET | `/api/communities/{id}` | UUID; no query; verified user for PUBLIC, owner/current MEMBER for PRIVATE | 200, `{ ok: true, id, name, description, visibility, isOwner, membership }` |
| GET | `/api/communities/{id}/memberships` | Owner only; optional single UUID `after` cursor | 200, `{ ok: true, items, next }`; rows contain `userId`, `status`, `displayName`, `isOwner` |
| POST | `/api/communities/{id}/memberships` | `action`: join/leave without `userId`; approve/remove with target UUID and owner authorization | 200, `{ ok: true }`; membership state requires a subsequent authorized read |

Discovery items contain `id`, `name`, `description`, `visibility`, `isOwner`, and the caller's `membership`; they do not expose owner IDs or member lists. List pages are capped at 20 items. Community names are trimmed, required, and at most 80 Unicode code points; descriptions are strings of at most 1,000 code points and may be empty. Visibility is exactly PUBLIC or PRIVATE. Additional controls and resource limits in source are not represented as manually tested by this campaign.

Owner membership is inserted with community creation in a transaction. Prisma defines one membership per `(communityId, userId)`. The membership service preserves MEMBER on repeated join and cannot approve a nonexistent request; these are implementation observations, not extra manual PASS results.

### 13.2 Test account roles

| Fixture | Role in supplied isolated campaign | Relevant state |
| --- | --- | --- |
| A | Authenticated owner of the public and private communities | Saved profile; owner membership; approves B |
| B | Authenticated non-owner participant | Public non-member to MEMBER; private non-member to PENDING to MEMBER |
| C | Authenticated discovery/incomplete-profile fixture | `displayName: null`, `canCreate: false` after session correction |
| Unauthorized private-read actor | Valid authenticated non-member of the selected target | Exact account not supplied; must not be assumed to be B after approval to that same community |
| Anonymous actor | No valid session | Community discovery denied |

Original-environment identity/profile cases used a separate account/session context; their exact identities are not needed for this report. Account D is a README setup convention, not an additional reported campaign participant. No actual email addresses, user UUIDs, cookies, tokens, passwords, or control keys are included.

### 13.3 Repository references

| Reference | Relevance |
| --- | --- |
| [README](../../README.md) | Local/manual workflow, isolated setup, session isolation, clipboard and recovery constraints |
| [Project brief](../project-brief.md) | Approved community policy and historical evidence, including isolation and native TypeScript correction |
| [Canonical abstract](../abstract.md) | Broader minimum project scope; campaign completion is not baseline completion |
| [Package metadata](../../package.json), [lockfile](../../package-lock.json), [Node pin](../../.node-version) | Configured application/tool versions |
| [Isolation configuration template](../../qa-isolation.example.json), [Compose configuration](../../compose.m1b.yaml) | Portable configuration shape and PostgreSQL image; actual run identities came from the inspected local profile, not the template |
| [Identity route](../../src/app/api/identity/%5Boperation%5D/route.ts) | Methods, input allowlists, Origin checks, response statuses |
| [Identity service](../../src/server/identity/service.ts), [identity policy](../../src/server/identity/policy.ts), [local identity boundary](../../src/server/identity/local.ts) | Challenge/session rules, own-profile enforcement, synthetic-only context |
| [Profile validation](../../src/server/database/validation.ts), [locales](../../src/i18n/locales.ts) | Unicode name limits and supported locale values |
| [Community collection route](../../src/app/api/communities/route.ts), [detail route](../../src/app/api/communities/%5Bid%5D/route.ts), [membership route](../../src/app/api/communities/%5Bid%5D/memberships/route.ts) | Endpoint response envelopes and method contracts |
| [Community HTTP boundary](../../src/server/communities/http.ts), [policy](../../src/server/communities/policy.ts), [service](../../src/server/communities/service.ts) | Input validation, live authorization, discovery projection, membership transitions |
| [Prisma schema](../../prisma/schema.prisma) | Ownership relations and membership uniqueness |
| [Identity browser specifications](../../tests/e2e/identity.spec.ts), [community browser specifications](../../tests/e2e/communities.spec.ts) | Existing HTTP/browser expectations; not rerun |
| [Identity database specifications](../../tests/database/identity.test.ts), [community database specifications](../../tests/database/communities.test.ts) | Existing persistence/access test design; not rerun |
| [Community policy specifications](../../src/server/communities/policy.test.ts), [identity policy specifications](../../src/server/identity/policy.test.ts) | Existing input/security assertions; not rerun |
| [Mailbox helper](../../tools/identity/manual-mailbox.ts), [recovery module](../../tools/database/manual-recovery.ts), [native TypeScript checker](../../tools/database/check-native-typescript.mjs) | Tooling behavior and documented operational limitations |

Only this report was created for the task. Existing uncommitted work is retained; no staging, commit, push, application/schema change, runtime lifecycle operation, or database mutation is part of report preparation.
