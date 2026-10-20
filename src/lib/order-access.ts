import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const COOKIE = "strideframe_order_access";
const DELIVERY_COOKIE = "strideframe_delivery_access";
function secret() { return process.env.AUTH_SECRET || "development-only-secret"; }
function signature(code: string) { return crypto.createHmac("sha256", secret()).update(code).digest("base64url"); }
export async function setOrderAccess(code: string) { (await cookies()).set(COOKIE, `${code}.${signature(code)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" }); }
export async function hasOrderAccess(code: string) { const value = (await cookies()).get(COOKIE)?.value || ""; const [stored, sig] = value.split("."); if (stored !== code || !sig) return false; const expected = signature(code); return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
export async function setDeliveryAccess(orderId: string, capabilityId: string, expiresAt: Date) {
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const payload = `${orderId}.${capabilityId}.${expiresAt.getTime()}`;
  (await cookies()).set(DELIVERY_COOKIE, `${payload}.${signature(payload)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge, path: "/" });
}

export async function getDeliveryAccessOrderId() {
  const value = (await cookies()).get(DELIVERY_COOKIE)?.value || "";
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [orderId, capabilityId, expiresAtValue, providedSignature] = parts;
  const expiresAt = Number(expiresAtValue);
  if (!orderId || !capabilityId || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || !providedSignature) return null;
  const expected = signature(`${orderId}.${capabilityId}.${expiresAtValue}`);
  if (providedSignature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expected))) return null;
  return { orderId, capabilityId };
}

export async function hasDeliveryAccess(orderId: string) {
  const access = await getDeliveryAccessOrderId();
  if (!access || access.orderId !== orderId) return false;
  const capability = await prisma.orderDeliveryCapability.findFirst({ where: { id: access.capabilityId, orderId, status: "ACTIVE", expiresAt: { gt: new Date() } }, select: { id: true } });
  return Boolean(capability);
}
