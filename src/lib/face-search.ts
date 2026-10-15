import crypto from "node:crypto";
import { prisma } from "./prisma";
import { createStorageProvider } from "./storage-factory";
import { assertEmbeddingCompatible, assertPersistedEmbeddingCompatible, faceCompatibilityKey, requireFaceProvider } from "./face-provider";
import { FACE_MATCH_LIMIT, FACE_MATCH_THRESHOLD, FACE_SELFIE_MAX_BYTES } from "./face-config";

function vectorLiteral(values: number[], dimension: number) {
  if (values.length !== dimension || values.some((value) => !Number.isFinite(value))) throw new Error("Invalid face embedding");
  return `[${values.join(",")}]`;
}

export async function processFaceIndexJob(jobId: string) {
  const job = await prisma.faceIndexJob.findUnique({ where: { id: jobId }, include: { photo: { include: { album: true } } } });
  if (!job) throw new Error("Face job not found");
  const provider = requireFaceProvider();
  assertPersistedEmbeddingCompatible(provider.metadata);
  const compatibilityKey = faceCompatibilityKey(provider.metadata);
  const bytes = await createStorageProvider().getProtectedOriginal(job.photo.originalKey);
  const faces = (await provider.detectFaces(bytes)).sort((left, right) => {
    const leftBox = left.boundingBox;
    const rightBox = right.boundingBox;
    return leftBox.y - rightBox.y || leftBox.x - rightBox.x || leftBox.width - rightBox.width || leftBox.height - rightBox.height || right.confidence - left.confidence;
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "PhotoFace" WHERE "photoId"=${job.photoId} AND "compatibilityKey"=${compatibilityKey}`;
    for (const [faceIndex, face] of faces.entries()) {
      const embedding = assertEmbeddingCompatible(await provider.generateEmbedding(face), provider.metadata);
      const id = crypto.createHash("sha256").update(`${job.photoId}:${compatibilityKey}:${faceIndex}`).digest("hex");
      const literal = vectorLiteral(embedding, provider.metadata.embeddingDimension);
      await tx.$executeRawUnsafe(
        `INSERT INTO "PhotoFace" ("id","photoId","eventId","albumId","embedding","detectionConfidence","boundingBox","faceIndex","providerId","modelId","modelVersion","embeddingFormatVersion","embeddingDimension","similarityMetric","compatibilityKey","createdAt") VALUES ($1,$2,$3,$4,$5::vector,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,NOW())`,
        id, job.photoId, job.photo.album.eventId, job.photo.albumId, literal, face.confidence, JSON.stringify(face.boundingBox), faceIndex, provider.metadata.providerId, provider.metadata.modelId, provider.metadata.modelVersion, provider.metadata.embeddingFormatVersion, provider.metadata.embeddingDimension, provider.metadata.similarityMetric, compatibilityKey,
      );
    }
    await tx.faceIndexJob.update({ where: { id: jobId }, data: { status: "COMPLETED", completedAt: new Date(), lastError: null } });
  });
  return faces.length;
}

export async function claimFaceIndexJob() {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`UPDATE "FaceIndexJob" SET "status"='PROCESSING',"startedAt"=NOW(),"attempts"="attempts"+1,"updatedAt"=NOW() WHERE "id"=(SELECT "id" FROM "FaceIndexJob" WHERE "status" IN ('PENDING','FAILED') AND "attempts" < 3 ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING "id"`;
    return rows[0]?.id;
  });
}

export async function failFaceIndexJob(jobId: string, error: unknown) {
  await prisma.faceIndexJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: error instanceof Error ? error.message : "Face indexing failed" } });
}

export async function searchEventFaces(eventId: string, embedding: number[], albumId?: string) {
  const provider = requireFaceProvider();
  assertPersistedEmbeddingCompatible(provider.metadata);
  const compatibleEmbedding = assertEmbeddingCompatible(embedding, provider.metadata);
  const compatibilityKey = faceCompatibilityKey(provider.metadata);
  const literal = vectorLiteral(compatibleEmbedding, provider.metadata.embeddingDimension);
  const threshold = FACE_MATCH_THRESHOLD;
  const limit = FACE_MATCH_LIMIT;
  return prisma.$queryRawUnsafe<Array<{ id: string; photoId: string; distance: number }>>(
    `SELECT MIN(pf."id") AS "id",pf."photoId",MAX(1-(pf."embedding" <=> $1::vector)) AS distance FROM "PhotoFace" pf JOIN "Photo" p ON p."id"=pf."photoId" JOIN "Album" a ON a."id"=p."albumId" JOIN "Event" e ON e."id"=pf."eventId" WHERE pf."eventId"=$2 AND pf."compatibilityKey"=$3 AND e."status"='PUBLISHED' AND a."status"='PUBLISHED' AND p."status"='PUBLISHED' ${albumId ? `AND pf."albumId"=$4` : ``} AND 1-(pf."embedding" <=> $1::vector) >= $${albumId ? 5 : 4} GROUP BY pf."photoId" ORDER BY distance DESC LIMIT $${albumId ? 6 : 5}`,
    ...(albumId ? [literal, eventId, compatibilityKey, albumId, threshold, limit] : [literal, eventId, compatibilityKey, threshold, limit]),
  );
}

export async function validateSelfie(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Unsupported selfie type");
  if (file.size <= 0 || file.size > FACE_SELFIE_MAX_BYTES) throw new Error("Selfie exceeds the allowed size");
  const bytes = Buffer.from(await file.arrayBuffer());
  const provider = requireFaceProvider();
  const faces = await provider.detectFaces(bytes);
  if (faces.length !== 1) throw new Error(faces.length === 0 ? "No face found" : "Please upload a selfie with one clear face");
  return { bytes, face: faces[0] };
}
