import { describe, expect, it } from "vitest";
import { DeterministicFaceProvider } from "./face-provider";
import { validateSelfie } from "./face-search";

describe("face provider boundary", () => {
  it("returns deterministic normalized embeddings without persisting input", async () => {
    const provider = new DeterministicFaceProvider();
    const faces = await provider.detectFaces(Buffer.from("known-selfie"));
    expect(faces).toHaveLength(1);
    expect(faces[0].embedding).toHaveLength(512);
    expect(Math.sqrt(faces[0].embedding.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1);
    expect(provider.modelVersion).toBeTruthy();
  });
  it("rejects unsupported and ambiguous selfie inputs", async () => {
    await expect(validateSelfie(new File(["x"], "selfie.txt", { type: "text/plain" }))).rejects.toThrow("Unsupported");
    await expect(validateSelfie(new File(["NO_FACE"], "selfie.jpg", { type: "image/jpeg" }))).rejects.toThrow("No face");
    await expect(validateSelfie(new File(["MULTI_FACE"], "selfie.jpg", { type: "image/jpeg" }))).rejects.toThrow("one clear face");
  });
});
