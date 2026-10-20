import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createWatermarkedPreview, sha256Hex, validateImage, validatePriceCents, validateUploadBatch, MAX_PHOTO_BYTES, MAX_UPLOAD_BYTES, MAX_PHOTOS_PER_UPLOAD, MAX_IMAGE_PIXELS, MAX_IMAGE_DIMENSION, WATERMARK_TEXT } from "./photos";
import { LocalStorageProvider } from "./storage";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(directory => fs.rm(directory, {recursive:true,force:true}))); });
async function jpeg(width = 120, height = 80) { return sharp({create:{width,height,channels:3,background:{r:30,g:160,b:100}}}).jpeg().toBuffer(); }
describe("photo pipeline", () => {
  it("uses the StrideFrame watermark", () => { expect(WATERMARK_TEXT).toBe("STRIDEFRAME"); });
  it("hashes the exact original byte buffer", () => { const bytes = Buffer.from([0, 1, 2, 255]); expect(sha256Hex(bytes)).toBe("3d1f57c984978ef98a18378c8166c1cb8ede02c03eeb6aee7e2f121dfeee3e56"); });
  it("validates images, creates an optimized watermarked preview, and stores USD cents", async () => { const bytes=await jpeg(); const file=new File([bytes],"race.jpg",{type:"image/jpeg"}); const valid=await validateImage(file); const preview=await createWatermarkedPreview(valid.bytes); expect(preview.contentType).toBe("image/webp"); expect(preview.bytes.length).toBeGreaterThan(0); expect(validatePriceCents(1250)).toBe(1250); });
  it("rejects unsupported, oversized, and corrupted files", async () => { await expect(validateImage(new File(["bad"],"x.txt",{type:"text/plain"}))).rejects.toThrow("Unsupported"); await expect(validateImage(new File(["bad"],"x.jpg",{type:"image/jpeg"}))).rejects.toThrow("corrupted"); });
  it("enforces the pilot upload batch boundaries before decoding", () => {
    const file = (name: string, size: number, type = "image/jpeg") => ({ name, size, type }) as File;
    expect(MAX_PHOTO_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBe(200 * 1024 * 1024);
    expect(MAX_PHOTOS_PER_UPLOAD).toBe(20);
    expect(MAX_IMAGE_PIXELS).toBe(40_000_000);
    expect(MAX_IMAGE_DIMENSION).toBe(10_000);
    expect(validateUploadBatch(Array.from({ length: 20 }, (_, index) => file(`photo-${index}.jpg`, 10 * 1024 * 1024))).totalBytes).toBe(200 * 1024 * 1024);
    expect(() => validateUploadBatch(Array.from({ length: 21 }, (_, index) => file(`photo-${index}.jpg`, 1)))).toThrow("at most 20");
    expect(() => validateUploadBatch([file("large.jpg", 25 * 1024 * 1024 + 1)])).toThrow("25 MB");
    expect(() => validateUploadBatch(Array.from({ length: 11 }, (_, index) => file(`photo-${index}.jpg`, 20 * 1024 * 1024)))).toThrow("smaller than 200 MB");
    expect(() => validateUploadBatch([file("bad.gif", 100, "image/gif")])).toThrow("Unsupported");
  });
  it("rejects images above the pilot dimension and pixel protections", async () => {
    await expect(validateImage(new File([await jpeg(10_001, 1)], "wide.jpg", { type: "image/jpeg" }))).rejects.toThrow();
    await expect(validateImage(new File([await jpeg(6_325, 6_325)], "huge.jpg", { type: "image/jpeg" }))).rejects.toThrow();
  });
  it("keeps local storage isolated and outside public", async () => { const directory=await fs.mkdtemp(path.join(os.tmpdir(),"sportpix-photo-")); temporary.push(directory); const provider=new LocalStorageProvider(directory); await provider.putOriginal({key:"a/original.jpg",bytes:Buffer.from("private"),contentType:"image/jpeg"}); expect(provider.getPublicPreviewUrl("a/preview.webp")).toContain("/api/previews/"); await expect(fs.access(path.join(directory,"originals/a/original.jpg"))).resolves.toBeUndefined(); });
});
