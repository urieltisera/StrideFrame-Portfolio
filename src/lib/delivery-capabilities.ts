import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const DEFAULT_TTL_HOURS = 168;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createDeliveryCapabilityToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function ttlHours() {
  const value = Number(process.env.ORDER_DELIVERY_CAPABILITY_TTL_HOURS || DEFAULT_TTL_HOURS);
  if (!Number.isFinite(value) || value <= 0) throw new Error("ORDER_DELIVERY_CAPABILITY_TTL_HOURS must be positive");
  return value;
}

function eligibleOrderStatus(status: string) {
  return status === "PAID" || status === "PARTIALLY_REFUNDED";
}

async function createOrRotateCapability(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { payment: true } });
  if (!order || !eligibleOrderStatus(order.status) || !order.payment || !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(order.payment.status)) {
    throw new Error("Delivery is not available for this order");
  }

  const token = createDeliveryCapabilityToken();
  const expiresAt = new Date(Date.now() + ttlHours() * 60 * 60 * 1000);
  const existing = await tx.orderDeliveryCapability.findUnique({ where: { orderId } });
  const capability = existing
    ? await tx.orderDeliveryCapability.update({ where: { id: existing.id }, data: { tokenHash: hashToken(token), status: "ACTIVE", expiresAt, lastUsedAt: null } })
    : await tx.orderDeliveryCapability.create({ data: { orderId, tokenHash: hashToken(token), status: "ACTIVE", expiresAt } });

  return { capability, token };
}

export async function issueOrderDeliveryCapability(orderId: string) {
  return prisma.$transaction(tx => createOrRotateCapability(tx, orderId));
}

export async function ensureOrderDeliveryCapability(tx: Prisma.TransactionClient, orderId: string) {
  return createOrRotateCapability(tx, orderId);
}

export async function redeemOrderDeliveryCapability(token: string) {
  if (!token) throw new Error("Delivery unavailable");
  const tokenHash = hashToken(token);
  return prisma.$transaction(async tx => {
    const capability = await tx.orderDeliveryCapability.findUnique({ where: { tokenHash }, include: { order: { include: { payment: true } } } });
    if (!capability || capability.status !== "ACTIVE" || capability.expiresAt <= new Date() || !eligibleOrderStatus(capability.order.status) || !capability.order.payment || !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(capability.order.payment.status)) {
      throw new Error("Delivery unavailable");
    }
    await tx.orderDeliveryCapability.update({ where: { id: capability.id }, data: { lastUsedAt: new Date() } });
    return { capabilityId: capability.id, orderId: capability.orderId, publicOrderCode: capability.order.publicOrderCode, expiresAt: capability.expiresAt };
  });
}

export function deliveryCapabilityTokenHash(token: string) {
  return hashToken(token);
}
