import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { markPaymentFromWebhook } from "../../src/lib/payments";
import { confirmManualPayment } from "../../src/lib/manual-payments";
import { processPendingDeliveryEmails } from "../../src/lib/delivery-email";
import { createDownloadGrant } from "../../src/lib/downloads";

const db = new PrismaClient();
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;

suite("transactional delivery email outbox", () => {
  beforeAll(async () => { await db.$connect(); });
  beforeEach(async () => {
    await db.transactionalEmailOutbox.deleteMany();
    await db.orderDeliveryCapability.deleteMany();
    await db.downloadGrant.deleteMany();
    await db.manualPaymentAudit.deleteMany();
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

  async function createOrder(input: { orderStatus: "PENDING_PAYMENT" | "AWAITING_PAYMENT_CONFIRMATION" | "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" | "PAYMENT_DISPUTED"; paymentStatus: "PENDING" | "AWAITING_PAYMENT_CONFIRMATION" | "SUCCEEDED" | "PARTIALLY_REFUNDED" | "REFUNDED" | "DISPUTED"; provider?: "STRIPE" | "ZELLE" }) {
    const suffix = crypto.randomUUID();
    const photographer = await db.photographer.create({ data: { email: `outbox-${suffix}@example.com`, name: "Outbox Owner", passwordHash: "x" } });
    const event = await db.event.create({ data: { photographerId: photographer.id, title: "Outbox Event", slug: `outbox-${suffix}`, accessCode: `outbox-${suffix}`, status: "PUBLISHED" } });
    const album = await db.album.create({ data: { photographerId: photographer.id, eventId: event.id, title: "Outbox Album", slug: "outbox-album", status: "PUBLISHED" } });
    const photo = await db.photo.create({ data: { albumId: album.id, originalKey: `private/${suffix}`, previewKey: `public/${suffix}`, originalFilename: "photo.jpg", mimeType: "image/jpeg", fileSize: 10, status: "PUBLISHED" } });
    const order = await db.order.create({ data: { publicOrderCode: `OUTBOX-${suffix}`, eventId: event.id, photographerId: photographer.id, customerEmail: "buyer@example.com", currency: "USD", subtotalCents: 1500, totalCents: 1500, status: input.orderStatus, items: { create: { photoId: photo.id, unitPriceCents: 1500, originalFilename: photo.originalFilename } }, payment: { create: { provider: input.provider || "STRIPE", amount: 1500, currency: "USD", billablePhotoCount: 1, platformFeePerPhotoCents: 25, platformFeeCents: 25, photographerProceedsCents: 1475, idempotencyKey: `payment-${suffix}`, status: input.paymentStatus } } } });
    return { order, photographer, photo };
  }

  it("creates one outbox job for Stripe confirmation and duplicate webhook handling", async () => {
    const { order } = await createOrder({ orderStatus: "PENDING_PAYMENT", paymentStatus: "PENDING" });
    const payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    await markPaymentFromWebhook({ paymentId: payment.id, providerPaymentId: "pi_outbox", status: "SUCCEEDED" });
    await markPaymentFromWebhook({ paymentId: payment.id, providerPaymentId: "pi_outbox", status: "SUCCEEDED" });
    expect(await db.transactionalEmailOutbox.count({ where: { orderId: order.id, kind: "PAID_PHOTO_DELIVERY" } })).toBe(1);
    expect(await db.transactionalEmailOutbox.findUnique({ where: { kind_orderId: { kind: "PAID_PHOTO_DELIVERY", orderId: order.id } } })).toMatchObject({ recipient: "buyer@example.com", status: "PENDING" });
  });

  it("creates one outbox job through authorized Zelle confirmation and repeat confirmation", async () => {
    const { order, photographer } = await createOrder({ orderStatus: "AWAITING_PAYMENT_CONFIRMATION", paymentStatus: "AWAITING_PAYMENT_CONFIRMATION", provider: "ZELLE" });
    await confirmManualPayment({ photographerId: photographer.id, orderId: order.id });
    await confirmManualPayment({ photographerId: photographer.id, orderId: order.id });
    expect(await db.transactionalEmailOutbox.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("issues the delivery capability only at send time and marks successful delivery SENT", async () => {
    const { order } = await createOrder({ orderStatus: "PAID", paymentStatus: "SUCCEEDED" });
    await db.transactionalEmailOutbox.create({ data: { orderId: order.id, kind: "PAID_PHOTO_DELIVERY", recipient: order.customerEmail } });
    const previousBase = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = "https://strideframe.example";
    let message: { to: string; text: string; html: string; attachments?: unknown } | undefined;
    await processPendingDeliveryEmails({ transport: { send: async input => { message = input; return { provider: "test" }; } } });
    if (previousBase === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousBase;
    const outbox = await db.transactionalEmailOutbox.findUnique({ where: { kind_orderId: { kind: "PAID_PHOTO_DELIVERY", orderId: order.id } } });
    expect(outbox?.status).toBe("SENT");
    expect(message?.to).toBe(order.customerEmail);
    expect(message?.text).toContain("/delivery/");
    expect(message?.html).toContain("View &amp; download photos");
    expect(message?.html).not.toContain("originalKey");
    expect(message).not.toHaveProperty("attachments");
    expect(await db.orderDeliveryCapability.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("keeps payment state intact and retries when production email is not configured", async () => {
    const { order } = await createOrder({ orderStatus: "PAID", paymentStatus: "SUCCEEDED" });
    await db.transactionalEmailOutbox.create({ data: { orderId: order.id, kind: "PAID_PHOTO_DELIVERY", recipient: order.customerEmail } });
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousBase = process.env.PUBLIC_BASE_URL;
    env.NODE_ENV = "production";
    process.env.PUBLIC_BASE_URL = "https://strideframe.example";
    await processPendingDeliveryEmails();
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousBase === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousBase;
    expect(await db.transactionalEmailOutbox.findUnique({ where: { kind_orderId: { kind: "PAID_PHOTO_DELIVERY", orderId: order.id } } })).toMatchObject({ status: "PENDING", attemptCount: 1, lastError: "CONFIGURATION_REQUIRED" });
    expect(await db.order.findUnique({ where: { id: order.id }, select: { status: true } })).toMatchObject({ status: "PAID" });
    expect(await db.payment.findUnique({ where: { orderId: order.id }, select: { status: true } })).toMatchObject({ status: "SUCCEEDED" });
  });

  it("increments attempts and retries a transient transport failure", async () => {
    const { order } = await createOrder({ orderStatus: "PAID", paymentStatus: "SUCCEEDED" });
    await db.transactionalEmailOutbox.create({ data: { orderId: order.id, kind: "PAID_PHOTO_DELIVERY", recipient: order.customerEmail } });
    const initial = await db.transactionalEmailOutbox.findUniqueOrThrow({ where: { kind_orderId: { kind: "PAID_PHOTO_DELIVERY", orderId: order.id } } });
    const base = new Date(initial.nextAttemptAt.getTime() + 1000);
    const previousBase = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = "https://strideframe.example";
    try {
      await processPendingDeliveryEmails({ now: base, transport: { send: async () => { throw new Error("temporary provider outage"); } } });
    } finally {
      if (previousBase === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = previousBase;
    }
    const first = await db.transactionalEmailOutbox.findUniqueOrThrow({ where: { kind_orderId: { kind: "PAID_PHOTO_DELIVERY", orderId: order.id } } });
    expect(first).toMatchObject({ status: "PENDING", attemptCount: 1, lastError: "temporary provider outage" });
    expect(first.nextAttemptAt.getTime()).toBeGreaterThan(base.getTime());
    await db.transactionalEmailOutbox.update({ where: { id: first.id }, data: { nextAttemptAt: base } });
    process.env.PUBLIC_BASE_URL = "https://strideframe.example";
    try {
      await processPendingDeliveryEmails({ now: new Date(base.getTime() + 1000), transport: { send: async () => ({ provider: "test" }) } });
    } finally {
      if (previousBase === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = previousBase;
    }
    expect(await db.transactionalEmailOutbox.findUnique({ where: { id: first.id } })).toMatchObject({ status: "SENT", attemptCount: 2 });
  });

  it("does not log delivery secrets or include download secrets in email payloads", async () => {
    const { order } = await createOrder({ orderStatus: "PAID", paymentStatus: "SUCCEEDED" });
    const grant = await createDownloadGrant(order.id);
    const rawDownloadToken = grant!.token;
    await db.transactionalEmailOutbox.create({ data: { orderId: order.id, kind: "PAID_PHOTO_DELIVERY", recipient: order.customerEmail } });
    const previousBase = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = "https://strideframe.example";
    let message: { text: string; html: string; attachments?: unknown } | undefined;
    const logSpies = (["debug", "info", "log", "warn", "error"] as const).map(method => vi.spyOn(console, method));
    try {
      await processPendingDeliveryEmails({ transport: { send: async input => { message = input; return { provider: "test" }; } } });
      const failedOrder = await createOrder({ orderStatus: "PAID", paymentStatus: "SUCCEEDED" });
      await db.transactionalEmailOutbox.create({ data: { orderId: failedOrder.order.id, kind: "PAID_PHOTO_DELIVERY", recipient: failedOrder.order.customerEmail } });
      await processPendingDeliveryEmails({ transport: { send: async () => { throw new Error("secret-boundary transport failure"); } } });
    } finally {
      if (previousBase === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = previousBase;
    }
    const logs = logSpies.flatMap(spy => spy.mock.calls.flat()).join(" ");
    logSpies.forEach(spy => spy.mockRestore());
    expect(message?.text).toMatch(/\/delivery\/[A-Za-z0-9_-]+/);
    expect(message).not.toHaveProperty("attachments");
    const deliveryUrl = message?.text.match(/https?:\/\/\S+\/delivery\/\S+/)?.[0];
    expect(message?.text).not.toContain(rawDownloadToken);
    expect(message?.text).not.toContain("private/");
    expect(message?.html).not.toContain("private/");
    expect(logs).not.toContain(rawDownloadToken);
    expect(logs).not.toContain(deliveryUrl || "delivery-url-not-captured");
    expect(logs).not.toContain("private/");
    expect(logs).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(grant).toBeTruthy();
  });

  it("does not send for fully refunded or disputed orders", async () => {
    const refunded = await createOrder({ orderStatus: "REFUNDED", paymentStatus: "REFUNDED" });
    const disputed = await createOrder({ orderStatus: "PAYMENT_DISPUTED", paymentStatus: "DISPUTED" });
    await db.transactionalEmailOutbox.createMany({ data: [{ orderId: refunded.order.id, kind: "PAID_PHOTO_DELIVERY", recipient: refunded.order.customerEmail }, { orderId: disputed.order.id, kind: "PAID_PHOTO_DELIVERY", recipient: disputed.order.customerEmail }] });
    const result = await processPendingDeliveryEmails({ transport: { send: async () => ({ provider: "test" }) } });
    expect(result.results).toHaveLength(2);
    expect(await db.transactionalEmailOutbox.findUnique({ where: { kind_orderId: { kind: "PAID_PHOTO_DELIVERY", orderId: refunded.order.id } } })).toMatchObject({ status: "FAILED" });
    expect(await db.transactionalEmailOutbox.findUnique({ where: { kind_orderId: { kind: "PAID_PHOTO_DELIVERY", orderId: disputed.order.id } } })).toMatchObject({ status: "FAILED" });
  });
});
