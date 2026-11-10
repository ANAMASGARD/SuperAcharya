import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthEmail } from "./brevo-email";
import { emailAuthPlugins } from "./email-auth";

function fixture() {
  const mail: AuthEmail[] = [];
  let failDelivery = false;
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    basePath: "/auth",
    secret: "test-secret-for-isolated-auth-tests-123456789",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      twoFactor: [],
      auth_rate_limits: [],
    }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    plugins: emailAuthPlugins(
      async (message) => {
        if (failDelivery) throw new Error("Provider rejected test request");
        mail.push(message);
      },
      { consume: async () => ({ allowed: true, retryAfter: null }) },
    ),
    logger: { disabled: true },
  });
  const cookies = new Map<string, string>();
  async function call(path: string, body?: Record<string, unknown>) {
    const response = await auth.handler(
      new Request(`http://localhost:3000/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const part = cookie.split(";")[0]!;
      const index = part.indexOf("=");
      cookies.set(part.slice(0, index), part.slice(index + 1));
    }
    const data: unknown = await response.json().catch(() => null);
    return { status: response.status, data };
  }
  const credentials = {
    email: "student@example.com",
    password: "A-long-test-password!",
    name: "Student",
  };
  const code = () => mail[mail.length - 1]!.text.match(/\b\d{6}\b/)![0];
  async function verifiedUser() {
    const signup = await call("/sign-up/email", credentials);
    expect(signup, JSON.stringify(signup)).toMatchObject({ status: 200 });
    expect((await call("/get-session")).data).toBeNull();
    expect(
      (
        await call("/email-otp/verify-email", {
          email: credentials.email,
          otp: code(),
        })
      ).status,
    ).toBe(200);
    expect((await call("/get-session")).data).toBeNull();
  }
  return {
    call,
    credentials,
    mail,
    code,
    verifiedUser,
    fail: () => {
      failDelivery = true;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("mandatory password plus email code", () => {
  it("requires verification and a fresh second factor, without exposing a session early", async () => {
    const f = fixture();
    await f.verifiedUser();
    expect((await f.call("/sign-in/email", f.credentials)).data).toMatchObject({
      twoFactorRedirect: true,
    });
    expect((await f.call("/get-session")).data).toBeNull();
    expect((await f.call("/two-factor/send-otp", {})).status).toBe(200);
    const code = f.code();
    expect(
      (await f.call("/two-factor/verify-otp", { code: "000000" })).status,
    ).toBe(401);
    expect((await f.call("/get-session")).data).toBeNull();
    const verified = await f.call("/two-factor/verify-otp", { code });
    expect(verified, JSON.stringify(verified)).toMatchObject({ status: 200 });
    expect((await f.call("/get-session")).data).toMatchObject({
      user: { email: f.credentials.email },
    });
    await f.call("/sign-out", {});
    expect((await f.call("/two-factor/verify-otp", { code })).status).not.toBe(
      200,
    );
    expect((await f.call("/sign-in/email", f.credentials)).data).toMatchObject({
      twoFactorRedirect: true,
    });
    expect((await f.call("/get-session")).data).toBeNull();
  });

  it("rejects expired codes and caps wrong guesses", async () => {
    const f = fixture();
    await f.verifiedUser();
    await f.call("/sign-in/email", f.credentials);
    await f.call("/two-factor/send-otp", {});
    const code = f.code();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(
        (await f.call("/two-factor/verify-otp", { code: wrong })).status,
      ).not.toBe(200);
    }
    expect((await f.call("/two-factor/verify-otp", { code })).status).not.toBe(
      200,
    );
    expect((await f.call("/get-session")).data).toBeNull();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 301_000);
    expect((await f.call("/two-factor/verify-otp", { code })).status).not.toBe(
      200,
    );
  });

  it("rejects bypass routes and trusted-device requests", async () => {
    const f = fixture();
    for (const path of [
      "/sign-in/email-otp",
      "/two-factor/disable",
      "/two-factor/verify-backup-code",
      "/sign-in/magic-link",
    ]) {
      expect(
        (
          await f.call(path, {
            ...f.credentials,
            otp: "123456",
            code: "123456",
          })
        ).status,
      ).not.toBe(200);
    }
    expect(
      (
        await f.call("/two-factor/verify-otp", {
          code: "123456",
          trustDevice: true,
        })
      ).status,
    ).toBe(403);
  });

  it("reports signup delivery failure without granting a session", async () => {
    const f = fixture();
    f.fail();
    expect((await f.call("/sign-up/email", f.credentials)).status).toBe(503);
    expect((await f.call("/get-session")).data).toBeNull();
  });

  it("does not claim delivery success when Brevo fails", async () => {
    const f = fixture();
    await f.verifiedUser();
    await f.call("/sign-in/email", f.credentials);
    f.fail();
    expect((await f.call("/two-factor/send-otp", {})).status).toBe(503);
    expect((await f.call("/get-session")).data).toBeNull();
  });
});
