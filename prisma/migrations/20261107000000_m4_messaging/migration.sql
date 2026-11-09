BEGIN;
CREATE TYPE "DirectRequestState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TABLE "DirectConversation" (
  id UUID PRIMARY KEY, "firstId" UUID NOT NULL, "secondId" UUID NOT NULL, "initiatorId" UUID NOT NULL,
  state "DirectRequestState" NOT NULL DEFAULT 'PENDING', "pendingMessages" INTEGER NOT NULL,
  "firstBlocked" BOOLEAN NOT NULL DEFAULT false, "secondBlocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectConversation_firstId_fkey" FOREIGN KEY ("firstId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DirectConversation_secondId_fkey" FOREIGN KEY ("secondId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DirectConversation_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DirectConversation_pair_policy" CHECK ("firstId" < "secondId" AND "initiatorId" IN ("firstId", "secondId")),
  CONSTRAINT "DirectConversation_pending_policy" CHECK ("pendingMessages" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "DirectConversation_firstId_secondId_key" ON "DirectConversation"("firstId", "secondId");
CREATE INDEX "DirectConversation_firstId_id_idx" ON "DirectConversation"("firstId", id);
CREATE INDEX "DirectConversation_secondId_id_idx" ON "DirectConversation"("secondId", id);
CREATE TABLE "DirectMessage" (
  id UUID PRIMARY KEY, "conversationId" UUID NOT NULL, "senderId" UUID NOT NULL,
  "submissionKey" VARCHAR(64) NOT NULL, body VARCHAR(4000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DirectMessage_text_policy" CHECK (char_length(btrim(body, E' \t\n\r')) BETWEEN 1 AND 4000
    AND body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  CONSTRAINT "DirectMessage_submission_policy" CHECK ("submissionKey" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "DirectMessage_submissionKey_key" ON "DirectMessage"("submissionKey");
CREATE INDEX "DirectMessage_conversationId_createdAt_id_idx" ON "DirectMessage"("conversationId", "createdAt", id);
COMMIT;
