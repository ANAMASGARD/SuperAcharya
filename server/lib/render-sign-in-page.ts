import type { AuthPageProps } from "@agent-native/core/shared/auth-page-types";
import { FRAMEWORK_INTERNAL_ROUTE_PREFIX } from "@agent-native/core/shared/framework-route-prefix";
import { renderAuthPage } from "@agent-native/toolkit/app/auth/server";

import type { ExtraSocialProviders } from "./better-auth-social-providers";

const BA_BASE = `${FRAMEWORK_INTERNAL_ROUTE_PREFIX}/auth/ba`;

type ExtraProvider = keyof ExtraSocialProviders;

function extraProvidersEnabled(
  configured: ExtraSocialProviders,
): ExtraProvider[] {
  const list: ExtraProvider[] = [];
  if (configured.discord) list.push("discord");
  if (configured.linkedin) list.push("linkedin");
  return list;
}

function socialForm(
  provider: ExtraProvider,
  callbackUrl: string,
  label: string,
  icon: string,
  buttonClass: string,
): string {
  const fields = [
    `<input type="hidden" name="provider" value="${provider}" />`,
    `<input type="hidden" name="callbackURL" value="${callbackUrl}" />`,
  ].join("");
  return `<form method="POST" action="${BA_BASE}/sign-in/social" class="sa-social-form">
  ${fields}
  <button type="submit" class="btn-social ${buttonClass}">${icon}<span>${label}</span></button>
</form>`;
}

function providerMeta(provider: ExtraProvider): {
  label: string;
  icon: string;
  buttonClass: string;
} {
  switch (provider) {
    case "discord":
      return {
        label: "Discord",
        buttonClass: "btn-social-discord",
        icon: `<svg class="sa-social-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
      };
    case "linkedin":
      return {
        label: "LinkedIn",
        buttonClass: "btn-social-linkedin",
        icon: `<svg class="sa-social-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
      };
    default: {
      const _never: never = provider;
      return _never;
    }
  }
}

function extraSocialHtml(
  callbackUrl: string,
  configured: ExtraSocialProviders,
): string {
  const providers = extraProvidersEnabled(configured);
  if (providers.length === 0) return "";

  const buttons = providers
    .map((provider) => {
      const meta = providerMeta(provider);
      return socialForm(
        provider,
        callbackUrl,
        meta.label,
        meta.icon,
        meta.buttonClass,
      );
    })
    .join("");

  return `
<style>
  .sa-extra-social { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }
  .sa-extra-social-label { font-size: 0.75rem; color: var(--muted-foreground, #6b6355); text-align: center; }
  .sa-social-form { margin: 0; }
  .btn-social {
    display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%;
    border: 2px solid #000; padding: 0.5rem 1rem; font-weight: 600; cursor: pointer;
    color: #000; background: #fff; box-shadow: 3px 3px 0 0 #000;
  }
  .btn-social:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 0 #000; }
  .sa-social-icon { flex-shrink: 0; }
  .btn-social-discord { background: #5865f2; color: #fff; border-color: #000; }
  .btn-social-linkedin { background: #0a66c2; color: #fff; border-color: #000; }
</style>
<div class="sa-extra-social" id="sa-extra-social">
  <p class="sa-extra-social-label">Or continue with</p>
  ${buttons}
</div>`;
}

/**
 * Toolkit sign-in page plus Discord / LinkedIn when configured in the auth plugin.
 * Google, GitHub, email, and magic link are rendered by the framework from env.
 */
export function renderSuperAcharyaSignInPage(
  props: AuthPageProps,
  extraSocialProviders: ExtraSocialProviders,
): string {
  const baseHtml = renderAuthPage(props);
  const callbackUrl = props.initialResumeHref ?? props.homePath ?? "/home";
  const injection = extraSocialHtml(callbackUrl, extraSocialProviders);
  if (!injection) return baseHtml;

  const anchor = '<div class="google-signin"';
  if (baseHtml.includes(anchor)) {
    return baseHtml.replace(anchor, `${injection}${anchor}`);
  }
  return `${baseHtml}\n${injection}`;
}
