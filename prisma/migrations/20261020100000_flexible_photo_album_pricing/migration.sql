-- Preserve every legacy Photo.priceCents value while moving current pricing
-- to Album.priceCents plus an optional Photo.priceOverrideCents.
ALTER TABLE "public"."Album"
  ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 1500;

ALTER TABLE "public"."Photo"
  ADD COLUMN "priceOverrideCents" INTEGER;

-- A deterministic album default is the minimum legacy price in that album.
-- Photos that differed retain their exact historical current price as an
-- override. Albums without photos keep the schema default.
WITH "legacyAlbumPrices" AS (
  SELECT "albumId", MIN("priceCents") AS "priceCents"
  FROM "public"."Photo"
  GROUP BY "albumId"
)
UPDATE "public"."Album" AS a
SET "priceCents" = p."priceCents"
FROM "legacyAlbumPrices" AS p
WHERE a."id" = p."albumId";

UPDATE "public"."Photo" AS p
SET "priceOverrideCents" = p."priceCents"
FROM "public"."Album" AS a
WHERE p."albumId" = a."id"
  AND p."priceCents" <> a."priceCents";

ALTER TABLE "public"."Photo"
  DROP COLUMN "priceCents";
