import {
  agentNativePath,
  appBasePath,
} from "@agent-native/core/client/api-path";
import { navigateForSession } from "@agent-native/core/client/use-session";
import { AUTH_SIGNUP_INVITE_ONLY_CODE } from "@agent-native/core/shared/auth-copy";
import { DEPLOY_SETTINGS_REQUIRED_CODE } from "@agent-native/core/shared/runtime-config";
import { signInJourney } from "@agent-native/core/shared/sign-in-journey";
import { z } from "zod";

import { BOARD_PATH } from "@/lib/chat-paths";

/** The part of a framework / Better Auth JSON reply the screens act on. */
const authResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
  twoFactorRedirect: z.boolean().optional(),
  ok: z.boolean().optional(),
  url: z.string().optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export interface AuthResult {
  ok: boolean;
  status: number;
  data: AuthResponse;
}

/**
 * Calls a framework auth endpoint with the session cookie. The body is parsed
 * defensively: a reply that is not the expected JSON object becomes `{}`, so
 * callers still get the HTTP status.
 */
export async function requestAuth(
  path: string,
  body: Record<string, unknown>,
): Promise<AuthResult> {
  const response = await fetch(agentNativePath(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  let raw: unknown = null;
  try {
    raw = await response.json();
  } catch {
    // coercion-ok: a non-JSON reply still has a status the caller can act on.
  }
  const parsed = authResponseSchema.safeParse(raw);
  return {
    ok: response.ok,
    status: response.status,
    data: parsed.success ? parsed.data : {},
  };
}

const INTERNAL_DETAIL_PATTERN =
  /failed query|\bselect\b.*\bfrom\b|\binsert\b.*\binto\b|\bupdate\b.*\bset\b|\bdelete\b.*\bfrom\b|\bsql\b|database|relation .* does not exist|column .* does not exist|syntax error|constraint|connection refused|econn|timeout/i;

/** The message to show for a failed auth call, never leaking internal detail. */
export function authErrorMessage(data: AuthResponse, fallback: string): string {
  if (
    data.code === AUTH_SIGNUP_INVITE_ONLY_CODE ||
    data.error === AUTH_SIGNUP_INVITE_ONLY_CODE
  ) {
    return "Sign-up is invite-only right now. Ask your teacher for an invite.";
  }
  if (data.code === DEPLOY_SETTINGS_REQUIRED_CODE) {
    return "Sign-in isn't finished being set up on this deployment yet.";
  }
  const candidate = (data.error ?? data.message ?? "").trim();
  if (!candidate || INTERNAL_DETAIL_PATTERN.test(candidate)) return fallback;
  return candidate;
}

export function isEmailNotVerified(result: AuthResult): boolean {
  const text = `${result.data.error ?? ""} ${result.data.message ?? ""}`;
  return result.status === 403 && /not verified|verification/i.test(text);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

/**
 * Where to send the student once signed in: the continuation the session gate
 * attached (`?c=`), otherwise the whiteboard. Never the sign-in screen itself,
 * and never an off-site URL: `signInJourney` only returns app paths.
 */
export function resolveResumeHref(search: string): string {
  const params = new URLSearchParams(search);
  return signInJourney({
    at: BOARD_PATH,
    continuation: params.get("c"),
    legacyReturn: params.get("return"),
    basePath: appBasePath(),
    homePath: BOARD_PATH,
  }).resumeHref;
}

/** Leaves the auth screen for the app. A full navigation, so the new session is read fresh. */
export function enterApp(href: string): void {
  navigateForSession(href, "signed_in_app");
}

export type SocialProviderId = "google" | "microsoft" | "facebook";

export type SocialStartResult =
  | { status: "redirecting" }
  | { status: "not-configured" }
  | { status: "failed" };

/**
 * Starts a social sign-in. Google uses the framework's own Google flow (the one
 * its stock page uses); Microsoft and Facebook use Better Auth's social endpoint.
 * A provider with no credentials answers 404, reported as "not configured" so
 * the screen can say so instead of navigating to an error page.
 */
export async function startSocialSignIn(
  provider: SocialProviderId,
  resumeHref: string,
): Promise<SocialStartResult> {
  try {
    if (provider === "google") {
      const url = `${agentNativePath("/_agent-native/google/auth-url")}?${new URLSearchParams({ return: resumeHref, redirect: "1" })}`;
      const probe = await fetch(url, {
        credentials: "include",
        redirect: "manual",
      });
      if (probe.type === "opaqueredirect") {
        window.location.assign(url);
        return { status: "redirecting" };
      }
      return { status: probe.status === 404 ? "not-configured" : "failed" };
    }

    const result = await requestAuth("/_agent-native/auth/ba/sign-in/social", {
      provider,
      callbackURL: resumeHref,
    });
    if (result.ok && result.data.url) {
      window.location.assign(result.data.url);
      return { status: "redirecting" };
    }
    return { status: result.status === 404 ? "not-configured" : "failed" };
  } catch {
    // coercion-ok: a network failure is reported to the student as a failed start.
    return { status: "failed" };
  }
}
