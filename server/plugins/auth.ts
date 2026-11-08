import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

import { buildExtraSocialProviders } from "../lib/better-auth-social-providers";
import { SIGN_IN_ENTRY_HTML } from "../lib/sign-in-entry-html";

const require = createRequire(import.meta.url);
const serverEntry = require.resolve("@agent-native/core/server");
const betterAuthInstanceUrl = pathToFileURL(
  path.join(path.dirname(serverEntry), "better-auth-instance.js"),
).href;

/**
 * `getBetterAuth` is a process-wide singleton. The framework opens the session
 * route before it mounts Better Auth, and that route calls `getBetterAuth()`
 * with no config. Whichever call arrives first wins, so Facebook and Microsoft
 * have to be attached on that first call or Better Auth answers
 * "Provider not found" for the rest of the process.
 */
const betterAuthModule: Promise<{
  getBetterAuth: (config?: {
    socialProviders?: ReturnType<typeof buildExtraSocialProviders>;
  }) => Promise<unknown>;
}> = import(/* @vite-ignore */ betterAuthInstanceUrl);

/**
 * Public routes: the marketing landing and the sign-in / sign-up screens
 * (`/auth/*`). Keep in sync with `app/lib/public-routes.ts`.
 */
const PUBLIC_PATHS = ["/", "/auth"];

type AuthPlugin = ReturnType<typeof createToolkitAuthPlugin>;

const authPlugin: AuthPlugin = async (nitroApp) => {
  const socialProviders = buildExtraSocialProviders();
  const { getBetterAuth } = await betterAuthModule;
  void getBetterAuth({ socialProviders });
  return createToolkitAuthPlugin({
    publicPaths: PUBLIC_PATHS,
    workspaceAppPublicPaths: PUBLIC_PATHS,
    rootAuth: false,
    marketing: false,
    // The framework's /sign-in, /login and /signup forward to /auth/sign-in and /auth/sign-up.
    loginHtml: SIGN_IN_ENTRY_HTML,
    betterAuth: {
      socialProviders,
    },
  })(nitroApp);
};

export default authPlugin;
