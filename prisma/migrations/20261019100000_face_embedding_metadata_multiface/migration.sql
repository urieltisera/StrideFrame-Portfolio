-- Persist embedding-space metadata and allow multiple detected faces per photo.
-- Existing rows are retained but explicitly classified as legacy so they are
-- not compared with a provider whose metadata was never recorded.
ALTER TABLE "public"."PhotoFace"
  ADD COLUMN "faceIndex" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "providerId" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "modelId" TEXT NOT NULL DEFAULT 'legacy-unclassified',
  ADD COLUMN "embeddingFormatVersion" TEXT NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "embeddingDimension" INTEGER NOT NULL DEFAULT 512,
  ADD COLUMN "similarityMetric" TEXT NOT NULL DEFAULT 'COSINE',
  ADD COLUMN "compatibilityKey" TEXT NOT NULL DEFAULT 'legacy';

UPDATE "public"."PhotoFace"
SET "compatibilityKey" = 'legacy|legacy-unclassified|' || "modelVersion" || '|legacy-unknown|512|COSINE';

DROP INDEX "public"."PhotoFace_photoId_modelVersion_key";
DROP INDEX "public"."PhotoFace_eventId_modelVersion_idx";
DROP INDEX "public"."PhotoFace_photoId_modelVersion_idx";

CREATE UNIQUE INDEX "PhotoFace_photoId_compatibilityKey_faceIndex_key"
  ON "public"."PhotoFace"("photoId", "compatibilityKey", "faceIndex");
CREATE INDEX "PhotoFace_eventId_compatibilityKey_idx"
  ON "public"."PhotoFace"("eventId", "compatibilityKey");
CREATE INDEX "PhotoFace_photoId_compatibilityKey_idx"
  ON "public"."PhotoFace"("photoId", "compatibilityKey");

ALTER TABLE "public"."PhotoFace"
  ALTER COLUMN "faceIndex" DROP DEFAULT,
  ALTER COLUMN "providerId" DROP DEFAULT,
  ALTER COLUMN "modelId" DROP DEFAULT,
  ALTER COLUMN "embeddingFormatVersion" DROP DEFAULT,
  ALTER COLUMN "embeddingDimension" DROP DEFAULT,
  ALTER COLUMN "similarityMetric" DROP DEFAULT,
  ALTER COLUMN "compatibilityKey" DROP DEFAULT;
