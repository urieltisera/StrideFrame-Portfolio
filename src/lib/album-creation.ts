import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeSlug } from "./slugs";
import { validatePriceCents } from "./photos";
import { internalLibraryEventSlug } from "./upload-workflow";

type CreateAlbumInput = {
  photographerId: string;
  photoIds: string[];
  name: string;
  priceCents: number;
};

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createAlbumFromSelectedPhotos(input: CreateAlbumInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Album name must be between 2 and 120 characters");
  const photoIds = [...input.photoIds];
  if (!photoIds.length) throw new Error("Select at least one photo");
  if (new Set(photoIds).size !== photoIds.length) throw new Error("Selected photos are invalid");
  const priceCents = validatePriceCents(input.priceCents);
  const baseSlug = normalizeSlug(name) || "album";
  const librarySlug = internalLibraryEventSlug(input.photographerId);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    try {
      return await prisma.$transaction(async (tx) => {
        const library = await tx.event.upsert({
          where: { slug: librarySlug },
          create: { photographerId: input.photographerId, title: "Private library", slug: librarySlug, accessCode: crypto.randomUUID().slice(0, 8), status: "DRAFT" },
          update: {},
        });
        if (library.photographerId !== input.photographerId) throw new Error("Internal library context is not owned by this photographer");

        const photos = await tx.photo.findMany({
          where: { id: { in: photoIds }, album: { photographerId: input.photographerId } },
          select: { id: true, albumId: true, album: { select: { eventId: true } } },
        });
        if (photos.length !== photoIds.length || photos.some((photo) => photo.album.eventId !== library.id)) throw new Error("Selected photos are not available in your private library");

        const album = await tx.album.create({ data: { photographerId: input.photographerId, eventId: library.id, title: name, slug, description: null, priceCents, status: "DRAFT" } });
        const moved = await tx.photo.updateMany({ where: { id: { in: photoIds }, album: { photographerId: input.photographerId, eventId: library.id } }, data: { albumId: album.id } });
        if (moved.count !== photoIds.length) throw new Error("Selected photos could not be moved into the album");
        await tx.photoFace.updateMany({ where: { photoId: { in: photoIds }, eventId: library.id }, data: { albumId: album.id } });
        return { ...album, photoCount: moved.count };
      });
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new Error("Unable to create a unique album URL");
}
