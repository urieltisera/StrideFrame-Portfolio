import crypto from "node:crypto";
import { prisma } from "./prisma";

const DEFAULT_TTL_HOURS = 24;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function ttlHours() {
  const value = Number(process.env.DOWNLOAD_GRANT_TTL_HOURS || DEFAULT_TTL_HOURS);
  if (!Number.isFinite(value) || value <= 0) throw new Error("DOWNLOAD_GRANT_TTL_HOURS must be positive");
  return value;
}

export async function createDownloadGrant(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } });
  if (!order || order.status !== "PAID") throw new Error("Downloads are not available for this order");
  const existing = await prisma.downloadGrant.findUnique({ where: { orderId } });
  if (existing?.status === "ACTIVE" && existing.expiresAt > new Date()) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlHours() * 60 * 60 * 1000);
  if (existing) await prisma.downloadGrant.update({ where: { id: existing.id }, data: { tokenHash: hashToken(token), expiresAt, status: "ACTIVE", revokedAt: null, lastUsedAt: null, usageCount: 0 } });
  else await prisma.downloadGrant.create({ data: { orderId, tokenHash: hashToken(token), expiresAt, status: "ACTIVE" } });
  return { token, expiresAt };
}

export async function authorizeDownload(token: string, photoId: string) {
  if (!token || !photoId) throw new Error("Download unavailable");
  const grant = await prisma.downloadGrant.findUnique({ where: { tokenHash: hashToken(token) }, include: { order: true } });
  if (!grant || grant.status !== "ACTIVE" || grant.expiresAt <= new Date() || grant.order.status !== "PAID") {
    if (grant?.status === "ACTIVE" && grant.expiresAt <= new Date()) await prisma.downloadGrant.update({ where: { id: grant.id }, data: { status: "EXPIRED" } });
    throw new Error("Download unavailable");
  }
  const item = await prisma.orderItem.findFirst({ where: { orderId: grant.orderId, photoId }, include: { photo: true } });
  if (!item) throw new Error("Download unavailable");
  await prisma.downloadGrant.update({ where: { id: grant.id }, data: { lastUsedAt: new Date(), usageCount: { increment: 1 } } });
  return { grantId: grant.id, photo: item.photo };
}

export async function revokeOrderDownloads(orderId: string) {
  await prisma.downloadGrant.updateMany({ where: { orderId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
}

export function downloadTokenHash(token: string) { return hashToken(token); }
