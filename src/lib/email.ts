import crypto from "node:crypto";
import { prisma } from "./prisma";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

export function hashVerificationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verificationTokenExpiry() {
  return new Date(Date.now() + TOKEN_TTL_MS);
}

export function verificationUrl(token: string) {
  const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  return new URL(`/photographer/verify-email?token=${encodeURIComponent(token)}`, base).toString();
}

export async function issueVerificationToken(photographerId: string) {
  const photographer = await prisma.photographer.findUnique({ where: { id: photographerId }, select: { id: true, emailVerifiedAt: true, emailVerificationSentAt: true } });
  if (!photographer || photographer.emailVerifiedAt) return { sent: false, reason: "verified" as const };
  if (photographer.emailVerificationSentAt && Date.now() - photographer.emailVerificationSentAt.getTime() < RESEND_COOLDOWN_MS) return { sent: false, reason: "cooldown" as const };
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.photographer.update({ where: { id: photographer.id }, data: { emailVerificationTokenHash: hashVerificationToken(token), emailVerificationExpiresAt: verificationTokenExpiry(), emailVerificationSentAt: new Date() } });
  return { sent: true, token };
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = verificationUrl(token);
  const provider = process.env.EMAIL_DELIVERY_PROVIDER;
  if (provider === "console" || (!provider && process.env.NODE_ENV !== "production")) {
    console.info(`[email-verification] ${email} ${url}`);
    return { delivered: true, provider: "console" };
  }
  return { delivered: false, provider: provider || "CONFIGURATION_REQUIRED" };
}

export async function verifyEmailToken(token: string) {
  if (!token) return "invalid" as const;
  const photographer = await prisma.photographer.findFirst({ where: { emailVerificationTokenHash: hashVerificationToken(token) }, select: { id: true, emailVerifiedAt: true, emailVerificationExpiresAt: true } });
  if (!photographer) return "invalid" as const;
  if (photographer.emailVerifiedAt) return "used" as const;
  if (!photographer.emailVerificationExpiresAt || photographer.emailVerificationExpiresAt <= new Date()) return "expired" as const;
  await prisma.photographer.update({ where: { id: photographer.id }, data: { emailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationExpiresAt: null, emailVerificationSentAt: null } });
  return "verified" as const;
}

export type TransactionalEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: never[];
};

export type TransactionalEmailResult = {
  delivered: boolean;
  provider: string;
  error?: "CONFIGURATION_REQUIRED";
};

export interface TransactionalEmailTransport {
  send(message: TransactionalEmailMessage): Promise<{ provider: string }>;
}

export function transactionalEmailConfiguration() {
  const configured = process.env.EMAIL_DELIVERY_PROVIDER;
  if (process.env.NODE_ENV === "production") return { available: false, provider: configured || "CONFIGURATION_REQUIRED" };
  if (!configured || configured === "console") return { available: true, provider: "console" };
  return { available: false, provider: configured };
}

export async function sendTransactionalEmail(message: TransactionalEmailMessage, transport?: TransactionalEmailTransport): Promise<TransactionalEmailResult> {
  if (transport) return { delivered: true, provider: (await transport.send(message)).provider };
  const configuration = transactionalEmailConfiguration();
  if (!configuration.available) return { delivered: false, provider: configuration.provider, error: "CONFIGURATION_REQUIRED" };
  return { delivered: true, provider: configuration.provider };
}
