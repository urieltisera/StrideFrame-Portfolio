import { describe, expect, it } from "vitest";
import { sendTransactionalEmail, transactionalEmailConfiguration } from "./email";

describe("transactional email configuration", () => {
  it("requires an explicit production transport", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousProvider = env.EMAIL_DELIVERY_PROVIDER;
    env.NODE_ENV = "production";
    delete env.EMAIL_DELIVERY_PROVIDER;
    expect(transactionalEmailConfiguration()).toEqual({ available: false, provider: "CONFIGURATION_REQUIRED" });
    await expect(sendTransactionalEmail({ to: "buyer@example.com", subject: "Ready", text: "Ready", html: "<p>Ready</p>" })).resolves.toMatchObject({ delivered: false, error: "CONFIGURATION_REQUIRED" });
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousProvider === undefined) delete env.EMAIL_DELIVERY_PROVIDER;
    else env.EMAIL_DELIVERY_PROVIDER = previousProvider;
  });

  it("uses the explicit safe console transport outside production", () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousProvider = env.EMAIL_DELIVERY_PROVIDER;
    env.NODE_ENV = "test";
    delete env.EMAIL_DELIVERY_PROVIDER;
    expect(transactionalEmailConfiguration()).toEqual({ available: true, provider: "console" });
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousProvider === undefined) delete env.EMAIL_DELIVERY_PROVIDER;
    else env.EMAIL_DELIVERY_PROVIDER = previousProvider;
  });
});
