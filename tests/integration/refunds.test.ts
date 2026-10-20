import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createPendingOrder } from "../../src/lib/orders";
import { startZellePayment } from "../../src/lib/payment-service";
import { confirmManualPayment } from "../../src/lib/manual-payments";
import { authorizeDownload, createDownloadGrant } from "../../src/lib/downloads";
import { issueOrderDeliveryCapability, redeemOrderDeliveryCapability } from "../../src/lib/delivery-capabilities";
import { completeManualZelleRefund, prepareManualZelleRefund } from "../../src/lib/refunds";
import { handleProviderDispute as applyDispute } from "../../src/lib/disputes";
import { findReconciliationIssues } from "../../src/lib/reconciliation";

const db = new PrismaClient();
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;

async function createSale(photoCount = 5, priceCents = 1000) {
  const photographer = await db.photographer.create({ data: { email: `refund-${Date.now()}-${Math.random()}@example.com`, name: "Refund Owner", passwordHash: "x" } });
  await db.photographerPaymentSettings.create({ data: { photographerId: photographer.id, zelleEnabled: true, zelleDisplayName: "Refund Owner", zellePaymentIdentifier: "refund@example.com" } });
  const event = await db.event.create({ data: { photographerId: photographer.id, title: "Refund Event", slug: `refund-event-${Date.now()}-${Math.random()}`, accessCode: `refund-code-${Date.now()}-${Math.random()}`, status: "PUBLISHED" } });
  const album = await db.album.create({ data: { photographerId: photographer.id, eventId: event.id, title: "Refund Album", slug: "refund-album", status: "PUBLISHED" } });
  const photos = await Promise.all(Array.from({ length: photoCount }, (_, index) => db.photo.create({ data: { albumId: album.id, originalKey: `private/refund-${index}`, previewKey: `public/refund-${index}`, originalFilename: `refund-${index}.jpg`, mimeType: "image/jpeg", fileSize: 10, priceOverrideCents: priceCents, currency: "USD", status: "PUBLISHED" } })));
  const order = await createPendingOrder({ photoIds: photos.map(photo => photo.id), email: "refund-buyer@example.com" });
  await startZellePayment(order.publicOrderCode);
  await confirmManualPayment({ photographerId: photographer.id, orderId: order.id });
  return { photographer, order, photos };
}

