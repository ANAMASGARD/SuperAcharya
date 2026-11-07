type SocialProviderCreds = { clientId: string; clientSecret: string };

export type ExtraSocialProviders = {
  discord?: SocialProviderCreds;
  linkedin?: SocialProviderCreds;
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
 * GOOGLE_* / GITHUB_* are set; this adds Discord and LinkedIn when configured.
 */
export function buildExtraSocialProviders(): ExtraSocialProviders {
  const providers: ExtraSocialProviders = {};

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
