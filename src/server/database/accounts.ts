import "server-only";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { normalizeEmail, validateDisplayName, validateUserId } from "./validation.ts";

// Internal persistence functions only. M2 must authorize callers before exposure.
export function createUser(db: PrismaClient, email: unknown) {
  return db.user.create({ data: normalizeEmail(email) });
}

export function findUserByEmail(db: PrismaClient, email: unknown) {
  return db.user.findUnique({ where: { emailKey: normalizeEmail(email).emailKey } });
}

export function saveProfile(db: PrismaClient, userId: unknown, name: unknown) {
  validateUserId(userId);
  const displayName = validateDisplayName(name);
  return db.profile.upsert({
    where: { userId },
    create: { userId, displayName },
    update: { displayName },
  });
}
