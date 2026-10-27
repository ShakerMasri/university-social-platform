BEGIN;
CREATE TABLE "PostVote" (
  "postId" UUID NOT NULL, "userId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostVote_pkey" PRIMARY KEY ("postId", "userId"),
  CONSTRAINT "PostVote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PostVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "PostVote_userId_idx" ON "PostVote"("userId");
CREATE TABLE "CommentVote" (
  "commentId" UUID NOT NULL, "userId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentVote_pkey" PRIMARY KEY ("commentId", "userId"),
  CONSTRAINT "CommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CommentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "CommentVote_userId_idx" ON "CommentVote"("userId");
COMMIT;
