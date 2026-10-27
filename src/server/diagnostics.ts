import "server-only";

type OperationalEvent =
  | "identity.http.get_failed"
  | "identity.http.post_failed"
  | "identity.delivery_failed"
  | "communities.http.failed";

// Fixed event names identify the failing boundary. Never accept an Error,
// request, URL, headers, query, user identifier or provider-supplied message.
// stderr belongs to the local operator; do not publish it as an app endpoint.
export function reportOperationalFailure(event: OperationalEvent) {
  console.error(JSON.stringify({ level: "error", event }));
}
