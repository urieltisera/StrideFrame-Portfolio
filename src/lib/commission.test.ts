import { describe, expect, it } from "vitest";
import { calculatePlatformFeeCents, calculateProceedsCents, platformFeeBps } from "./commission";

describe("platform commission", () => {
  it("calculates integer minor units using nearest-cent half-up rounding", () => {
    expect(calculatePlatformFeeCents(1000, 1000)).toBe(100);
    expect(calculatePlatformFeeCents(999, 333)).toBe(33);
    expect(calculateProceedsCents(999, 33)).toBe(966);
  });

  it("rejects missing or out-of-range configuration", () => {
    const previous = process.env.STRIDEFRAME_PLATFORM_FEE_BPS;
    delete process.env.STRIDEFRAME_PLATFORM_FEE_BPS;
    expect(() => platformFeeBps()).toThrow("required");
    process.env.STRIDEFRAME_PLATFORM_FEE_BPS = "10001";
    expect(() => platformFeeBps()).toThrow("between 0 and 10000");
    if (previous === undefined) delete process.env.STRIDEFRAME_PLATFORM_FEE_BPS;
    else process.env.STRIDEFRAME_PLATFORM_FEE_BPS = previous;
  });
});
