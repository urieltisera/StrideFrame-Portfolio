import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "strideframe_order_access";
function secret() { return process.env.AUTH_SECRET || "development-only-secret"; }
function signature(code: string) { return crypto.createHmac("sha256", secret()).update(code).digest("base64url"); }
export async function setOrderAccess(code: string) { (await cookies()).set(COOKIE, `${code}.${signature(code)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" }); }
export async function hasOrderAccess(code: string) { const value = (await cookies()).get(COOKIE)?.value || ""; const [stored, sig] = value.split("."); if (stored !== code || !sig) return false; const expected = signature(code); return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
export async function setDownloadToken(token: string) { (await cookies()).set("strideframe_download_token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24, path: "/" }); }
export async function getDownloadToken() { return (await cookies()).get("strideframe_download_token")?.value; }
