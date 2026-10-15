import { prisma } from "./prisma";
import { calculatePlatformFeeCents, calculateProceedsCents, platformFeePerPhotoCents } from "./commission";
import { isStripeConnectReady, syncStripeConnectAccount } from "./stripe-connect";
import { paymentProvider, markPaymentFromWebhook } from "./payments";
import { getAvailablePaymentMethods } from "./payment-settings";

async function getOrCreatePayment(input: { orderId: string; provider: string; amount: number; currency: string; billablePhotoCount: number; platformFeePerPhotoCents: number; platformFeeCents: number; photographerProceedsCents: number; connectedAccountId?: string }) {
  const existing = await prisma.payment.findUnique({ where: { orderId: input.orderId } });
  if (existing) {
    if (existing.status !== "PENDING") throw new Error("Payment is no longer payable");
    if (existing.provider !== input.provider) throw new Error("Payment provider cannot change after order payment starts");
    if (existing.providerCheckoutId && (existing.amount !== input.amount || existing.currency !== input.currency || existing.connectedAccountId !== input.connectedAccountId || existing.billablePhotoCount !== input.billablePhotoCount || existing.platformFeeCents !== input.platformFeeCents)) throw new Error("Payment configuration cannot change after Checkout starts");
    if (!existing.providerCheckoutId && existing.status === "PENDING") return prisma.payment.update({ where: { id: existing.id }, data: { amount: input.amount, currency: input.currency, billablePhotoCount: input.billablePhotoCount, platformFeePerPhotoCents: input.platformFeePerPhotoCents, platformFeeCents: input.platformFeeCents, photographerProceedsCents: input.photographerProceedsCents, connectedAccountId: input.connectedAccountId } });
    return existing;
  }
  try {
    return await prisma.payment.create({ data: { orderId: input.orderId, provider: input.provider, amount: input.amount, currency: input.currency, billablePhotoCount: input.billablePhotoCount, platformFeePerPhotoCents: input.platformFeePerPhotoCents, platformFeeCents: input.platformFeeCents, photographerProceedsCents: input.photographerProceedsCents, connectedAccountId: input.connectedAccountId, idempotencyKey: `order:${input.orderId}` } });
  } catch (error) {
    const raced = await prisma.payment.findUnique({ where: { orderId: input.orderId } });
    if (!raced) throw error;
    return raced;
  }
}

export async function initiatePayment(publicOrderCode: string) {
  const order = await prisma.order.findUnique({ where: { publicOrderCode }, include: { payment: true, photographer: true, items: { select: { id: true } } } });
  if (!order) throw new Error("Order not found");
  if (order.status !== "PENDING_PAYMENT") throw new Error("Order is not payable");
  if (!Number.isSafeInteger(order.totalCents) || order.totalCents < 0 || !order.currency) throw new Error("Order money is invalid");

  const connected = await syncStripeConnectAccount(order.photographerId);
  if (!connected || !isStripeConnectReady(connected)) throw new Error("Photographer Stripe account is not payment-ready");
  const available = await getAvailablePaymentMethods(order.photographerId);
  if (!available.stripe) throw new Error("Photographer Stripe payments are not currently available");
  const billablePhotoCount = order.items.length;
  const feePerPhotoCents = platformFeePerPhotoCents();
  const platformFeeCents = calculatePlatformFeeCents(billablePhotoCount, feePerPhotoCents);
  const photographerProceedsCents = calculateProceedsCents(order.totalCents, platformFeeCents);
  const payment = await getOrCreatePayment({ orderId: order.id, provider: "STRIPE", amount: order.totalCents, currency: order.currency, billablePhotoCount, platformFeePerPhotoCents: feePerPhotoCents, platformFeeCents, photographerProceedsCents, connectedAccountId: connected.stripeAccountId });
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) throw new Error("PUBLIC_BASE_URL is required");
  const session = await paymentProvider().createCheckout({ paymentId: payment.id, publicOrderCode: order.publicOrderCode, amountCents: payment.amount, platformFeeCents: payment.platformFeeCents, connectedAccountId: payment.connectedAccountId || connected.stripeAccountId, currency: payment.currency, customerEmail: order.customerEmail, successUrl: `${base}/order/${order.publicOrderCode}?checkout=return`, cancelUrl: `${base}/order/${order.publicOrderCode}?checkout=cancel` });
  await prisma.payment.update({ where: { id: payment.id }, data: { providerCheckoutId: session.providerCheckoutId, providerPaymentId: session.providerPaymentId } });
  return session.checkoutUrl;
}

