BEGIN;
CREATE TYPE "PostType" AS ENUM ('QUESTION', 'DISCUSSION', 'RESOURCE', 'ANNOUNCEMENT');
CREATE TABLE "Post" (
  id UUID PRIMARY KEY, "communityId" UUID NOT NULL, "authorId" UUID, "submissionKey" VARCHAR(64),
  type "PostType" NOT NULL, title VARCHAR(160) NOT NULL, body VARCHAR(10000) NOT NULL,
  "resourceUrl" VARCHAR(2048), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Post_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "Post_text_policy" CHECK (char_length(btrim(title)) BETWEEN 1 AND 160 AND char_length(btrim(body)) BETWEEN 1 AND 10000
    AND title !~ '[\x00-\x1f\x7f]' AND body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  CONSTRAINT "Post_resource_policy" CHECK ("resourceUrl" IS NULL OR (type = 'RESOURCE' AND "resourceUrl" ~ '^https?://[^[:space:]]+$')),
  CONSTRAINT "Post_submission_policy" CHECK ("submissionKey" IS NULL OR "submissionKey" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "Post_submissionKey_key" ON "Post"("submissionKey");
CREATE INDEX "Post_communityId_createdAt_id_idx" ON "Post"("communityId", "createdAt", id);
COMMIT;
