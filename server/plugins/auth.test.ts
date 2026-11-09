import {
  autoMountAuth,
  getH3App,
  markDefaultPluginProvided,
  runBetterAuthMigrations,
} from "@agent-native/core/server";
import { beforeEach, expect, it, vi } from "vitest";

import authPlugin from "./auth";
vi.mock("@agent-native/core/server", () => ({
  autoMountAuth: vi.fn(),
  getH3App: vi.fn(),
  markDefaultPluginProvided: vi.fn(),
  runBetterAuthMigrations: vi.fn(),
}));
vi.mock("@agent-native/toolkit/app/auth/server", () => ({
  renderAuthPage: vi.fn(),
  renderAuthResetPasswordPage: vi.fn(),
}));
vi.mock("../lib/better-auth-social-providers", () => ({
  buildExtraSocialProviders: () => ({
    microsoft: { clientId: "fixture", clientSecret: "synthetic-only" },
  }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(autoMountAuth).mockResolvedValue(true);
});
it("mounts the configured auth runtime through public APIs after storage readiness", async () => {
  const app = {};
  await authPlugin(app);
  expect(markDefaultPluginProvided).toHaveBeenCalledWith(app, "auth");
  expect(getH3App).toHaveBeenCalledWith(app);
  expect(autoMountAuth).toHaveBeenCalledWith(
    undefined,
    expect.objectContaining({
      publicPaths: ["/", "/auth"],
      rootAuth: false,
      betterAuth: {
        socialProviders: {
          microsoft: { clientId: "fixture", clientSecret: "synthetic-only" },
        },
      },
    }),
  );
  expect(
    vi.mocked(runBetterAuthMigrations).mock.invocationCallOrder[0],
  ).toBeLessThan(vi.mocked(autoMountAuth).mock.invocationCallOrder[0]!);
});
it("does not expose a partially initialized auth runtime if storage readiness fails", async () => {
  vi.mocked(runBetterAuthMigrations).mockRejectedValue(
    new Error("storage unavailable"),
  );
  await expect(authPlugin({})).rejects.toThrow("storage unavailable");
  expect(autoMountAuth).not.toHaveBeenCalled();
});
