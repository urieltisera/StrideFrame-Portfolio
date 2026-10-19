import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_UPLOAD, MAX_UPLOAD_BYTES, supportedMimeTypes, validateUploadBatch } from "./photo-config";
import { PHOTOGRAPHER_UPLOAD_ENDPOINT, priceDollarsFromCents } from "./upload-contract";

describe("photographer upload contract", () => {
  it("uses the shared API endpoint and serializes album price in USD", () => {
    expect(PHOTOGRAPHER_UPLOAD_ENDPOINT).toBe("/api/photographer/upload");
    expect(priceDollarsFromCents(1250)).toBe("12.50");
    expect(priceDollarsFromCents(5)).toBe("0.05");
  });

  it("supports albumId and repeated photos in the multipart contract", () => {
    const form = new FormData();
    form.append("albumId", "album-owned");
    form.append("priceDollars", priceDollarsFromCents(500));
    form.append("photos", new File(["a"], "a.jpg", { type: "image/jpeg" }));
    form.append("photos", new File(["b"], "b.webp", { type: "image/webp" }));
    expect(form.get("albumId")).toBe("album-owned");
    expect(form.get("priceDollars")).toBe("5.00");
    expect(form.getAll("photos")).toHaveLength(2);
  });

  it("shares the server-enforced client validation boundaries", () => {
    const file = (name: string, size: number, type = "image/jpeg") => ({ name, size, type }) as File;
    expect(validateUploadBatch([file("ok.jpg", 1)])).toEqual({ totalBytes: 1 });
    expect(() => validateUploadBatch(Array.from({ length: MAX_PHOTOS_PER_UPLOAD + 1 }, (_, index) => file(`${index}.jpg`, 1)))).toThrow();
    expect(() => validateUploadBatch([file("large.jpg", MAX_PHOTO_BYTES + 1)])).toThrow();
    expect(() => validateUploadBatch([file("batch.jpg", MAX_UPLOAD_BYTES + 1)])).toThrow();
    expect(() => validateUploadBatch([file("bad.gif", 1, "image/gif")])).toThrow();
    expect(supportedMimeTypes).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});
