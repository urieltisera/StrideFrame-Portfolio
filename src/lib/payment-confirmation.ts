import type { Prisma } from "@prisma/client";
import { ensureDownloadGrant } from "./downloads";
import { ensureOrderDeliveryCapability } from "./delivery-capabilities";

export async function finalizeConfirmedPayment(tx: Prisma.TransactionClient, input: { paymentId: string; providerPaymentId?: string; connectedAccountId?: string }) {
  const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { order: true } });
  if (!payment) throw new Error("Payment not found");
  if (input.providerPaymentId && payment.providerPaymentId && payment.providerPaymentId !== input.providerPaymentId) throw new Error("Provider payment mismatch");
  if (input.connectedAccountId && payment.connectedAccountId && payment.connectedAccountId !== input.connectedAccountId) throw new Error("Connected account mismatch");
  if (payment.amount !== payment.order.totalCents || payment.currency !== payment.order.currency) throw new Error("Payment amount or currency mismatch");
  if (payment.status === "SUCCEEDED") return { payment, order: payment.order, entitlement: null, token: null, idempotent: true };
  if (payment.status !== "PENDING" && payment.status !== "AWAITING_PAYMENT_CONFIRMATION") throw new Error("Payment is not awaiting confirmation");

  const updatedPayment = await tx.payment.update({ where: { id: payment.id }, data: { providerPaymentId: input.providerPaymentId || payment.providerPaymentId, status: "SUCCEEDED", paidAt: payment.paidAt || new Date() } });
  await tx.order.updateMany({ where: { id: payment.orderId, status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED", "AWAITING_PAYMENT_CONFIRMATION"] } }, data: { status: "PAID" } });
  const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
  const entitlement = await ensureDownloadGrant(tx, payment.orderId, { defaultTtlHours: payment.provider === "ZELLE" ? 72 : undefined });
  const delivery = await ensureOrderDeliveryCapability(tx, payment.orderId);
  return { payment: updatedPayment, order: updatedOrder, entitlement: entitlement.grant, token: entitlement.token, deliveryToken: delivery.token, idempotent: false };
}
