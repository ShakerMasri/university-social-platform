import "server-only";
import type { Prisma } from "../../generated/prisma/client.ts";

// Called only inside the content transaction while its community write lock is
// held. A set-based insert bounds application memory, preserves atomicity and
// takes one preferences/membership snapshot. SQL is parameterized; no text is
// copied into notifications. Statement/transaction limits fail the entire write.
export async function notifyContent(tx: Prisma.TransactionClient, communityId: string, actorId: string, postId: string, commentId: string | null, recipientIds: string[] = []) {
  await tx.$executeRaw`SET LOCAL statement_timeout = '4000ms'`;
  if (commentId === null) {
    await tx.$executeRaw`INSERT INTO "Notification" (id, "recipientId", "postId", "eventKey", kind)
      SELECT gen_random_uuid(), m."userId", ${postId}::uuid, ${postId}::uuid, 'ANNOUNCEMENT'::"NotificationKind"
      FROM "CommunityMembership" m LEFT JOIN "NotificationPreference" p ON p."userId" = m."userId"
      WHERE m."communityId" = ${communityId}::uuid AND m.status = 'MEMBER' AND m."userId" <> ${actorId}::uuid
        AND COALESCE(p.announcements, true)
      ON CONFLICT ("recipientId", "eventKey") DO NOTHING`;
  } else {
    await tx.$executeRaw`INSERT INTO "Notification" (id, "recipientId", "postId", "commentId", "eventKey", kind)
      SELECT gen_random_uuid(), m."userId", ${postId}::uuid, ${commentId}::uuid, ${commentId}::uuid, 'COMMENT'::"NotificationKind"
      FROM "CommunityMembership" m LEFT JOIN "NotificationPreference" p ON p."userId" = m."userId"
      WHERE m."communityId" = ${communityId}::uuid AND m.status = 'MEMBER' AND m."userId" <> ${actorId}::uuid
        AND m."userId" = ANY(${recipientIds}::uuid[]) AND COALESCE(p.replies, true)
      ON CONFLICT ("recipientId", "eventKey") DO NOTHING`;
  }
}
