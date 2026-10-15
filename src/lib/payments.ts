import Stripe from "stripe";
import { prisma } from "./prisma";
import { PRODUCT_NAME } from "./product";

export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "REFUNDED";
export type WebhookPaymentResult = { providerPaymentId: string; paymentId: string; status: PaymentStatus | null; ignored?: boolean; dispute?: { providerDisputeId: string; providerEventId: string; status: "OPEN" | "WON" | "LOST"; amountCents: number; currency: string; reason?: string } };
export type CheckoutRequest = {
  paymentId: string;
  publicOrderCode: string;
  amountCents: number;
  platformFeeCents: number;
  connectedAccountId: string;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
};

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutRequest): Promise<{ checkoutUrl: string; providerPaymentId: string; providerCheckoutId: string }>;
  getPaymentStatus(id: string): Promise<PaymentStatus>;
  verifyWebhook(payload: string, signature: string): boolean;
  handleWebhook(payload: string, signature: string): Promise<WebhookPaymentResult>;
  refund(id: string, amountCents?: number, idempotencyKey?: string): Promise<{ providerRefundId: string }>;
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "STRIPE";
  private stripe: Stripe;

  constructor(stripeClient?: Stripe) {
    if (stripeClient) this.stripe = stripeClient;
    else {
      if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
  }

  async createCheckout(input: CheckoutRequest) {
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price_data: { currency: input.currency.toLowerCase(), product_data: { name: `${PRODUCT_NAME} order ${input.publicOrderCode}` }, unit_amount: input.amountCents }, quantity: 1 }],
      customer_email: input.customerEmail,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { strideframeOrderCode: input.publicOrderCode, paymentId: input.paymentId },
      payment_intent_data: {
        application_fee_amount: input.platformFeeCents,
        transfer_data: { destination: input.connectedAccountId },
        metadata: { strideframeOrderCode: input.publicOrderCode, paymentId: input.paymentId },
      },
    }, { idempotencyKey: input.paymentId });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { checkoutUrl: session.url, providerPaymentId: typeof session.payment_intent === "string" ? session.payment_intent : session.id, providerCheckoutId: session.id };
  }

  async getPaymentStatus(id: string): Promise<PaymentStatus> {
    const intent = await this.stripe.paymentIntents.retrieve(id);
    return intent.status === "succeeded" ? "SUCCEEDED" : intent.status === "processing" ? "PENDING" : "FAILED";
  }

  verifyWebhook(payload: string, signature: string) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is required");
    try { this.stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET); return true; } catch { return false; }
  }

  async handleWebhook(payload: string, signature: string): Promise<WebhookPaymentResult> {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is required");
    const event = this.stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
    if (["charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"].includes(event.type)) {
      const dispute = event.data.object as Stripe.Dispute;
      const status = event.type !== "charge.dispute.closed" ? "OPEN" : dispute.status === "won" ? "WON" : "LOST";
      const providerPaymentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : typeof dispute.charge === "string" ? dispute.charge : "";
      return { providerPaymentId, paymentId: "", status: null, dispute: { providerDisputeId: dispute.id, providerEventId: event.id, status, amountCents: dispute.amount, currency: dispute.currency.toUpperCase(), reason: dispute.reason || undefined } };
    }
    if (!["checkout.session.completed", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) return { providerPaymentId: event.id, paymentId: "", status: null, ignored: true };
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.metadata?.paymentId;
    if (!paymentId) throw new Error(`Missing ${PRODUCT_NAME} payment metadata`);
    const providerPaymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
    const status: PaymentStatus = event.type === "checkout.session.completed" ? (session.payment_status === "paid" ? "SUCCEEDED" : "PENDING") : event.type === "checkout.session.async_payment_failed" ? "FAILED" : "CANCELLED";
    return { providerPaymentId, paymentId, status };
  }

  async refund(id: string, amountCents?: number, idempotencyKey?: string) {
    const refund = await this.stripe.refunds.create({ payment_intent: id, ...(amountCents === undefined ? {} : { amount: amountCents }) }, idempotencyKey ? { idempotencyKey } : undefined);
    return { providerRefundId: refund.id };
  }
}

export function paymentProvider(): PaymentProvider {
  const provider = (process.env.PAYMENT_PROVIDER || "stripe").toLowerCase();
  if (provider !== "stripe") throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);
  return new StripePaymentProvider();
}

export async function markPaymentFromWebhook(input: { paymentId: string; providerPaymentId: string; status: PaymentStatus; connectedAccountId?: string }) {
  return prisma.$transaction(async tx => {
    const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { order: true } });
    if (!payment || payment.provider !== "STRIPE") throw new Error("Payment not found");
    if (payment.providerPaymentId && payment.providerPaymentId !== input.providerPaymentId) throw new Error("Provider payment mismatch");
    if (input.connectedAccountId && payment.connectedAccountId && payment.connectedAccountId !== input.connectedAccountId) throw new Error("Connected account mismatch");
    if (payment.amount !== payment.order.totalCents || payment.currency !== payment.order.currency) throw new Error("Payment amount or currency mismatch");

    const alreadyFinal = payment.status === "SUCCEEDED" || payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED" || payment.status === "DISPUTED";
    if (alreadyFinal && input.status !== payment.status) return payment;
    const updated = await tx.payment.update({ where: { id: payment.id }, data: { providerPaymentId: input.providerPaymentId, status: input.status, paidAt: input.status === "SUCCEEDED" ? payment.paidAt || new Date() : undefined }, include: { order: true } });
    if (input.status === "SUCCEEDED" && updated.order.status !== "PAID" && updated.order.status !== "REFUNDED") await tx.order.updateMany({ where: { id: payment.orderId, status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED"] } }, data: { status: "PAID" } });
    if (input.status === "FAILED") await tx.order.updateMany({ where: { id: payment.orderId, status: "PENDING_PAYMENT" }, data: { status: "PAYMENT_FAILED" } });
    if (input.status === "CANCELLED") await tx.order.updateMany({ where: { id: payment.orderId, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } });
    return updated;
  });
}
