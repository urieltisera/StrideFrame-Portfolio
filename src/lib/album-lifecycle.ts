import crypto from "node:crypto";
import { prisma } from "./prisma";
import { DEFAULT_ALBUM_SLUG, DEFAULT_ALBUM_TITLE, internalLibraryEventSlug } from "./upload-workflow";

export async function deleteDraftAlbumSafely(albumId: string, photographerId: string) {
  const album = await prisma.album.findFirst({ where: { id: albumId, photographerId }, select: { id: true, eventId: true, status: true, priceCents: true, event: { select: { slug: true } }, photos: { select: { id: true, orderItems: { select: { id: true }, take: 1 } } } } });
  if (!album) throw new Error("Album not found or not owned");
  if (album.status !== "DRAFT") throw new Error("Published albums cannot be deleted");
  if (album.event.slug !== internalLibraryEventSlug(photographerId)) throw new Error("This legacy album cannot be safely deleted yet");
  if (album.id === (await prisma.album.findFirst({ where: { eventId: album.eventId, slug: DEFAULT_ALBUM_SLUG }, select: { id: true } }))?.id) throw new Error("The private library cannot be deleted");
  if (album.photos.some((photo) => photo.orderItems.length)) throw new Error("This album contains order history and cannot be deleted");

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.upsert({ where: { slug: internalLibraryEventSlug(photographerId) }, create: { photographerId, title: "Private library", slug: internalLibraryEventSlug(photographerId), accessCode: crypto.randomUUID().slice(0, 8), status: "DRAFT" }, update: {} });
    const library = await tx.album.upsert({ where: { eventId_slug: { eventId: event.id, slug: DEFAULT_ALBUM_SLUG } }, create: { eventId: event.id, photographerId, title: DEFAULT_ALBUM_TITLE, slug: DEFAULT_ALBUM_SLUG, priceCents: album.priceCents, status: "DRAFT" }, update: {} });
    const photoIds = album.photos.map((photo) => photo.id);
    if (photoIds.length) {
      await tx.photo.updateMany({ where: { id: { in: photoIds }, albumId: album.id }, data: { albumId: library.id } });
      await tx.photoFace.updateMany({ where: { photoId: { in: photoIds }, eventId: album.eventId }, data: { albumId: library.id } });
    }
    await tx.album.delete({ where: { id: album.id } });
    return { photoCount: photoIds.length };
  });
}
