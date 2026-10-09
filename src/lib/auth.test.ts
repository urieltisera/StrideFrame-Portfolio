import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { ownsResource, requireOwner } from "./authorization";

describe("photographer authentication and authorization", () => {
  it("hashes a registration password and accepts the correct login password", async () => {
    const hash = await bcrypt.hash("correct horse battery staple", 4);
    expect(hash).not.toBe("correct horse battery staple");
    await expect(bcrypt.compare("correct horse battery staple", hash)).resolves.toBe(true);
  });
  it("rejects a failed login password", async () => {
    const hash = await bcrypt.hash("correct horse battery staple", 4);
    await expect(bcrypt.compare("wrong password", hash)).resolves.toBe(false);
  });
  it("allows and rejects ownership explicitly", () => {
    const event = { photographerId: "p1" };
    expect(ownsResource(event, "p1")).toBe(true);
    expect(ownsResource(event, "p2")).toBe(false);
    expect(() => requireOwner(event, "p2")).toThrow("FORBIDDEN");
  });
});
