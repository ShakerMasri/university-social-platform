import "server-only";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { authorized, mutating } from "../communities/service.ts";
import { notificationPreferences } from "./policy.ts";

export function readPreferences(db: PrismaClient, token: unknown) {
  return authorized(db, token, async (tx, userId) => await tx.notificationPreference.findUnique({ where: { userId }, select: { announcements: true, replies: true } }) ?? { announcements: true, replies: true });
}
export function savePreferences(db: PrismaClient, token: unknown, input: Record<string, unknown>) {
  const data = notificationPreferences(input);
  return mutating(db, token, (tx, userId) => tx.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: { announcements: true, replies: true } }), false, "m3-notification-write");
}
