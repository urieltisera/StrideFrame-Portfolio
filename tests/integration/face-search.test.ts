import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { DeterministicFaceProvider, faceCompatibilityKey } from "../../src/lib/face-provider";
import { searchEventFaces } from "../../src/lib/face-search";

const db = new PrismaClient();
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;

suite("persisted Face Search metadata and multi-face semantics", () => {
  const provider = new DeterministicFaceProvider();
  const metadata = provider.metadata;

  beforeEach(async () => {
    await db.photoFace.deleteMany();
    await db.paymentDisputeEvent.deleteMany();
    await db.paymentDispute.deleteMany();
    await db.zelleFeeObligationReversal.deleteMany();
    await db.refundItem.deleteMany();
    await db.refund.deleteMany();
    await db.manualPaymentAudit.deleteMany();
    await db.zelleFeeObligation.deleteMany();
    await db.downloadGrant.deleteMany();
    await db.orderItem.deleteMany();
    await db.payment.deleteMany();
    await db.order.deleteMany();
    await db.photo.deleteMany();
    await db.album.deleteMany();
    await db.event.deleteMany();
    await db.photographer.deleteMany();
  });
  afterAll(async () => { await db.$disconnect(); });

  async function createPhoto(albumId: string, suffix: string) {
    return db.photo.create({ data: { albumId, originalKey: `private/${suffix}`, previewKey: `public/${suffix}`, originalFilename: `${suffix}.jpg`, mimeType: "image/jpeg", fileSize: 10, priceCents: 1000, currency: "USD", status: "PUBLISHED" } });
  }

  async function replaceFaces(photoId: string, eventId: string, albumId: string, faces: Awaited<ReturnType<typeof provider.detectFaces>>, compatibility = faceCompatibilityKey(metadata), rowMetadata = metadata) {
    await db.$executeRaw`DELETE FROM "PhotoFace" WHERE "photoId"=${photoId} AND "compatibilityKey"=${compatibility}`;
    for (const [faceIndex, face] of faces.entries()) {
      const embedding = await provider.generateEmbedding(face);
      const id = crypto.createHash("sha256").update(`${photoId}:${compatibility}:${faceIndex}`).digest("hex");
      const literal = `[${embedding.join(",")}]`;
      await db.$executeRawUnsafe(`INSERT INTO "PhotoFace" ("id","photoId","eventId","albumId","embedding","detectionConfidence","boundingBox","faceIndex","providerId","modelId","modelVersion","embeddingFormatVersion","embeddingDimension","similarityMetric","compatibilityKey","createdAt") VALUES ($1,$2,$3,$4,$5::vector,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,NOW())`, id, photoId, eventId, albumId, literal, face.confidence, JSON.stringify(face.boundingBox), faceIndex, rowMetadata.providerId, rowMetadata.modelId, rowMetadata.modelVersion, rowMetadata.embeddingFormatVersion, rowMetadata.embeddingDimension, rowMetadata.similarityMetric, compatibility);
    }
  }

  it("stores three faces, returns a photo once, excludes incompatible records, and replaces 3 faces with 2", async () => {
    const owner = await db.photographer.create({ data: { email: "face-owner@example.com", name: "Owner", passwordHash: "x" } });
    const other = await db.photographer.create({ data: { email: "face-other@example.com", name: "Other", passwordHash: "x" } });
    const eventA = await db.event.create({ data: { photographerId: owner.id, title: "Event A", slug: "face-a", accessCode: "face-a", status: "PUBLISHED" } });
    const eventB = await db.event.create({ data: { photographerId: owner.id, title: "Event B", slug: "face-b", accessCode: "face-b", status: "PUBLISHED" } });
    const eventC = await db.event.create({ data: { photographerId: other.id, title: "Event C", slug: "face-c", accessCode: "face-c", status: "PUBLISHED" } });
    const albumA = await db.album.create({ data: { photographerId: owner.id, eventId: eventA.id, title: "A", slug: "a", status: "PUBLISHED" } });
    const albumB = await db.album.create({ data: { photographerId: owner.id, eventId: eventB.id, title: "B", slug: "b", status: "PUBLISHED" } });
    const albumC = await db.album.create({ data: { photographerId: other.id, eventId: eventC.id, title: "C", slug: "c", status: "PUBLISHED" } });
    const photoA = await createPhoto(albumA.id, "photo-a");
    const legacyPhoto = await createPhoto(albumA.id, "photo-legacy");
    const photoB = await createPhoto(albumB.id, "photo-b");
    const photoC = await createPhoto(albumC.id, "photo-c");
    const threeFaces = await provider.detectFaces(Buffer.from("THREE_FACE photo-a"));
    await replaceFaces(photoA.id, eventA.id, albumA.id, threeFaces);
    await replaceFaces(photoB.id, eventB.id, albumB.id, [threeFaces[0]]);
    await replaceFaces(photoC.id, eventC.id, albumC.id, [threeFaces[0]]);
    const incompatibleKey = "legacy|legacy-unclassified|old-model|legacy-unknown|512|COSINE";
    await replaceFaces(legacyPhoto.id, eventA.id, albumA.id, [threeFaces[0]], incompatibleKey, {
      providerId: "legacy", modelId: "legacy-unclassified", modelVersion: "old-model", embeddingFormatVersion: "legacy-unknown", embeddingDimension: 512, similarityMetric: "COSINE", readinessClass: "DEV_VALIDATION_ONLY",
    });

    expect(await db.photoFace.count({ where: { photoId: photoA.id } })).toBe(3);
    const queryEmbedding = await provider.generateEmbedding(threeFaces[0]);
    const matches = await searchEventFaces(eventA.id, queryEmbedding);
    expect(matches).toHaveLength(1);
    expect(matches[0].photoId).toBe(photoA.id);
    expect(matches.some((match) => match.photoId === legacyPhoto.id)).toBe(false);
    expect((await searchEventFaces(eventB.id, queryEmbedding)).some((match) => match.photoId === photoA.id || match.photoId === photoC.id)).toBe(false);

    await replaceFaces(photoA.id, eventA.id, albumA.id, threeFaces.slice(0, 2));
    expect(await db.photoFace.count({ where: { photoId: photoA.id, compatibilityKey: faceCompatibilityKey(metadata) } })).toBe(2);
    await replaceFaces(photoA.id, eventA.id, albumA.id, threeFaces.slice(0, 2));
    expect(await db.photoFace.count({ where: { photoId: photoA.id, compatibilityKey: faceCompatibilityKey(metadata) } })).toBe(2);

    await db.photo.delete({ where: { id: photoA.id } });
    expect(await db.photoFace.count({ where: { photoId: photoA.id } })).toBe(0);
    await db.event.delete({ where: { id: eventB.id } });
    expect(await db.photoFace.count({ where: { eventId: eventB.id } })).toBe(0);
  });
});
