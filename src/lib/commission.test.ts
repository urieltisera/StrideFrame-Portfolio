import { describe, expect, it } from "vitest";
import { calculatePlatformFeeCents, calculateProceedsCents, MVP_PLATFORM_FEE_PER_PHOTO_CENTS, platformFeePerPhotoCents } from "./commission";

describe("fixed per-photo platform fee", () => {
  it.each([[1, 25], [2, 50], [10, 250], [37, 925]])("charges %s sold photos %s cents", (count, expected) => {
    expect(calculatePlatformFeeCents(count)).toBe(expected);
  });

  it("does not depend on photographer sale price", () => {
    expect(calculatePlatformFeeCents(4)).toBe(100);
    expect(platformFeePerPhotoCents()).toBe(MVP_PLATFORM_FEE_PER_PHOTO_CENTS);
  });

  it("calculates photographer proceeds after the fixed fee", () => {
    expect(calculateProceedsCents(4000, calculatePlatformFeeCents(4))).toBe(3900);
  });

  it("rejects invalid billable counts", () => {
    expect(() => calculatePlatformFeeCents(-1)).toThrow("count");
    expect(() => calculatePlatformFeeCents(1.5)).toThrow("count");
  });
});
