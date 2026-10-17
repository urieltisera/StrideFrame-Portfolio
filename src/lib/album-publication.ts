import { prisma } from "./prisma";
import { newQrCode } from "./qr";
import { isInternalLibraryEvent } from "./upload-workflow";

export async function publishAlbumForPhotographer(albumId: string, photographerId: string) {
  const album = await prisma.album.findFirst({ where: { id: albumId, photographerId }, include: { event: true } });
  if (!album || album.event.photographerId !== photographerId) throw new Error("Album not found or not owned");
  if (isInternalLibraryEvent(album.event, album.photographerId)) throw new Error("Internal library albums cannot be published directly");
  return prisma.$transaction(async (tx) => {
    if (album.event.status !== "PUBLISHED") await tx.event.update({ where: { id: album.eventId }, data: { status: "PUBLISHED" } });
    const published = await tx.album.update({ where: { id: album.id }, data: { status: "PUBLISHED" } });
    const existing = await tx.qRLink.findFirst({ where: { albumId: album.id } });
    if (existing) {
      if (existing.status !== "ACTIVE") await tx.qRLink.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
    } else {
      await tx.qRLink.create({ data: { code: newQrCode(), photographerId, albumId: album.id } });
    }
    return published;
  });
}
