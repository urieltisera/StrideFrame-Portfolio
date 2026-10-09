import { describe, expect, it } from "vitest";

type Item = { photoId: string; priceCents: number };
function total(items: Item[]) { return items.reduce((sum, item) => sum + item.priceCents, 0); }

describe("order totals", () => {
  it("sums unique photo prices", () => expect(total([{photoId:"a",priceCents:1500},{photoId:"b",priceCents:2200}])).toBe(3700));
  it("supports an empty cart", () => expect(total([])).toBe(0));
});
