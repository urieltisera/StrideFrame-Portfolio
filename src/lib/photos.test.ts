import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createWatermarkedPreview, validateImage, validatePriceCents, WATERMARK_TEXT } from "./photos";
import { LocalStorageProvider } from "./storage";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(directory => fs.rm(directory, {recursive:true,force:true}))); });
async function jpeg() { return sharp({create:{width:120,height:80,channels:3,background:{r:30,g:160,b:100}}}).jpeg().toBuffer(); }
describe("photo pipeline", () => {
  it("uses the StrideFrame watermark", () => { expect(WATERMARK_TEXT).toBe("STRIDEFRAME"); });
  it("validates images, creates an optimized watermarked preview, and stores USD cents", async () => { const bytes=await jpeg(); const file=new File([bytes],"race.jpg",{type:"image/jpeg"}); const valid=await validateImage(file); const preview=await createWatermarkedPreview(valid.bytes); expect(preview.contentType).toBe("image/webp"); expect(preview.bytes.length).toBeGreaterThan(0); expect(validatePriceCents(1250)).toBe(1250); });
  it("rejects unsupported, oversized, and corrupted files", async () => { await expect(validateImage(new File(["bad"],"x.txt",{type:"text/plain"}))).rejects.toThrow("Unsupported"); await expect(validateImage(new File(["bad"],"x.jpg",{type:"image/jpeg"}))).rejects.toThrow("corrupted"); });
  it("keeps local storage isolated and outside public", async () => { const directory=await fs.mkdtemp(path.join(os.tmpdir(),"sportpix-photo-")); temporary.push(directory); const provider=new LocalStorageProvider(directory); await provider.putOriginal({key:"a/original.jpg",bytes:Buffer.from("private"),contentType:"image/jpeg"}); expect(provider.getPublicPreviewUrl("a/preview.webp")).toContain("/api/previews/"); await expect(fs.access(path.join(directory,"originals/a/original.jpg"))).resolves.toBeUndefined(); });
});
