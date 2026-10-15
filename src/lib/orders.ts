import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { resolveEffectivePhotoPrice, STRIDEFRAME_MVP_CURRENCY } from "./pricing";

export const checkoutSchema = z.object({ email: z.string().email(), firstName: z.string().trim().max(80).optional(), lastName: z.string().trim().max(80).optional() });

export async function createPendingOrder(input: { photoIds: string[]; email: string; firstName?: string; lastName?: string }) {
  const data = checkoutSchema.parse(input);
  const ids = [...new Set(input.photoIds)];
  if (!ids.length) throw new Error("Cart is empty");
  const photos = await prisma.photo.findMany({
    where: { id: { in: ids }, status: "PUBLISHED", album: { status: "PUBLISHED", event: { status: "PUBLISHED" } } },
    include: { album: { include: { event: true } } },
  });
  if (photos.length !== ids.length) throw new Error("Some photos are no longer available");
  const photographerId = photos[0].album.photographerId;
  if (photos.some(photo => photo.album.photographerId !== photographerId)) throw new Error("Cart must contain photos from one photographer");
  const pricedPhotos = photos.map((photo) => ({ photo, price: resolveEffectivePhotoPrice(photo) }));
  if (pricedPhotos.some(({ price }) => price.currency !== STRIDEFRAME_MVP_CURRENCY)) throw new Error("Only USD pricing is supported");
  const subtotal = pricedPhotos.reduce((sum, item) => sum + item.price.priceCents, 0);
  return prisma.$transaction(tx => tx.order.create({
    data: {
      publicOrderCode: crypto.randomBytes(12).toString("base64url"), photographerId, eventId: photos[0].album.eventId,
      customerEmail: data.email, customerFirstName: data.firstName || null, customerLastName: data.lastName || null,
      currency: "USD", subtotalCents: subtotal, totalCents: subtotal, status: "PENDING_PAYMENT",
      items: { create: pricedPhotos.map(({ photo, price }) => ({ photoId: photo.id, unitPriceCents: price.priceCents, currency: price.currency, originalFilename: photo.originalFilename })) },
    }, include: { items: { include: { photo: true } }, event: true },
  }));
}
