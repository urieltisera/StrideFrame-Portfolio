import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { issueOrderDeliveryCapability, redeemOrderDeliveryCapability, deliveryCapabilityTokenHash } from "../../src/lib/delivery-capabilities";
import { authorizeDownload } from "../../src/lib/downloads";
import { getDeliveryAccessOrderId } from "../../src/lib/order-access";
import { GET as deliveryGET } from "../../src/app/delivery/[token]/route";
import { GET as orderDownloadGET } from "../../src/app/order/[publicOrderCode]/download/[photoReference]/route";

const mocks = vi.hoisted(() => ({ cookieJar: new Map<string, { value: string; options?: Record<string, unknown> }>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const cookie = mocks.cookieJar.get(name);
      return cookie ? { value: cookie.value } : undefined;
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => { mocks.cookieJar.set(name, { value, options }); },
    delete: (name: string) => { mocks.cookieJar.delete(name); },
  }),
}));

const db = new PrismaClient();
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;

suite("customer delivery capabilities", () => {
  beforeAll(async () => { await db.$connect(); });
  beforeEach(async () => {
    mocks.cookieJar.clear();
    await db.orderDeliveryCapability.deleteMany();
    await db.paymentDisputeEvent.deleteMany();
    await db.paymentDispute.deleteMany();
    await db.zelleFeeObligationReversal.deleteMany();
    await db.refundItem.deleteMany();
    await db.refund.deleteMany();
    await db.zelleFeeObligation.deleteMany();
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

  it("denies expired capabilities before establishing delivery access", async () => {
    const { order } = await createOrder();
    const issued = await issueOrderDeliveryCapability(order.id);
    await db.orderDeliveryCapability.update({ where: { orderId: order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(redeemOrderDeliveryCapability(issued.token)).rejects.toThrow("Delivery unavailable");
    const response = await deliveryGET(new Request(`https://strideframe.example/delivery/${issued.token}`), { params: Promise.resolve({ token: issued.token }) });
    expect(response.status).toBe(404);
    expect(mocks.cookieJar.has("strideframe_delivery_access")).toBe(false);
  });

  it("cleans the capability URL and creates an order-bound HttpOnly session", async () => {
    const { order } = await createOrder();
    const issued = await issueOrderDeliveryCapability(order.id);
    const response = await deliveryGET(new Request(`https://strideframe.example/delivery/${issued.token}`), { params: Promise.resolve({ token: issued.token }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://strideframe.example/order/${order.publicOrderCode}`);
    expect(response.headers.get("location")).not.toContain(issued.token);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.cookieJar.get("strideframe_delivery_access")?.options).toMatchObject({ httpOnly: true, sameSite: "lax" });
    await expect(getDeliveryAccessOrderId()).resolves.toMatchObject({ orderId: order.id, capabilityId: expect.any(String) });
  });

  it("isolates delivery sessions and rejects public order codes without delivery access", async () => {
    const first = await createOrder();
    const second = await createOrder();
    const issued = await issueOrderDeliveryCapability(first.order.id);
    await deliveryGET(new Request(`https://strideframe.example/delivery/${issued.token}`), { params: Promise.resolve({ token: issued.token }) });
    const access = await getDeliveryAccessOrderId();
    expect(access?.orderId).toBe(first.order.id);
    const secondDownload = await orderDownloadGET(new Request(`https://strideframe.example/order/${second.order.publicOrderCode}/download/${second.photo.id}`), { params: Promise.resolve({ publicOrderCode: second.order.publicOrderCode, photoReference: second.photo.id }) });
    expect(secondDownload.status).toBe(404);
    mocks.cookieJar.clear();
    const firstDownloadWithoutSession = await orderDownloadGET(new Request(`https://strideframe.example/order/${first.order.publicOrderCode}/download/${first.photo.id}`), { params: Promise.resolve({ publicOrderCode: first.order.publicOrderCode, photoReference: first.photo.id }) });
    expect(firstDownloadWithoutSession.status).toBe(404);
  });

  it("keeps download authorization bound to the purchased photo and grant", async () => {
    const first = await createOrder();
    const second = await createOrder();
    const issued = await issueOrderDeliveryCapability(first.order.id);
    await expect(authorizeDownload(issued.token, first.photo.id)).rejects.toThrow("Download unavailable");
    await expect((async () => { await authorizeDownload("not-a-grant", first.photo.id); })()).rejects.toThrow("Download unavailable");
    const grant = await db.downloadGrant.create({ data: { orderId: first.order.id, tokenHash: crypto.createHash("sha256").update("grant-secret").digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
    await expect(authorizeDownload("grant-secret", second.photo.id)).rejects.toThrow("Download unavailable");
    await db.downloadGrant.delete({ where: { id: grant.id } });
  });
});
