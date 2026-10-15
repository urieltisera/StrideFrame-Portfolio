import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn(), retrieve: vi.fn(), accountLink: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { stripeConnectAccount: { findUnique: mocks.findUnique, upsert: mocks.upsert, update: vi.fn() } } }));
vi.mock("stripe", () => ({ default: class { accounts = { create: mocks.create, retrieve: mocks.retrieve }; accountLinks = { create: mocks.accountLink }; } }));

import { createOrGetStripeConnectAccount, isStripeConnectReady } from "./stripe-connect";

describe("Stripe Connect readiness", () => {
  it("requires both charge and payout capabilities", () => {
    expect(isStripeConnectReady({ status: "READY", chargesEnabled: true, payoutsEnabled: true })).toBe(true);
    expect(isStripeConnectReady({ status: "READY", chargesEnabled: true, payoutsEnabled: false })).toBe(false);
    expect(isStripeConnectReady({ status: "RESTRICTED", chargesEnabled: true, payoutsEnabled: true })).toBe(false);
  });
});

describe("Stripe Connect account creation", () => {
  it("reuses the stored account and does not create a duplicate", async () => {
    mocks.findUnique.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce({ photographerId: "photographer_1", stripeAccountId: "acct_1", status: "ONBOARDING", chargesEnabled: false, payoutsEnabled: false });
    mocks.create.mockReset().mockResolvedValue({ id: "acct_1", details_submitted: false, charges_enabled: false, payouts_enabled: false, requirements: {} });
    mocks.upsert.mockReset().mockResolvedValue({ photographerId: "photographer_1", stripeAccountId: "acct_1", status: "ONBOARDING", chargesEnabled: false, payoutsEnabled: false });
    const previousKey = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "mock-stripe-key";
    await createOrGetStripeConnectAccount("photographer_1", "photographer@example.com");
    await createOrGetStripeConnectAccount("photographer_1", "photographer@example.com");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previousKey;
  });
});
