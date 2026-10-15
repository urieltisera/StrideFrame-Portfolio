import { prisma } from "./prisma";
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
    } else if (input.status === "LOST") {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: "REFUNDED" } });
      await tx.downloadGrant.updateMany({ where: { orderId: payment.orderId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
    } else {
      await tx.payment.updateMany({ where: { id: payment.id, status: "DISPUTED" }, data: { status: "SUCCEEDED" } });
      await tx.order.updateMany({ where: { id: payment.orderId, status: "PAYMENT_DISPUTED" }, data: { status: "PAID" } });
    }
    return { dispute, idempotent: false };
  });
}