export async function startZellePayment(publicOrderCode: string) {
  const order = await prisma.order.findUnique({ where: { publicOrderCode }, include: { payment: true, photographer: true, items: { select: { id: true } } } });
  if (!order) throw new Error("Order not found");
  if (order.status !== "PENDING_PAYMENT") throw new Error("Order is not payable");
  const available = await getAvailablePaymentMethods(order.photographerId);
  if (!available.zelle || !available.settings.zelleDisplayName || !available.settings.zellePaymentIdentifier) throw new Error("Photographer Zelle payments are not currently available");
  const billablePhotoCount = order.items.length;
  const feePerPhotoCents = platformFeePerPhotoCents();
  const platformFeeCents = calculatePlatformFeeCents(billablePhotoCount, feePerPhotoCents);
  const photographerProceedsCents = calculateProceedsCents(order.totalCents, platformFeeCents);
  const payment = await getOrCreatePayment({ orderId: order.id, provider: "ZELLE", amount: order.totalCents, currency: order.currency, billablePhotoCount, platformFeePerPhotoCents: feePerPhotoCents, platformFeeCents, photographerProceedsCents });
  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: "AWAITING_PAYMENT_CONFIRMATION" } }),
    prisma.order.update({ where: { id: order.id }, data: { status: "AWAITING_PAYMENT_CONFIRMATION" } }),
  ]);
  return { orderId: order.id, publicOrderCode: order.publicOrderCode, amountCents: order.totalCents, currency: order.currency, displayName: available.settings.zelleDisplayName, paymentIdentifier: available.settings.zellePaymentIdentifier, instructions: available.settings.zelleInstructions, qrKey: available.settings.zelleQrKey };
}

export async function validatePaymentSelection(publicOrderCode: string, provider: "stripe" | "zelle") {
  const order = await prisma.order.findUnique({ where: { publicOrderCode }, select: { photographerId: true, status: true } });
  if (!order || order.status !== "PENDING_PAYMENT") throw new Error("Order is not payable");
  const available = await getAvailablePaymentMethods(order.photographerId);
  if (provider === "stripe" && !available.stripe) throw new Error("Photographer Stripe payments are not currently available");
  if (provider === "zelle" && !available.zelle) throw new Error("Photographer Zelle payments are not currently available");
}

export async function processStripeWebhook(payload: string, signature: string) {
  const provider = paymentProvider();
  if (!provider.verifyWebhook(payload, signature)) throw new Error("Invalid webhook signature");
  let eventId: string;
  try { eventId = (JSON.parse(payload) as { id?: string }).id || ""; } catch { throw new Error("Invalid webhook payload"); }
  if (!eventId) throw new Error("Webhook event ID is required");

  const event = await prisma.paymentWebhookEvent.upsert({ where: { providerEventId: eventId }, create: { provider: "STRIPE", providerEventId: eventId, attempts: 1 }, update: { attempts: { increment: 1 }, lastError: null } });
  if (event.processedAt) return;
  try {
    const result = await provider.handleWebhook(payload, signature);
    if (result.status) await markPaymentFromWebhook({ paymentId: result.paymentId, providerPaymentId: result.providerPaymentId, status: result.status });
    await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), lastError: null } });
  } catch (error) {
    await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { lastError: error instanceof Error ? error.message : "Webhook processing failed" } });
    throw error;
  }
}
