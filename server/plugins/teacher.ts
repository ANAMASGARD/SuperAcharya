import { registerRequiredSecret } from "@agent-native/core/secrets";

// The installed workspace catalog has no reusable Clocked or Sarvam connection.
// OpenAI also uses the framework's scoped secret store, not a second key form.
for (const [key, label, docsUrl] of [
  [
    "OPENAI_API_KEY",
    "OpenAI teacher API key",
    "https://platform.openai.com/api-keys",
  ],
  [
    "CLOCKED_API_KEY",
    "Clocked learning preferences API key",
    "https://clocked.rezolve.ai/account",
  ],
  [
    "SARVAM_API_KEY",
    "Sarvam teacher voice API key",
    "https://dashboard.sarvam.ai/",
  ],
] as const)
  registerRequiredSecret({
    key,
    label,
    docsUrl,
    description: "Server-only provider credential for the classroom teacher.",
    scope: "user",
    kind: "api-key",
    required: false,
  });

export default () => {};
