import crypto from "node:crypto";
import { prisma } from "./prisma";
import { DEFAULT_ALBUM_SLUG, DEFAULT_ALBUM_TITLE } from "./album-labels";

export { DEFAULT_ALBUM_SLUG, DEFAULT_ALBUM_TITLE };

const INTERNAL_LIBRARY_PREFIX = "__strideframe_library_";

/**
 * Reserved, server-generated Event identity for uploads that have not been
 * organized into a photographer-facing album yet. It is intentionally based
 * on a one-way digest rather than a display name or exposed database ID.
 */
export function internalLibraryEventSlug(photographerId: string) {
  const digest = crypto.createHash("sha256").update(`strideframe-library:${photographerId}`).digest("hex").slice(0, 32);
  return `${INTERNAL_LIBRARY_PREFIX}${digest}`;
}

export function isInternalLibraryEvent(event: { slug: string }, photographerId?: string) {
  return photographerId ? event.slug === internalLibraryEventSlug(photographerId) : event.slug.startsWith(INTERNAL_LIBRARY_PREFIX);
}

export async function getOrCreateInternalLibraryEvent(photographerId: string) {
  const slug = internalLibraryEventSlug(photographerId);
  const event = await prisma.event.upsert({
    where: { slug },
    create: {
      photographerId,
      title: "Private library",
      slug,
      accessCode: crypto.randomUUID().slice(0, 8),
      status: "DRAFT",
    },
    update: {},
  });
  if (event.photographerId !== photographerId) throw new Error("Internal library context is not owned by this photographer");
  return event;
}

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
