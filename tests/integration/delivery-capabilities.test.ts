import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { issueOrderDeliveryCapability, redeemOrderDeliveryCapability, deliveryCapabilityTokenHash } from "../../src/lib/delivery-capabilities";

const db = new PrismaClient();
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;

suite("customer delivery capabilities", () => {
  beforeAll(async () => { await db.$connect(); });
  beforeEach(async () => {
    await db.orderDeliveryCapability.deleteMany();
    await db.orderItem.deleteMany();
    await db.payment.deleteMany();
    await db.order.deleteMany();
    await db.photo.deleteMany();
    await db.album.deleteMany();
    await db.event.deleteMany();
    await db.photographer.deleteMany();
  });
  afterAll(async () => { await db.$disconnect(); });

  async function createOrder(status: "PAID" | "PENDING_PAYMENT" = "PAID") {
    const suffix = crypto.randomUUID();
    const photographer = await db.photographer.create({ data: { email: `delivery-${suffix}@example.com`, name: "Delivery Owner", passwordHash: "x" } });
    const event = await db.event.create({ data: { photographerId: photographer.id, title: "Delivery Event", slug: `delivery-${suffix}`, accessCode: `delivery-${suffix}`, status: "PUBLISHED" } });
    const album = await db.album.create({ data: { photographerId: photographer.id, eventId: event.id, title: "Delivery Album", slug: "delivery-album", status: "PUBLISHED" } });
    const photo = await db.photo.create({ data: { albumId: album.id, originalKey: "private/delivery", previewKey: "public/delivery", originalFilename: "delivery.jpg", mimeType: "image/jpeg", fileSize: 10, status: "PUBLISHED" } });
    const order = await db.order.create({ data: { publicOrderCode: `ORDER-${suffix}`, eventId: event.id, photographerId: photographer.id, customerEmail: "buyer@example.com", currency: "USD", subtotalCents: 1500, totalCents: 1500, status, items: { create: { photoId: photo.id, unitPriceCents: 1500, originalFilename: photo.originalFilename } }, payment: { create: { provider: "ZELLE", amount: 1500, currency: "USD", idempotencyKey: `payment-${suffix}`, status: status === "PAID" ? "SUCCEEDED" : "PENDING" } } } });
    return { order, photo };
  }

  it("issues a hashed capability for a paid order and redeems it once", async () => {
    const { order } = await createOrder();
    const issued = await issueOrderDeliveryCapability(order.id);
    const stored = await db.orderDeliveryCapability.findUnique({ where: { orderId: order.id } });
    expect(stored?.tokenHash).toBe(deliveryCapabilityTokenHash(issued.token));
    expect(stored?.tokenHash).not.toBe(issued.token);
    await expect(redeemOrderDeliveryCapability(issued.token)).resolves.toMatchObject({ orderId: order.id, publicOrderCode: order.publicOrderCode });
  });

  it("rejects unpaid orders and invalid or rotated capabilities", async () => {
    const unpaid = await createOrder("PENDING_PAYMENT");
    await expect(issueOrderDeliveryCapability(unpaid.order.id)).rejects.toThrow("Delivery is not available");

    const paid = await createOrder();
    const first = await issueOrderDeliveryCapability(paid.order.id);
    const second = await issueOrderDeliveryCapability(paid.order.id);
    await expect(redeemOrderDeliveryCapability(first.token)).rejects.toThrow("Delivery unavailable");
    await expect(redeemOrderDeliveryCapability("invalid-token")).rejects.toThrow("Delivery unavailable");
    await expect(redeemOrderDeliveryCapability(second.token)).resolves.toMatchObject({ orderId: paid.order.id });
  });
});
