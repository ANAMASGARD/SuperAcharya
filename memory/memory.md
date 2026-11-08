# Super Acharya — project memory

## Project direction

- **Product:** Super Acharya — whiteboard-first, real-time, multimodal AI teacher (Builder.io Agent-Native 2026).
- **Framework:** Agent-Native standalone — React 19, React Router 8, Vite, Nitro/h3. No Next.js. No Clerk.
- **Stack:** `@agent-native/core` / `toolkit` / `agentkit` 0.226.0, Drizzle over Postgres/PGlite; production DB via Neon `DATABASE_URL`.
- **Authority:** `AGENTS.md` = vision/rules; this file = what is implemented and verified. Read the code to confirm behavior.

## Authentication

- Framework only: `createToolkitAuthPlugin` in `server/plugins/auth.ts`. No parallel `/api/auth` or second auth product.
- **Email/password** and magic link when outbound email is configured.
- **Google:** framework flow `/_agent-native/google/auth-url` → `/_agent-native/google/callback` (`GOOGLE_SIGN_IN_*` in env).
- **Microsoft & Facebook:** Better Auth `POST /_agent-native/auth/ba/sign-in/social`; credentials in `server/lib/better-auth-social-providers.ts` (`MICROSOFT_*`, `FACEBOOK_*`).
- **Sign-in UI:** `/auth/sign-in`, `/auth/sign-up` — Google, Microsoft (four-colour icon), Facebook. Apple removed from the screen.
- **Better Auth bootstrap fix:** `server/plugins/auth.ts` calls `getBetterAuth({ socialProviders })` before the framework session route, so Facebook/Microsoft are not lost to a first empty singleton (`PROVIDER_NOT_FOUND`).
- **Local env:** `.env.example` documents redirect URIs. Set `BETTER_AUTH_URL=http://localhost:8080` in `.env.local` so Better Auth callbacks match `agent-native dev` (port 8080). Use `AGENT_NATIVE_DISABLE_AUTO_DEV_ACCOUNT=1` for real sign-in on localhost.
- **Provider consoles (local dev):** register these redirect URIs exactly:
  - Google: `http://localhost:8080/_agent-native/google/callback`
  - Facebook: `http://localhost:8080/_agent-native/auth/ba/callback/facebook`
  - Microsoft: `http://localhost:8080/_agent-native/auth/ba/callback/microsoft`
- Google `redirect_uri_mismatch` is fixed in Google Cloud Console, not in app code. `gcloud` cannot edit console OAuth clients.

## Routes and landing

- **`/`** — public video hero landing (`app/components/landing/LandingPage.tsx`). Signed-in users can stay on `/` (no auto-bounce to the classroom).
- **Landing auth redirect disabled:** `app/root.tsx` sets `window.__agentNativeAuthRedirectStarted` on `/` so the framework’s injected `data-agent-native-auth-redirect` script does not send signed-in visitors away from the marketing page.
- **Header (right):** signed-out → “Sign in” → `/auth/sign-in`; signed-in → circular profile avatar (session `image` or initial) linking to the whiteboard.
- **“Get started”** → `/whiteboard` for everyone (session required inside the app shell on that route).
- **`/whiteboard`** — classroom placeholder (`BOARD_PATH` = `/whiteboard` in `app/lib/chat-paths.ts`). `app.homePath` in `server/plugins/agent-native-email-branding.ts` matches `/whiteboard`.
- **`/board`** — redirect to `/whiteboard` for old links.
- **`/home`** — product cards; chat secondary in sidebar.
- **Public paths:** `/`, `/auth/*` (`app/lib/public-routes.ts`, `server/plugins/auth.ts`). Other routes use the signed-in shell.
- **Post-auth default** (no `?c=`): `resolveResumeHref` → `/whiteboard` (`app/lib/auth-client.ts`).
- **`DbSyncSetup`:** wrapped in `<ClientOnly>` on public routes (`app/root.tsx`).

## Data

- Neon linked; `DATABASE_URL` / `DATABASE_URL_UNPOOLED` in `.env.local` (gitignored). No app-owned lesson/whiteboard tables yet.

## Verification (last run)

| Check | Result |
|--------|--------|
| `pnpm run typecheck` | Passed |
| `pnpm test` | 19/19 passed |
| `pnpm agent-native:doctor` | Clean |
| `pnpm run build` | Complete (exit 0) |

Social OAuth: Facebook/Microsoft social endpoints return authorize URLs after auth-plugin fix; full browser login depends on provider console redirect URIs. Google same.

## Important files

| Area | Path |
|------|------|
| Auth plugin + Better Auth preload | `server/plugins/auth.ts` |
| Extra social providers | `server/lib/better-auth-social-providers.ts` |
| Sign-in entry forwarder | `server/lib/sign-in-entry-html.ts` |
| Auth screens | `app/components/auth/*`, `app/lib/auth-client.ts` |
| Landing | `app/components/landing/LandingPage.tsx` |
| Whiteboard route | `app/routes/whiteboard.tsx`, `app/components/board/BoardPage.tsx` |
| Paths / public routes | `app/lib/chat-paths.ts`, `app/lib/public-routes.ts` |
| Root shell | `app/root.tsx` |
| Env docs | `.env.example` |

## Not done yet

- Register localhost (and production) OAuth redirect URIs at Google, Meta, and Microsoft Entra; smoke-test each provider end to end.
- Excalidraw on the whiteboard, lesson ops, LangGraph teaching workflow, STT/TTS, interruption handling.
- Whiteboard link in `app/components/layout/Sidebar.tsx` (route exists; sidebar may still emphasize Home/Chat only).
- Optional: email verification / forgot-password flows with a real mail provider.

## Git policy

- Work on `main`. Commits only when the user asks. Do not commit `.env.local` or secrets.
