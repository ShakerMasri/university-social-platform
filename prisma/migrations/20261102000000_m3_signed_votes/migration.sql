BEGIN;
ALTER TABLE "PostVote" ADD COLUMN value INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "firstUpvotedAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CommentVote" ADD COLUMN value INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "firstUpvotedAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP;
-- Existing upvotes keep their contribution and are historical, not new events.
UPDATE "PostVote" SET "firstUpvotedAt" = "createdAt";
UPDATE "CommentVote" SET "firstUpvotedAt" = "createdAt";
ALTER TABLE "PostVote" ADD CONSTRAINT "PostVote_value_check" CHECK (value IN (-1, 0, 1) AND (value <> 1 OR "firstUpvotedAt" IS NOT NULL));
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_value_check" CHECK (value IN (-1, 0, 1) AND (value <> 1 OR "firstUpvotedAt" IS NOT NULL));
-- Neutral rows retain this minimal marker so toggles cannot create new events.
CREATE FUNCTION preserve_first_upvote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."firstUpvotedAt" IS NOT NULL AND NEW."firstUpvotedAt" IS DISTINCT FROM OLD."firstUpvotedAt" THEN
    RAISE EXCEPTION 'First upvote marker is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PostVote_first_upvote" BEFORE UPDATE ON "PostVote" FOR EACH ROW EXECUTE FUNCTION preserve_first_upvote();
CREATE TRIGGER "CommentVote_first_upvote" BEFORE UPDATE ON "CommentVote" FOR EACH ROW EXECUTE FUNCTION preserve_first_upvote();
ALTER TABLE "NotificationPreference" ADD COLUMN upvotes BOOLEAN NOT NULL DEFAULT true;
ALTER TYPE "NotificationKind" ADD VALUE 'UPVOTE';
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_event_policy";
-- Compare the new enum through text: PostgreSQL cannot use a newly added enum
-- literal before this transaction commits. No historical notification is added.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_event_policy" CHECK (
  (kind::text = 'ANNOUNCEMENT' AND "commentId" IS NULL AND "eventKey" = "postId") OR
  (kind::text = 'COMMENT' AND "commentId" IS NOT NULL AND "eventKey" = "commentId") OR
  kind::text = 'UPVOTE'
);
COMMIT;
