import { prisma } from "./prisma";
import { calculatePlatformFeeCents, platformFeePerPhotoCents } from "./commission";
import { finalizeConfirmedPayment } from "./payment-confirmation";

const MAX_NOTE_LENGTH = 500;

function noteValue(note?: string) {
  const value = note?.trim();
  if (value && value.length > MAX_NOTE_LENGTH) throw new Error("Manual payment note is too long");
  return value || null;
}

export async function listAwaitingZelleOrders(photographerId: string) {
  return prisma.order.findMany({
    where: { photographerId, status: "AWAITING_PAYMENT_CONFIRMATION", payment: { is: { provider: "ZELLE", status: "AWAITING_PAYMENT_CONFIRMATION" } } },
    include: { payment: true, items: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getOwnedZelleOrder(photographerId: string, orderId: string) {
  return prisma.order.findFirst({ where: { id: orderId, photographerId, payment: { is: { provider: "ZELLE" } } }, include: { payment: true, items: { include: { photo: true } } } });
}

export async function confirmManualPayment(input: { photographerId: string; orderId: string; note?: string }) {
  return decideManualPayment({ ...input, action: "CONFIRMED" });
}

export async function rejectManualPayment(input: { photographerId: string; orderId: string; note?: string }) {
  return decideManualPayment({ ...input, action: "REJECTED" });
}

async function decideManualPayment(input: { photographerId: string; orderId: string; note?: string; action: "CONFIRMED" | "REJECTED" }) {
  const note = noteValue(input.note);
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: input.orderId, photographerId: input.photographerId }, include: { payment: true } });
    if (!order || !order.payment) throw new Error("Zelle order not found");
    const payment = order.payment;
    if (payment.provider !== "ZELLE") throw new Error("Manual confirmation is only available for Zelle");
    const previousAction = await tx.manualPaymentAudit.findUnique({ where: { paymentId_action: { paymentId: payment.id, action: input.action } } });
    if (previousAction) return { order, payment, audit: previousAction, idempotent: true };
    if (order.currency !== "USD" || payment.amount !== order.totalCents || payment.currency !== order.currency || !Number.isSafeInteger(payment.amount) || payment.amount < 0) throw new Error("Payment amount or currency mismatch");
    if (payment.billablePhotoCount < 0 || payment.platformFeePerPhotoCents !== platformFeePerPhotoCents() || payment.platformFeeCents !== calculatePlatformFeeCents(payment.billablePhotoCount, payment.platformFeePerPhotoCents)) throw new Error("Platform fee snapshot is invalid");
    if (order.status !== "AWAITING_PAYMENT_CONFIRMATION" || payment.status !== "AWAITING_PAYMENT_CONFIRMATION") throw new Error("Zelle payment is not awaiting confirmation");

    const resultingOrderStatus = input.action === "CONFIRMED" ? "PAID" : "CANCELLED";
    const resultingPaymentStatus = input.action === "CONFIRMED" ? "SUCCEEDED" : "CANCELLED";
    const finalized = input.action === "CONFIRMED" ? await finalizeConfirmedPayment(tx, { paymentId: payment.id }) : null;
    if (input.action === "REJECTED") {
      const paymentTransition = await tx.payment.updateMany({ where: { id: payment.id, status: "AWAITING_PAYMENT_CONFIRMATION" }, data: { status: resultingPaymentStatus, paidAt: null } });
      const orderTransition = await tx.order.updateMany({ where: { id: order.id, status: "AWAITING_PAYMENT_CONFIRMATION" }, data: { status: resultingOrderStatus } });
      if (paymentTransition.count !== 1 || orderTransition.count !== 1) throw new Error("Zelle payment is no longer awaiting confirmation");
    }
    const updatedPayment = finalized?.payment || await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const updatedOrder = finalized?.order || await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    const audit = await tx.manualPaymentAudit.create({ data: { orderId: order.id, paymentId: payment.id, photographerId: input.photographerId, provider: payment.provider, action: input.action, previousOrderStatus: order.status, resultingOrderStatus, previousPaymentStatus: payment.status, resultingPaymentStatus, note } });

    if (input.action === "CONFIRMED") {
      await tx.zelleFeeObligation.upsert({ where: { paymentId: payment.id }, create: { photographerId: input.photographerId, orderId: order.id, paymentId: payment.id, billablePhotoCount: payment.billablePhotoCount, feePerPhotoCents: payment.platformFeePerPhotoCents, amountCents: payment.platformFeeCents, currency: payment.currency, status: "OPEN" }, update: {} });
    }
    return { order: updatedOrder, payment: updatedPayment, audit, idempotent: false };
  });
}

export async function getZelleFeeSummary(photographerId: string) {
  const obligations = await prisma.zelleFeeObligation.findMany({ where: { photographerId, status: { in: ["OPEN", "ROLLED_FORWARD", "INVOICED"] } }, select: { amountCents: true, currency: true, status: true, reversals: { select: { amountCents: true } } } });
  return { amountCents: obligations.reduce((sum, obligation) => sum + obligation.amountCents - obligation.reversals.reduce((reversed, item) => reversed + item.amountCents, 0), 0), currency: obligations[0]?.currency || "USD", count: obligations.length, statuses: obligations.map((obligation) => obligation.status) };
}
