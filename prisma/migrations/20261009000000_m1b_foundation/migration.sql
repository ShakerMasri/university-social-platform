BEGIN;

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "emailKey" VARCHAR(254) NOT NULL,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Profile" (
    "userId" UUID NOT NULL,
    "displayName" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Profile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "EmailOwnershipChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emailKey" VARCHAR(254) NOT NULL,
    "tokenDigest" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    CONSTRAINT "EmailOwnershipChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_emailKey_key" ON "User"("emailKey");
CREATE UNIQUE INDEX "User_id_emailKey_key" ON "User"("id", "emailKey");
CREATE UNIQUE INDEX "EmailOwnershipChallenge_tokenDigest_key" ON "EmailOwnershipChallenge"("tokenDigest");
CREATE INDEX "EmailOwnershipChallenge_userId_expiresAt_idx" ON "EmailOwnershipChallenge"("userId", "expiresAt");

ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "EmailOwnershipChallenge" ADD CONSTRAINT "EmailOwnershipChallenge_userId_emailKey_fkey"
    FOREIGN KEY ("userId", "emailKey") REFERENCES "User"("id", "emailKey") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Custom checks are intentionally retained in migration history: Prisma's schema
-- language does not express them. PostgreSQL 18 full Unicode lower() matches the
-- chosen whole-address lowercasing policy (not provider rewriting or casefold()).
-- The escape string lists exactly ECMAScript trim whitespace/line terminators.
ALTER TABLE "User" ADD CONSTRAINT "User_email_policy" CHECK (
    char_length("email") BETWEEN 3 AND 254
    AND "email" = translate("email", E'\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff', '')
    AND "email" !~ '[[:space:][:cntrl:]]'
    AND "email" ~ '^[^@]+@[^@]+$'
    AND "emailKey" = lower("email" COLLATE pg_unicode_fast)
    AND char_length("emailKey") BETWEEN 3 AND 254
);
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_display_name_policy" CHECK (
    char_length("displayName") BETWEEN 1 AND 60
    AND char_length(btrim("displayName", E'\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff')) > 0
);
ALTER TABLE "EmailOwnershipChallenge" ADD CONSTRAINT "EmailOwnershipChallenge_expiry" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "EmailOwnershipChallenge" ADD CONSTRAINT "EmailOwnershipChallenge_digest" CHECK ("tokenDigest" ~ '^[0-9a-f]{64}$');
ALTER TABLE "EmailOwnershipChallenge" ADD CONSTRAINT "EmailOwnershipChallenge_state" CHECK (
    NOT ("consumedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
    AND ("consumedAt" IS NULL OR ("consumedAt" >= "createdAt" AND "consumedAt" < "expiresAt"))
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

COMMIT;
