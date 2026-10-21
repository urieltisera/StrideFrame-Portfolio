import { describe, expect, it, vi } from "vitest";
import { RESEND_FROM_ADDRESS, sendTransactionalEmail, transactionalEmailConfiguration } from "./email";

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

  it("sends the delivery message through Resend without attachments", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousProvider = env.EMAIL_DELIVERY_PROVIDER;
    const previousApiKey = env.RESEND_API_KEY;
    env.NODE_ENV = "production";
    env.EMAIL_DELIVERY_PROVIDER = "resend";
    env.RESEND_API_KEY = "test-resend-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "email-test" }), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      const result = await sendTransactionalEmail({
        to: "buyer@example.com",
        subject: "Your StrideFrame photos are ready",
        text: "View & download photos: https://strideframe.example/delivery/fake-capability",
        html: '<a href="https://strideframe.example/delivery/fake-capability">View &amp; download photos</a>',
      });
      expect(result).toEqual({ delivered: true, provider: "resend" });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, request] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.resend.com/emails");
      expect(request?.headers).toMatchObject({ Authorization: "Bearer test-resend-key", "Content-Type": "application/json" });
      const body = JSON.parse(String(request?.body));
      expect(body).toMatchObject({ from: RESEND_FROM_ADDRESS, to: ["buyer@example.com"], subject: "Your StrideFrame photos are ready" });
      expect(body.text).toContain("/delivery/fake-capability");
      expect(body.html).toContain("View &amp; download photos");
      expect(body).not.toHaveProperty("attachments");
    } finally {
      fetchSpy.mockRestore();
      if (previousNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previousNodeEnv;
      if (previousProvider === undefined) delete env.EMAIL_DELIVERY_PROVIDER;
      else env.EMAIL_DELIVERY_PROVIDER = previousProvider;
      if (previousApiKey === undefined) delete env.RESEND_API_KEY;
      else env.RESEND_API_KEY = previousApiKey;
    }
  });

  it("requires the Resend API key in production", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousProvider = env.EMAIL_DELIVERY_PROVIDER;
    const previousApiKey = env.RESEND_API_KEY;
    env.NODE_ENV = "production";
    env.EMAIL_DELIVERY_PROVIDER = "resend";
    delete env.RESEND_API_KEY;
    try {
      expect(transactionalEmailConfiguration()).toEqual({ available: false, provider: "resend" });
      await expect(sendTransactionalEmail({ to: "buyer@example.com", subject: "Ready", text: "Ready", html: "<p>Ready</p>" })).resolves.toMatchObject({ delivered: false, provider: "resend", error: "CONFIGURATION_REQUIRED" });
    } finally {
      if (previousNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previousNodeEnv;
      if (previousProvider === undefined) delete env.EMAIL_DELIVERY_PROVIDER;
      else env.EMAIL_DELIVERY_PROVIDER = previousProvider;
      if (previousApiKey === undefined) delete env.RESEND_API_KEY;
      else env.RESEND_API_KEY = previousApiKey;
    }
  });

  it("does not expose the API key when the provider fails", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousProvider = env.EMAIL_DELIVERY_PROVIDER;
    const previousApiKey = env.RESEND_API_KEY;
    env.NODE_ENV = "production";
    env.EMAIL_DELIVERY_PROVIDER = "resend";
    env.RESEND_API_KEY = "test-resend-secret";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("provider failure", { status: 503 }));
    const logSpies = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "info"), vi.spyOn(console, "log")];
    try {
      await expect(sendTransactionalEmail({ to: "buyer@example.com", subject: "Ready", text: "Ready", html: "<p>Ready</p>" })).rejects.toThrow("status 503");
      expect(logSpies.flatMap(spy => spy.mock.calls.flat()).join(" ")).not.toContain("test-resend-secret");
    } finally {
      fetchSpy.mockRestore();
      logSpies.forEach(spy => spy.mockRestore());
      if (previousNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previousNodeEnv;
      if (previousProvider === undefined) delete env.EMAIL_DELIVERY_PROVIDER;
      else env.EMAIL_DELIVERY_PROVIDER = previousProvider;
      if (previousApiKey === undefined) delete env.RESEND_API_KEY;
      else env.RESEND_API_KEY = previousApiKey;
    }
  });
});
