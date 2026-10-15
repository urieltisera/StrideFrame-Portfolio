import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { assertEmbeddingCompatible, DeterministicFaceProvider, faceCompatibilityKey, faceProvider, getFaceSearchAvailability, requireFaceProvider } from "./face-provider";
import { FACE_SEARCH_CONSENT_FIELD, FACE_SEARCH_CONSENT_VALUE, hasFaceSearchConsent, validateSelfie } from "./face-search";

afterEach(() => vi.unstubAllEnvs());

describe("face provider boundary", () => {
  it("returns deterministic normalized embeddings without persisting input", async () => {
    const provider = new DeterministicFaceProvider();
    const faces = await provider.detectFaces(Buffer.from("known-selfie"));
    expect(faces).toHaveLength(1);
    expect(faces[0].embedding).toHaveLength(512);
    expect(Math.sqrt(faces[0].embedding.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1);
    expect(provider.modelVersion).toBeTruthy();
    expect(provider.metadata.providerId).toBe("deterministic");
    expect(provider.metadata.readinessClass).toBe("DEV_VALIDATION_ONLY");
  });
  it("rejects unsupported and ambiguous selfie inputs", async () => {
    await expect(validateSelfie(new File(["x"], "selfie.txt", { type: "text/plain" }))).rejects.toThrow("Unsupported");
    await expect(validateSelfie(new File(["NO_FACE"], "selfie.jpg", { type: "image/jpeg" }))).rejects.toThrow("No face");
    await expect(validateSelfie(new File(["MULTI_FACE"], "selfie.jpg", { type: "image/jpeg" }))).rejects.toThrow("one clear face");
  });

  it("requires explicit Face Search consent and does not treat a generic form as consent", () => {
    expect(hasFaceSearchConsent(new FormData())).toBe(false);
    const consent = new FormData();
    consent.set(FACE_SEARCH_CONSENT_FIELD, FACE_SEARCH_CONSENT_VALUE);
    expect(hasFaceSearchConsent(consent)).toBe(true);
    consent.set(FACE_SEARCH_CONSENT_FIELD, "terms-accepted");
    expect(hasFaceSearchConsent(consent)).toBe(false);
    consent.set(FACE_SEARCH_CONSENT_FIELD, "true");
    expect(hasFaceSearchConsent(consent)).toBe(false);
    consent.set(FACE_SEARCH_CONSENT_FIELD, FACE_SEARCH_CONSENT_VALUE);
    consent.append(FACE_SEARCH_CONSENT_FIELD, "unexpected");
    expect(hasFaceSearchConsent(consent)).toBe(false);
  });

  it("rejects empty, malformed, and extension-mismatched query images", async () => {
    await expect(validateSelfie(new File([], "selfie.jpg", { type: "image/jpeg" }))).rejects.toThrow("allowed size");
    await expect(validateSelfie(new File(["not an image"], "selfie.jpg", { type: "image/jpeg" }))).rejects.toThrow("Malformed");
    await expect(validateSelfie(new File(["NO_FACE"], "selfie.png", { type: "image/jpeg" }))).rejects.toThrow("extension");
  });

  it("rejects decoded dimensions before face inference", async () => {
    const oversized = await sharp({ create: { width: 6001, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    await expect(validateSelfie(new File([oversized], "selfie.png", { type: "image/png" }))).rejects.toThrow("dimensions");
  });

  it("keeps deterministic and ONNX providers development-only", () => {
    expect(faceProvider().readinessClass).toBe("DEV_VALIDATION_ONLY");
    vi.stubEnv("FACE_PROVIDER", "onnx");
    expect(faceProvider().metadata.providerId).toBe("onnx");
    expect(faceProvider().readinessClass).toBe("DEV_VALIDATION_ONLY");
  });

  it("fails closed in production without a production-authorized provider", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FACE_PROVIDER", "deterministic");
    expect(getFaceSearchAvailability()).toMatchObject({ available: false, reason: "dev_provider" });
    expect(() => requireFaceProvider()).toThrow("currently unavailable");
  });

  it("fails closed for unknown providers without exposing configuration details", () => {
    vi.stubEnv("FACE_PROVIDER", "not-a-provider");
    expect(getFaceSearchAvailability()).toMatchObject({ available: false, reason: "unknown_provider" });
    expect(() => requireFaceProvider()).toThrow("currently unavailable");
  });

  it("rejects embeddings from an incompatible space", () => {
    const provider = new DeterministicFaceProvider();
    expect(() => assertEmbeddingCompatible([1, 2], provider.metadata)).toThrow("incompatible");
  });

  it("creates a stable compatibility identity from persisted provider metadata", () => {
    const provider = new DeterministicFaceProvider();
    const key = faceCompatibilityKey(provider.metadata);
    expect(key).toContain("deterministic");
    expect(key).toContain(provider.metadata.modelVersion);
    expect(faceCompatibilityKey({ ...provider.metadata })).toBe(key);
  });
});
