import crypto from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "./prisma";
import { createStorageProvider } from "./storage-factory";
import { supportedMimeTypes } from "./photo-config";

export const paymentProviderSchema = z.enum(["stripe", "zelle"]);
export type CustomerPaymentProvider = z.infer<typeof paymentProviderSchema>;
const settingsInput = z.object({
  stripeEnabled: z.boolean().optional(),
  zelleEnabled: z.boolean().optional(),
  zelleDisplayName: z.string().trim().max(120).nullable().optional(),
  zellePaymentIdentifier: z.string().trim().max(160).nullable().optional(),
  zelleInstructions: z.string().trim().max(500).nullable().optional(),
});
const MAX_QR_BYTES = 2 * 1024 * 1024;

export async function getOrCreatePaymentSettings(photographerId: string) {
  return prisma.photographerPaymentSettings.upsert({
    where: { photographerId },
    create: { photographerId },
    update: {},
  });
}

export async function getPhotographerPaymentSettings(photographerId: string) {
  const settings = await getOrCreatePaymentSettings(photographerId);
  const stripe = await prisma.stripeConnectAccount.findUnique({ where: { photographerId } });
  return { settings, stripe };
}

export function stripeIsAvailable(settings: { stripeEnabled: boolean }, stripe: { status: string; chargesEnabled: boolean; payoutsEnabled: boolean } | null) {
  return settings.stripeEnabled && stripe?.status === "READY" && stripe.chargesEnabled && stripe.payoutsEnabled;
}

export function zelleIsAvailable(settings: { zelleEnabled: boolean; zelleDisplayName: string | null; zellePaymentIdentifier: string | null }) {
  return settings.zelleEnabled && Boolean(settings.zelleDisplayName && settings.zellePaymentIdentifier);
}

export async function updatePaymentSettings(photographerId: string, input: unknown) {
  const parsed = settingsInput.parse(input);
  const existing = await getOrCreatePaymentSettings(photographerId);
  const merged = { ...existing, ...parsed };
  if (merged.zelleEnabled && (!merged.zelleDisplayName || !merged.zellePaymentIdentifier)) throw new Error("Zelle recipient details are required");
  return prisma.photographerPaymentSettings.update({ where: { photographerId }, data: parsed });
}

export async function validateZelleQr(file: File) {
  if (!supportedMimeTypes.includes(file.type as never)) throw new Error("QR must be a JPEG, PNG or WebP image");
  if (file.size <= 0 || file.size > MAX_QR_BYTES) throw new Error("QR image must be smaller than 2 MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  const info = await sharp(bytes).metadata().catch(() => null);
  if (!info?.width || !info.height || info.width > 4096 || info.height > 4096) throw new Error("QR image is invalid or too large");
  return { bytes, contentType: file.type };
}

export async function uploadZelleQr(photographerId: string, file: File) {
  const validated = await validateZelleQr(file);
  const settings = await getOrCreatePaymentSettings(photographerId);
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const key = `zelle/${photographerId}/${crypto.randomUUID()}.${extension}`;
  const provider = createStorageProvider();
  await provider.putAsset({ key, bytes: validated.bytes, contentType: validated.contentType });
  try {
    await prisma.photographerPaymentSettings.update({ where: { photographerId }, data: { zelleQrKey: key, zelleQrContentType: validated.contentType } });
  } catch (error) {
    await provider.deleteAsset(key).catch(() => undefined);
    throw error;
  }
  if (settings.zelleQrKey) await provider.deleteAsset(settings.zelleQrKey).catch(() => undefined);
  return key;
}

export async function removeZelleQr(photographerId: string) {
  const settings = await getOrCreatePaymentSettings(photographerId);
  await prisma.photographerPaymentSettings.update({ where: { photographerId }, data: { zelleQrKey: null, zelleQrContentType: null } });
  if (settings.zelleQrKey) await createStorageProvider().deleteAsset(settings.zelleQrKey).catch(() => undefined);
}

export async function getAvailablePaymentMethods(photographerId: string) {
  const { settings, stripe } = await getPhotographerPaymentSettings(photographerId);
  return { stripe: stripeIsAvailable(settings, stripe), zelle: zelleIsAvailable(settings), settings, stripeAccount: stripe };
}
