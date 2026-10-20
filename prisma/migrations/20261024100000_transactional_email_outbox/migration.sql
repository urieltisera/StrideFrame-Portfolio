-- CreateEnum
CREATE TYPE "TransactionalEmailKind" AS ENUM ('PAID_PHOTO_DELIVERY');

-- CreateEnum
CREATE TYPE "TransactionalEmailStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "TransactionalEmailOutbox" (
    "id" TEXT NOT NULL,
    "kind" "TransactionalEmailKind" NOT NULL DEFAULT 'PAID_PHOTO_DELIVERY',
    "orderId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "TransactionalEmailStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionalEmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionalEmailOutbox_kind_orderId_key" ON "TransactionalEmailOutbox"("kind", "orderId");

-- CreateIndex
CREATE INDEX "TransactionalEmailOutbox_status_nextAttemptAt_idx" ON "TransactionalEmailOutbox"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "TransactionalEmailOutbox" ADD CONSTRAINT "TransactionalEmailOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
