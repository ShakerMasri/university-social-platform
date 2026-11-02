export const notificationPageSize = 20;
export function notificationPreferences(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => !["announcements", "replies", "upvotes"].includes(key)) || typeof value.announcements !== "boolean" || typeof value.replies !== "boolean" ||
      ("upvotes" in value && typeof value.upvotes !== "boolean")) throw new Error("Invalid notification settings");
  return { announcements: value.announcements, replies: value.replies, ...("upvotes" in value ? { upvotes: value.upvotes as boolean } : {}) };
}
