import { afterEach, describe, expect, it, vi } from "vitest";

import { sendBrevoEmail } from "./brevo-email";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Brevo auth delivery", () => {
  it("exchanges scoped server credentials and reuses the short-lived token", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("BREVO_CLIENT_ID", "synthetic-client");
    vi.stubEnv("BREVO_CLIENT_SECRET", "synthetic-secret");
    vi.stubEnv("BREVO_SENDER_EMAIL", "teacher@example.com");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "synthetic-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        ),
      )
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ messageId: "test-id" }), {
            status: 201,
          }),
      );
    vi.stubGlobal("fetch", fetch);
    const mail = {
      to: "student@example.com",
      subject: "Code",
      text: "Synthetic test",
    };
    await sendBrevoEmail(mail);
    await sendBrevoEmail(mail);
    expect(fetch).toHaveBeenCalledTimes(3);
    const firstCall = fetch.mock.calls[0];
    if (!firstCall) throw new Error("Expected a token request");
    const tokenBody = firstCall[1].body;
    expect(tokenBody.get("grant_type")).toBe("client_credentials");
    expect(tokenBody.get("scope")).toBe("transactional.email:write");
    expect(tokenBody.get("client_secret")).toBe("synthetic-secret");
    for (const call of fetch.mock.calls.slice(1)) {
      expect(call[1].headers.Authorization).toBe("Bearer synthetic-token");
      expect(call[1].body).not.toContain("synthetic-secret");
    }
  });
  it("uses only the configured sender and keeps the key in the provider header", async () => {
    vi.stubEnv("BREVO_API_KEY", "synthetic-test-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "teacher@example.com");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ messageId: "test-id" }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetch);
    await sendBrevoEmail({
      to: "student@example.com",
      subject: "Code",
      text: "Synthetic test",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        headers: expect.objectContaining({ "api-key": "synthetic-test-key" }),
        body: JSON.stringify({
          sender: { name: "Super Acharya", email: "teacher@example.com" },
          to: [{ email: "student@example.com" }],
          subject: "Code",
          textContent: "Synthetic test",
        }),
      }),
    );
  });
  it("fails closed without configuration and sanitizes provider errors", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      sendBrevoEmail({
        to: "student@example.com",
        subject: "Code",
        text: "Test",
      }),
    ).rejects.toThrow("not configured");
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("BREVO_API_KEY", "synthetic-test-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "teacher@example.com");
    fetch.mockResolvedValue(
      new Response("sensitive provider detail", { status: 401 }),
    );
    await expect(
      sendBrevoEmail({
        to: "student@example.com",
        subject: "Code",
        text: "Test",
      }),
    ).rejects.toThrow("Email delivery failed. Please try again shortly.");
  });
});
