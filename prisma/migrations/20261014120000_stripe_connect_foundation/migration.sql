-- SF-PAY-02: additive Stripe Connect destination-charge foundation.
CREATE TYPE "public"."StripeConnectStatus" AS ENUM ('ONBOARDING', 'READY', 'RESTRICTED', 'DISABLED');

CREATE TABLE "public"."StripeConnectAccount" (
    "id" TEXT NOT NULL,
    "photographerId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "status" "public"."StripeConnectStatus" NOT NULL DEFAULT 'ONBOARDING',
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "currentlyDue" JSONB,
    "disabledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeConnectAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeConnectAccount_photographerId_key" ON "public"."StripeConnectAccount"("photographerId");
CREATE UNIQUE INDEX "StripeConnectAccount_stripeAccountId_key" ON "public"."StripeConnectAccount"("stripeAccountId");

ALTER TABLE "public"."StripeConnectAccount"
  ADD CONSTRAINT "StripeConnectAccount_photographerId_fkey"
  FOREIGN KEY ("photographerId") REFERENCES "public"."Photographer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."Payment"
  ADD COLUMN "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "photographerProceedsCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "connectedAccountId" TEXT,
  ADD COLUMN "providerChargeId" TEXT,
  ADD COLUMN "providerApplicationFeeId" TEXT;

CREATE UNIQUE INDEX "DownloadGrant_orderId_key" ON "public"."DownloadGrant"("orderId");

ALTER TABLE "public"."PaymentWebhookEvent"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "processedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
