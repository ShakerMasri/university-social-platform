import { notificationOpenResponse, notificationPageResponse } from "@/app/[locale]/(app)/notifications/content-data";

// Browser requests shared by the header preview and Home's side panel. Both
// use the owner-checked notification endpoints; nothing here is cached.
const requestTimeoutMs = 15_000;
/** How many notifications the header preview and Home's panel show; the rest are on /notifications. */
export const notificationPreviewSize = 5;

/** A failed request, with the HTTP status when there was a response. */
export class NotificationRequestError extends Error {
  constructor(readonly status: number | null) { super("Notification request failed"); }
}

/** The newest page of the viewer's notifications. */
export async function fetchNotificationPage(signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch("/api/notifications", { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]) });
  } catch { throw new NotificationRequestError(null); }
  if (!response.ok) throw new NotificationRequestError(response.status);
  return notificationPageResponse(await response.json());
}

/** Opens one notification: where to go, and whether this request marked it read. */
export async function openNotification(id: string) {
  const response = await fetch(`/api/notifications/${id}/open`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) throw new NotificationRequestError(response.status);
  return notificationOpenResponse(await response.json(), id);
}
