import { prisma } from "./prisma";
import { newQrCode } from "./qr";

export async function publishAlbumForPhotographer(albumId: string, photographerId: string) {
  const album = await prisma.album.findFirst({ where: { id: albumId, photographerId }, select: { id: true } });
  if (!album) throw new Error("Album not found or not owned");
  // Serialize the find-or-create QR operation so concurrent Publish submissions
  // cannot create duplicate share identities.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.album.findFirst({ where: { id: album.id, photographerId }, include: { event: true } });
        if (!current || current.event.photographerId !== photographerId) throw new Error("Album not found or not owned");
        if (current.event.status !== "PUBLISHED") await tx.event.update({ where: { id: current.eventId }, data: { status: "PUBLISHED" } });
        const published = await tx.album.update({ where: { id: current.id }, data: { status: "PUBLISHED" } });
        const existing = await tx.qRLink.findFirst({ where: { albumId: current.id } });
        if (existing) {
          if (existing.status !== "ACTIVE") await tx.qRLink.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
        } else {
          await tx.qRLink.create({ data: { code: newQrCode(), photographerId, albumId: current.id } });
        }
        return published;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt === 2 || !(error instanceof Error && "code" in error && error.code === "P2034")) throw error;
    }
  }
  throw new Error("Album publication could not be completed");
}
