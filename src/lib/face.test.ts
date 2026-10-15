import { afterEach, describe, expect, it, vi } from "vitest";
import { assertEmbeddingCompatible, DeterministicFaceProvider, faceCompatibilityKey, faceProvider, getFaceSearchAvailability, requireFaceProvider } from "./face-provider";
import { validateSelfie } from "./face-search";

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
