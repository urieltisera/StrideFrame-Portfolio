import { prisma } from "./prisma";
import { paymentProvider } from "./payments";

type RefundSource = "STRIPE" | "ZELLE_MANUAL" | "DISPUTE";

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

async function prepareRefund(input: {
  orderId: string;
  itemIds?: string[];
  idempotencyKey: string;
  reason?: string;
  source: RefundSource;
  actorId?: string;
  photographerId?: string;
}) {
  const existing = await prisma.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true, order: { select: { photographerId: true } } } });
  if (existing) {
    if (existing.orderId !== input.orderId || existing.source !== input.source || (input.photographerId && existing.order.photographerId !== input.photographerId)) throw new Error("Refund idempotency key is not valid for this owner/order");
    return { refund: existing, idempotent: true };
  }

  return prisma.$transaction(async tx => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, ...(input.photographerId ? { photographerId: input.photographerId } : {}) },
      include: { payment: true, items: true },
    });
    if (!order || !order.payment) throw new Error("Order payment not found");
    const payment = order.payment;
    if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") throw new Error("Only completed payments can be refunded");
    if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED") throw new Error("Order is not refundable");
    if (input.source === "ZELLE_MANUAL" && payment.provider !== "ZELLE") throw new Error("Manual refund is only available for Zelle");
    if (input.source === "STRIPE" && payment.provider !== "STRIPE") throw new Error("Stripe refund requires a Stripe payment");

    const requestedIds = uniqueIds(input.itemIds || []);
    const selected = requestedIds.length
      ? order.items.filter(item => requestedIds.includes(item.id))
      : order.items.filter(item => !item.refundedAt);
    if (requestedIds.length > 0 && requestedIds.length !== selected.length) throw new Error("Refund item is not part of this order");
    if (!selected.length) throw new Error("No refundable photos remain");

    const conflicting = await tx.refundItem.findMany({ where: { orderItemId: { in: selected.map(item => item.id) } } });
    if (conflicting.length) throw new Error("One or more photos have already been refunded or are pending refund");
    const amountCents = selected.reduce((sum, item) => sum + item.unitPriceCents, 0);
    if (amountCents <= 0 || amountCents > payment.amount) throw new Error("Refund amount is invalid");
    const platformFeeReversalCents = selected.length * payment.platformFeePerPhotoCents;
    const status = input.source === "ZELLE_MANUAL" ? "MANUAL_PENDING" : "PENDING";
    const refund = await tx.refund.create({
      data: {
        orderId: order.id,
        paymentId: payment.id,
        provider: payment.provider,
        amountCents,
        platformFeeReversalCents,
        currency: payment.currency,
        status,
        reason: input.reason?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        source: input.source,
        actorId: input.actorId || null,
        items: { create: selected.map(item => ({ amountCents: item.unitPriceCents, platformFeeReversalCents: payment.platformFeePerPhotoCents, orderItemId: item.id })) },
      },
      include: { items: true },
    });
    return { refund, idempotent: false };
  });
}

export async function prepareManualZelleRefund(input: { photographerId: string; orderId: string; itemIds?: string[]; idempotencyKey: string; reason?: string }) {
  return prepareRefund({ ...input, source: "ZELLE_MANUAL", actorId: input.photographerId, photographerId: input.photographerId });
}

export async function prepareStripeRefund(input: { orderId: string; itemIds?: string[]; idempotencyKey: string; reason?: string }) {
  const prepared = await prepareRefund({ ...input, source: "STRIPE" });
  if (prepared.idempotent && prepared.refund.status !== "PENDING") return prepared;
  const payment = await prisma.payment.findUnique({ where: { orderId: input.orderId } });
  if (!payment?.providerPaymentId) throw new Error("Stripe payment identifier is missing");
  try {
    const providerRefund = await paymentProvider().refund(payment.providerPaymentId, prepared.refund.amountCents, input.idempotencyKey);
    return completeRefund({ refundId: prepared.refund.id, providerRefundId: providerRefund.providerRefundId });
  } catch (error) {
    await prisma.refund.updateMany({ where: { id: prepared.refund.id, status: "PENDING" }, data: { status: "FAILED" } });
    throw error;
  }
}

export async function completeManualZelleRefund(input: { photographerId: string; refundId: string; note?: string }) {
  const refund = await prisma.refund.findFirst({ where: { id: input.refundId, actorId: input.photographerId, source: "ZELLE_MANUAL" } });
  if (!refund) throw new Error("Refund not found");
  return completeRefund({ refundId: refund.id, note: input.note });
}

export async function completeRefund(input: { refundId: string; providerRefundId?: string; note?: string }) {
  return prisma.$transaction(async tx => {
    const refund = await tx.refund.findUnique({ where: { id: input.refundId }, include: { items: true, payment: true, order: { include: { items: true } } } });
    if (!refund) throw new Error("Refund not found");
    if (refund.status === "SUCCEEDED" || refund.status === "MANUAL_COMPLETED") return { refund, idempotent: true };
    if (refund.status !== "PENDING" && refund.status !== "MANUAL_PENDING") throw new Error("Refund is not awaiting completion");
    if (input.providerRefundId && refund.provider === "ZELLE") throw new Error("Zelle refunds do not have provider refund IDs");

    const completedStatus = refund.provider === "ZELLE" ? "MANUAL_COMPLETED" : "SUCCEEDED";
    const updated = await tx.refund.update({ where: { id: refund.id }, data: { status: completedStatus, providerRefundId: input.providerRefundId, completedAt: new Date(), reason: input.note ? `${refund.reason || ""}${refund.reason ? "\n" : ""}${input.note.trim()}` : refund.reason }, include: { items: true } });
    await tx.orderItem.updateMany({ where: { id: { in: refund.items.map(item => item.orderItemId) }, refundedAt: null }, data: { refundedAt: new Date() } });
    const currentItems = await tx.orderItem.findMany({ where: { orderId: refund.orderId }, select: { refundedAt: true } });
    const fullyRefunded = currentItems.length > 0 && currentItems.every(item => item.refundedAt);
    const nextPaymentStatus = fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED";
    const nextOrderStatus = fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await tx.payment.update({ where: { id: refund.paymentId }, data: { status: nextPaymentStatus } });
    await tx.order.update({ where: { id: refund.orderId }, data: { status: nextOrderStatus } });
    if (fullyRefunded) await tx.downloadGrant.updateMany({ where: { orderId: refund.orderId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });

    if (refund.provider === "ZELLE") {
      const obligation = await tx.zelleFeeObligation.findUnique({ where: { paymentId: refund.paymentId } });
      if (obligation) {
        await tx.zelleFeeObligationReversal.upsert({ where: { refundId: refund.id }, create: { obligationId: obligation.id, refundId: refund.id, billablePhotoCount: refund.items.length, amountCents: refund.platformFeeReversalCents, currency: refund.currency }, update: {} });
        if (fullyRefunded) await tx.zelleFeeObligation.update({ where: { id: obligation.id }, data: { status: "VOID", voidedAt: new Date() } });
      }
    }
    return { refund: updated, idempotent: false };
  });
}

export async function listPhotographerRefunds(photographerId: string) {
  return prisma.refund.findMany({ where: { order: { photographerId } }, include: { items: true, order: { select: { publicOrderCode: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
}
