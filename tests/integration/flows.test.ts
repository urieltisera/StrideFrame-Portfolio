import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPhoto, deletePhoto } from "../../src/lib/photos";
import { sha256Hex } from "../../src/lib/photos";
import { deletePhotoSafely } from "../../src/lib/photos";
import { createDraftEvent } from "../../src/lib/events";
import { getOrCreateDefaultAlbum, getOrCreateInternalLibraryEvent, internalLibraryEventSlug } from "../../src/lib/upload-workflow";
import { createAlbumFromSelectedPhotos } from "../../src/lib/album-creation";
import { addPhotosToDraftAlbum, createEmptyAlbumForPhotographer, removePhotoFromDraftAlbum } from "../../src/lib/album-membership";
import { deleteDraftAlbumSafely } from "../../src/lib/album-lifecycle";
import { issueVerificationToken, verifyEmailToken } from "../../src/lib/email";
import { publishAlbumForPhotographer } from "../../src/lib/album-publication";
import { LocalStorageProvider } from "../../src/lib/storage";
import { createPendingOrder, validateCheckoutInput } from "../../src/lib/orders";
import { getOrCreatePaymentSettings } from "../../src/lib/payment-settings";
import { startZellePayment } from "../../src/lib/payment-service";
import { markPaymentFromWebhook } from "../../src/lib/payments";
import { createDownloadGrant, authorizeDownload, revokeOrderDownloads, downloadTokenHash } from "../../src/lib/downloads";
import { GET as previewGET } from "../../src/app/api/previews/[...key]/route";

const db = new PrismaClient();
const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

