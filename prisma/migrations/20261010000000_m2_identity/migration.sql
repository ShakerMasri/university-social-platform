BEGIN;

-- Existing synthetic challenges remain unbound and cannot be used by M2 HTTP login.
ALTER TABLE "EmailOwnershipChallenge" ADD COLUMN "browserDigest" VARCHAR(64);

CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenDigest" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdentityRateLimit" (
    "keyDigest" VARCHAR(64) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hits" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "IdentityRateLimit_pkey" PRIMARY KEY ("keyDigest")
);

CREATE UNIQUE INDEX "Session_tokenDigest_key" ON "Session"("tokenDigest");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Custom checks
ALTER TABLE "EmailOwnershipChallenge" ADD CONSTRAINT "EmailOwnershipChallenge_browser_digest"
    CHECK ("browserDigest" IS NULL OR "browserDigest" ~ '^[0-9a-f]{64}$');
ALTER TABLE "Session" ADD CONSTRAINT "Session_policy" CHECK (
    "tokenDigest" ~ '^[0-9a-f]{64}$'
    AND "expiresAt" > "createdAt"
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);
ALTER TABLE "IdentityRateLimit" ADD CONSTRAINT "IdentityRateLimit_policy"
    CHECK ("keyDigest" ~ '^[0-9a-f]{64}$' AND hits >= 0 AND hits <= 30);

COMMIT;
