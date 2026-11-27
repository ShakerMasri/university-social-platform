export async function checkFeedSession(viewer: string, signal: AbortSignal): Promise<"verified" | "changed" | "failed"> {
  try {
    const response = await fetch("/api/feed/session", {
      headers: { "X-Feed-Expected-Viewer": viewer }, cache: "no-store", signal,
    });
    if ([401, 403].includes(response.status)) return "changed";
    if (response.status !== 200 || (await response.json())?.ok !== true || signal.aborted) return "failed";
    return "verified";
  } catch { return "failed"; }
}
