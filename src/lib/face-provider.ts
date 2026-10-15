import crypto from "node:crypto";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import {
  FACE_DETECTION_MODEL_PATH,
  FACE_DETECTION_THRESHOLD,
  FACE_EMBEDDING_DIMENSION,
  FACE_MIN_FACE_SIZE,
  FACE_MODEL_VERSION,
  FACE_RECOGNITION_MODEL_PATH,
} from "./face-config";

export type FaceLandmark = { x: number; y: number };
export type FaceReadinessClass = "DISABLED" | "DEV_VALIDATION_ONLY" | "PRODUCTION_READY";
export type FaceProviderMetadata = {
  providerId: string;
  modelId: string;
  modelVersion: string;
  embeddingFormatVersion: string;
  embeddingDimension: number;
  similarityMetric: "COSINE";
  readinessClass: FaceReadinessClass;
};
export type DetectedFace = {
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  landmarks?: FaceLandmark[];
  embedding: number[];
  alignedImage?: Buffer;
};
export interface FaceRecognitionProvider {
  readonly metadata: FaceProviderMetadata;
  readonly modelVersion: string;
  readonly readinessClass: FaceReadinessClass;
  detectFaces(bytes: Buffer): Promise<DetectedFace[]>;
  generateEmbedding(face: DetectedFace): Promise<number[]>;
}
export type FaceSearchAvailability = {
  available: boolean;
  readinessClass: FaceReadinessClass;
  provider?: Pick<FaceProviderMetadata, "providerId" | "modelId" | "modelVersion">;
  reason?: "disabled" | "dev_provider" | "unknown_provider";
};
export const FACE_SEARCH_UNAVAILABLE_MESSAGE = "Face Search is currently unavailable for this event.";
export class FaceSearchUnavailableError extends Error {
  readonly code = "FACE_SEARCH_UNAVAILABLE";
  constructor() { super(FACE_SEARCH_UNAVAILABLE_MESSAGE); this.name = "FaceSearchUnavailableError"; }
}
export const ARCFACE_TEMPLATE: FaceLandmark[] = [
  { x: 38.2946, y: 51.6963 }, { x: 73.5318, y: 51.5014 }, { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 }, { x: 70.7299, y: 92.2041 },
];
function normalize(values: number[]) {
  const n = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(n) || !n || values.some((value) => !Number.isFinite(value))) throw new Error("Invalid face embedding");
  return values.map((value) => value / n);
}
export function similarityTransform(source: FaceLandmark[], target = ARCFACE_TEMPLATE) {
  if (source.length !== 5) throw new Error("Exactly five landmarks are required");
  let aa = 0, bb = 0, cc = 0, sx = 0, sy = 0, tx = 0, ty = 0;
  for (let i = 0; i < 5; i += 1) {
    const { x, y } = source[i]; const u = target[i].x; const v = target[i].y;
    aa += x * x + y * y; bb += x * u + y * v; cc += -y * u + x * v;
    sx += x; sy += y; tx += u; ty += v;
  }
  if (!aa) throw new Error("Invalid landmarks");
  const a = bb / aa; const b = cc / aa;
  return { a, b, tx: (tx - a * sx + b * sy) / 5, ty: (ty - b * sx - a * sy) / 5 };
}
function metadataFor(providerId: string, modelId: string, modelVersion: string, readinessClass: FaceReadinessClass): FaceProviderMetadata {
  return { providerId, modelId, modelVersion, embeddingFormatVersion: "float32-l2-v1", embeddingDimension: FACE_EMBEDDING_DIMENSION, similarityMetric: "COSINE", readinessClass };
}
export function assertProviderMetadata(metadata: FaceProviderMetadata) {
  if (!metadata.providerId || !metadata.modelId || !metadata.modelVersion || !metadata.embeddingFormatVersion ||
    !Number.isInteger(metadata.embeddingDimension) || metadata.embeddingDimension < 2 || metadata.similarityMetric !== "COSINE" ||
    !["DISABLED", "DEV_VALIDATION_ONLY", "PRODUCTION_READY"].includes(metadata.readinessClass)) throw new Error("Invalid face provider metadata");
  return metadata;
}
export function assertEmbeddingCompatible(embedding: number[], metadata: FaceProviderMetadata) {
  assertProviderMetadata(metadata);
  if (embedding.length !== metadata.embeddingDimension || embedding.some((value) => !Number.isFinite(value))) throw new Error("Face embedding is incompatible with the configured provider");
  return embedding;
}
export function faceCompatibilityKey(metadata: FaceProviderMetadata) {
  assertProviderMetadata(metadata);
  return [metadata.providerId, metadata.modelId, metadata.modelVersion, metadata.embeddingFormatVersion, metadata.embeddingDimension, metadata.similarityMetric].map((part) => encodeURIComponent(String(part))).join("|");
}
export function assertPersistedEmbeddingCompatible(metadata: FaceProviderMetadata) {
  assertProviderMetadata(metadata);
  if (metadata.embeddingDimension !== 512) throw new Error("Configured face embedding dimension is incompatible with the persisted face index");
  return metadata;
}
export class DeterministicFaceProvider implements FaceRecognitionProvider {
  readonly metadata = metadataFor("deterministic", "deterministic-test", `deterministic-${FACE_MODEL_VERSION}`, "DEV_VALIDATION_ONLY");
  readonly modelVersion = this.metadata.modelVersion;
  readonly readinessClass = this.metadata.readinessClass;
  async detectFaces(bytes: Buffer) {
    const marker = bytes.toString("utf8"); if (marker.includes("NO_FACE")) return [];
    const faceCount = marker.includes("THREE_FACE") ? 3 : marker.includes("MULTI_FACE") ? 2 : 1;
    return Array.from({ length: faceCount }, (_, index) => ({ confidence: 0.99 - index * 0.05, boundingBox: { x: 0.1 + index * 0.3, y: 0.1, width: 0.22, height: 0.6 }, landmarks: ARCFACE_TEMPLATE, embedding: this.vector(bytes, index) }));
  }
  async generateEmbedding(face: DetectedFace) { return assertEmbeddingCompatible(face.embedding, this.metadata); }
  private vector(bytes: Buffer, index: number) {
    return normalize(Array.from({ length: FACE_EMBEDDING_DIMENSION }, (_, dimension) => crypto.createHash("sha256").update(bytes).update(`${index}:${dimension}`).digest()[0] / 255));
  }
}
export class OnnxFaceProvider implements FaceRecognitionProvider {
  readonly metadata = metadataFor("onnx", "configured-onnx-face-model", FACE_MODEL_VERSION, "DEV_VALIDATION_ONLY");
  readonly modelVersion = this.metadata.modelVersion;
  readonly readinessClass = this.metadata.readinessClass;
  private detector?: ort.InferenceSession;
  private recognizer?: ort.InferenceSession;
  private async sessions() {
    this.detector ??= await ort.InferenceSession.create(FACE_DETECTION_MODEL_PATH);
    this.recognizer ??= await ort.InferenceSession.create(FACE_RECOGNITION_MODEL_PATH);
    return { detector: this.detector, recognizer: this.recognizer };
  }
  async detectFaces(bytes: Buffer) {
    const { detector } = await this.sessions(); const image = sharp(bytes); const meta = await image.metadata();
    const width = meta.width || 640; const height = meta.height || 640;
    const raw = await image.resize(640, 640, { fit: "fill" }).removeAlpha().raw().toBuffer(); const input = new Float32Array(3 * 640 * 640);
    for (let y = 0; y < 640; y += 1) for (let x = 0; x < 640; x += 1) for (let channel = 0; channel < 3; channel += 1) input[channel * 640 * 640 + y * 640 + x] = (raw[(y * 640 + x) * 3 + 2 - channel] - 127.5) / 128;
    const output = await detector.run({ [detector.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, 640, 640]) }); const faces: DetectedFace[] = [];
    for (let level = 0; level < 3; level += 1) {
      const stride = 8 << level; const grid = 640 / stride; const scores = output[detector.outputNames[level]].data as Float32Array; const boxes = output[detector.outputNames[3 + level]].data as Float32Array; const keypoints = output[detector.outputNames[6 + level]].data as Float32Array;
      for (let i = 0; i < scores.length; i += 1) {
        const confidence = scores[i]; if (confidence < FACE_DETECTION_THRESHOLD) continue; const row = Math.floor(i / grid / 2); const column = Math.floor(i / 2) % grid; const centerX = column * stride; const centerY = row * stride; const base = i * 4;
        const x = ((centerX - boxes[base] * stride) / 640) * width; const y = ((centerY - boxes[base + 1] * stride) / 640) * height; const faceWidth = ((boxes[base] + boxes[base + 2]) * stride / 640) * width; const faceHeight = ((boxes[base + 1] + boxes[base + 3]) * stride / 640) * height;
        if (Math.min(faceWidth, faceHeight) < FACE_MIN_FACE_SIZE) continue;
        const landmarks = Array.from({ length: 5 }, (_, landmark) => ({ x: ((centerX + keypoints[i * 10 + landmark * 2] * stride) / 640) * width, y: ((centerY + keypoints[i * 10 + landmark * 2 + 1] * stride) / 640) * height }));
        faces.push({ confidence, boundingBox: { x, y, width: faceWidth, height: faceHeight }, landmarks, embedding: [], alignedImage: await alignFace(bytes, landmarks, width, height) });
      }
    }
    return nonMaximumSuppression(faces);
  }
  async generateEmbedding(face: DetectedFace) {
    const { recognizer } = await this.sessions(); if (!face.alignedImage) throw new Error("Aligned face image is required"); const rgb = face.alignedImage; const input = new Float32Array(3 * 112 * 112);
    for (let y = 0; y < 112; y += 1) for (let x = 0; x < 112; x += 1) for (let channel = 0; channel < 3; channel += 1) input[channel * 112 * 112 + y * 112 + x] = (rgb[(y * 112 + x) * 3 + channel] - 127.5) / 127.5;
    const output = await recognizer.run({ [recognizer.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, 112, 112]) }); const values = Array.from((output[recognizer.outputNames[0]] as ort.Tensor).data as Float32Array);
    return assertEmbeddingCompatible(normalize(values), this.metadata);
  }
}
async function alignFace(bytes: Buffer, landmarks: FaceLandmark[], width: number, height: number) {
  const source = await sharp(bytes).removeAlpha().raw().toBuffer(); const transform = similarityTransform(landmarks); const denominator = transform.a * transform.a + transform.b * transform.b; const output = Buffer.alloc(112 * 112 * 3);
  for (let y = 0; y < 112; y += 1) for (let x = 0; x < 112; x += 1) { const sourceX = (transform.a * (x - transform.tx) + transform.b * (y - transform.ty)) / denominator; const sourceY = (-transform.b * (x - transform.tx) + transform.a * (y - transform.ty)) / denominator; const imageX = Math.max(0, Math.min(width - 1, Math.round(sourceX))); const imageY = Math.max(0, Math.min(height - 1, Math.round(sourceY))); const sourceIndex = (imageY * width + imageX) * 3; const outputIndex = (y * 112 + x) * 3; output[outputIndex] = source[sourceIndex]; output[outputIndex + 1] = source[sourceIndex + 1]; output[outputIndex + 2] = source[sourceIndex + 2]; }
  return output;
}
function nonMaximumSuppression(faces: DetectedFace[]) { return faces.sort((a, b) => b.confidence - a.confidence).filter((face, index, list) => list.slice(0, index).every((other) => intersectionOverUnion(face.boundingBox, other.boundingBox) < 0.4)); }
function intersectionOverUnion(a: DetectedFace["boundingBox"], b: DetectedFace["boundingBox"]) { const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)); const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); const intersection = width * height; return intersection / (a.width * a.height + b.width * b.height - intersection || 1); }
export function faceProvider(): FaceRecognitionProvider { const configured = (process.env.FACE_PROVIDER || "deterministic").toLowerCase(); if (configured === "deterministic" || configured === "fake") return new DeterministicFaceProvider(); if (configured === "onnx") return new OnnxFaceProvider(); throw new Error(`Unsupported FACE_PROVIDER: ${configured}`); }
let lastObservedAvailability = "";
export function getFaceSearchAvailability(): FaceSearchAvailability {
  try {
    const provider = faceProvider(); assertProviderMetadata(provider.metadata);
    if (provider.readinessClass === "DISABLED") return observeAvailability({ available: false, readinessClass: "DISABLED", reason: "disabled" });
    if (process.env.NODE_ENV === "production" && provider.readinessClass !== "PRODUCTION_READY") return observeAvailability({ available: false, readinessClass: provider.readinessClass, reason: "dev_provider" });
    return observeAvailability({ available: true, readinessClass: provider.readinessClass, provider: { providerId: provider.metadata.providerId, modelId: provider.metadata.modelId, modelVersion: provider.metadata.modelVersion } });
  } catch { return observeAvailability({ available: false, readinessClass: "DISABLED", reason: "unknown_provider" }); }
}
function observeAvailability(availability: FaceSearchAvailability) {
  const signature = JSON.stringify({ available: availability.available, readinessClass: availability.readinessClass, providerId: availability.provider?.providerId, reason: availability.reason });
  if (signature !== lastObservedAvailability) { lastObservedAvailability = signature; console.info(JSON.stringify({ component: "face-search", ...JSON.parse(signature) })); }
  return availability;
}
export function requireFaceProvider() { const availability = getFaceSearchAvailability(); if (!availability.available) throw new FaceSearchUnavailableError(); return faceProvider(); }
