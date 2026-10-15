-- SF-COM-02: fixed $0.25 StrideFrame fee per sold photo and Zelle obligation foundation.
CREATE TYPE "public"."ZelleFeeSettlementStatus" AS ENUM ('OPEN', 'ROLLED_FORWARD', 'INVOICED', 'PAID', 'VOID');

ALTER TABLE "public"."Payment"
  ADD COLUMN "billablePhotoCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "platformFeePerPhotoCents" INTEGER NOT NULL DEFAULT 25;

-- Preserve historical payment amounts while deriving the trusted licensed-photo
-- count for existing orders. New payments snapshot the fixed fee below.
UPDATE "public"."Payment" AS payment
SET "billablePhotoCount" = counts.photo_count
FROM (
  SELECT "orderId", COUNT(*)::INTEGER AS photo_count
  FROM "public"."OrderItem"
  GROUP BY "orderId"
) AS counts
WHERE payment."orderId" = counts."orderId";

CREATE TABLE "public"."ZelleFeeObligation" (
    "id" TEXT NOT NULL,
    "photographerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "billablePhotoCount" INTEGER NOT NULL,
    "feePerPhotoCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "public"."ZelleFeeSettlementStatus" NOT NULL DEFAULT 'OPEN',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZelleFeeObligation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZelleFeeObligation_orderId_key" ON "public"."ZelleFeeObligation"("orderId");
CREATE UNIQUE INDEX "ZelleFeeObligation_paymentId_key" ON "public"."ZelleFeeObligation"("paymentId");
CREATE INDEX "ZelleFeeObligation_photographerId_status_earnedAt_idx" ON "public"."ZelleFeeObligation"("photographerId", "status", "earnedAt");
CREATE INDEX "ZelleFeeObligation_status_earnedAt_idx" ON "public"."ZelleFeeObligation"("status", "earnedAt");

ALTER TABLE "public"."ZelleFeeObligation"
  ADD CONSTRAINT "ZelleFeeObligation_photographerId_fkey"
  FOREIGN KEY ("photographerId") REFERENCES "public"."Photographer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ZelleFeeObligation"
  ADD CONSTRAINT "ZelleFeeObligation_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ZelleFeeObligation"
  ADD CONSTRAINT "ZelleFeeObligation_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
