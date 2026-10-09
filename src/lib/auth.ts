import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
const COOKIE = "sportpix_session";
const configuredSecret = process.env.AUTH_SECRET;
function getSecret() { if (process.env.NODE_ENV !== "development" && !configuredSecret) throw new Error("AUTH_SECRET must be configured outside development"); return new TextEncoder().encode(configuredSecret || "development-only-change-me"); }
export async function createSession(photographerId: string) { const token = await new SignJWT({ photographerId }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(getSecret()); (await cookies()).set(COOKIE, token, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", path:"/", maxAge:60*60*24*7 }); }
export async function destroySession() { (await cookies()).delete(COOKIE); }
export async function getCurrentPhotographer() { const token = (await cookies()).get(COOKIE)?.value; if (!token) return null; try { const {payload} = await jwtVerify(token, getSecret()); if (typeof payload.photographerId !== "string") return null; return prisma.photographer.findUnique({where:{id:payload.photographerId}}); } catch { return null; } }
