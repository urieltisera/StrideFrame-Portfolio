ALTER TABLE "Photo" ADD COLUMN "originalFilename" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Photo" ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream';
ALTER TABLE "Photo" ADD COLUMN "fileSize" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Photo" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
CREATE TYPE "public"."PhotoStatus" AS ENUM ('DRAFT', 'PUBLISHED');
ALTER TABLE "Photo" ADD COLUMN "status" "public"."PhotoStatus" NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Photo" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Photo_albumId_status_idx" ON "Photo"("albumId", "status");
