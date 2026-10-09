import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";

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
  const subtotal = photos.reduce((sum, photo) => sum + photo.priceCents, 0);
  return prisma.$transaction(tx => tx.order.create({
    data: {
      publicOrderCode: crypto.randomBytes(12).toString("base64url"), photographerId, eventId: photos[0].album.eventId,
      customerEmail: data.email, customerFirstName: data.firstName || null, customerLastName: data.lastName || null,
      currency: "USD", subtotalCents: subtotal, totalCents: subtotal, status: "PENDING_PAYMENT",
      items: { create: photos.map(photo => ({ photoId: photo.id, unitPriceCents: photo.priceCents, currency: photo.currency, originalFilename: photo.originalFilename })) },
    }, include: { items: { include: { photo: true } }, event: true },
  }));
}
