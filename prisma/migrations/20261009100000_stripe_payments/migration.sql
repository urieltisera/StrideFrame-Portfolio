ALTER TYPE "public"."PaymentStatus" RENAME VALUE 'APPROVED' TO 'SUCCEEDED';
ALTER TYPE "public"."PaymentStatus" RENAME VALUE 'REJECTED' TO 'FAILED';
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'CANCELLED';
ALTER TABLE "Payment" ADD COLUMN "providerCheckoutId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Payment" ADD COLUMN "paidAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
