BEGIN;
CREATE TABLE "Comment" (
  id UUID PRIMARY KEY, "postId" UUID NOT NULL, "authorId" UUID,
  "submissionKey" VARCHAR(64) NOT NULL, body VARCHAR(4000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "Comment_text_policy" CHECK (char_length(btrim(body, E' \t\n\r')) BETWEEN 1 AND 4000
    AND body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  CONSTRAINT "Comment_submission_policy" CHECK ("submissionKey" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "Comment_submissionKey_key" ON "Comment"("submissionKey");
CREATE INDEX "Comment_postId_createdAt_id_idx" ON "Comment"("postId", "createdAt", id);
COMMIT;
