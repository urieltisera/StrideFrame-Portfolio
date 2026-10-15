-- SF-PAY-03: additive photographer-owned provider settings and safe Zelle state.
ALTER TYPE "public"."OrderStatus" ADD VALUE 'AWAITING_PAYMENT_CONFIRMATION';
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'AWAITING_PAYMENT_CONFIRMATION';

CREATE TABLE "public"."PhotographerPaymentSettings" (
    "id" TEXT NOT NULL,
    "photographerId" TEXT NOT NULL,
    "stripeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "zelleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "zelleDisplayName" TEXT,
    "zellePaymentIdentifier" TEXT,
    "zelleInstructions" TEXT,
    "zelleQrKey" TEXT,
    "zelleQrContentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotographerPaymentSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhotographerPaymentSettings_photographerId_key" ON "public"."PhotographerPaymentSettings"("photographerId");
CREATE UNIQUE INDEX "PhotographerPaymentSettings_zelleQrKey_key" ON "public"."PhotographerPaymentSettings"("zelleQrKey");

ALTER TABLE "public"."PhotographerPaymentSettings"
  ADD CONSTRAINT "PhotographerPaymentSettings_photographerId_fkey"
  FOREIGN KEY ("photographerId") REFERENCES "public"."Photographer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
