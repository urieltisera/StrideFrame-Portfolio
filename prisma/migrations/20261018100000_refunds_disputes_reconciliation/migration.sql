-- SF-PAY-06: additive refund, dispute, entitlement, and reconciliation foundation.
ALTER TYPE "public"."OrderStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "public"."OrderStatus" ADD VALUE 'PAYMENT_DISPUTED';
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'DISPUTED';

CREATE TYPE "public"."RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'MANUAL_PENDING', 'MANUAL_COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "public"."DisputeStatus" AS ENUM ('OPEN', 'WON', 'LOST');

ALTER TABLE "public"."OrderItem" ADD COLUMN "refundedAt" TIMESTAMP(3);

CREATE TABLE "public"."Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "platformFeeReversalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "public"."RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "providerRefundId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."RefundItem" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "platformFeeReversalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefundItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ZelleFeeObligationReversal" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "billablePhotoCount" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZelleFeeObligationReversal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."PaymentDispute" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerDisputeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "public"."DisputeStatus" NOT NULL,
    "reason" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "PaymentDispute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."PaymentDisputeEvent" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "status" "public"."DisputeStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentDisputeEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "public"."Refund"("providerRefundId");
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "public"."Refund"("idempotencyKey");
CREATE INDEX "Refund_orderId_status_createdAt_idx" ON "public"."Refund"("orderId", "status", "createdAt");
CREATE INDEX "Refund_paymentId_status_createdAt_idx" ON "public"."Refund"("paymentId", "status", "createdAt");
CREATE UNIQUE INDEX "RefundItem_orderItemId_key" ON "public"."RefundItem"("orderItemId");
CREATE INDEX "RefundItem_refundId_idx" ON "public"."RefundItem"("refundId");
CREATE UNIQUE INDEX "ZelleFeeObligationReversal_refundId_key" ON "public"."ZelleFeeObligationReversal"("refundId");
CREATE INDEX "ZelleFeeObligationReversal_obligationId_createdAt_idx" ON "public"."ZelleFeeObligationReversal"("obligationId", "createdAt");
CREATE UNIQUE INDEX "PaymentDispute_providerDisputeId_key" ON "public"."PaymentDispute"("providerDisputeId");
CREATE INDEX "PaymentDispute_paymentId_status_openedAt_idx" ON "public"."PaymentDispute"("paymentId", "status", "openedAt");
CREATE INDEX "PaymentDispute_orderId_status_openedAt_idx" ON "public"."PaymentDispute"("orderId", "status", "openedAt");
CREATE UNIQUE INDEX "PaymentDisputeEvent_providerEventId_key" ON "public"."PaymentDisputeEvent"("providerEventId");
CREATE INDEX "PaymentDisputeEvent_disputeId_createdAt_idx" ON "public"."PaymentDisputeEvent"("disputeId", "createdAt");

ALTER TABLE "public"."Refund"
  ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."RefundItem"
  ADD CONSTRAINT "RefundItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "public"."Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RefundItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "public"."OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ZelleFeeObligationReversal"
  ADD CONSTRAINT "ZelleFeeObligationReversal_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "public"."ZelleFeeObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ZelleFeeObligationReversal_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "public"."Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."PaymentDispute"
  ADD CONSTRAINT "PaymentDispute_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentDispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."PaymentDisputeEvent"
  ADD CONSTRAINT "PaymentDisputeEvent_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "public"."PaymentDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