suite("refund, dispute, and reconciliation foundation", () => {
  beforeAll(async () => { await db.$connect(); });
  beforeEach(async () => {
    await db.paymentDisputeEvent.deleteMany();
    await db.paymentDispute.deleteMany();
    await db.zelleFeeObligationReversal.deleteMany();
    await db.refundItem.deleteMany();
    await db.refund.deleteMany();
    await db.zelleFeeObligation.deleteMany();
    await db.downloadGrant.deleteMany();
    await db.orderItem.deleteMany();
    await db.manualPaymentAudit.deleteMany();
    await db.payment.deleteMany();
    await db.order.deleteMany();
    await db.photo.deleteMany();
    await db.album.deleteMany();
    await db.event.deleteMany();
    await db.photographerPaymentSettings.deleteMany();
    await db.photographer.deleteMany();
  });
  afterAll(async () => { await db.$disconnect(); });

  it("partially refunds selected Zelle photos and preserves remaining downloads", async () => {
    const { photographer, order, photos } = await createSale(5, 1000);
    const grant = await createDownloadGrant(order.id, { rotate: true });
    const selectedItems = await db.orderItem.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" }, take: 2 });
    const remainingItem = (await db.orderItem.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } })).find(item => !selectedItems.some(selected => selected.id === item.id))!;
    const refund = await prepareManualZelleRefund({ photographerId: photographer.id, orderId: order.id, itemIds: selectedItems.map(item => item.id), idempotencyKey: "zelle-refund-partial-1" });
    expect(refund.refund.status).toBe("MANUAL_PENDING");
    expect((await db.order.findUnique({ where: { id: order.id } }))?.status).toBe("PAID");
    const completed = await completeManualZelleRefund({ photographerId: photographer.id, refundId: refund.refund.id });
    expect(completed.refund.status).toBe("MANUAL_COMPLETED");
    const stored = await db.order.findUnique({ where: { id: order.id }, include: { payment: true } });
    expect(stored?.status).toBe("PARTIALLY_REFUNDED");
    expect(stored?.payment?.status).toBe("PARTIALLY_REFUNDED");
    expect(await db.zelleFeeObligationReversal.findFirst({ where: { refundId: refund.refund.id } })).toMatchObject({ billablePhotoCount: 2, amountCents: 50 });
    await expect(authorizeDownload(grant!.token, selectedItems[0].photoId)).rejects.toThrow();
    await expect(authorizeDownload(grant!.token, remainingItem.photoId)).resolves.toMatchObject({ photo: { id: remainingItem.photoId } });
    const repeated = await completeManualZelleRefund({ photographerId: photographer.id, refundId: refund.refund.id });
    expect(repeated.idempotent).toBe(true);
    expect(await db.zelleFeeObligationReversal.count({ where: { refundId: refund.refund.id } })).toBe(1);
  });

  it("fully refunds Zelle, voids the fee obligation, and revokes the order grant", async () => {
    const { photographer, order, photos } = await createSale(2, 1000);
    const grant = await createDownloadGrant(order.id, { rotate: true });
    const refund = await prepareManualZelleRefund({ photographerId: photographer.id, orderId: order.id, idempotencyKey: "zelle-refund-full-1" });
    await completeManualZelleRefund({ photographerId: photographer.id, refundId: refund.refund.id });
    expect(await db.order.findUnique({ where: { id: order.id }, select: { status: true } })).toMatchObject({ status: "REFUNDED" });
    expect(await db.zelleFeeObligation.findUnique({ where: { orderId: order.id }, select: { status: true } })).toMatchObject({ status: "VOID" });
    await expect(authorizeDownload(grant!.token, photos[0].id)).rejects.toThrow();
  });

  it("rejects cross-photographer refund access and detects open Zelle obligations", async () => {
    const sale = await createSale(1, 1000);
    const other = await db.photographer.create({ data: { email: "refund-other@example.com", name: "Other", passwordHash: "x" } });
    await expect(prepareManualZelleRefund({ photographerId: other.id, orderId: sale.order.id, idempotencyKey: "cross-refund" })).rejects.toThrow();
    const issues = await findReconciliationIssues(sale.photographer.id);
    expect(issues.some(issue => issue.type === "OPEN_ZELLE_OBLIGATION")).toBe(true);
  });

  it("revokes downloads for an opened then lost Stripe dispute and ignores duplicate events", async () => {
    const { photographer, order, photos } = await createSale(1, 1000);
    await db.payment.update({ where: { orderId: order.id }, data: { provider: "STRIPE", providerPaymentId: "pi_dispute_test" } });
    const payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    await db.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });
    await db.order.update({ where: { id: order.id }, data: { status: "PAID" } });
    expect((await findReconciliationIssues(photographer.id)).some(issue => issue.type === "MISSING_PROVIDER_CHARGE")).toBe(true);
    const grant = await createDownloadGrant(order.id, { rotate: true });
    const opened = await applyDispute({ paymentId: payment.id, providerDisputeId: "dp_test", providerEventId: "evt_dispute_open", status: "OPEN", amountCents: 1000, currency: "USD" });
    expect(opened.idempotent).toBe(false);
    expect(await db.order.findUnique({ where: { id: order.id }, select: { status: true } })).toMatchObject({ status: "PAYMENT_DISPUTED" });
    const lost = await applyDispute({ paymentId: payment.id, providerDisputeId: "dp_test", providerEventId: "evt_dispute_lost", status: "LOST", amountCents: 1000, currency: "USD" });
    expect(lost.idempotent).toBe(false);
    expect(await db.order.findUnique({ where: { id: order.id }, select: { status: true } })).toMatchObject({ status: "REFUNDED" });
    await expect(authorizeDownload(grant!.token, photos[0].id)).rejects.toThrow();
    const duplicate = await applyDispute({ paymentId: payment.id, providerDisputeId: "dp_test", providerEventId: "evt_dispute_lost", status: "LOST", amountCents: 1000, currency: "USD" });
    expect(duplicate.idempotent).toBe(true);
    expect(photographer.id).toBeTruthy();
  });

  it("restores only fresh delivery authorization after a dispute is won", async () => {
    const { order, photos } = await createSale(1, 1000);
    await db.payment.update({ where: { orderId: order.id }, data: { provider: "STRIPE", providerPaymentId: "pi_dispute_won_test" } });
    const payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    const oldGrant = await createDownloadGrant(order.id, { rotate: true });
    const oldCapability = await issueOrderDeliveryCapability(order.id);

    await applyDispute({ paymentId: payment.id, providerDisputeId: "dp_won_test", providerEventId: "evt_won_open", status: "OPEN", amountCents: 1000, currency: "USD" });
    await expect(authorizeDownload(oldGrant!.token, photos[0].id)).rejects.toThrow();
    await expect(redeemOrderDeliveryCapability(oldCapability.token)).rejects.toThrow();

    await applyDispute({ paymentId: payment.id, providerDisputeId: "dp_won_test", providerEventId: "evt_won_close", status: "WON", amountCents: 1000, currency: "USD" });
    expect(await db.order.findUnique({ where: { id: order.id }, select: { status: true } })).toMatchObject({ status: "PAID" });
    expect(await db.payment.findUnique({ where: { id: payment.id }, select: { status: true } })).toMatchObject({ status: "SUCCEEDED" });
    expect(await db.downloadGrant.findUnique({ where: { orderId: order.id }, select: { tokenHash: true, status: true } })).toMatchObject({ status: "ACTIVE" });
    await expect(authorizeDownload(oldGrant!.token, photos[0].id)).rejects.toThrow();
    await expect(redeemOrderDeliveryCapability(oldCapability.token)).rejects.toThrow();

    const newGrant = await createDownloadGrant(order.id, { rotate: true });
    const newCapability = await issueOrderDeliveryCapability(order.id);
    await expect(authorizeDownload(newGrant!.token, photos[0].id)).resolves.toMatchObject({ photo: { id: photos[0].id } });
    await expect(redeemOrderDeliveryCapability(newCapability.token)).resolves.toMatchObject({ orderId: order.id });
    expect(await db.transactionalEmailOutbox.count({ where: { orderId: order.id, kind: "PAID_PHOTO_DELIVERY" } })).toBe(1);
  });

  it("does not bypass an individual refund when a dispute is won", async () => {
    const { order } = await createSale(2, 1000);
    await db.payment.update({ where: { orderId: order.id }, data: { provider: "STRIPE", providerPaymentId: "pi_partial_won_test" } });
    const payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    const items = await db.orderItem.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    await db.orderItem.update({ where: { id: items[0].id }, data: { refundedAt: new Date() } });
    const refundedStateItems = await db.orderItem.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    await db.payment.update({ where: { id: payment.id }, data: { status: "PARTIALLY_REFUNDED" } });
    await db.order.update({ where: { id: order.id }, data: { status: "PARTIALLY_REFUNDED" } });
    const grant = await createDownloadGrant(order.id, { rotate: true });

    await applyDispute({ paymentId: payment.id, providerDisputeId: "dp_partial_won_test", providerEventId: "evt_partial_open", status: "OPEN", amountCents: 1000, currency: "USD" });
    await applyDispute({ paymentId: payment.id, providerDisputeId: "dp_partial_won_test", providerEventId: "evt_partial_won", status: "WON", amountCents: 1000, currency: "USD" });
    expect(await db.order.findUnique({ where: { id: order.id }, select: { status: true } })).toMatchObject({ status: "PARTIALLY_REFUNDED" });
    const refundedItem = refundedStateItems.find(item => item.refundedAt !== null)!;
    const remainingItem = refundedStateItems.find(item => item.refundedAt === null)!;
    await expect(authorizeDownload(grant!.token, refundedItem.photoId)).rejects.toThrow();
    const fresh = await createDownloadGrant(order.id, { rotate: true });
    await expect(authorizeDownload(fresh!.token, remainingItem.photoId)).resolves.toMatchObject({ photo: { id: remainingItem.photoId } });
    await expect(authorizeDownload(fresh!.token, refundedItem.photoId)).rejects.toThrow();
  });
});
