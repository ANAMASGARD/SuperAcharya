import vm from "node:vm";

import { describe, expect, it } from "vitest";

import { SIGN_IN_ENTRY_HTML } from "./sign-in-entry-html";

/** Runs the forwarding script for a browser at `url` and returns where it sends the page. */
function forwardTarget(url: string): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(SIGN_IN_ENTRY_HTML);
  if (!match?.[1]) throw new Error("forwarding script not found");
  const parsed = new URL(url, "https://app.example");
  let replaced = "";
  vm.runInNewContext(match[1], {
    URLSearchParams,
    window: {
      location: {
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        replace: (target: string) => {
          replaced = target;
        },
      },
    },
  });
  return replaced;
}

describe("sign-in entry forwarding", () => {
  it("sends the framework's sign-in entries to the sign-in screen", () => {
    expect(forwardTarget("/sign-in")).toBe("/auth/sign-in");
    expect(forwardTarget("/login")).toBe("/auth/sign-in");
    expect(forwardTarget("/_agent-native/sign-in")).toBe("/auth/sign-in");
  });

  it("sends the sign-up entry to the sign-up screen", () => {
    expect(forwardTarget("/signup")).toBe("/auth/sign-up");
    // The whole query string is kept, so the tab hint travels with the redirect.
    expect(forwardTarget("/sign-in?tab=signup")).toBe("/auth/sign-up?tab=signup");
  });

  it("keeps the return target, email-link params and hash", () => {
    expect(forwardTarget("/sign-in?c=JTJGaG9tZQ&verified=1#top")).toBe(
      "/auth/sign-in?c=JTJGaG9tZQ&verified=1#top",
    );
  });

  it("keeps an app base path", () => {
    expect(forwardTarget("/classroom/sign-in?c=abc")).toBe(
      "/classroom/auth/sign-in?c=abc",
    );
    expect(forwardTarget("/classroom/signup")).toBe("/classroom/auth/sign-up");
  });

  it("is a complete, cacheable document with a head for the framework to inject into", () => {
    expect(SIGN_IN_ENTRY_HTML).toMatch(/^<!doctype html>/i);
    expect(SIGN_IN_ENTRY_HTML).toContain("</head>");
    expect(SIGN_IN_ENTRY_HTML).toContain("<noscript>");
  });
});