suite("PostgreSQL critical flows", () => {
  beforeAll(async () => { await db.$connect(); });
  beforeEach(async () => { await db.paymentDisputeEvent.deleteMany(); await db.paymentDispute.deleteMany(); await db.zelleFeeObligationReversal.deleteMany(); await db.refundItem.deleteMany(); await db.refund.deleteMany(); await db.zelleFeeObligation.deleteMany(); await db.downloadGrant.deleteMany(); await db.orderItem.deleteMany(); await db.payment.deleteMany(); await db.order.deleteMany(); await db.photo.deleteMany(); await db.album.deleteMany(); await db.event.deleteMany(); await db.photographer.deleteMany(); });
  afterAll(async () => { await db.$disconnect(); });

  it("persists registration, rejects duplicate email, and verifies login", async () => {
    const hash = await bcrypt.hash("password-123", 4);
    const photographer = await db.photographer.create({data:{email:"one@example.com",name:"One",passwordHash:hash}});
    expect(await bcrypt.compare("password-123", photographer.passwordHash)).toBe(true);
    await expect(db.photographer.create({data:{email:"one@example.com",name:"Duplicate",passwordHash:hash}})).rejects.toThrow();
    expect(await bcrypt.compare("wrong", photographer.passwordHash)).toBe(false);
  });
  it("requires expiring single-use email verification tokens", async () => {
    const photographer = await db.photographer.create({ data: { email: "verify@example.com", name: "Verify", passwordHash: "x" } });
    const issued = await issueVerificationToken(photographer.id);
    expect(issued.sent).toBe(true);
    expect(await issueVerificationToken(photographer.id)).toMatchObject({ sent: false, reason: "cooldown" });
    expect(await verifyEmailToken("wrong-token")).toBe("invalid");
    expect(await verifyEmailToken(issued.token!)).toBe("verified");
    expect(await verifyEmailToken(issued.token!)).toBe("invalid");
    const expired = await db.photographer.create({ data: { email: "expired@example.com", name: "Expired", passwordHash: "x" } });
    const expiredToken = await issueVerificationToken(expired.id);
    await db.photographer.update({ where: { id: expired.id }, data: { emailVerificationExpiresAt: new Date(Date.now() - 1000) } });
    expect(await verifyEmailToken(expiredToken.token!)).toBe("expired");
  });
  it("defaults appearance to BLACK and keeps photographer themes isolated", async () => {
    const [first, second] = await Promise.all([
      db.photographer.create({ data: { email: "theme-first@example.com", name: "Theme First", passwordHash: "x" } }),
      db.photographer.create({ data: { email: "theme-second@example.com", name: "Theme Second", passwordHash: "x" } }),
    ]);
    expect(first.appearanceTheme).toBe("BLACK");
    expect(second.appearanceTheme).toBe("BLACK");
    await db.photographer.update({ where: { id: first.id }, data: { appearanceTheme: "LIGHT" } });
    expect((await db.photographer.findUnique({ where: { id: first.id }, select: { appearanceTheme: true } }))?.appearanceTheme).toBe("LIGHT");
    expect((await db.photographer.findUnique({ where: { id: second.id }, select: { appearanceTheme: true } }))?.appearanceTheme).toBe("BLACK");
  });
  it("enforces event and album ownership and public publication filters", async () => {
    const [a,b] = await Promise.all([db.photographer.create({data:{email:"a@example.com",name:"A",passwordHash:"x"}}),db.photographer.create({data:{email:"b@example.com",name:"B",passwordHash:"x"}})]);
    const event = await db.event.create({data:{photographerId:a.id,title:"Race",slug:"race",accessCode:"racecode",status:"PUBLISHED"}});
    const album = await db.album.create({data:{photographerId:a.id,eventId:event.id,title:"Finish",slug:"finish",status:"PUBLISHED"}});
    expect(await db.event.findFirst({where:{id:event.id,photographerId:b.id}})).toBeNull();
    expect(await db.event.updateMany({where:{id:event.id,photographerId:b.id},data:{title:"Hacked"}})).toMatchObject({count:0});
    expect(await db.event.updateMany({where:{id:event.id,photographerId:b.id},data:{status:"DRAFT"}})).toMatchObject({count:0});
    expect(await db.event.updateMany({where:{id:event.id,photographerId:a.id},data:{status:"DRAFT"}})).toMatchObject({count:1});
    expect(await db.event.findFirst({where:{slug:"race",status:"PUBLISHED"}})).toBeNull();
    expect(await db.event.updateMany({where:{id:event.id,photographerId:a.id},data:{status:"PUBLISHED"}})).toMatchObject({count:1});
    expect(await db.album.deleteMany({where:{id:album.id,photographerId:b.id}})).toMatchObject({count:0});
    expect(await db.event.findFirst({where:{slug:"race",status:"PUBLISHED"},include:{albums:{where:{status:"PUBLISHED"}}}})).toMatchObject({title:"Race",albums:[{title:"Finish"}]});
    await db.album.update({where:{id:album.id},data:{status:"DRAFT"}});
    expect((await db.event.findFirst({where:{slug:"race",status:"PUBLISHED"},include:{albums:{where:{status:"PUBLISHED"}}}}))?.albums).toHaveLength(0);
  });
  it("creates collision-safe draft events and reuses the owned default upload album", async () => {
    const owner = await db.photographer.create({ data: { email: "upload-owner@example.com", name: "Upload Owner", passwordHash: "x" } });
    const first = await createDraftEvent({ photographerId: owner.id, title: "Race Day", description: "Saturday" });
    const second = await createDraftEvent({ photographerId: owner.id, title: "Race Day" });
    expect(first.slug).toBe("race-day");
    expect(second.slug).toBe("race-day-2");
    expect(first.status).toBe("DRAFT");
    expect(second.status).toBe("DRAFT");
    const album = await getOrCreateDefaultAlbum({ eventId: first.id, photographerId: owner.id, priceCents: 500 });
    const reused = await getOrCreateDefaultAlbum({ eventId: first.id, photographerId: owner.id, priceCents: 800 });
    expect(reused.id).toBe(album.id);
    expect(reused.slug).toBe("event-photos");
    expect(reused.priceCents).toBe(800);
    await expect(getOrCreateDefaultAlbum({ eventId: first.id, photographerId: "not-owner", priceCents: 500 })).rejects.toThrow("not owned");
  });
  it("validates checkout before order creation and preserves the valid Zelle lifecycle", async () => {
    const owner = await db.photographer.create({ data: { email: "checkout-owner@example.com", name: "Checkout Owner", passwordHash: "x" } });
    const event = await db.event.create({ data: { photographerId: owner.id, title: "Checkout Event", slug: "checkout-event", accessCode: "checkout-code", status: "PUBLISHED" } });
    const album = await db.album.create({ data: { photographerId: owner.id, eventId: event.id, title: "Checkout Album", slug: "checkout-album", status: "PUBLISHED", priceCents: 1500 } });
    const photo = await db.photo.create({ data: { albumId: album.id, originalKey: "private/checkout", previewKey: "public/checkout", originalFilename: "checkout.jpg", mimeType: "image/jpeg", fileSize: 10, status: "PUBLISHED" } });
    const settings = await getOrCreatePaymentSettings(owner.id);
    await db.photographerPaymentSettings.update({ where: { id: settings.id }, data: { zelleEnabled: true, zelleDisplayName: "Checkout Owner", zellePaymentIdentifier: "checkout@example.com" } });
    const initialOrders = await db.order.count();

    await expect(validateCheckoutInput({ photoIds: [photo.id], email: "invalid", paymentMethod: "zelle" })).rejects.toThrow();
    await expect(validateCheckoutInput({ photoIds: [photo.id], email: "buyer@example.com", paymentMethod: "" })).rejects.toThrow();
    await expect(validateCheckoutInput({ photoIds: [photo.id], email: "buyer@example.com", paymentMethod: "stripe" })).rejects.toThrow("Stripe payments are not currently available");
    expect(await db.order.count()).toBe(initialOrders);

    await db.photo.update({ where: { id: photo.id }, data: { status: "DRAFT" } });
    await expect(validateCheckoutInput({ photoIds: [photo.id], email: "buyer@example.com", paymentMethod: "zelle" })).rejects.toThrow("no longer available");
    expect(await db.order.count()).toBe(initialOrders);
    await db.photo.update({ where: { id: photo.id }, data: { status: "PUBLISHED" } });

    const other = await db.photographer.create({ data: { email: "checkout-other@example.com", name: "Checkout Other", passwordHash: "x" } });
    const otherEvent = await db.event.create({ data: { photographerId: other.id, title: "Other Checkout Event", slug: "other-checkout-event", accessCode: "other-checkout-code", status: "PUBLISHED" } });
    const otherAlbum = await db.album.create({ data: { photographerId: other.id, eventId: otherEvent.id, title: "Other Checkout Album", slug: "other-checkout-album", status: "PUBLISHED" } });
    const otherPhoto = await db.photo.create({ data: { albumId: otherAlbum.id, originalKey: "private/other-checkout", previewKey: "public/other-checkout", originalFilename: "other-checkout.jpg", mimeType: "image/jpeg", fileSize: 10, status: "PUBLISHED" } });
    await expect(validateCheckoutInput({ photoIds: [photo.id, otherPhoto.id], email: "buyer@example.com", paymentMethod: "zelle" })).rejects.toThrow("one photographer");
    expect(await db.order.count()).toBe(initialOrders);

    const validated = await validateCheckoutInput({ photoIds: [photo.id], email: "buyer@example.com", paymentMethod: "zelle" });
    const order = await createPendingOrder({ photoIds: validated.context.ids, email: validated.email });
    await startZellePayment(order.publicOrderCode);
    expect(await db.order.count()).toBe(initialOrders + 1);
    expect((await db.order.findUnique({ where: { id: order.id } }))?.status).toBe("AWAITING_PAYMENT_CONFIRMATION");
    expect(await db.order.count({ where: { customerEmail: "buyer@example.com" } })).toBe(1);
  });
  it("resolves one private library context per photographer without cross-owner reuse", async () => {
    const [owner, other] = await Promise.all([
      db.photographer.create({ data: { email: "library-owner@example.com", name: "Library Owner", passwordHash: "x" } }),
      db.photographer.create({ data: { email: "library-other@example.com", name: "Library Other", passwordHash: "x" } }),
    ]);
    const first = await getOrCreateInternalLibraryEvent(owner.id);
    const reused = await getOrCreateInternalLibraryEvent(owner.id);
    const separate = await getOrCreateInternalLibraryEvent(other.id);
    expect(reused.id).toBe(first.id);
    expect(first.slug).toBe(internalLibraryEventSlug(owner.id));
    expect(first.slug).not.toBe(separate.slug);
    expect(first.photographerId).toBe(owner.id);
    expect(first.status).toBe("DRAFT");
    expect(first.title).toBe("Private library");
    expect(await db.event.findFirst({ where: { id: first.id, status: "PUBLISHED" } })).toBeNull();
    await expect(getOrCreateDefaultAlbum({ eventId: first.id, photographerId: other.id, priceCents: 500 })).rejects.toThrow("not owned");
  });
  it("keeps the private library upload relationship and face-search event scope intact", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sportpix-library-"));
    const provider = new LocalStorageProvider(directory);
    const owner = await db.photographer.create({ data: { email: "library-upload@example.com", name: "Library Upload", passwordHash: "x" } });
    try {
      const event = await getOrCreateInternalLibraryEvent(owner.id);
      const album = await getOrCreateDefaultAlbum({ eventId: event.id, photographerId: owner.id, priceCents: 500 });
      const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#ff5a1f" } }).jpeg().toBuffer();
      const photo = await createPhoto({ photographerId: owner.id, albumId: album.id, file: new File([bytes], "library.jpg", { type: "image/jpeg" }), provider });
      expect(photo.albumId).toBe(album.id);
      expect((await db.album.findUnique({ where: { id: album.id }, select: { eventId: true } }))?.eventId).toBe(event.id);
      expect(await db.photoFace.findFirst({ where: { photoId: photo.id, eventId: { not: event.id } } })).toBeNull();
      expect(await db.event.findUnique({ where: { id: event.id }, select: { status: true } })).toMatchObject({ status: "DRAFT" });
      await deletePhoto(photo.id, owner.id, provider);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it("creates a private album from selected library photos and synchronizes FaceSearch album metadata", async () => {
    const [owner, other] = await Promise.all([
      db.photographer.create({ data: { email: "album-create-owner@example.com", name: "Album Owner", passwordHash: "x" } }),
      db.photographer.create({ data: { email: "album-create-other@example.com", name: "Album Other", passwordHash: "x" } }),
    ]);
    const library = await getOrCreateInternalLibraryEvent(owner.id);
    const defaultAlbum = await getOrCreateDefaultAlbum({ eventId: library.id, photographerId: owner.id, priceCents: 500 });
    const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#132238" } }).jpeg().toBuffer();
    const photos = await Promise.all([
      db.photo.create({ data: { albumId: defaultAlbum.id, originalKey: "private/a", previewKey: "public/a", originalFilename: "a.jpg", mimeType: "image/jpeg", fileSize: bytes.length, priceOverrideCents: null, status: "PUBLISHED" } }),
      db.photo.create({ data: { albumId: defaultAlbum.id, originalKey: "private/b", previewKey: "public/b", originalFilename: "b.jpg", mimeType: "image/jpeg", fileSize: bytes.length, priceOverrideCents: 800, status: "DRAFT" } }),
      db.photo.create({ data: { albumId: defaultAlbum.id, originalKey: "private/c", previewKey: "public/c", originalFilename: "c.jpg", mimeType: "image/jpeg", fileSize: bytes.length, priceOverrideCents: null, status: "PUBLISHED" } }),
    ]);
    const compatibilityKey = "album-create-test";
    await db.$executeRawUnsafe(`INSERT INTO "PhotoFace" ("id","photoId","eventId","albumId","embedding","detectionConfidence","boundingBox","faceIndex","providerId","modelId","modelVersion","embeddingFormatVersion","embeddingDimension","similarityMetric","compatibilityKey","createdAt") VALUES ($1,$2,$3,$4,array_fill(0::real, ARRAY[512])::vector,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,NOW())`, crypto.randomUUID(), photos[0].id, library.id, defaultAlbum.id, 0.9, JSON.stringify({ x: 1 }), 0, "test", "test", "test", "test", 512, "COSINE", compatibilityKey);
    const created = await createAlbumFromSelectedPhotos({ photographerId: owner.id, photoIds: photos.slice(0, 2).map((photo) => photo.id), name: "Race Day", priceCents: 650 });
    expect(created.eventId).toBe(library.id);
    expect(created.slug).toBe("race-day");
    expect(created.status).toBe("DRAFT");
    expect(await db.photo.findMany({ where: { id: { in: photos.map((photo) => photo.id) } }, select: { id: true, albumId: true, status: true, priceOverrideCents: true } })).toEqual(expect.arrayContaining([
      { id: photos[0].id, albumId: created.id, status: "PUBLISHED", priceOverrideCents: null },
      { id: photos[1].id, albumId: created.id, status: "DRAFT", priceOverrideCents: 800 },
      { id: photos[2].id, albumId: defaultAlbum.id, status: "PUBLISHED", priceOverrideCents: null },
    ]));
    expect(await db.photoFace.findUnique({ where: { photoId_compatibilityKey_faceIndex: { photoId: photos[0].id, compatibilityKey, faceIndex: 0 } }, select: { eventId: true, albumId: true } })).toEqual({ eventId: library.id, albumId: created.id });
    await expect(createAlbumFromSelectedPhotos({ photographerId: owner.id, photoIds: [photos[2].id], name: "Race Day", priceCents: 650 })).resolves.toMatchObject({ slug: "race-day-2" });
    const otherLibrary = await getOrCreateInternalLibraryEvent(other.id);
    const otherPhoto = await db.photo.create({ data: { albumId: (await getOrCreateDefaultAlbum({ eventId: otherLibrary.id, photographerId: other.id, priceCents: 500 })).id, originalKey: "private/other", previewKey: "public/other", originalFilename: "other.jpg", mimeType: "image/jpeg", fileSize: bytes.length } });
    await expect(createAlbumFromSelectedPhotos({ photographerId: owner.id, photoIds: [photos[0].id, otherPhoto.id], name: "Invalid", priceCents: 500 })).rejects.toThrow("private library");
    await expect(createAlbumFromSelectedPhotos({ photographerId: owner.id, photoIds: [photos[0].id, photos[0].id], name: "Duplicate", priceCents: 500 })).rejects.toThrow("invalid");
  });
  it("creates empty draft albums and preserves photos while editing draft membership", async () => {
    const [owner, other] = await Promise.all([
      db.photographer.create({ data: { email: "membership-owner@example.com", name: "Membership Owner", passwordHash: "x" } }),
      db.photographer.create({ data: { email: "membership-other@example.com", name: "Membership Other", passwordHash: "x" } }),
    ]);
    const library = await getOrCreateInternalLibraryEvent(owner.id);
    const privateAlbum = await getOrCreateDefaultAlbum({ eventId: library.id, photographerId: owner.id, priceCents: 500 });
    const draft = await createEmptyAlbumForPhotographer({ photographerId: owner.id, name: "Empty Draft", priceCents: 700 });
    expect(draft.status).toBe("DRAFT");
    expect(await db.photo.count({ where: { albumId: draft.id } })).toBe(0);
    const photo = await db.photo.create({ data: { albumId: privateAlbum.id, originalKey: "private/membership-original", previewKey: "private/membership-preview", originalFilename: "membership.jpg", mimeType: "image/jpeg", fileSize: 10, status: "PUBLISHED" } });
    const compatibilityKey = "membership-test";
    await db.$executeRawUnsafe(`INSERT INTO "PhotoFace" ("id","photoId","eventId","albumId","embedding","detectionConfidence","boundingBox","faceIndex","providerId","modelId","modelVersion","embeddingFormatVersion","embeddingDimension","similarityMetric","compatibilityKey","createdAt") VALUES ($1,$2,$3,$4,array_fill(0::real, ARRAY[512])::vector,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,NOW())`, crypto.randomUUID(), photo.id, library.id, privateAlbum.id, 0.9, JSON.stringify({ x: 1 }), 0, "test", "test", "test", "test", 512, "COSINE", compatibilityKey);
    await addPhotosToDraftAlbum({ photographerId: owner.id, albumId: draft.id, photoIds: [photo.id] });
    expect((await db.photo.findUnique({ where: { id: photo.id }, select: { albumId: true, originalKey: true } }))).toEqual({ albumId: draft.id, originalKey: "private/membership-original" });
    expect(await db.photoFace.findUnique({ where: { photoId_compatibilityKey_faceIndex: { photoId: photo.id, compatibilityKey, faceIndex: 0 } }, select: { eventId: true, albumId: true } })).toEqual({ eventId: library.id, albumId: draft.id });
    await expect(addPhotosToDraftAlbum({ photographerId: owner.id, albumId: draft.id, photoIds: [photo.id] })).rejects.toThrow("private library");
    const otherLibrary = await getOrCreateInternalLibraryEvent(other.id);
    const otherAlbum = await getOrCreateDefaultAlbum({ eventId: otherLibrary.id, photographerId: other.id, priceCents: 500 });
    const otherPhoto = await db.photo.create({ data: { albumId: otherAlbum.id, originalKey: "private/other-membership", previewKey: "private/other-membership-preview", originalFilename: "other.jpg", mimeType: "image/jpeg", fileSize: 10 } });
    await expect(addPhotosToDraftAlbum({ photographerId: owner.id, albumId: draft.id, photoIds: [otherPhoto.id] })).rejects.toThrow("owned");
    const beforeRemoval = await db.photo.findUniqueOrThrow({ where: { id: photo.id }, select: { originalKey: true, previewKey: true } });
    await removePhotoFromDraftAlbum({ photographerId: owner.id, albumId: draft.id, photoId: photo.id });
    expect(await db.photo.findUnique({ where: { id: photo.id }, select: { albumId: true, originalKey: true, previewKey: true } })).toEqual({ albumId: privateAlbum.id, ...beforeRemoval });
    expect(await db.photoFace.findUnique({ where: { photoId_compatibilityKey_faceIndex: { photoId: photo.id, compatibilityKey, faceIndex: 0 } }, select: { eventId: true, albumId: true } })).toEqual({ eventId: library.id, albumId: privateAlbum.id });
    await addPhotosToDraftAlbum({ photographerId: owner.id, albumId: draft.id, photoIds: [photo.id] });
    expect((await db.photo.findUnique({ where: { id: photo.id }, select: { albumId: true } }))?.albumId).toBe(draft.id);
  });
  it("safely deletes eligible photos and draft albums without losing library photos", async () => {
    const [owner, other] = await Promise.all([
      db.photographer.create({ data: { email: "delete-owner@example.com", name: "Delete Owner", passwordHash: "x" } }),
      db.photographer.create({ data: { email: "delete-other@example.com", name: "Delete Other", passwordHash: "x" } }),
    ]);
    const library = await getOrCreateInternalLibraryEvent(owner.id);
    const defaultAlbum = await getOrCreateDefaultAlbum({ eventId: library.id, photographerId: owner.id, priceCents: 500 });
    const draft = await createEmptyAlbumForPhotographer({ photographerId: owner.id, name: "Delete Draft", priceCents: 500 });
    const photo = await db.photo.create({ data: { albumId: draft.id, originalKey: "private/delete-original", previewKey: "private/delete-preview", originalFilename: "delete.jpg", mimeType: "image/jpeg", fileSize: 10 } });
    await addPhotosToDraftAlbum({ photographerId: owner.id, albumId: draft.id, photoIds: [photo.id] }).catch(() => undefined);
    await expect(deleteDraftAlbumSafely(draft.id, other.id)).rejects.toThrow("not owned");
    await deleteDraftAlbumSafely(draft.id, owner.id);
    expect(await db.album.findUnique({ where: { id: draft.id } })).toBeNull();
    expect((await db.photo.findUnique({ where: { id: photo.id }, select: { albumId: true } }))?.albumId).toBe(defaultAlbum.id);
    const deleteEligible = await db.photo.create({ data: { albumId: defaultAlbum.id, originalKey: "private/delete-safe-original", previewKey: "private/delete-safe-preview", originalFilename: "safe.jpg", mimeType: "image/jpeg", fileSize: 10 } });
    await expect(deletePhotoSafely(deleteEligible.id, other.id)).rejects.toThrow("not found or not owned");
    await deletePhotoSafely(deleteEligible.id, owner.id);
    expect(await db.photo.findUnique({ where: { id: deleteEligible.id } })).toBeNull();
  });
  it("runs the owner-only photo pipeline and keeps originals outside public storage", async () => {
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),"sportpix-integration-")); const provider=new LocalStorageProvider(directory);
    const [owner,other]=await Promise.all([db.photographer.create({data:{email:"photo-owner@example.com",name:"Owner",passwordHash:"x"}}),db.photographer.create({data:{email:"photo-other@example.com",name:"Other",passwordHash:"x"}})]);
    const event=await db.event.create({data:{photographerId:owner.id,title:"Photo Event",slug:"photo-event",accessCode:"photo-code",status:"PUBLISHED"}}); const album=await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"Album",slug:"album",status:"PUBLISHED"}});
    const bytes=await sharp({create:{width:64,height:64,channels:3,background:"#229977"}}).jpeg().toBuffer(); const file=new File([bytes],"photo.jpg",{type:"image/jpeg"});
    const photo=await createPhoto({photographerId:owner.id,albumId:album.id,file,priceOverrideCents:1250,provider}); expect(photo.priceOverrideCents).toBe(1250); expect(photo.currency).toBe("USD"); expect(await db.faceIndexJob.findUnique({where:{photoId:photo.id}})).toMatchObject({photoId:photo.id,status:"PENDING"}); expect((await db.photo.findUnique({where:{id:photo.id},include:{album:true}}))?.album.eventId).toBe(event.id); await expect(createPhoto({photographerId:other.id,albumId:album.id,file,priceOverrideCents:1250,provider})).rejects.toThrow("not owned"); await expect(createPhoto({photographerId:owner.id,albumId:album.id,file:new File(["bad"],"bad.txt",{type:"text/plain"}),priceOverrideCents:1250,provider})).rejects.toThrow("Unsupported"); await expect(fs.access(path.join(directory,"originals",photo.originalKey))).resolves.toBeUndefined(); await deletePhoto(photo.id,owner.id,provider); await expect(db.photo.findUnique({where:{id:photo.id}})).resolves.toBeNull(); await fs.rm(directory,{recursive:true,force:true});
  });
  it("serves only published local previews and never exposes missing/private files", async () => {
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),"sportpix-preview-")); const previousDirectory=process.env.STORAGE_LOCAL_DIR; const previousProvider=process.env.STORAGE_PROVIDER; process.env.STORAGE_LOCAL_DIR=directory; delete process.env.STORAGE_PROVIDER;
    try {
      const owner=await db.photographer.create({data:{email:"preview-owner@example.com",name:"Preview Owner",passwordHash:"x"}}); const event=await db.event.create({data:{photographerId:owner.id,title:"Preview Event",slug:"preview-event",accessCode:"preview-code",status:"PUBLISHED"}}); const album=await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"Preview Album",slug:"preview-album",status:"PUBLISHED"}}); const bytes=await sharp({create:{width:32,height:32,channels:3,background:"#ff5a1f"}}).webp().toBuffer(); const photo=await createPhoto({photographerId:owner.id,albumId:album.id,file:new File([bytes],"preview.webp",{type:"image/webp"}),priceOverrideCents:500,provider:new LocalStorageProvider(directory)});
      const published=await previewGET(new Request("http://localhost/api/previews/"+photo.previewKey),{params:Promise.resolve({key:photo.previewKey.split("/")})}); expect(published.status).toBe(200); expect(published.headers.get("content-type")).toContain("image/webp");
      await db.photo.update({where:{id:photo.id},data:{status:"DRAFT"}}); const draft=await previewGET(new Request("http://localhost/api/previews/"+photo.previewKey),{params:Promise.resolve({key:photo.previewKey.split("/")})}); expect(draft.status).toBe(404);
      await db.photo.update({where:{id:photo.id},data:{status:"PUBLISHED",previewKey:"missing/preview.webp"}}); const missing=await previewGET(new Request("http://localhost/api/previews/missing/preview.webp"),{params:Promise.resolve({key:["missing","preview.webp"]})}); expect(missing.status).toBe(404);
      await db.photo.update({where:{id:photo.id},data:{previewKey:photo.previewKey}}); await db.album.update({where:{id:album.id},data:{status:"DRAFT"}}); const privateAlbum=await previewGET(new Request("http://localhost/api/previews/"+photo.previewKey),{params:Promise.resolve({key:photo.previewKey.split("/")})}); expect(privateAlbum.status).toBe(404);
    } finally { previousDirectory===undefined?delete process.env.STORAGE_LOCAL_DIR:process.env.STORAGE_LOCAL_DIR=previousDirectory; previousProvider===undefined?delete process.env.STORAGE_PROVIDER:process.env.STORAGE_PROVIDER=previousProvider; await fs.rm(directory,{recursive:true,force:true}); }
  });
  it("creates canonical QR links and enforces publication during resolution", async () => {
    const [owner,other]=await Promise.all([db.photographer.create({data:{email:"qr-owner@example.com",name:"Owner",passwordHash:"x"}}),db.photographer.create({data:{email:"qr-other@example.com",name:"Other",passwordHash:"x"}})]);
    const event=await db.event.create({data:{photographerId:owner.id,title:"QR Event",slug:"qr-event",accessCode:"qr-code",status:"DRAFT"}}); const album=await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"QR Album",slug:"qr-album",status:"PUBLISHED"}}); const code="opaque-qr-code";
    const link=await db.qRLink.create({data:{code,photographerId:owner.id,eventId:event.id}}); expect(link.code).not.toContain(event.id); expect(await db.qRLink.findFirst({where:{eventId:event.id,photographerId:other.id}})).toBeNull();
    expect(await db.qRLink.findFirst({where:{code,status:"ACTIVE",event:{status:"PUBLISHED"}}})).toBeNull(); await db.event.update({where:{id:event.id},data:{status:"PUBLISHED"}}); expect(await db.qRLink.findFirst({where:{code,status:"ACTIVE",event:{status:"PUBLISHED"}}})).not.toBeNull(); await db.qRLink.update({where:{id:link.id},data:{status:"DISABLED"}}); expect(await db.qRLink.findFirst({where:{code,status:"ACTIVE"}})).toBeNull(); await db.qRLink.update({where:{id:link.id},data:{status:"ACTIVE"}}); expect(await db.qRLink.findFirst({where:{code,status:"ACTIVE",event:{status:"PUBLISHED"}}})).not.toBeNull(); await db.album.update({where:{id:album.id},data:{status:"DRAFT"}}); const albumQr=await db.qRLink.create({data:{code:"album-opaque-code",photographerId:owner.id,albumId:album.id}}); expect(await db.qRLink.findFirst({where:{id:albumQr.id,status:"ACTIVE",album:{status:"PUBLISHED",event:{status:"PUBLISHED"}}}})).toBeNull();
  });
  it("publishes an owned album with its event and reuses a stable QR without publishing draft photos", async () => {
    const [owner, other] = await Promise.all([db.photographer.create({data:{email:"publish-owner@example.com",name:"Owner",passwordHash:"x"}}), db.photographer.create({data:{email:"publish-other@example.com",name:"Other",passwordHash:"x"}})]);
    const event = await db.event.create({data:{photographerId:owner.id,title:"Private Event",slug:"private-publish-event",accessCode:"private-publish-code",status:"DRAFT"}});
    const album = await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"Finish Line",slug:"finish-line",status:"DRAFT"}});
    const publishedPhoto = await db.photo.create({data:{albumId:album.id,originalKey:"private/published",previewKey:"public/published",originalFilename:"published.jpg",mimeType:"image/jpeg",fileSize:10,status:"PUBLISHED"}});
    const draftPhoto = await db.photo.create({data:{albumId:album.id,originalKey:"private/draft",previewKey:"public/draft",originalFilename:"draft.jpg",mimeType:"image/jpeg",fileSize:10,status:"DRAFT"}});
    await expect(publishAlbumForPhotographer(album.id, other.id)).rejects.toThrow("not owned");
    await publishAlbumForPhotographer(album.id, owner.id);
    const first = await db.qRLink.findFirst({where:{albumId:album.id}});
    expect(await db.event.findUnique({where:{id:event.id},select:{status:true}})).toMatchObject({status:"PUBLISHED"});
    expect(await db.album.findUnique({where:{id:album.id},select:{status:true}})).toMatchObject({status:"PUBLISHED"});
    expect(await db.photo.findUnique({where:{id:publishedPhoto.id},select:{status:true}})).toMatchObject({status:"PUBLISHED"});
    expect(await db.photo.findUnique({where:{id:draftPhoto.id},select:{status:true}})).toMatchObject({status:"DRAFT"});
    await db.album.update({where:{id:album.id},data:{status:"DRAFT"}});
    expect(await db.qRLink.findFirst({where:{id:first?.id,status:"ACTIVE",album:{status:"PUBLISHED",event:{status:"PUBLISHED"}}}})).toBeNull();
    await publishAlbumForPhotographer(album.id, owner.id);
    const second = await db.qRLink.findFirst({where:{albumId:album.id}});
    expect(second?.code).toBe(first?.code);
  });
  it("publishes an internal library album without exposing sibling or default albums", async () => {
    const owner = await db.photographer.create({ data: { email: "library-publish-owner@example.com", name: "Library Publish Owner", passwordHash: "x" } });
    const library = await getOrCreateInternalLibraryEvent(owner.id);
    const defaultAlbum = await getOrCreateDefaultAlbum({ eventId: library.id, photographerId: owner.id, priceCents: 500 });
    const album = await db.album.create({ data: { photographerId: owner.id, eventId: library.id, title: "Finish Line", slug: "finish-line", status: "DRAFT", priceCents: 700 } });
    const sibling = await db.album.create({ data: { photographerId: owner.id, eventId: library.id, title: "Later", slug: "later", status: "DRAFT" } });
    await db.photo.create({ data: { albumId: album.id, originalKey: "private/library-publish", previewKey: "public/library-publish", originalFilename: "finish.jpg", mimeType: "image/jpeg", fileSize: 10, status: "PUBLISHED" } });
    await publishAlbumForPhotographer(album.id, owner.id);
    const firstQr = await db.qRLink.findFirst({ where: { albumId: album.id, status: "ACTIVE" } });
    expect(await db.event.findUnique({ where: { id: library.id }, select: { status: true } })).toMatchObject({ status: "PUBLISHED" });
    expect(await db.album.findUnique({ where: { id: album.id }, select: { status: true } })).toMatchObject({ status: "PUBLISHED" });
    expect(await db.album.findUnique({ where: { id: sibling.id }, select: { status: true } })).toMatchObject({ status: "DRAFT" });
    expect(await db.album.findUnique({ where: { id: defaultAlbum.id }, select: { status: true } })).toMatchObject({ status: "DRAFT" });
    expect(await db.album.findFirst({ where: { id: sibling.id, status: "PUBLISHED", event: { status: "PUBLISHED" } } })).toBeNull();
    expect(await db.album.findFirst({ where: { id: defaultAlbum.id, status: "PUBLISHED", event: { status: "PUBLISHED" } } })).toBeNull();
    await publishAlbumForPhotographer(album.id, owner.id);
    expect(await db.qRLink.count({ where: { albumId: album.id } })).toBe(1);
    expect((await db.qRLink.findFirst({ where: { albumId: album.id } }))?.code).toBe(firstQr?.code);
  });
  it("keeps public profiles scoped, opt-in, and independent from event QR links", async () => {
    const [owner, other] = await Promise.all([db.photographer.create({data:{email:"profile-owner@example.com",name:"Profile Owner",passwordHash:"x",publicSlug:"profile-owner-a1b2c3",publicProfileEnabled:true}}), db.photographer.create({data:{email:"profile-other@example.com",name:"Profile Other",passwordHash:"x",publicSlug:"profile-other-d4e5f6",publicProfileEnabled:false}})]);
    const published = await db.event.create({data:{photographerId:owner.id,title:"Published Work",slug:"published-work",accessCode:"published-profile-code",status:"PUBLISHED"}});
    await db.event.create({data:{photographerId:owner.id,title:"Private Work",slug:"private-work",accessCode:"private-profile-code",status:"DRAFT"}});
    await db.event.create({data:{photographerId:other.id,title:"Other Work",slug:"other-work",accessCode:"other-profile-code",status:"PUBLISHED"}});
    const profile = await db.photographer.findUnique({where:{publicSlug:owner.publicSlug!},select:{name:true,publicProfileEnabled:true,events:{where:{status:"PUBLISHED"},select:{slug:true,photographerId:true}}}});
    expect(profile).toMatchObject({name:"Profile Owner",publicProfileEnabled:true,events:[{slug:published.slug,photographerId:owner.id}]});
    expect(profile?.events.some((event) => event.slug === "private-work" || event.slug === "other-work")).toBe(false);
    await db.photographer.update({where:{id:owner.id},data:{publicProfileEnabled:false}});
    expect(await db.photographer.findFirst({where:{publicSlug:owner.publicSlug!,publicProfileEnabled:true}})).toBeNull();
    await db.photographer.update({where:{id:owner.id},data:{publicProfileEnabled:true}});
    expect((await db.photographer.findUnique({where:{id:owner.id},select:{publicSlug:true}}))?.publicSlug).toBe("profile-owner-a1b2c3");
  });
  it("creates a pending order with server-side price snapshots", async () => {
    const owner=await db.photographer.create({data:{email:"order-owner@example.com",name:"Owner",passwordHash:"x"}}); const event=await db.event.create({data:{photographerId:owner.id,title:"Order Event",slug:"order-event",accessCode:"order-code",status:"PUBLISHED"}}); const album=await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"Order Album",slug:"order-album",status:"PUBLISHED"}}); const photo=await db.photo.create({data:{albumId:album.id,originalKey:"private/a",previewKey:"public/a",originalFilename:"a.jpg",mimeType:"image/jpeg",fileSize:10,priceOverrideCents:1250,currency:"USD",status:"PUBLISHED"}});
    const order=await createPendingOrder({photoIds:[photo.id],email:"buyer@example.com"}); expect(order.status).toBe("PENDING_PAYMENT"); expect(order.totalCents).toBe(1250); expect(order.items[0].unitPriceCents).toBe(1250); await db.photo.update({where:{id:photo.id},data:{priceOverrideCents:2500}}); expect((await db.orderItem.findUnique({where:{id:order.items[0].id}}))?.unitPriceCents).toBe(1250); await expect(createPendingOrder({photoIds:[photo.id],email:"bad"})).rejects.toThrow();
  });
  it("resolves album inheritance, overrides, and immutable order prices", async () => {
    const owner = await db.photographer.create({ data: { email: "pricing-owner@example.com", name: "Pricing Owner", passwordHash: "x" } });
    const event = await db.event.create({ data: { photographerId: owner.id, title: "Pricing Event", slug: "pricing-event", accessCode: "pricing-code", status: "PUBLISHED" } });
    const album = await db.album.create({ data: { photographerId: owner.id, eventId: event.id, title: "Pricing Album", slug: "pricing-album", status: "PUBLISHED", priceCents: 500 } });
    const photos = await Promise.all([null, 800, null].map((priceOverrideCents, index) => db.photo.create({ data: { albumId: album.id, originalKey: `private/pricing-${index}`, previewKey: `public/pricing-${index}`, originalFilename: `pricing-${index}.jpg`, mimeType: "image/jpeg", fileSize: 10, priceOverrideCents, currency: "USD", status: "PUBLISHED" } })));
    const firstOrder = await createPendingOrder({ photoIds: photos.map((photo) => photo.id), email: "pricing-buyer@example.com" });
    expect(firstOrder.totalCents).toBe(1800);
    expect(Object.fromEntries(firstOrder.items.map((item) => [item.photoId, item.unitPriceCents]))).toEqual({ [photos[0].id]: 500, [photos[1].id]: 800, [photos[2].id]: 500 });
    await db.album.update({ where: { id: album.id }, data: { priceCents: 600 } });
    const secondOrder = await createPendingOrder({ photoIds: photos.map((photo) => photo.id), email: "pricing-buyer-2@example.com" });
    expect(secondOrder.totalCents).toBe(2000);
    expect(Object.fromEntries(secondOrder.items.map((item) => [item.photoId, item.unitPriceCents]))).toEqual({ [photos[0].id]: 600, [photos[1].id]: 800, [photos[2].id]: 600 });
    expect(Object.fromEntries((await db.orderItem.findMany({ where: { orderId: firstOrder.id } })).map((item) => [item.photoId, item.unitPriceCents]))).toEqual({ [photos[0].id]: 500, [photos[1].id]: 800, [photos[2].id]: 500 });
  });
  it("creates hashed paid-order grants and authorizes only purchased photos", async () => {
    const owner=await db.photographer.create({data:{email:"delivery-owner@example.com",name:"Owner",passwordHash:"x"}}); const event=await db.event.create({data:{photographerId:owner.id,title:"Delivery Event",slug:"delivery-event",accessCode:"delivery-code",status:"PUBLISHED"}}); const album=await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"Delivery Album",slug:"delivery-album",status:"PUBLISHED"}}); const photo=await db.photo.create({data:{albumId:album.id,originalKey:"private/delivery",previewKey:"public/delivery",originalFilename:"delivery.jpg",mimeType:"image/jpeg",fileSize:10,priceOverrideCents:1250,currency:"USD",status:"PUBLISHED"}}); const order=await createPendingOrder({photoIds:[photo.id],email:"delivery@example.com"}); await expect(createDownloadGrant(order.id)).rejects.toThrow(); await db.order.update({where:{id:order.id},data:{status:"PAID"}}); const grant=await createDownloadGrant(order.id); expect(grant?.token).toBeTruthy(); const stored=await db.downloadGrant.findFirst({where:{orderId:order.id}}); expect(stored?.tokenHash).toBe(downloadTokenHash(grant!.token));
    await expect(authorizeDownload(grant!.token,photo.id)).resolves.toMatchObject({photo:{id:photo.id}}); await revokeOrderDownloads(order.id); await expect(authorizeDownload(grant!.token,photo.id)).rejects.toThrow(); await db.order.update({where:{id:order.id},data:{status:"REFUNDED"}}); await expect(authorizeDownload(grant!.token,photo.id)).rejects.toThrow();
  });
  it("persists and delivers byte-identical original masters", async () => {
    const owner = await db.photographer.create({ data: { email: "integrity-owner@example.com", name: "Integrity Owner", passwordHash: "x" } });
    const event = await db.event.create({ data: { photographerId: owner.id, title: "Integrity Event", slug: "integrity-event", accessCode: "integrity-code", status: "PUBLISHED" } });
    const album = await db.album.create({ data: { photographerId: owner.id, eventId: event.id, title: "Integrity Album", slug: "integrity-album", status: "PUBLISHED", priceCents: 1250 } });
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "strideframe-integrity-"));
    const previousProvider = process.env.STORAGE_PROVIDER;
    const previousDirectory = process.env.STORAGE_LOCAL_DIR;
    process.env.STORAGE_PROVIDER = "local";
    process.env.STORAGE_LOCAL_DIR = directory;
    try {
      const bytes = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 20, g: 100, b: 180 } } }).png().toBuffer();
      const photo = await createPhoto({ photographerId: owner.id, albumId: album.id, file: new File([bytes], "integrity.png", { type: "image/png" }), provider: new LocalStorageProvider(directory) });
      expect(photo.originalSha256).toBe(sha256Hex(bytes));
      await expect(new LocalStorageProvider(directory).getProtectedOriginal(photo.originalKey)).resolves.toEqual(bytes);
      const order = await createPendingOrder({ photoIds: [photo.id], email: "integrity-buyer@example.com" });
      await db.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      const grant = await createDownloadGrant(order.id);
      const authorized = await authorizeDownload(grant!.token, photo.id);
      const downloaded = await new LocalStorageProvider(directory).getProtectedOriginal(authorized.photo.originalKey);
      expect(downloaded).toEqual(bytes);
      expect(sha256Hex(downloaded)).toBe(photo.originalSha256);
    } finally {
      if (previousProvider === undefined) delete process.env.STORAGE_PROVIDER; else process.env.STORAGE_PROVIDER = previousProvider;
      if (previousDirectory === undefined) delete process.env.STORAGE_LOCAL_DIR; else process.env.STORAGE_LOCAL_DIR = previousDirectory;
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it("finalizes Stripe confirmation with one reusable download entitlement", async () => {
    const owner = await db.photographer.create({ data: { email: "stripe-confirm-owner@example.com", name: "Stripe Owner", passwordHash: "x" } });
    const event = await db.event.create({ data: { photographerId: owner.id, title: "Stripe Event", slug: "stripe-event", accessCode: "stripe-code", status: "PUBLISHED" } });
    const album = await db.album.create({ data: { photographerId: owner.id, eventId: event.id, title: "Stripe Album", slug: "stripe-album", status: "PUBLISHED", priceCents: 1250 } });
    const photo = await db.photo.create({ data: { albumId: album.id, originalKey: "private/stripe", previewKey: "public/stripe", originalFilename: "stripe.jpg", mimeType: "image/jpeg", fileSize: 10, priceOverrideCents: 1250, currency: "USD", status: "PUBLISHED" } });
    const order = await createPendingOrder({ photoIds: [photo.id], email: "stripe-buyer@example.com" });
    const payment = await db.payment.create({ data: { orderId: order.id, provider: "STRIPE", providerPaymentId: "pi_stripe_confirm", amount: order.totalCents, currency: order.currency, idempotencyKey: `stripe-confirm:${order.id}` } });
    await markPaymentFromWebhook({ paymentId: payment.id, providerPaymentId: "pi_stripe_confirm", status: "SUCCEEDED" });
    await markPaymentFromWebhook({ paymentId: payment.id, providerPaymentId: "pi_stripe_confirm", status: "SUCCEEDED" });
    const confirmed = await db.order.findUnique({ where: { id: order.id }, include: { payment: true, grants: true } });
    expect(confirmed?.status).toBe("PAID");
    expect(confirmed?.payment?.status).toBe("SUCCEEDED");
    expect(confirmed?.grants).toHaveLength(1);
  });
});
