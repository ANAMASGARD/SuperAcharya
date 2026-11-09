import {
  autoMountAuth,
  getH3App,
  markDefaultPluginProvided,
  runBetterAuthMigrations,
} from "@agent-native/core/server";
import {
  createToolkitAuthPlugin,
  renderAuthPage,
  renderAuthResetPasswordPage,
} from "@agent-native/toolkit/app/auth/server";

import { buildExtraSocialProviders } from "../lib/better-auth-social-providers";
import { SIGN_IN_ENTRY_HTML } from "../lib/sign-in-entry-html";

// Keep in sync with app/lib/public-routes.ts.
const PUBLIC_PATHS = ["/", "/auth"];

const authPlugin: ReturnType<typeof createToolkitAuthPlugin> = async (
  nitroApp,
) => {
  markDefaultPluginProvided(nitroApp, "auth");
  // Use the public mounting API and normal bootstrap readiness. Exposing the
  // session route early could initialize Better Auth before social configuration.
  // No private dynamic package imports: they cannot resolve in a serverless bundle.
  await runBetterAuthMigrations(nitroApp);
  await autoMountAuth(getH3App(nitroApp), {
    publicPaths: PUBLIC_PATHS,
    workspaceAppPublicPaths: PUBLIC_PATHS,
    rootAuth: false,
    marketing: false,
    loginHtml: SIGN_IN_ENTRY_HTML,
    renderSignInPage: renderAuthPage,
    renderResetPasswordPage: renderAuthResetPasswordPage,
    betterAuth: { socialProviders: buildExtraSocialProviders() },
  });
};
export default authPlugin;
