# Email verification and password sign-in

Super Acharya retains Agent-Native's Better Auth identity, database and cookies.
The app configures public Better Auth plugins through `server/plugins/auth.ts`.
Google's sign-in flow is unchanged. Existing sessions are not revoked.

- Signup requires a six-digit emailed verification code. Verification does not
  create a session. The subsequent password sign-in requires its own fresh code.
- Password sign-in enrolls the verified user in email two-factor authentication
  after password validation, on their next sign-in. Better Auth deletes the
  provisional session and grants a new one only after the second-factor code.
- Codes are hashed in Better Auth's verification store, expire in five minutes,
  and permit five wrong guesses. Replayed challenges are rejected.
- Magic-link, passwordless email OTP, legacy link verification, disabling 2FA,
  backup-code login and trusted-device requests are denied by server policy.
  Previously issued trusted-device grants are retired at password sign-in.
- The app uses the native `/_agent-native/auth/ba` HTTP endpoints. Legacy Core
  register/login direct API wrappers are refused because they skip Better Auth's
  HTTP rate limiter. Google and existing session reads retain their normal paths.
- Better Auth uses an app-owned atomic PostgreSQL rate-limit store. Counters are
  shared between serverless instances, keys are hashed, and inactive counters
  are pruned after 24 hours. Second-factor delivery permits one request per
  minute per client; the UI also provides a 60-second resend cooldown.
- Brevo acceptance is checked before the UI claims a code was sent. Provider
  acceptance does not prove inbox arrival. Failed signup delivery can leave an
  unverified account: retry sign-in and request verification again.

## Deployment setup

Use deployment-owned, server-only credentials. Unauthenticated students cannot
resolve an authenticated workspace secret. There is no Brevo connection in the
installed framework's provider catalog; its built-in email readiness supports
Resend and SendGrid only. The app's plugin explicitly supplies the Brevo email
policy and callbacks; no dummy provider keys or package patches are used.

Set a verified `BREVO_SENDER_EMAIL`, plus either:

- `BREVO_API_KEY`; or
- `BREVO_CLIENT_ID` and `BREVO_CLIENT_SECRET` for a private Brevo M2M app scoped
  to `transactional.email:write`. The server obtains short-lived tokens and
  caches them until one minute before expiry. Restart after rotating secrets.

Never use a developer CLI access/refresh token as deployment credentials.
Never prefix these variables with `VITE_`. Missing delivery configuration fails
email authentication closed; Google remains independent.

Apply the additive app migration `email-auth-rate-limits-v1` with the existing
release migration command before production promotion. Keep `BETTER_AUTH_SECRET`
and the session cookie namespace unchanged. No production migration or deployment
is implied by the source change.

Password recovery sends a Brevo reset link through the existing framework reset
screen. It does not bypass the code requirement on the next password sign-in.

The current UI deliberately uses email codes; it is not an authenticator-app
setup flow and does not claim phishing-resistant authentication.

References: [Better Auth email OTP](https://www.better-auth.com/docs/plugins/email-otp),
[Better Auth two-factor](https://www.better-auth.com/docs/plugins/2fa),
[Brevo M2M authentication](https://developers.brevo.com/docs/oauth-m2m-authentication),
[Brevo transactional email](https://developers.brevo.com/docs/send-a-transactional-email).
See `email-auth-contract-research.md` for the installed-version investigation.

## Configured sender domain

The configured sender is `Super Acharya <no-reply@we.superacharya.com>`.
Brevo verified the domain's ownership, both DKIM selectors and DMARC on
2026-11-10. Cloudflare uses Vercel's recommended A records at `we` so the
Brevo ownership TXT record can coexist at that hostname. DKIM CNAMEs are
DNS-only with flattening disabled. This setup enables outgoing mail; it does
not provision an inbox for replies.

Local server credentials and the sender are configured in ignored `.env.local`.
Production environment configuration and deployment remain separate steps.
