import { prisma } from "./prisma";
import { calculatePlatformFeeCents } from "./commission";

export type ReconciliationIssue = {
  type: "MISSING_PROVIDER_CHARGE" | "FEE_MISMATCH" | "OPEN_ZELLE_OBLIGATION" | "PENDING_REFUND" | "STATE_MISMATCH";
  orderId: string;
  paymentId?: string;
  detail: string;
};

export async function findReconciliationIssues(photographerId?: string): Promise<ReconciliationIssue[]> {
  const payments = await prisma.payment.findMany({
    where: photographerId ? { order: { photographerId } } : undefined,
    include: { order: { include: { items: true } }, zelleFeeObligation: { include: { reversals: true } }, refunds: { where: { status: { in: ["PENDING", "MANUAL_PENDING"] } } } },
  });
  const issues: ReconciliationIssue[] = [];
  for (const payment of payments) {
    if (payment.provider === "STRIPE" && payment.status === "SUCCEEDED" && !payment.providerChargeId) issues.push({ type: "MISSING_PROVIDER_CHARGE", orderId: payment.orderId, paymentId: payment.id, detail: "Paid Stripe payment is missing providerChargeId" });
    if (payment.status === "SUCCEEDED" && payment.platformFeeCents !== calculatePlatformFeeCents(payment.billablePhotoCount, payment.platformFeePerPhotoCents)) issues.push({ type: "FEE_MISMATCH", orderId: payment.orderId, paymentId: payment.id, detail: "Stored platform fee differs from its immutable photo-count snapshot" });
    if (payment.provider === "ZELLE" && payment.zelleFeeObligation?.status === "OPEN") issues.push({ type: "OPEN_ZELLE_OBLIGATION", orderId: payment.orderId, paymentId: payment.id, detail: "Confirmed Zelle sale has an unsettled fee obligation" });
    if (payment.refunds.length) issues.push({ type: "PENDING_REFUND", orderId: payment.orderId, paymentId: payment.id, detail: "Refund is awaiting provider or photographer completion" });
    const orderShouldBePaid = payment.status === "SUCCEEDED" || payment.status === "PARTIALLY_REFUNDED";
    if (orderShouldBePaid && !["PAID", "PARTIALLY_REFUNDED"].includes(payment.order.status)) issues.push({ type: "STATE_MISMATCH", orderId: payment.orderId, paymentId: payment.id, detail: "Payment and order paid states do not agree" });
  }
  return issues;
}
