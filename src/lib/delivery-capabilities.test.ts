import { describe, expect, it } from "vitest";
import { createDeliveryCapabilityToken, deliveryCapabilityTokenHash } from "./delivery-capabilities";

describe("order delivery capabilities", () => {
  it("generates a 32-byte URL-safe secret and stores only its hash representation", () => {
    const token = createDeliveryCapabilityToken();
    const hash = deliveryCapabilityTokenHash(token);

    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(token).not.toContain("/");
    expect(token).not.toContain("+");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
  });

  it("hashes the same capability deterministically for lookup", () => {
    const token = "delivery-test-token";
    expect(deliveryCapabilityTokenHash(token)).toBe(deliveryCapabilityTokenHash(token));
  });
});
