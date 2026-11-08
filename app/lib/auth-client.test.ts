// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
  authErrorMessage,
  isEmailNotVerified,
  isValidEmail,
  normalizeEmail,
  resolveResumeHref,
  type AuthResult,
} from "@/lib/auth-client";

function result(
  status: number,
  data: AuthResult["data"],
  ok = status >= 200 && status < 300,
): AuthResult {
  return { ok, status, data };
}

describe("authErrorMessage", () => {
  it("shows the framework's message when it is safe to show", () => {
    expect(
      authErrorMessage({ error: "The email or password is incorrect." }, "fallback"),
    ).toBe("The email or password is incorrect.");
  });

  it("falls back when there is no message", () => {
    expect(authErrorMessage({}, "fallback")).toBe("fallback");
    expect(authErrorMessage({ error: "   " }, "fallback")).toBe("fallback");
  });

  it("never leaks database or SQL detail", () => {
    for (const leaked of [
      "Failed query: select * from user where email = $1",
      'insert into "user" (id) values ($1)',
      'relation "user" does not exist',
      "connection refused ECONNREFUSED 10.0.0.1:5432",
      "unique constraint violated",
      "statement timeout",
    ]) {
      expect(authErrorMessage({ error: leaked }, "fallback"), leaked).toBe(
        "fallback",
      );
    }
  });

  it("explains invite-only sign-up", () => {
    expect(authErrorMessage({ code: "INVITE_ONLY" }, "fallback")).toMatch(
      /invite-only/i,
    );
  });
});

describe("isEmailNotVerified", () => {
  it("is true only for a 403 that talks about verification", () => {
    expect(isEmailNotVerified(result(403, { error: "Email not verified" }))).toBe(true);
    expect(isEmailNotVerified(result(403, { message: "Needs verification" }))).toBe(true);
    expect(isEmailNotVerified(result(401, { error: "Email not verified" }))).toBe(false);
    expect(isEmailNotVerified(result(403, { error: "Forbidden" }))).toBe(false);
  });
});

describe("email helpers", () => {
  it("normalizes and validates addresses", () => {
    expect(normalizeEmail("  Student@School.EDU ")).toBe("student@school.edu");
    expect(isValidEmail("student@school.edu")).toBe(true);
    expect(isValidEmail(" student@school.edu ")).toBe(true);
    for (const bad of ["", "student", "student@", "@school.edu", "a b@c.d"]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });
});

describe("resolveResumeHref", () => {
  it("defaults to the whiteboard", () => {
    expect(resolveResumeHref("")).toBe("/whiteboard");
  });

  it("returns to the page the session gate sent the student from", () => {
    // `c` is the framework's opaque continuation for "/home".
    expect(resolveResumeHref("?c=JTJGaG9tZQ")).toBe("/home");
  });

  it("never returns to an auth screen", () => {
    const toSignIn = Buffer.from(encodeURIComponent("/auth/sign-in")).toString("base64url");
    expect(resolveResumeHref(`?c=${toSignIn}`)).toBe("/whiteboard");
  });

  it("ignores off-site return targets", () => {
    for (const target of ["//evil.example", "https://evil.example/x", "/\\evil.example"]) {
      expect(resolveResumeHref(`?return=${encodeURIComponent(target)}`), target).toBe(
        "/whiteboard",
      );
    }
  });
});
