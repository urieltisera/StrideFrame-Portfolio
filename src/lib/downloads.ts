import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const DEFAULT_TTL_HOURS = 24;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function ttlHours(defaultHours = DEFAULT_TTL_HOURS) {
  const value = Number(process.env.DOWNLOAD_GRANT_TTL_HOURS || defaultHours);
  if (!Number.isFinite(value) || value <= 0) throw new Error("DOWNLOAD_GRANT_TTL_HOURS must be positive");
  return value;
}

export async function createDownloadGrant(orderId: string, options: { rotate?: boolean } = {}) {
  const result = await prisma.$transaction(tx => ensureDownloadGrant(tx, orderId, options));
  if (result.reused && !options.rotate) return null;
  return { token: result.token!, expiresAt: result.expiresAt };
}

export async function authorizeDownload(token: string, photoId: string) {
  if (!token || !photoId) throw new Error("Download unavailable");
  const grant = await prisma.downloadGrant.findUnique({ where: { tokenHash: hashToken(token) }, include: { order: true } });
  if (!grant || grant.status !== "ACTIVE" || grant.expiresAt <= new Date() || (grant.order.status !== "PAID" && grant.order.status !== "PARTIALLY_REFUNDED")) {
    if (grant?.status === "ACTIVE" && grant.expiresAt <= new Date()) await prisma.downloadGrant.update({ where: { id: grant.id }, data: { status: "EXPIRED" } });
    throw new Error("Download unavailable");
  }
  const item = await prisma.orderItem.findFirst({ where: { orderId: grant.orderId, photoId, refundedAt: null }, include: { photo: true } });
  if (!item) throw new Error("Download unavailable");
  await prisma.downloadGrant.update({ where: { id: grant.id }, data: { lastUsedAt: new Date(), usageCount: { increment: 1 } } });
  return { grantId: grant.id, photo: item.photo };
}

export async function authorizeOrderDeliveryDownload(orderId: string, photoId: string) {
  if (!orderId || !photoId) throw new Error("Download unavailable");
  const grant = await prisma.downloadGrant.findUnique({ where: { orderId }, include: { order: true } });
  if (!grant || grant.status !== "ACTIVE" || grant.expiresAt <= new Date() || (grant.order.status !== "PAID" && grant.order.status !== "PARTIALLY_REFUNDED")) {
    if (grant?.status === "ACTIVE" && grant.expiresAt <= new Date()) await prisma.downloadGrant.update({ where: { id: grant.id }, data: { status: "EXPIRED" } });
    throw new Error("Download unavailable");
  }
  const item = await prisma.orderItem.findFirst({ where: { orderId, photoId, refundedAt: null }, include: { photo: true } });
  if (!item) throw new Error("Download unavailable");
  await prisma.downloadGrant.update({ where: { id: grant.id }, data: { lastUsedAt: new Date(), usageCount: { increment: 1 } } });
  return { grantId: grant.id, photo: item.photo };
}

export async function revokeOrderDownloads(orderId: string) {
  await prisma.downloadGrant.updateMany({ where: { orderId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
}

export function downloadTokenHash(token: string) { return hashToken(token); }

export async function ensureDownloadGrant(tx: Prisma.TransactionClient, orderId: string, options: { rotate?: boolean; defaultTtlHours?: number } = {}) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } });
  if (!order || (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED")) throw new Error("Downloads are not available for this order");
  const existing = await tx.downloadGrant.findUnique({ where: { orderId } });
  if (existing?.status === "ACTIVE" && existing.expiresAt > new Date() && !options.rotate) return { grant: existing, token: null, expiresAt: existing.expiresAt, reused: true };
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlHours(options.defaultTtlHours) * 60 * 60 * 1000);
  const grant = existing
    ? await tx.downloadGrant.update({ where: { id: existing.id }, data: { tokenHash: hashToken(token), expiresAt, status: "ACTIVE", revokedAt: null, lastUsedAt: null, usageCount: 0 } })
    : await tx.downloadGrant.create({ data: { orderId, tokenHash: hashToken(token), status: "ACTIVE", expiresAt } });
  return { grant, token, expiresAt, reused: false };
}
