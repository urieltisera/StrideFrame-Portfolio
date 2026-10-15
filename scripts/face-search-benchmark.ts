import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DeterministicFaceProvider, faceCompatibilityKey } from "../src/lib/face-provider";
import { searchEventFaces } from "../src/lib/face-search";

const db = new PrismaClient();
const DIMENSION = 512;
const SIZES = (process.env.FACE_BENCHMARK_SIZES || "100,500,1000,5000,10000").split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0);
const FACE_COUNTS = (process.env.FACE_BENCHMARK_FACE_COUNTS || "1,2,3").split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0);

function vectorFor(index: number) {
  const values = new Array<number>(DIMENSION).fill(0);
  values[index % DIMENSION] = 1;
  return values;
}

function literalFor(values: number[]) {
  return `[${values.join(",")}]`;
}

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function insertFaces(eventId: string, albumId: string, photoIds: string[], faceCount: number, compatibilityKey: string) {
  const rows: string[] = [];
  for (let photoIndex = 0; photoIndex < photoIds.length; photoIndex += 1) {
    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
      const id = crypto.createHash("sha256").update(`${photoIds[photoIndex]}:${faceIndex}`).digest("hex");
      const vector = literalFor(vectorFor(photoIndex + faceIndex));
      rows.push(`(${sqlQuote(id)},${sqlQuote(photoIds[photoIndex])},${sqlQuote(eventId)},${sqlQuote(albumId)},${sqlQuote(vector)}::vector,0.99,'{"x":0,"y":0,"width":1,"height":1}'::jsonb,${faceIndex},'deterministic','deterministic-test','deterministic-benchmark','float32-l2-v1',512,'COSINE',${sqlQuote(compatibilityKey)},NOW())`);
    }
  }
  for (let offset = 0; offset < rows.length; offset += 250) {
    await db.$executeRawUnsafe(`INSERT INTO "PhotoFace" ("id","photoId","eventId","albumId","embedding","detectionConfidence","boundingBox","faceIndex","providerId","modelId","modelVersion","embeddingFormatVersion","embeddingDimension","similarityMetric","compatibilityKey","createdAt") VALUES ${rows.slice(offset, offset + 250).join(",")}`);
  }
}

async function explain(eventId: string, compatibilityKey: string, queryLiteral: string) {
  const result = await db.$queryRawUnsafe<Array<{ "QUERY PLAN": Array<{ Plan: { "Actual Total Time": number; "Node Type": string; "Plans"?: unknown[] } }> }>>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT MIN(pf."id") AS "id",pf."photoId",MAX(1-(pf."embedding" <=> ${sqlQuote(queryLiteral)}::vector)) AS distance FROM "PhotoFace" pf JOIN "Photo" p ON p."id"=pf."photoId" JOIN "Album" a ON a."id"=p."albumId" JOIN "Event" e ON e."id"=pf."eventId" WHERE pf."eventId"=${sqlQuote(eventId)} AND pf."compatibilityKey"=${sqlQuote(compatibilityKey)} AND e."status"='PUBLISHED' AND a."status"='PUBLISHED' AND p."status"='PUBLISHED' AND 1-(pf."embedding" <=> ${sqlQuote(queryLiteral)}::vector) >= 0.92 GROUP BY pf."photoId" ORDER BY distance DESC LIMIT 50`);
  const plan = result[0]?.["QUERY PLAN"]?.[0]?.Plan;
  return { executionMs: plan?.["Actual Total Time"] ?? null, rootNode: plan?.["Node Type"] ?? null };
}

async function main() {
  const assertLocalQaUrl = (value: string | undefined, label: string) => {
    if (!value) throw new Error(`Set ${label} to an isolated local QA database`);
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${label} must be a valid database URL`);
    }
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!localHost || !/(test|qa)/i.test(databaseName)) {
      throw new Error(`${label} must target a localhost/loopback database whose name contains test or qa`);
    }
    return parsed;
  };

  const databaseUrl = assertLocalQaUrl(process.env.DATABASE_URL, "DATABASE_URL");
  const testDatabaseUrl = assertLocalQaUrl(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
  if (databaseUrl.href !== testDatabaseUrl.href) {
    throw new Error("DATABASE_URL and TEST_DATABASE_URL must target the same isolated QA database");
  }
  process.env.FACE_PROVIDER = "deterministic";
  const provider = new DeterministicFaceProvider();
  const compatibilityKey = faceCompatibilityKey(provider.metadata);
  const photographer = await db.photographer.create({ data: { email: `face-benchmark-${Date.now()}@example.com`, name: "Benchmark", passwordHash: "benchmark" } });
  const results: Array<Record<string, number | string | null>> = [];
  try {
    for (const faceCount of FACE_COUNTS) {
      for (const photoCount of SIZES) {
        const event = await db.event.create({ data: { photographerId: photographer.id, title: `Benchmark ${photoCount}x${faceCount}`, slug: `face-benchmark-${photoCount}-${faceCount}-${Date.now()}`, accessCode: crypto.randomUUID(), status: "PUBLISHED" } });
        const album = await db.album.create({ data: { photographerId: photographer.id, eventId: event.id, title: "Benchmark", slug: "benchmark", status: "PUBLISHED" } });
        const photos = Array.from({ length: photoCount }, (_, index) => ({ albumId: album.id, originalKey: `benchmark/${event.id}/${index}`, previewKey: `benchmark/${event.id}/${index}.webp`, originalFilename: `${index}.jpg`, mimeType: "image/jpeg", fileSize: 1, status: "PUBLISHED" as const }));
        await db.photo.createMany({ data: photos });
        const photoRows = await db.photo.findMany({ where: { albumId: album.id }, select: { id: true } });
        await insertFaces(event.id, album.id, photoRows.map((photo) => photo.id), faceCount, compatibilityKey);
        const query = vectorFor(0);
        const before = process.memoryUsage();
        const started = performance.now();
        const matches = await searchEventFaces(event.id, query);
        const totalMs = performance.now() - started;
        const after = process.memoryUsage();
        const plan = await explain(event.id, compatibilityKey, literalFor(query));
        results.push({ photos: photoCount, facesPerPhoto: faceCount, searchableFaces: photoCount * faceCount, matches: matches.length, searchMs: Number(totalMs.toFixed(2)), explainMs: plan.executionMs === null ? null : Number(plan.executionMs.toFixed(2)), rootPlanNode: plan.rootNode, heapDeltaMB: Number(((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(3)), rssDeltaMB: Number(((after.rss - before.rss) / 1024 / 1024).toFixed(3)), estimatedVectorMB: Number(((photoCount * faceCount * DIMENSION * 4) / 1024 / 1024).toFixed(3)) });
        await db.event.delete({ where: { id: event.id } });
        console.log(JSON.stringify(results.at(-1)));
      }
    }
  } finally {
    await db.photographer.delete({ where: { id: photographer.id } });
    await db.$disconnect();
  }
}

main().catch(async (error) => { console.error(error instanceof Error ? error.message : error); await db.$disconnect(); process.exitCode = 1; });
