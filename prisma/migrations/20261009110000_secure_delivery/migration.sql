-- Secure delivery v1 replaces the legacy per-photo placeholder grant with a
-- single hashed capability per paid order. Existing pre-production grants are
-- revoked because they did not contain usable access tokens.
DELETE FROM "public"."DownloadGrant";
DROP INDEX IF EXISTS "DownloadGrant_orderId_photoId_key";
ALTER TABLE "public"."DownloadGrant" DROP CONSTRAINT IF EXISTS "DownloadGrant_photoId_fkey";
ALTER TABLE "public"."DownloadGrant" DROP COLUMN IF EXISTS "photoId";
CREATE TYPE "public"."DownloadGrantStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
ALTER TABLE "public"."DownloadGrant"
  ADD COLUMN "tokenHash" TEXT NOT NULL,
  ADD COLUMN "status" "public"."DownloadGrantStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "DownloadGrant_tokenHash_key" ON "public"."DownloadGrant"("tokenHash");
CREATE INDEX "DownloadGrant_orderId_status_idx" ON "public"."DownloadGrant"("orderId", "status");
CREATE INDEX "DownloadGrant_expiresAt_idx" ON "public"."DownloadGrant"("expiresAt");
