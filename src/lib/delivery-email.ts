import type { Prisma, TransactionalEmailOutbox } from "@prisma/client";
import { issueOrderDeliveryCapability } from "./delivery-capabilities";
import { prisma } from "./prisma";
import { sendTransactionalEmail, transactionalEmailConfiguration, type TransactionalEmailTransport } from "./email";

const MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 10;
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Email delivery failed";
  return message.replace(/https?:\/\/\S+/gi, "[url]").replace(/[\r\n\t]/g, " ").slice(0, 240) || "Email delivery failed";
}

function retryDelayMs(attemptCount: number) {
  return Math.min(24 * 60 * 60 * 1000, 60 * 1000 * 2 ** Math.max(0, attemptCount - 1));
}

function deliveryBaseUrl() {
  const configured = process.env.PUBLIC_BASE_URL;
  if (!configured) throw new Error("PUBLIC_BASE_URL is required for delivery email");
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("PUBLIC_BASE_URL must use HTTP or HTTPS");
  return url;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function ensureDeliveryEmailOutbox(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { payment: true } });
  if (!order || !["PAID", "PARTIALLY_REFUNDED"].includes(order.status) || !order.payment || !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(order.payment.status)) throw new Error("Delivery email is not available for this order");
  return tx.transactionalEmailOutbox.upsert({
    where: { kind_orderId: { kind: "PAID_PHOTO_DELIVERY", orderId } },
    create: { kind: "PAID_PHOTO_DELIVERY", orderId, recipient: order.customerEmail },
    update: {},
  });
}

function messageForOrder(recipient: string, deliveryUrl: string) {
  const escapedUrl = escapeHtml(deliveryUrl);
  return {
    to: recipient,
    subject: "Your StrideFrame photos are ready",
    text: `Payment confirmed. Your StrideFrame photos are ready. View & download photos: ${deliveryUrl}`,
    html: `<p>Payment confirmed.</p><p>Your StrideFrame photos are ready.</p><p><a href="${escapedUrl}">View &amp; download photos</a></p>`,
  } as const;
}

async function claimNext(now: Date) {
  return prisma.$transaction(async tx => {
    const staleProcessingAt = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);
    const candidate = await tx.transactionalEmailOutbox.findFirst({ where: { OR: [{ status: "PENDING", nextAttemptAt: { lte: now } }, { status: "PROCESSING", lastAttemptAt: { lte: staleProcessingAt } }] }, orderBy: { createdAt: "asc" } });
    if (!candidate) return null;
    const claimed = await tx.transactionalEmailOutbox.updateMany({ where: { id: candidate.id, status: candidate.status }, data: { status: "PROCESSING", attemptCount: { increment: 1 }, lastAttemptAt: now } });
    return claimed.count === 1 ? candidate.id : null;
  });
}

async function markFailure(id: string, attemptCount: number, error: unknown, now: Date) {
  const terminal = attemptCount >= MAX_ATTEMPTS;
  await prisma.transactionalEmailOutbox.update({ where: { id }, data: { status: terminal ? "FAILED" : "PENDING", nextAttemptAt: new Date(now.getTime() + retryDelayMs(attemptCount)), lastError: sanitizeError(error) } });
  return terminal ? "FAILED" : "RETRYABLE";
}

async function processClaimed(id: string, now: Date, transport?: TransactionalEmailTransport) {
  const job = await prisma.transactionalEmailOutbox.findUnique({ where: { id }, include: { order: { include: { payment: true, items: { where: { refundedAt: null }, select: { id: true } } } } } });
  if (!job) return "MISSING" as const;
  const eligible = ["PAID", "PARTIALLY_REFUNDED"].includes(job.order.status) && Boolean(job.order.payment && ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(job.order.payment.status)) && job.order.items.length > 0;
  if (!eligible) {
    await prisma.transactionalEmailOutbox.update({ where: { id }, data: { status: "FAILED", lastError: "Order is not eligible for delivery email" } });
    return "INELIGIBLE" as const;
  }

  try {
    if (!transport && !transactionalEmailConfiguration().available) throw new Error("CONFIGURATION_REQUIRED");
    const baseUrl = deliveryBaseUrl();
    const capability = await issueOrderDeliveryCapability(job.orderId);
    const url = new URL(`/delivery/${capability.token}`, baseUrl).toString();
    const result = await sendTransactionalEmail(messageForOrder(job.recipient, url), transport);
    if (!result.delivered) throw new Error(result.error || "Email delivery failed");
    await prisma.transactionalEmailOutbox.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
    return "SENT" as const;
  } catch (error) {
    return markFailure(id, job.attemptCount, error, now);
  }
}

export async function processPendingDeliveryEmails(options: { limit?: number; now?: Date; transport?: TransactionalEmailTransport } = {}) {
  const limit = Math.max(1, Math.min(options.limit || DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE));
  const now = options.now || new Date();
  const results: Array<Awaited<ReturnType<typeof processClaimed>>> = [];
  for (let index = 0; index < limit; index += 1) {
    const id = await claimNext(now);
    if (!id) break;
    results.push(await processClaimed(id, now, options.transport));
  }
  return { processed: results.length, results };
}

export type DeliveryEmailOutboxRecord = TransactionalEmailOutbox;
