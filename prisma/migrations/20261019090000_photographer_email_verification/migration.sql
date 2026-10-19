ALTER TABLE "Photographer"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "emailVerificationTokenHash" TEXT,
  ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "emailVerificationSentAt" TIMESTAMP(3);

UPDATE "Photographer"
SET "emailVerifiedAt" = CURRENT_TIMESTAMP
WHERE "emailVerifiedAt" IS NULL;

CREATE UNIQUE INDEX "Photographer_emailVerificationTokenHash_key"
  ON "Photographer"("emailVerificationTokenHash");
