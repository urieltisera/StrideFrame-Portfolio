import { prisma } from "./prisma";
import { requeueDeliveryEmailAfterDisputeWon } from "./delivery-email";
import { ensureDownloadGrant } from "./downloads";

export async function handleProviderDispute(input: {
  paymentId: string;
  providerDisputeId: string;
  providerEventId: string;
  status: "OPEN" | "WON" | "LOST";
  amountCents: number;
  currency: string;
  reason?: string;
}) {
  return prisma.$transaction(async tx => {
    const existingEvent = await tx.paymentDisputeEvent.findUnique({ where: { providerEventId: input.providerEventId }, include: { dispute: true } });
    if (existingEvent) return { dispute: existingEvent.dispute, idempotent: true };
    const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { order: true } });
    if (!payment || payment.provider !== "STRIPE") throw new Error("Stripe payment not found");
    if (payment.currency !== input.currency || input.amountCents < 0 || input.amountCents > payment.amount) throw new Error("Dispute amount or currency mismatch");
    const previousDispute = await tx.paymentDispute.findUnique({ where: { providerDisputeId: input.providerDisputeId } });
    const dispute = await tx.paymentDispute.upsert({
      where: { providerDisputeId: input.providerDisputeId },
      create: { paymentId: payment.id, orderId: payment.orderId, providerDisputeId: input.providerDisputeId, amountCents: input.amountCents, currency: input.currency, status: input.status, reason: input.reason || null, resolvedAt: input.status === "OPEN" ? null : new Date() },
      update: { status: input.status, reason: input.reason || undefined, resolvedAt: input.status === "OPEN" ? null : new Date() },
    });
    await tx.paymentDisputeEvent.create({ data: { disputeId: dispute.id, providerEventId: input.providerEventId, status: input.status } });
    if (input.status === "OPEN") {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED" } });
      await tx.order.updateMany({ where: { id: payment.orderId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, data: { status: "PAYMENT_DISPUTED" } });
      await tx.downloadGrant.updateMany({ where: { orderId: payment.orderId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
      await tx.orderDeliveryCapability.updateMany({ where: { orderId: payment.orderId, status: "ACTIVE" }, data: { status: "REVOKED" } });
    } else if (input.status === "LOST") {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: "REFUNDED" } });
      await tx.downloadGrant.updateMany({ where: { orderId: payment.orderId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
      await tx.orderDeliveryCapability.updateMany({ where: { orderId: payment.orderId, status: "ACTIVE" }, data: { status: "REVOKED" } });
    } else {
      const items = await tx.orderItem.findMany({ where: { orderId: payment.orderId }, select: { refundedAt: true } });
      const hasRefundedItems = items.some(item => item.refundedAt !== null);
      const fullyRefunded = items.length > 0 && items.every(item => item.refundedAt !== null);
      if (fullyRefunded) {
        await tx.payment.updateMany({ where: { id: payment.id, status: "DISPUTED" }, data: { status: "REFUNDED" } });
        await tx.order.updateMany({ where: { id: payment.orderId, status: "PAYMENT_DISPUTED" }, data: { status: "REFUNDED" } });
        await tx.downloadGrant.updateMany({ where: { orderId: payment.orderId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
        await tx.orderDeliveryCapability.updateMany({ where: { orderId: payment.orderId, status: "ACTIVE" }, data: { status: "REVOKED" } });
      } else if (payment.status === "DISPUTED" && payment.order.status === "PAYMENT_DISPUTED" && previousDispute?.status !== "WON") {
        const restoredPaymentStatus = hasRefundedItems ? ("PARTIALLY_REFUNDED" as const) : ("SUCCEEDED" as const);
        const restoredOrderStatus = hasRefundedItems ? ("PARTIALLY_REFUNDED" as const) : ("PAID" as const);
        await tx.payment.updateMany({ where: { id: payment.id, status: "DISPUTED" }, data: { status: restoredPaymentStatus } });
        await tx.order.updateMany({ where: { id: payment.orderId, status: "PAYMENT_DISPUTED" }, data: { status: restoredOrderStatus } });
        await tx.downloadGrant.updateMany({ where: { orderId: payment.orderId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
        await ensureDownloadGrant(tx, payment.orderId, { rotate: true });
        await tx.orderDeliveryCapability.updateMany({ where: { orderId: payment.orderId, status: "ACTIVE" }, data: { status: "REVOKED" } });
        await requeueDeliveryEmailAfterDisputeWon(tx, payment.orderId);
      }
    }
    return { dispute, idempotent: false };
  });
}
