import { describe, expect, it } from "vitest";
import { LANDING_SPORTS, LANDING_TICKER_ITEMS } from "./landing-visuals";

describe("landing visual contracts", () => {
  it("keeps three local sport replacement slots", () => {
    expect(LANDING_SPORTS.map((sport) => sport.id)).toEqual(["running", "cycling", "motorsport"]);
    expect(LANDING_SPORTS.every((sport) => sport.requiredPath.startsWith("/images/landing/"))).toBe(true);
    expect(LANDING_SPORTS.every((sport) => sport.src === null || sport.src.startsWith("/"))).toBe(true);
  });

  it("keeps the ticker local and content-first", () => {
    expect(LANDING_TICKER_ITEMS).toContain("Every finish has a frame");
    expect(LANDING_TICKER_ITEMS.every((item) => !/^https?:\/\//.test(item))).toBe(true);
  });
});
