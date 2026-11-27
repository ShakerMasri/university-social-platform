import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { archiveInput } from "@/server/archive/policy";
import { archiveCommunities, searchArchive } from "@/server/archive/service";
import { peopleInput } from "@/server/profiles/policy";
import { searchPeople } from "@/server/profiles/service";
import { CommunityError } from "@/server/communities/service";
import { communityId } from "@/server/communities/policy";
import { InputError } from "@/server/communities/http";
import { reportOperationalFailure } from "@/server/diagnostics";
import type { SearchRequest } from "./search-request";

// Runs the existing permission-checked searches for /search. Every call goes
// through the same services as /api/archive and /api/people, with the same
// budgets, signed cursors and access rechecks. Nothing here widens access.

export type SearchFailure = "invalid" | "unavailable" | "rate" | "failed";
export type Outcome<T> = { status: "ok"; value: T } | { status: SearchFailure } | { status: "signedOut" };

/** Maps a search error to what the page shows. Unexpected errors are reported. */
export function searchFailure(error: unknown): SearchFailure | "signedOut" {
  if (error instanceof InputError) return "invalid";
  if (error instanceof CommunityError) {
    if (error.status === 401) return "signedOut";
    if (error.status === 429) return "rate";
    return "unavailable";
  }
  reportOperationalFailure("search.page.failed");
  return "failed";
}

async function attempt<T>(run: () => Promise<T>): Promise<Outcome<T>> {
  try { return { status: "ok", value: await run() }; }
  catch (error) { return { status: searchFailure(error) }; }
}

export type SearchContext = { db: PrismaClient; token: string | undefined; cursorKey: string };

export function postSearch(context: SearchContext, request: SearchRequest) {
  if (request.duplicate) return Promise.resolve<Outcome<never>>({ status: "invalid" });
  const params = new URLSearchParams({ q: request.query });
  // Filters belong to the Posts tab, the only one that shows them. The All
  // tab ignores them, so its results always match "See all posts".
  if (request.tab === "posts") {
    if (request.community) params.set("community", request.community);
    if (request.type) params.set("type", request.type);
    if (request.after) params.set("after", request.after);
  }
  let input: ReturnType<typeof archiveInput>;
  try { input = archiveInput(params); } catch { return Promise.resolve<Outcome<never>>({ status: "invalid" }); }
  return attempt(() => searchArchive(context.db, context.token, input, context.cursorKey));
}

export function peopleSearch(context: SearchContext, request: SearchRequest) {
  if (request.duplicate) return Promise.resolve<Outcome<never>>({ status: "invalid" });
  const params = new URLSearchParams({ q: request.query });
  if (request.after && request.tab === "people") params.set("after", request.after);
  let input: ReturnType<typeof peopleInput>;
  try { input = peopleInput(params); } catch { return Promise.resolve<Outcome<never>>({ status: "invalid" }); }
  return attempt(() => searchPeople(context.db, context.token, input, context.cursorKey));
}

/** Communities the viewer can search in, for the Posts tab filter. */
export function filterCommunities(context: SearchContext, request: SearchRequest) {
  let selected: string | undefined;
  // A malformed selection is "unavailable", like an unreadable one.
  try { selected = request.community === undefined ? undefined : communityId(request.community); }
  catch { return Promise.resolve<Outcome<never>>({ status: "unavailable" }); }
  return attempt(() => archiveCommunities(context.db, context.token, selected));
}
