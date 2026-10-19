import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentPhotographer: vi.fn(),
  validateUploadBatch: vi.fn(),
  validatePriceCents: vi.fn((value: number) => value),
  createPhoto: vi.fn(),
  getOrCreateInternalLibraryEvent: vi.fn(),
  getOwnedUploadAlbum: vi.fn(),
  createDraftEvent: vi.fn(),
  prisma: { album: { update: vi.fn() }, event: { findFirst: vi.fn() } },
}));

vi.mock("@/lib/auth", () => ({ getCurrentPhotographer: mocks.getCurrentPhotographer }));
vi.mock("@/lib/photos", () => ({ createPhoto: mocks.createPhoto, validatePriceCents: mocks.validatePriceCents, validateUploadBatch: mocks.validateUploadBatch }));
vi.mock("@/lib/upload-workflow", () => ({ getOrCreateInternalLibraryEvent: mocks.getOrCreateInternalLibraryEvent, getOwnedUploadAlbum: mocks.getOwnedUploadAlbum, getOrCreateDefaultAlbum: vi.fn() }));
vi.mock("@/lib/events", () => ({ createDraftEvent: mocks.createDraftEvent }));
vi.mock("@/lib/money", () => ({ dollarsToCents: (value: string) => Math.round(Number(value) * 100) }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/pricing", () => ({ MINIMUM_PAID_PHOTO_PRICE_CENTS: 100 }));

import { POST } from "./route";

function request(fields: Record<string, string>, files: File[] = []) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  files.forEach((file) => form.append("photos", file));
  return new Request("http://localhost/api/photographer/upload", { method: "POST", body: form });
}

describe("photographer upload API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentPhotographer.mockResolvedValue({ id: "photographer-a" });
    mocks.getOrCreateInternalLibraryEvent.mockResolvedValue({ id: "event-a" });
    mocks.getOwnedUploadAlbum.mockResolvedValue({ id: "album-a", status: "DRAFT" });
    mocks.createPhoto.mockResolvedValue({ id: "photo-created" });
  });

  it("rejects unauthenticated requests before reading upload data", async () => {
    mocks.getCurrentPhotographer.mockResolvedValue(null);
    const response = await POST(request({ albumId: "album-a", priceDollars: "5.00" }, [new File(["a"], "a.jpg", { type: "image/jpeg" })]));
    expect(response.status).toBe(401);
    expect(mocks.validateUploadBatch).not.toHaveBeenCalled();
  });

  it("rejects a foreign or non-owned album", async () => {
    mocks.getOwnedUploadAlbum.mockResolvedValue(null);
    const response = await POST(request({ albumId: "album-foreign", priceDollars: "5.00" }, [new File(["a"], "a.jpg", { type: "image/jpeg" })]));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Album not found for this event" });
    expect(mocks.createPhoto).not.toHaveBeenCalled();
  });

  it("rejects uploads into published albums", async () => {
    mocks.getOwnedUploadAlbum.mockResolvedValue({ id: "album-published", status: "PUBLISHED" });
    const response = await POST(request({ albumId: "album-published", priceDollars: "5.00" }, [new File(["a"], "a.jpg", { type: "image/jpeg" })]));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Only a draft album can receive uploads" });
    expect(mocks.createPhoto).not.toHaveBeenCalled();
  });

  it("maps a backend minimum-price rejection without creating photos", async () => {
    mocks.validatePriceCents.mockImplementationOnce(() => { throw new Error("Photo price must be between 100 and 10000000 cents"); });
    const response = await POST(request({ albumId: "album-a", priceDollars: "0.30" }, [new File(["a"], "a.jpg", { type: "image/jpeg" })]));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Price must be at least $1.00 per photo." });
    expect(mocks.createPhoto).not.toHaveBeenCalled();
  });

  it("uploads to the requested draft album and reports partial errors", async () => {
    mocks.createPhoto.mockResolvedValueOnce({ id: "photo-one" }).mockRejectedValueOnce(new Error("corrupted image"));
    const response = await POST(request({ albumId: "album-a", priceDollars: "12.50" }, [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
    ]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ eventId: "event-a", albumId: "album-a", uploaded: 1, errors: ["b.jpg: corrupted image"] });
    expect(mocks.createPhoto).toHaveBeenCalledTimes(2);
    expect(mocks.createPhoto).toHaveBeenCalledWith(expect.objectContaining({ photographerId: "photographer-a", albumId: "album-a" }));
    expect(mocks.prisma.album.update).toHaveBeenCalledWith({ where: { id: "album-a" }, data: { priceCents: 1250 } });
  });
});
