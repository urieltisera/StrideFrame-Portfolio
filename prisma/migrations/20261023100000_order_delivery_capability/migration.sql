-- CreateEnum
CREATE TYPE "OrderDeliveryCapabilityStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "OrderDeliveryCapability" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "OrderDeliveryCapabilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "OrderDeliveryCapability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderDeliveryCapability_orderId_key" ON "OrderDeliveryCapability"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderDeliveryCapability_tokenHash_key" ON "OrderDeliveryCapability"("tokenHash");

-- CreateIndex
CREATE INDEX "OrderDeliveryCapability_status_expiresAt_idx" ON "OrderDeliveryCapability"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "OrderDeliveryCapability" ADD CONSTRAINT "OrderDeliveryCapability_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
