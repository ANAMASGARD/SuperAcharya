import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

import { buildExtraSocialProviders } from "../lib/better-auth-social-providers";
import { renderSuperAcharyaSignInPage } from "../lib/render-sign-in-page";

const extraSocialProviders = buildExtraSocialProviders();

export default createToolkitAuthPlugin({
  publicPaths: ["/"],
  workspaceAppPublicPaths: ["/"],
  rootAuth: false,
  marketing: false,
  renderSignInPage: (props) =>
    renderSuperAcharyaSignInPage(props, extraSocialProviders),
  betterAuth: {
    socialProviders: extraSocialProviders,
  },
});
