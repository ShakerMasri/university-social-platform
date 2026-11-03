BEGIN;
ALTER TABLE "Comment" ADD COLUMN "rootId" UUID, ADD COLUMN "replyToId" UUID;
CREATE UNIQUE INDEX "Comment_id_postId_key" ON "Comment"(id, "postId");
CREATE INDEX "Comment_postId_rootId_createdAt_id_idx" ON "Comment"("postId", "rootId", "createdAt", id);
ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_rootId_postId_fkey" FOREIGN KEY ("rootId", "postId") REFERENCES "Comment"(id, "postId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "Comment_replyToId_postId_fkey" FOREIGN KEY ("replyToId", "postId") REFERENCES "Comment"(id, "postId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "Comment_reply_pair" CHECK (("rootId" IS NULL) = ("replyToId" IS NULL) AND id IS DISTINCT FROM "rootId" AND id IS DISTINCT FROM "replyToId");
-- Cross-row thread integrity cannot be expressed in a CHECK. No runtime UPDATE
-- grant exists; this trigger also rejects structural changes by privileged tools.
CREATE FUNCTION check_comment_thread() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW."postId", NEW."rootId", NEW."replyToId") IS DISTINCT FROM (OLD.id, OLD."postId", OLD."rootId", OLD."replyToId") THEN
    RAISE EXCEPTION 'Comment structure is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."rootId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Comment" root JOIN "Comment" target ON target.id = NEW."replyToId" AND target."postId" = NEW."postId"
    WHERE root.id = NEW."rootId" AND root."postId" = NEW."postId" AND root."rootId" IS NULL
      AND COALESCE(target."rootId", target.id) = root.id
  ) THEN RAISE EXCEPTION 'Invalid comment thread' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Comment_thread_integrity" BEFORE INSERT OR UPDATE ON "Comment" FOR EACH ROW EXECUTE FUNCTION check_comment_thread();

CREATE TABLE "NotificationPreference" (
  "userId" UUID PRIMARY KEY, announcements BOOLEAN NOT NULL DEFAULT true, replies BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TYPE "NotificationKind" AS ENUM ('ANNOUNCEMENT', 'COMMENT');
CREATE TABLE "Notification" (
  id UUID PRIMARY KEY, "recipientId" UUID NOT NULL, "postId" UUID NOT NULL, "commentId" UUID,
  "eventKey" UUID NOT NULL, kind "NotificationKind" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "readAt" TIMESTAMPTZ(3),
  CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Notification_commentId_postId_fkey" FOREIGN KEY ("commentId", "postId") REFERENCES "Comment"(id, "postId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Notification_event_policy" CHECK (
    (kind = 'ANNOUNCEMENT' AND "commentId" IS NULL AND "eventKey" = "postId") OR
    (kind = 'COMMENT' AND "commentId" IS NOT NULL AND "eventKey" = "commentId"))
);
CREATE UNIQUE INDEX "Notification_recipientId_eventKey_key" ON "Notification"("recipientId", "eventKey");
CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON "Notification"("recipientId", "createdAt", id);
CREATE INDEX "Notification_recipientId_readAt_idx" ON "Notification"("recipientId", "readAt");
COMMIT;
