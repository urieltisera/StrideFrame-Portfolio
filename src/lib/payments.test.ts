import { describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { paymentProvider, StripePaymentProvider } from "./payments";
import { calculatePlatformFeeCents } from "./commission";

describe("payment provider", () => {
  it("rejects unsupported providers without fallback", () => {
    const old = process.env.PAYMENT_PROVIDER;
    process.env.PAYMENT_PROVIDER = "paypal";
    expect(() => paymentProvider()).toThrow("Unsupported");
    if (old === undefined) delete process.env.PAYMENT_PROVIDER; else process.env.PAYMENT_PROVIDER = old;
  });

  it("requires server Stripe configuration", () => {
    const oldProvider = process.env.PAYMENT_PROVIDER;
    const oldKey = process.env.STRIPE_SECRET_KEY;
    process.env.PAYMENT_PROVIDER = "stripe";
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => paymentProvider()).toThrow("STRIPE_SECRET_KEY");
    if (oldProvider === undefined) delete process.env.PAYMENT_PROVIDER; else process.env.PAYMENT_PROVIDER = oldProvider;
    if (oldKey) process.env.STRIPE_SECRET_KEY = oldKey;
  });

  it("creates a destination-charge Checkout Session with an explicit fee", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cs_test", url: "https://checkout.test", payment_intent: "pi_test" });
    const fakeStripe = { checkout: { sessions: { create } } } as unknown as Stripe;
    const provider = new StripePaymentProvider(fakeStripe);
    await provider.createCheckout({ paymentId: "payment_1", publicOrderCode: "ORDER-1", amountCents: 4000, platformFeeCents: calculatePlatformFeeCents(4), connectedAccountId: "acct_test", currency: "USD", customerEmail: "buyer@example.com", successUrl: "https://app.test/success", cancelUrl: "https://app.test/cancel" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent_data: { application_fee_amount: 100, transfer_data: { destination: "acct_test" }, metadata: { strideframeOrderCode: "ORDER-1", paymentId: "payment_1" } } }), { idempotencyKey: "payment_1" });
  });

  it("returns a provider refund ID and forwards idempotency", async () => {
    const create = vi.fn().mockResolvedValue({ id: "re_test" });
    const fakeStripe = { refunds: { create } } as unknown as Stripe;
    const provider = new StripePaymentProvider(fakeStripe);
    await expect(provider.refund("pi_test", 500, "refund-key")).resolves.toEqual({ providerRefundId: "re_test" });
    expect(create).toHaveBeenCalledWith({ payment_intent: "pi_test", amount: 500 }, { idempotencyKey: "refund-key" });
  });
});
