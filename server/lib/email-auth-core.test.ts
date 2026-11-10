import {
  closeDbExec,
  getDbExec,
  withMigrationRuntime,
} from "@agent-native/core/db";
import {
  autoMountAuth,
  type H3AppShim,
  runFrameworkReleaseMigrations,
} from "@agent-native/core/server";
import { H3, type EventHandler } from "h3";
import { afterAll, expect, it } from "vitest";

import { boardMigrations } from "../db/migrations";
import type { AuthEmail } from "./brevo-email";
import { emailAuthPlugins } from "./email-auth";

afterAll(async () => {
  await closeDbExec();
});
it("uses the real Core configuration and database for verification and password challenges", async () => {
  process.env.BETTER_AUTH_SECRET = "isolated-test-secret-12345678901234567890";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  await withMigrationRuntime(async () => {
    await runFrameworkReleaseMigrations(null);
    for (const migration of boardMigrations) {
      if (typeof migration.sql === "string")
        for (const sql of migration.sql.split(";").filter((s) => s.trim()))
          await getDbExec().execute({ sql });
    }
  });
  const mails: AuthEmail[] = [];
  const app = new H3();
  const shim: H3AppShim = {
    use(pathOrHandler: string | EventHandler, handler?: EventHandler) {
      if (typeof pathOrHandler === "string") {
        if (!handler) throw new Error("Handler required");
        app.use((event) => {
          if (
            event.url.pathname === pathOrHandler ||
            event.url.pathname.startsWith(pathOrHandler + "/")
          )
            return handler(event);
        });
      } else app.use(pathOrHandler);
    },
  };
  expect(
    await autoMountAuth(shim, {
      rootAuth: false,
      marketing: false,
      betterAuth: {
        plugins: emailAuthPlugins(async (mail) => {
          mails.push(mail);
        }),
      },
    }),
  ).toBe(true);
  const cookies = new Map<string, string>();
  const call = async (path: string, body: Record<string, unknown>) => {
    const response = await app.fetch(
      new Request(`http://localhost:3000/_agent-native/auth/ba${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          "x-forwarded-for": "192.0.2.44",
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        },
        body: JSON.stringify(body),
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const part = cookie.split(";")[0]!;
      const index = part.indexOf("=");
      cookies.set(part.slice(0, index), part.slice(index + 1));
    }
    return { status: response.status, data: await response.json() };
  };
  const credentials = {
    email: "core-student@example.com",
    password: "A-long-test-password!",
    name: "Student",
  };
  const signup = await call("/sign-up/email", credentials);
  expect(signup, JSON.stringify(signup)).toMatchObject({ status: 200 });
  expect(mails).toHaveLength(1);
  expect((await call("/sign-in/email", credentials)).status).toBe(403);
  const otp = mails[0]!.text.match(/\b\d{6}\b/)![0];
  expect(
    (await call("/email-otp/verify-email", { email: credentials.email, otp }))
      .status,
  ).toBe(200);
  const login = await call("/sign-in/email", credentials);
  expect(login, JSON.stringify(login)).toMatchObject({
    status: 200,
    data: { twoFactorRedirect: true },
  });
  expect((await call("/two-factor/send-otp", {})).status).toBe(200);
  expect((await call("/two-factor/send-otp", {})).status).toBe(429);
  const code = mails[mails.length - 1]!.text.match(/\b\d{6}\b/)![0];
  const verification = await call("/two-factor/verify-otp", { code });
  expect(verification, JSON.stringify(verification)).toMatchObject({
    status: 200,
  });
});
