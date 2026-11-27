// Browser-side calls to the identity API. Errors become a status, never a
// thrown exception, so callers always show a message instead of failing silently.
export async function postIdentity(operation: "request" | "confirm" | "logout", data: object) {
  try {
    const response = await fetch(`/api/identity/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store" });
    return { ok: response.ok, status: response.status };
  } catch { return { ok: false, status: 503 }; }
}
