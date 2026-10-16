ALTER TABLE "public"."Photographer"
  ADD COLUMN "publicSlug" TEXT,
  ADD COLUMN "publicProfileEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Photographer_publicSlug_key" ON "public"."Photographer"("publicSlug");
