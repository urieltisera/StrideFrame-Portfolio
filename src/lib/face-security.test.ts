import { afterEach, describe, expect, it } from "vitest";
import {
  consumeFaceSearchRateLimit,
  resetFaceSearchSecurityState,
  tryAcquireFaceSearchInference,
  withFaceSearchTimeout,
} from "./face-security";

afterEach(() => resetFaceSearchSecurityState());

describe("Face Search abuse protection", () => {
  it("allows requests under the server-side limit and rejects the next request with a retry window", () => {
    const request = new Request("https://example.test/api/events/city/face-search");
    for (let index = 0; index < 10; index += 1) {
      expect(consumeFaceSearchRateLimit(request, "city").allowed).toBe(true);
    }
    const rejected = consumeFaceSearchRateLimit(request, "city");
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps event and endpoint buckets separate without storing raw network identity", () => {
    const request = new Request("https://example.test/api/events/city/face-search");
    expect(consumeFaceSearchRateLimit(request, "city").allowed).toBe(true);
    expect(consumeFaceSearchRateLimit(request, "other-event").allowed).toBe(true);
  });

  it("bounds inference concurrency without queueing unbounded work", () => {
    const releaseOne = tryAcquireFaceSearchInference();
    const releaseTwo = tryAcquireFaceSearchInference();
    expect(releaseOne).toBeTypeOf("function");
    expect(releaseTwo).toBeTypeOf("function");
    expect(tryAcquireFaceSearchInference()).toBeNull();
    releaseOne?.();
    expect(tryAcquireFaceSearchInference()).toBeTypeOf("function");
    releaseTwo?.();
  });

  it("contains provider work with a timeout and releases capacity after failure", async () => {
    await expect(withFaceSearchTimeout(new Promise<void>(() => undefined), 1_000)).rejects.toThrow("timed out");
    const release = tryAcquireFaceSearchInference();
    expect(release).toBeTypeOf("function");
    release?.();
  }, 2_000);
});
