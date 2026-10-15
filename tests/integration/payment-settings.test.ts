import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { createPendingOrder } from "../../src/lib/orders";
import { startZellePayment } from "../../src/lib/payment-service";
import { getPhotographerPaymentSettings, zelleIsAvailable } from "../../src/lib/payment-settings";
import { confirmManualPayment, getOwnedZelleOrder, rejectManualPayment } from "../../src/lib/manual-payments";
import { authorizeDownload, createDownloadGrant } from "../../src/lib/downloads";

const db = prisma;
const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasDatabase)("photographer payment settings and Zelle boundary", () => {
  beforeEach(async () => {
    await db.paymentDisputeEvent.deleteMany();
    await db.paymentDispute.deleteMany();
    await db.zelleFeeObligationReversal.deleteMany();
    await db.refundItem.deleteMany();
    await db.refund.deleteMany();
    await db.downloadGrant.deleteMany();
    await db.zelleFeeObligation.deleteMany();
    await db.orderItem.deleteMany();
    await db.payment.deleteMany();
    await db.order.deleteMany();
    await db.photo.deleteMany();
    await db.album.deleteMany();
    await db.event.deleteMany();
    await db.photographerPaymentSettings.deleteMany();
    await db.photographer.deleteMany();
  });

  it("defaults Zelle off and isolates each photographer's settings", async () => {
    const first = await db.photographer.create({ data: { email: "settings-one@example.com", name: "One", passwordHash: "x" } });
    const second = await db.photographer.create({ data: { email: "settings-two@example.com", name: "Two", passwordHash: "x" } });
    const own = await getPhotographerPaymentSettings(first.id);
    expect(own.settings.zelleEnabled).toBe(false);
    await db.photographerPaymentSettings.update({ where: { photographerId: first.id }, data: { zelleEnabled: true, zelleDisplayName: "One Photos", zellePaymentIdentifier: "one@example.com" } });
    const other = await getPhotographerPaymentSettings(second.id);
    expect(other.settings.zelleEnabled).toBe(false);
    expect(zelleIsAvailable(other.settings)).toBe(false);
  });

  it("creates an awaiting-confirmation Zelle order with server-owned money/details", async () => {
    const photographer = await db.photographer.create({ data: { email: "zelle-owner@example.com", name: "Owner", passwordHash: "x" } });
    await db.photographerPaymentSettings.create({ data: { photographerId: photographer.id, zelleEnabled: true, zelleDisplayName: "Owner Photos", zellePaymentIdentifier: "owner@example.com", zelleInstructions: "Use the order reference." } });
    const event = await db.event.create({ data: { photographerId: photographer.id, title: "Zelle Event", slug: "zelle-event", accessCode: "zelle-code", status: "PUBLISHED" } });
    const album = await db.album.create({ data: { photographerId: photographer.id, eventId: event.id, title: "Race", slug: "race", status: "PUBLISHED" } });
    const photo = await db.photo.create({ data: { albumId: album.id, originalKey: "private/zelle", previewKey: "public/zelle", originalFilename: "race.jpg", mimeType: "image/jpeg", fileSize: 10, priceOverrideCents: 2750, currency: "USD", status: "PUBLISHED" } });
    const order = await createPendingOrder({ photoIds: [photo.id], email: "buyer@example.com" });
    const details = await startZellePayment(order.publicOrderCode);
    const stored = await db.order.findUnique({ where: { id: order.id }, include: { payment: true, grants: true } });
    expect(details.amountCents).toBe(2750);
    expect(details.displayName).toBe("Owner Photos");
    expect(details.paymentIdentifier).toBe("owner@example.com");
    expect(stored?.status).toBe("AWAITING_PAYMENT_CONFIRMATION");
    expect(stored?.payment?.status).toBe("AWAITING_PAYMENT_CONFIRMATION");
    expect(stored?.payment?.provider).toBe("ZELLE");
    expect(stored?.payment?.platformFeeCents).toBe(25);
    expect(stored?.grants).toHaveLength(0);
  });

  it("authorizes, audits, and idempotently confirms or rejects Zelle orders", async () => {
    const owner = await db.photographer.create({ data: { email: "audit-owner@example.com", name: "Owner", passwordHash: "x" } });
    const other = await db.photographer.create({ data: { email: "audit-other@example.com", name: "Other", passwordHash: "x" } });
    await db.photographerPaymentSettings.create({ data: { photographerId: owner.id, zelleEnabled: true, zelleDisplayName: "Owner Photos", zellePaymentIdentifier: "owner@example.com" } });
    const event = await db.event.create({ data: { photographerId: owner.id, title: "Audit Event", slug: "audit-event", accessCode: "audit-code", status: "PUBLISHED" } });
    const album = await db.album.create({ data: { photographerId: owner.id, eventId: event.id, title: "Race", slug: "race", status: "PUBLISHED" } });
    const photo = await db.photo.create({ data: { albumId: album.id, originalKey: "private/audit", previewKey: "public/audit", originalFilename: "audit.jpg", mimeType: "image/jpeg", fileSize: 10, priceOverrideCents: 3000, currency: "USD", status: "PUBLISHED" } });
    const order = await createPendingOrder({ photoIds: [photo.id], email: "buyer@example.com" });
    await startZellePayment(order.publicOrderCode);
    await expect(getOwnedZelleOrder(other.id, order.id)).resolves.toBeNull();
    await expect(confirmManualPayment({ photographerId: other.id, orderId: order.id })).rejects.toThrow("Zelle order not found");

    const confirmed = await confirmManualPayment({ photographerId: owner.id, orderId: order.id, note: "Verified independently in bank activity" });
    expect(confirmed.idempotent).toBe(false);
    const repeated = await confirmManualPayment({ photographerId: owner.id, orderId: order.id });
    expect(repeated.idempotent).toBe(true);
    const paid = await db.order.findUnique({ where: { id: order.id }, include: { payment: true, grants: true } });
    expect(paid?.status).toBe("PAID");
    expect(paid?.payment?.status).toBe("SUCCEEDED");
    expect(paid?.grants).toHaveLength(1);
    expect(await db.manualPaymentAudit.count({ where: { paymentId: paid!.payment!.id, action: "CONFIRMED" } })).toBe(1);
    const download = await createDownloadGrant(order.id, { rotate: true });
    await expect(authorizeDownload(download!.token, photo.id)).resolves.toMatchObject({ photo: { id: photo.id } });
    await expect(rejectManualPayment({ photographerId: owner.id, orderId: order.id })).rejects.toThrow("not awaiting confirmation");

    const secondPhoto = await db.photo.create({ data: { albumId: album.id, originalKey: "private/reject", previewKey: "public/reject", originalFilename: "reject.jpg", mimeType: "image/jpeg", fileSize: 10, priceOverrideCents: 3100, currency: "USD", status: "PUBLISHED" } });
    const rejectedOrder = await createPendingOrder({ photoIds: [secondPhoto.id], email: "buyer-two@example.com" });
    await startZellePayment(rejectedOrder.publicOrderCode);
    const rejected = await rejectManualPayment({ photographerId: owner.id, orderId: rejectedOrder.id, note: "No matching incoming payment" });
    expect(rejected.order.status).toBe("CANCELLED");
    expect((await rejectManualPayment({ photographerId: owner.id, orderId: rejectedOrder.id })).idempotent).toBe(true);
    await expect(confirmManualPayment({ photographerId: owner.id, orderId: rejectedOrder.id })).rejects.toThrow("not awaiting confirmation");
    const rejectedStored = await db.order.findUnique({ where: { id: rejectedOrder.id }, include: { grants: true } });
    expect(rejectedStored?.grants).toHaveLength(0);
  });

  it("snapshots the fixed fee for every sold photo", async () => {
    const photographer = await db.photographer.create({ data: { email: "bundle-owner@example.com", name: "Bundle Owner", passwordHash: "x" } });
    await db.photographerPaymentSettings.create({ data: { photographerId: photographer.id, zelleEnabled: true, zelleDisplayName: "Bundle Photos", zellePaymentIdentifier: "bundle@example.com" } });
    const event = await db.event.create({ data: { photographerId: photographer.id, title: "Bundle Event", slug: "bundle-event", accessCode: "bundle-code", status: "PUBLISHED" } });
    const album = await db.album.create({ data: { photographerId: photographer.id, eventId: event.id, title: "Bundle", slug: "bundle", status: "PUBLISHED" } });
    const photos = await Promise.all([1, 2, 3, 4].map((index) => db.photo.create({ data: { albumId: album.id, originalKey: `private/bundle-${index}`, previewKey: `public/bundle-${index}`, originalFilename: `bundle-${index}.jpg`, mimeType: "image/jpeg", fileSize: 10, priceOverrideCents: 1000, currency: "USD", status: "PUBLISHED" } })));
    const order = await createPendingOrder({ photoIds: photos.map((photo) => photo.id), email: "bundle-buyer@example.com" });
    await startZellePayment(order.publicOrderCode);
    await confirmManualPayment({ photographerId: photographer.id, orderId: order.id });
    const obligation = await db.zelleFeeObligation.findUnique({ where: { orderId: order.id } });
    expect(order.totalCents).toBe(4000);
    expect(obligation).toMatchObject({ billablePhotoCount: 4, feePerPhotoCents: 25, amountCents: 100, currency: "USD", status: "OPEN" });
  });
});
