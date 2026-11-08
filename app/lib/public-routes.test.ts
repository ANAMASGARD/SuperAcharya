import { describe, expect, it } from "vitest";

import {
  isAuthScreenPath,
  isPublicLandingPath,
  isPublicRoutePath,
} from "@/lib/public-routes";

describe("public routes", () => {
  it("treats the landing and both auth screens as public", () => {
    for (const path of [
      "/",
      "/auth",
      "/auth/",
      "/auth/sign-in",
      "/auth/sign-up",
      "/auth/sign-in/",
    ]) {
      expect(isPublicRoutePath(path), path).toBe(true);
    }
  });

  it("keeps every app route behind a session", () => {
    for (const path of [
      "/whiteboard",
      "/board",
      "/home",
      "/chat",
      "/chat/abc",
      "/settings/agent",
      "/database",
    ]) {
      expect(isPublicRoutePath(path), path).toBe(false);
    }
  });

  it("does not match paths that merely start with the auth prefix", () => {
    for (const path of ["/authors", "/auth-evil", "/authx/sign-in", "/oauth"]) {
      expect(isAuthScreenPath(path), path).toBe(false);
      expect(isPublicRoutePath(path), path).toBe(false);
    }
  });

  it("recognises only the root as the landing", () => {
    expect(isPublicLandingPath("/")).toBe(true);
    expect(isPublicLandingPath("/auth/sign-in")).toBe(false);
    expect(isPublicLandingPath("/whiteboard")).toBe(false);
  });
});
