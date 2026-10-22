import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentPhotographer: vi.fn(),
  findFirst: vi.fn(),
  getProtectedPreview: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentPhotographer: mocks.getCurrentPhotographer }));
vi.mock("@/lib/prisma", () => ({ prisma: { photo: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/storage-factory", () => ({ createStorageProvider: () => ({ getProtectedPreview: mocks.getProtectedPreview }) }));

import { GET } from "./route";

function requestFor(key: string) {
  return GET(new Request(`http://localhost/api/photographer/previews/${key}`), { params: Promise.resolve({ key: key.split("/") }) });
}

describe("authenticated photographer previews", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies anonymous access without querying a photo", async () => {
    mocks.getCurrentPhotographer.mockResolvedValueOnce(null);
    const response = await requestFor("owner/event/photo.webp");
    expect(response.status).toBe(404);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("serves an owned draft preview through protected storage", async () => {
    mocks.getCurrentPhotographer.mockResolvedValueOnce({ id: "owner" });
    mocks.findFirst.mockResolvedValueOnce({ id: "photo" });
    mocks.getProtectedPreview.mockResolvedValueOnce(Buffer.from("preview-bytes"));
    const response = await requestFor("owner/event/photo.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("preview-bytes");
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { previewKey: "owner/event/photo.webp", album: { photographerId: "owner" } }, select: { id: true } });
  });

  it("denies another photographer without revealing ownership", async () => {
    mocks.getCurrentPhotographer.mockResolvedValueOnce({ id: "other" });
    mocks.findFirst.mockResolvedValueOnce(null);
    const response = await requestFor("owner/event/photo.webp");
    expect(response.status).toBe(404);
    expect(mocks.getProtectedPreview).not.toHaveBeenCalled();
  });

  it("returns 404 when the owned preview file is missing", async () => {
    mocks.getCurrentPhotographer.mockResolvedValueOnce({ id: "owner" });
    mocks.findFirst.mockResolvedValueOnce({ id: "photo" });
    mocks.getProtectedPreview.mockRejectedValueOnce(new Error("ENOENT"));
    expect((await requestFor("owner/event/missing.webp")).status).toBe(404);
  });

  it("rejects traversal keys before authentication or storage access", async () => {
    const response = await requestFor("owner/../originals/private.jpg");
    expect(response.status).toBe(404);
    expect(mocks.getCurrentPhotographer).not.toHaveBeenCalled();
    expect(mocks.getProtectedPreview).not.toHaveBeenCalled();
  });
});
