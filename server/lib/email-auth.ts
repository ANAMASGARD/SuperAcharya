import type { BetterAuthPlugin, BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { emailOTP, twoFactor } from "better-auth/plugins";

import { authRateLimitStorage } from "./auth-rate-limit";
import { sendBrevoEmail, type AuthEmail } from "./brevo-email";

/** One delivery implementation for signup, second factor and password recovery. */
export function emailAuthPlugins(
  send: (mail: AuthEmail) => Promise<void> = sendBrevoEmail,
  storage: NonNullable<
    NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
  > = authRateLimitStorage,
) {
  const deliveries = new WeakMap<object, Promise<boolean>>();
  const sendCode = (email: string, code: string, purpose: string) =>
    send({
      to: email,
      subject: `Your Super Acharya ${purpose} code`,
      text: `Your ${purpose} code is ${code}. It expires in 5 minutes. If you did not request this, ignore this email. Never share this code.`,
    });
  const policy: BetterAuthPlugin = {
    id: "acharya-email-policy",
    init(ctx) {
      Object.assign(ctx.rateLimit, {
        enabled: true,
        storage: "database",
        window: 60,
        max: 30,
        customRules: { "/two-factor/send-otp": { window: 60, max: 1 } },
      });
      Object.assign(ctx.options, {
        emailAndPassword: {
          ...ctx.options.emailAndPassword,
          enabled: true,
          requireEmailVerification: true,
          autoSignIn: false,
          // Core's built-in readiness knows Resend/SendGrid only. Brevo is
          // supplied by this plugin; absent credentials fail during delivery.
          disableSignUp: false,
          onExistingUserSignUp: async () => {},
          sendResetPassword: async ({ user, url }, request) => {
            if (!request)
              throw new Error("Password recovery requires an HTTP request.");
            const delivery = send({
              to: user.email,
              subject: "Reset your Super Acharya password",
              text: `Use this link to reset your password: ${url}\nIf you did not request this, ignore this email.`,
            }).then(
              () => true,
              () => false,
            );
            deliveries.set(request, delivery);
            await delivery;
          },
        },
        emailVerification: {
          ...ctx.options.emailVerification,
          // The emailOTP signup after-hook owns delivery using the current
          // request context. Legacy link delivery is disabled by route policy.
          sendVerificationEmail: async () => {},
          sendOnSignUp: true,
          sendOnSignIn: false,
          autoSignInAfterVerification: false,
        },
        rateLimit: {
          enabled: true,
          customStorage: storage,
          window: 60,
          max: 30,
        },
      } satisfies Partial<typeof ctx.options>);
    },
    hooks: {
      before: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            // HTTP entrypoints retain Better Auth's shared database rate limiter.
            // Core's legacy direct API wrappers skip it, so refuse those paths.
            if (
              !ctx.request &&
              [
                "/sign-up/email",
                "/sign-in/email",
                "/request-password-reset",
              ].includes(ctx.path ?? "")
            ) {
              throw new APIError("BAD_REQUEST", {
                message: "Use the email sign-in form to continue.",
              });
            }
            if (
              (ctx.path?.startsWith("/email-otp/") &&
                ![
                  "/email-otp/send-verification-otp",
                  "/email-otp/verify-email",
                ].includes(ctx.path)) ||
              (ctx.path === "/email-otp/send-verification-otp" &&
                ctx.body?.type !== "email-verification") ||
              ctx.path === "/forget-password/email-otp" ||
              ctx.path === "/two-factor/enable" ||
              ctx.path === "/send-verification-email" ||
              ctx.path === "/verify-email" ||
              ctx.path === "/sign-in/email-otp" ||
              ctx.path?.includes("magic-link") ||
              ctx.path === "/two-factor/disable" ||
              ctx.path === "/two-factor/verify-backup-code"
            ) {
              throw new APIError("FORBIDDEN", {
                message: "Sign in with your password and an email code.",
              });
            }
            if (
              ctx.path?.startsWith("/two-factor/") &&
              ctx.body?.trustDevice === true
            ) {
              throw new APIError("FORBIDDEN", {
                message: "A fresh code is required at every sign-in.",
              });
            }
            if (ctx.path === "/sign-in/email") {
              // Retire any previously issued trusted-device grant before the
              // native two-factor hook examines it. Do not revoke real sessions.
              const cookie = ctx.context.createAuthCookie("trust_device");
              const trust = await ctx.getSignedCookie(
                cookie.name,
                ctx.context.secret,
              );
              if (trust) {
                const identifier = trust.split("!")[1];
                if (identifier)
                  await ctx.context.internalAdapter.deleteVerificationByIdentifier(
                    identifier,
                  );
              }
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/sign-in/email",
          handler: createAuthMiddleware(async (ctx) => {
            const pending = ctx.context.newSession;
            if (!pending) return;
            // Enroll only after password validation, on the next sign-in. Native
            // twoFactor removes this provisional session before the response.
            // Existing sessions are not revoked.
            try {
              const user = await ctx.context.internalAdapter.updateUser(
                pending.user.id,
                { twoFactorEnabled: true },
              );
              ctx.context.setNewSession({ ...pending, user });
            } catch {
              deleteSessionCookie(ctx, true);
              ctx.context.setNewSession(null);
              await ctx.context.internalAdapter.deleteSession(
                pending.session.token,
              );
              throw new APIError("SERVICE_UNAVAILABLE", {
                message: "Sign-in could not complete. Try again shortly.",
              });
            }
          }),
        },
      ],
    },
  };
  const verification = emailOTP({
    sendVerificationOnSignUp: true,
    disableSignUp: true,
    otpLength: 6,
    expiresIn: 300,
    allowedAttempts: 5,
    storeOTP: "hashed",
    rateLimit: { window: 60, max: 3 },
    async sendVerificationOTP({ email, otp, type }, ctx) {
      if (type !== "email-verification") {
        throw new APIError("FORBIDDEN", {
          message: "Use password sign-in or password recovery.",
        });
      }
      if (!ctx)
        throw new APIError("INTERNAL_SERVER_ERROR", {
          message: "Email delivery could not start.",
        });
      const delivery = sendCode(email, otp, "verification").then(
        () => true,
        () => false,
      );
      deliveries.set(ctx.context, delivery);
      await delivery;
    },
  });
  const secondFactor = twoFactor({
    issuer: "Super Acharya",
    twoFactorCookieMaxAge: 300,
    totpOptions: { disable: true },
    otpOptions: {
      digits: 6,
      period: 5,
      allowedAttempts: 5,
      storeOTP: "hashed",
      // Native send-otp swallows rejected asynchronous callbacks. Track the
      // delivery and await it in an after hook to report failure truthfully.
      sendOTP({ user, otp }, ctx) {
        if (!ctx)
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Email delivery could not start.",
          });
        deliveries.set(
          ctx.context,
          sendCode(user.email, otp, "sign-in").then(
            () => true,
            () => false,
          ),
        );
      },
    },
  });
  const delivery: BetterAuthPlugin = {
    id: "acharya-email-delivery",
    hooks: {
      after: [
        {
          matcher: (ctx) =>
            [
              "/two-factor/send-otp",
              "/sign-up/email",
              "/email-otp/send-verification-otp",
              "/request-password-reset",
            ].includes(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const pending =
              deliveries.get(ctx.context) ??
              (ctx.request ? deliveries.get(ctx.request) : undefined);
            deliveries.delete(ctx.context);
            if (ctx.request) deliveries.delete(ctx.request);
            if (pending && !(await pending)) {
              throw new APIError("SERVICE_UNAVAILABLE", {
                message: "We couldn't send the code. Please try again shortly.",
              });
            }
          }),
        },
      ],
    },
  };
  return [policy, verification, secondFactor, delivery];
}
