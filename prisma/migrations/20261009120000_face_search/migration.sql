CREATE EXTENSION IF NOT EXISTS vector;
CREATE TYPE "public"."FaceIndexJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TABLE "public"."PhotoFace" (
  "id" TEXT NOT NULL,
  "photoId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "albumId" TEXT NOT NULL,
  "embedding" vector(4) NOT NULL,
  "detectionConfidence" DOUBLE PRECISION NOT NULL,
  "boundingBox" JSONB NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhotoFace_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."FaceIndexJob" (
  "id" TEXT NOT NULL,
  "photoId" TEXT NOT NULL,
  "status" "public"."FaceIndexJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FaceIndexJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhotoFace_photoId_modelVersion_key" ON "public"."PhotoFace"("photoId", "modelVersion");
CREATE INDEX "PhotoFace_eventId_modelVersion_idx" ON "public"."PhotoFace"("eventId", "modelVersion");
CREATE INDEX "PhotoFace_photoId_modelVersion_idx" ON "public"."PhotoFace"("photoId", "modelVersion");
CREATE INDEX "FaceIndexJob_status_createdAt_idx" ON "public"."FaceIndexJob"("status", "createdAt");
CREATE UNIQUE INDEX "FaceIndexJob_photoId_key" ON "public"."FaceIndexJob"("photoId");
ALTER TABLE "public"."PhotoFace" ADD CONSTRAINT "PhotoFace_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "public"."Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."FaceIndexJob" ADD CONSTRAINT "FaceIndexJob_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "public"."Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
