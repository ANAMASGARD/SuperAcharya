import { z } from "zod";

const senderSchema = z.email();
const credentialsSchema = z.object({
  BREVO_CLIENT_ID: z.string().trim().min(1),
  BREVO_CLIENT_SECRET: z.string().trim().min(1),
});
let cachedToken:
  | { clientId: string; token: string; expiresAt: number }
  | undefined;

async function authorization(): Promise<Record<string, string>> {
  // guard:allow-env-credential — User-authorized deployment auth mail; pre-login visitors have no scoped identity.
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (apiKey) return { "api-key": apiKey };
  const credentials = credentialsSchema.safeParse(process.env);
  if (!credentials.success)
    throw new Error("Email delivery is not configured.");
  const { BREVO_CLIENT_ID: clientId, BREVO_CLIENT_SECRET: clientSecret } =
    credentials.data;
  if (
    cachedToken?.clientId === clientId &&
    cachedToken.expiresAt > Date.now()
  ) {
    return { Authorization: `Bearer ${cachedToken.token}` };
  }
  try {
    const response = await fetch(
      "https://api.brevo.com/realms/partner/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "transactional.email:write",
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error("Token request failed");
    const token = z
      .object({
        access_token: z.string().min(1),
        token_type: z.literal("Bearer"),
        expires_in: z.number().positive(),
      })
      .parse(await response.json());
    cachedToken = {
      clientId,
      token: token.access_token,
      expiresAt: Date.now() + Math.max(0, token.expires_in - 60) * 1000,
    };
    return { Authorization: `Bearer ${token.access_token}` };
  } catch {
    throw new Error(
      "Email delivery authentication failed. Please try again shortly.",
    );
  }
}

export interface AuthEmail {
  to: string;
  subject: string;
  text: string;
}

/** Auth mail belongs to the deployment: recipients do not have sessions yet. */
export async function sendBrevoEmail(mail: AuthEmail): Promise<void> {
  // guard:allow-env-credential — Non-secret verified deployment sender for unauthenticated auth mail.
  const sender = senderSchema.safeParse(process.env.BREVO_SENDER_EMAIL);
  if (!sender.success) throw new Error("Email delivery is not configured.");
  const authHeaders = await authorization();
  z.email().parse(mail.to);
  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Super Acharya", email: sender.data },
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Email delivery failed. Please try again shortly.");
  }
  // Never include provider bodies, recipients, credentials or codes in errors.
  if (response.status !== 201) {
    throw new Error("Email delivery failed. Please try again shortly.");
  }
  const result: unknown = await response.json().catch(() => null);
  if (!z.object({ messageId: z.string().min(1) }).safeParse(result).success) {
    throw new Error(
      "Email delivery could not be confirmed. Please try again shortly.",
    );
  }
}
