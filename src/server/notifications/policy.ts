export const notificationPageSize = 20;
export function notificationPreferences(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => !["announcements", "replies"].includes(key)) || typeof value.announcements !== "boolean" || typeof value.replies !== "boolean") throw new Error("Invalid notification settings");
  return { announcements: value.announcements, replies: value.replies };
}
