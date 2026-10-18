import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeSlug } from "./slugs";
import { validatePriceCents } from "./photos";
import { DEFAULT_ALBUM_SLUG, DEFAULT_ALBUM_TITLE, internalLibraryEventSlug } from "./upload-workflow";

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function privateLibrary(photographerId: string, priceCents: number) {
  const slug = internalLibraryEventSlug(photographerId);
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.upsert({ where: { slug }, create: { photographerId, title: "Private library", slug, accessCode: crypto.randomUUID().slice(0, 8), status: "DRAFT" }, update: {} });
    if (event.photographerId !== photographerId) throw new Error("Private library is not owned by this photographer");
    const album = await tx.album.upsert({ where: { eventId_slug: { eventId: event.id, slug: DEFAULT_ALBUM_SLUG } }, create: { eventId: event.id, photographerId, title: DEFAULT_ALBUM_TITLE, slug: DEFAULT_ALBUM_SLUG, priceCents, status: "DRAFT" }, update: { priceCents } });
    return { event, album };
  });
}

export async function createEmptyAlbumForPhotographer(input: { photographerId: string; name: string; priceCents: number }) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Album name must be between 2 and 120 characters");
  const priceCents = validatePriceCents(input.priceCents);
  const baseSlug = normalizeSlug(name) || "album";
  const librarySlug = internalLibraryEventSlug(input.photographerId);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    try {
      return await prisma.$transaction(async (tx) => {
        const event = await tx.event.upsert({ where: { slug: librarySlug }, create: { photographerId: input.photographerId, title: "Private library", slug: librarySlug, accessCode: crypto.randomUUID().slice(0, 8), status: "DRAFT" }, update: {} });
        if (event.photographerId !== input.photographerId) throw new Error("Private library is not owned by this photographer");
        return tx.album.create({ data: { photographerId: input.photographerId, eventId: event.id, title: name, slug, description: null, priceCents, status: "DRAFT" } });
      });
    } catch (error) { if (isUniqueViolation(error)) continue; throw error; }
  }
  throw new Error("Unable to create a unique album URL");
}

export async function addPhotosToDraftAlbum(input: { photographerId: string; albumId: string; photoIds: string[] }) {
  const photoIds = [...new Set(input.photoIds)];
  if (!photoIds.length) throw new Error("Select at least one photo");
  const target = await prisma.album.findFirst({ where: { id: input.albumId, photographerId: input.photographerId }, select: { id: true, status: true, priceCents: true, eventId: true, event: { select: { slug: true } } } });
  if (!target) throw new Error("Album not found or not owned");
  if (target.status !== "DRAFT") throw new Error("Photos can only be added to a draft album");
  if (target.event.slug !== internalLibraryEventSlug(input.photographerId)) throw new Error("This legacy album is not compatible with private-library membership editing");
  const library = await privateLibrary(input.photographerId, target.priceCents);
  if (library.album.id === target.id) throw new Error("The private library cannot be added to itself");
  return prisma.$transaction(async (tx) => {
    const photos = await tx.photo.findMany({ where: { id: { in: photoIds }, album: { photographerId: input.photographerId } }, select: { id: true, albumId: true } });
    if (photos.length !== photoIds.length) throw new Error("One or more photos are not owned by this photographer");
    if (photos.some((photo) => photo.albumId !== library.album.id)) throw new Error("Only photos in your private library can be added without removing them from another album first");
    const moved = await tx.photo.updateMany({ where: { id: { in: photoIds }, albumId: library.album.id }, data: { albumId: target.id } });
    if (moved.count !== photoIds.length) throw new Error("Photos could not be added to this album");
    await tx.photoFace.updateMany({ where: { photoId: { in: photoIds }, eventId: library.event.id }, data: { albumId: target.id } });
    return moved.count;
  });
}

export async function removePhotoFromDraftAlbum(input: { photographerId: string; albumId: string; photoId: string }) {
  const target = await prisma.album.findFirst({ where: { id: input.albumId, photographerId: input.photographerId }, select: { id: true, status: true, priceCents: true, eventId: true, event: { select: { slug: true } } } });
  if (!target) throw new Error("Album not found or not owned");
  if (target.status !== "DRAFT") throw new Error("Photos can only be removed from a draft album");
  if (target.event.slug !== internalLibraryEventSlug(input.photographerId)) throw new Error("This legacy album is not compatible with private-library membership editing");
  const library = await privateLibrary(input.photographerId, target.priceCents);
  const photo = await prisma.photo.findFirst({ where: { id: input.photoId, albumId: target.id }, select: { id: true, originalKey: true, previewKey: true } });
  if (!photo) throw new Error("Photo is not in this album");
  await prisma.$transaction(async (tx) => {
    const moved = await tx.photo.updateMany({ where: { id: photo.id, albumId: target.id }, data: { albumId: library.album.id } });
    if (moved.count !== 1) throw new Error("Photo could not be removed from this album");
    await tx.photoFace.updateMany({ where: { photoId: photo.id, eventId: target.eventId }, data: { albumId: library.album.id } });
  });
  return photo;
}
