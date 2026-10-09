-- Pre-production vector dimension upgrade for ArcFace-compatible embeddings.
-- Existing deterministic vector rows are removed because they are incompatible.
DELETE FROM "public"."PhotoFace";
ALTER TABLE "public"."PhotoFace" DROP COLUMN "embedding";
ALTER TABLE "public"."PhotoFace" ADD COLUMN "embedding" vector(512) NOT NULL;
