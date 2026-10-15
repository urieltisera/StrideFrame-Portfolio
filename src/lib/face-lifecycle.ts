import { prisma } from "./prisma";
import { storage, type StorageProvider } from "./storage";
import { createStorageProvider } from "./storage-factory";

export type FaceLifecycleIssue = {
  type: "ORPHAN_PHOTO_FACE" | "RELATIONSHIP_MISMATCH" | "NON_SEARCHABLE_DERIVATIVE";
  photoFaceId: string;
  photoId: string;
  detail: string;
};

function defaultStorageProvider(): StorageProvider {
  return process.env.STORAGE_PROVIDER === "s3" ? createStorageProvider() : storage;
}

/**
 * Search is event-scoped and joins through the source photo/album/event. This
 * check makes denormalized PhotoFace relationship fields observable instead of
 * trusting them silently. Foreign keys make missing parents impossible under
 * normal schema operation, but restore/manual SQL drift can still be audited.
 */
export async function findFaceLifecycleIssues(): Promise<FaceLifecycleIssue[]> {
  const rows = await prisma.$queryRaw<FaceLifecycleIssue[]>`
    SELECT 'ORPHAN_PHOTO_FACE'::text AS "type", pf."id" AS "photoFaceId", pf."photoId", 'missing source photo' AS detail
    FROM "PhotoFace" pf
    LEFT JOIN "Photo" p ON p."id" = pf."photoId"
    WHERE p."id" IS NULL
    UNION ALL
    SELECT 'RELATIONSHIP_MISMATCH'::text AS "type", pf."id" AS "photoFaceId", pf."photoId",
      'denormalized event or album does not match source photo' AS detail
    FROM "PhotoFace" pf
    JOIN "Photo" p ON p."id" = pf."photoId"
    JOIN "Album" a ON a."id" = p."albumId"
    WHERE pf."albumId" <> p."albumId" OR pf."eventId" <> a."eventId"
    UNION ALL
    SELECT 'NON_SEARCHABLE_DERIVATIVE'::text AS "type", pf."id" AS "photoFaceId", pf."photoId",
      'source photo, album, or event is not published' AS detail
    FROM "PhotoFace" pf
    JOIN "Photo" p ON p."id" = pf."photoId"
    JOIN "Album" a ON a."id" = p."albumId"
    JOIN "Event" e ON e."id" = a."eventId"
    WHERE p."status" <> 'PUBLISHED' OR a."status" <> 'PUBLISHED' OR e."status" <> 'PUBLISHED'
  `;
  return rows;
}

/**
 * Remove all embedding-space rows except the successfully indexed space.
 * Search already excludes incompatible rows; this cleanup makes replacement
 * deterministic and avoids retaining stale searchable-looking derivatives.
 */
export async function removeStaleFaceDerivatives(photoId: string, activeCompatibilityKey: string) {
  return prisma.$executeRaw`
    DELETE FROM "PhotoFace"
    WHERE "photoId"=${photoId} AND "compatibilityKey" <> ${activeCompatibilityKey}
  `;
}

export async function deleteEventWithAssets(eventId: string, photographerId: string, provider = defaultStorageProvider()) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, photographerId },
    select: { id: true, albums: { select: { photos: { select: { originalKey: true, previewKey: true } } } } },
  });
  if (!event) throw new Error("Event not found or not owned");
  const files = event.albums.flatMap((album) => album.photos);

  // Database cascades revoke PhotoFace rows before external cleanup. A storage
  // failure can leave files behind, but cannot leave them searchable.
  await prisma.event.delete({ where: { id: event.id } });
  const cleanup = await Promise.allSettled(files.flatMap((file) => [
    provider.deleteOriginal(file.originalKey),
    provider.deletePreview(file.previewKey),
  ]));
  const failed = cleanup.filter((result) => result.status === "rejected");
  if (failed.length) throw new Error("Event biometric derivatives were revoked, but some stored photo files require cleanup retry");
  return { photoCount: files.length };
}
