import { prisma } from "./prisma";

export const DEFAULT_ALBUM_SLUG = "event-photos";
export const DEFAULT_ALBUM_TITLE = "Event photos";

export async function getOrCreateDefaultAlbum({ eventId, photographerId, priceCents }: { eventId: string; photographerId: string; priceCents: number }) {
  const event = await prisma.event.findFirst({ where: { id: eventId, photographerId }, select: { id: true, status: true } });
  if (!event) throw new Error("Event not found or not owned");
  return prisma.album.upsert({
    where: { eventId_slug: { eventId, slug: DEFAULT_ALBUM_SLUG } },
    create: {
      eventId,
      photographerId,
      title: DEFAULT_ALBUM_TITLE,
      slug: DEFAULT_ALBUM_SLUG,
      description: null,
      priceCents,
      status: event.status,
    },
    update: { priceCents },
  });
}

export async function getOwnedUploadAlbum({ albumId, eventId, photographerId }: { albumId: string; eventId: string; photographerId: string }) {
  return prisma.album.findFirst({ where: { id: albumId, eventId, photographerId } });
}
