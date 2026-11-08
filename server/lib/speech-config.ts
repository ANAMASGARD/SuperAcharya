import { resolveSecretDetailed } from "@agent-native/core/server";

// Explicitly requested deployment-owned fallback; scoped Settings keys win.
export async function speechCredential() {
  const scoped = await resolveSecretDetailed("GNANI_API_KEY");
  if (scoped.lookupFailed) return scoped;
  return {
    ...scoped,
    // guard:allow-env-credential — User explicitly authorized deployment GNANI_API_KEY in env; scoped keys take precedence.
    value: scoped.value || process.env.GNANI_API_KEY?.trim() || null,
  };
}
