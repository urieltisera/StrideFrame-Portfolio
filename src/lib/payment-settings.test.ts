import { describe, expect, it } from "vitest";
import { stripeIsAvailable, zelleIsAvailable, validateZelleQr } from "./payment-settings";

describe("photographer payment settings", () => {
  it("only represents Stripe as available when Connect is ready", () => {
    expect(stripeIsAvailable({ stripeEnabled: true }, { status: "READY", chargesEnabled: true, payoutsEnabled: true })).toBe(true);
    expect(stripeIsAvailable({ stripeEnabled: true }, { status: "ONBOARDING", chargesEnabled: true, payoutsEnabled: true })).toBe(false);
    expect(stripeIsAvailable({ stripeEnabled: false }, { status: "READY", chargesEnabled: true, payoutsEnabled: true })).toBe(false);
  });

  it("keeps Zelle disabled until recipient details exist", () => {
    expect(zelleIsAvailable({ zelleEnabled: false, zelleDisplayName: "Alex", zellePaymentIdentifier: "alex@example.com" })).toBe(false);
    expect(zelleIsAvailable({ zelleEnabled: true, zelleDisplayName: "", zellePaymentIdentifier: "alex@example.com" })).toBe(false);
    expect(zelleIsAvailable({ zelleEnabled: true, zelleDisplayName: "Alex", zellePaymentIdentifier: "alex@example.com" })).toBe(true);
  });

  it("rejects unsupported or oversized QR uploads", async () => {
    await expect(validateZelleQr(new File(["not-an-image"], "qr.gif", { type: "image/gif" }))).rejects.toThrow("JPEG, PNG or WebP");
    await expect(validateZelleQr(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "qr.png", { type: "image/png" }))).rejects.toThrow("smaller than 2 MB");
  });
});
