import { describe, expect, it } from "vitest";
import { priceValidationMessage, resolveEffectivePhotoPrice, validateRetailPriceCents } from "./pricing";

describe("effective photo pricing", () => {
  const album = { priceCents: 500 };

  it("inherits an album price when no override exists", () => {
    expect(resolveEffectivePhotoPrice({ album, priceOverrideCents: null, currency: "USD" })).toEqual({ priceCents: 500, currency: "USD", pricingSource: "ALBUM_DEFAULT" });
  });

  it("uses a photo override without changing the album", () => {
    expect(resolveEffectivePhotoPrice({ album, priceOverrideCents: 800, currency: "USD" }).priceCents).toBe(800);
    expect(album.priceCents).toBe(500);
  });

  it("supports the approved price boundaries", () => {
    expect(() => validateRetailPriceCents(99)).toThrow();
    expect(() => validateRetailPriceCents(10_000_001)).toThrow();
    expect(() => validateRetailPriceCents(500)).not.toThrow();
    expect(() => resolveEffectivePhotoPrice({ album, priceOverrideCents: null, currency: "EUR" })).toThrow("USD");
  });

  it("validates normal USD price boundaries for photographer forms", () => {
    expect(priceValidationMessage("0.99")).toBe("Price must be at least $1.00 per photo.");
    expect(priceValidationMessage("1.00")).toBe("");
    expect(priceValidationMessage("1.01")).toBe("");
    expect(priceValidationMessage("")).toContain("valid USD amount");
    expect(priceValidationMessage("-1.00")).toContain("valid USD amount");
    expect(priceValidationMessage("1.999")).toContain("valid USD amount");
  });
});
