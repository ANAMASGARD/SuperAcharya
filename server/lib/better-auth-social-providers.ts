type SocialProviderCreds = { clientId: string; clientSecret: string };

type MicrosoftProviderCreds = SocialProviderCreds & { tenantId?: string };

export type ExtraSocialProviders = {
  discord?: SocialProviderCreds;
  facebook?: SocialProviderCreds;
  linkedin?: SocialProviderCreds;
  microsoft?: MicrosoftProviderCreds;
};

function providerFromEnv(
  clientId: string | undefined,
  clientSecret: string | undefined,
): { clientId: string; clientSecret: string } | undefined {
  const id = clientId?.trim();
  const secret = clientSecret?.trim();
  if (!id || !secret) return undefined;
  return { clientId: id, clientSecret: secret };
}

/**
 * Extra OAuth providers passed through Agent-Native's Better Auth bridge.
 * Google and GitHub are also enabled from env by the framework when
 * GOOGLE_* / GITHUB_* are set; this adds Facebook, Microsoft, Discord and
 * LinkedIn when their credentials are configured. A provider with no credentials
 * is simply absent, and Better Auth answers 404 for it.
 */
export function buildExtraSocialProviders(): ExtraSocialProviders {
  const providers: ExtraSocialProviders = {};

  const facebook = providerFromEnv(
    process.env.FACEBOOK_CLIENT_ID, // guard:allow-env-credential — deploy-level Better Auth Facebook OAuth app id
    process.env.FACEBOOK_CLIENT_SECRET, // guard:allow-env-credential — deploy-level Better Auth Facebook OAuth app secret
  );
  if (facebook) providers.facebook = facebook;

  const microsoft = providerFromEnv(
    process.env.MICROSOFT_CLIENT_ID, // guard:allow-env-credential — Microsoft Entra app (client) id
    process.env.MICROSOFT_CLIENT_SECRET, // guard:allow-env-credential — Microsoft Entra client secret
  );
  if (microsoft) {
    const tenantId = process.env.MICROSOFT_TENANT_ID?.trim(); // guard:allow-env-credential — deploy-level Microsoft Entra directory (tenant) id
    providers.microsoft = tenantId ? { ...microsoft, tenantId } : microsoft;
  }

  const discord = providerFromEnv(
    process.env.DISCORD_CLIENT_ID, // guard:allow-env-credential — deploy-level Better Auth Discord OAuth app id
    process.env.DISCORD_CLIENT_SECRET, // guard:allow-env-credential — deploy-level Better Auth Discord OAuth secret
  );
  if (discord) providers.discord = discord;

  const linkedin = providerFromEnv(
    process.env.LINKEDIN_CLIENT_ID, // guard:allow-env-credential — deploy-level Better Auth LinkedIn OAuth app id
    process.env.LINKEDIN_CLIENT_SECRET, // guard:allow-env-credential — deploy-level Better Auth LinkedIn OAuth secret
  );
  if (linkedin) providers.linkedin = linkedin;

  return providers;
}
