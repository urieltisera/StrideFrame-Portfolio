-- SF-PAY-04: auditable, photographer-authorized Zelle decisions.
CREATE TYPE "public"."ManualPaymentAction" AS ENUM ('CONFIRMED', 'REJECTED');

CREATE TABLE "public"."ManualPaymentAudit" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "photographerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "action" "public"."ManualPaymentAction" NOT NULL,
    "previousOrderStatus" "public"."OrderStatus" NOT NULL,
    "resultingOrderStatus" "public"."OrderStatus" NOT NULL,
    "previousPaymentStatus" "public"."PaymentStatus" NOT NULL,
    "resultingPaymentStatus" "public"."PaymentStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPaymentAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualPaymentAudit_paymentId_action_key" ON "public"."ManualPaymentAudit"("paymentId", "action");
CREATE INDEX "ManualPaymentAudit_photographerId_action_createdAt_idx" ON "public"."ManualPaymentAudit"("photographerId", "action", "createdAt");
CREATE INDEX "ManualPaymentAudit_orderId_createdAt_idx" ON "public"."ManualPaymentAudit"("orderId", "createdAt");

ALTER TABLE "public"."ManualPaymentAudit"
  ADD CONSTRAINT "ManualPaymentAudit_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ManualPaymentAudit"
  ADD CONSTRAINT "ManualPaymentAudit_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ManualPaymentAudit"
  ADD CONSTRAINT "ManualPaymentAudit_photographerId_fkey"
  FOREIGN KEY ("photographerId") REFERENCES "public"."Photographer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
