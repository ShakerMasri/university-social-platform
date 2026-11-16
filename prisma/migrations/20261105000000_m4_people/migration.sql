BEGIN;

-- Existing names and attribution remain intact. No existing account is opted in.
ALTER TABLE "Profile"
  ADD COLUMN "directoryId" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "directoryVisible" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Profile_directoryId_key" ON "Profile"("directoryId");

COMMIT;
