# Super Acharya — project memory

Last updated: 2026-11-07 (auth + landing handoff).

## Project direction

- **Product:** Super Acharya — whiteboard-first, real-time, multimodal AI teacher (hackathon: Builder.io Agent-Native 2026).
- **Framework (locked):** Agent-Native standalone — React 19 + React Router 8 + Vite + Nitro/h3. **No Next.js. No Clerk.**
- **Stack:** `@agent-native/core` / `toolkit` / `agentkit` **0.226.0**, Drizzle over Postgres/PGlite; production DB target **Neon** via `DATABASE_URL`.
- **Authority:** `AGENTS.md` = vision/rules; this file = what is actually done. Prefer reading code over old notes.

## Completed — authentication & app shell (2026-11-07)

### Auth (Better Auth via Agent-Native)

- **Done.** Framework auth only: `createToolkitAuthPlugin` in `server/plugins/auth.ts`.
- **Do not** add standalone `auth.ts`, `/api/auth/*`, or a second auth product (Clerk was tried then fully removed).
- **Methods:**
  - Email/password + magic link (framework defaults when email is ready).
  - Google: `GOOGLE_SIGN_IN_CLIENT_ID` / `GOOGLE_SIGN_IN_CLIENT_SECRET`.
  - GitHub: `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
  - Discord / LinkedIn: `server/lib/better-auth-social-providers.ts` → `betterAuth.socialProviders`; UI extras in `server/lib/render-sign-in-page.ts` (POST to `/_agent-native/auth/ba/sign-in/social`).
- **Env:** Documented in `.env.example`. Local secrets live in `.env.local` (gitignored). Use `AGENT_NATIVE_DISABLE_AUTO_DEV_ACCOUNT=1` so localhost does not auto-sign in as `dev@local.test`.
- **Doctor:** Discord/LinkedIn `process.env` reads use `// guard:allow-env-credential — …`. `pnpm agent-native:doctor` is clean.

### Public landing → sign-in → protected app

Desired flow (implemented):

1. **`/`** — public marketing landing (`app/components/landing/LandingPage.tsx`); no app sidebar.
2. **Sign in / Sign up / Get started** — sheet (`AuthDialog`) with Better Auth embed + fallback “Continue to sign in”.
3. After session — redirect to **`/home`** (`homePath` in `server/plugins/agent-native-email-branding.ts`).
4. All other app routes require session (`RequireSession` via `AppProviders`); only `/` is public (`publicPaths` / `workspaceAppPublicPaths` + `isPublicPath` / `PUBLIC_PATHS` in `app/root.tsx`).

SSR fix: `DbSyncSetup` wrapped in `<ClientOnly>` so public `/` does not 500 with `useLocation() outside <Router>` during SSR.

### Chat template removed as primary UX

- Removed AgentKit “Get started / Ask anything” home and sidebar thread rail as the product face.
- **`/home`** — product home cards (whiteboard coming soon; optional Open chat).
- **`/chat`** — still available for agent/hackathon; secondary in sidebar (Home + Chat).
- Branding: `sourceTemplate: "app"` (not `"chat"`).

### Design system (earlier same day)

- Neobrutalism tokens in `app/global.css`; Archivo Black + Space Grotesk.
- Local UI: button, card, input, label; other controls still toolkit re-exports.

## Data / Neon (decision, not provisioned in repo)

- Agent-Native **already ships Drizzle + Postgres**. Local = PGlite; production needs **`DATABASE_URL`** (Neon recommended).
- No app-owned lesson/board tables yet — add Drizzle schema when building `/board`. Large scenes → file storage + SQL references, not huge base64 in rows.
- `pnpm run build` may still **print** missing production `DATABASE_URL`; build still completes. Set Neon URL on the host before real deploy — **do not commit secrets**.

## Verification (latest)

| Check | Result |
|--------|--------|
| `pnpm typecheck` | Passed |
| `pnpm agent-native:doctor` | Clean |
| `pnpm run build` | Complete (exit 0); advisory missing `DATABASE_URL` for production |
| Browser | Landing SSR 200 on `/`; auth sheet + protected `/home` exercised in session |

## Important files

| Area | Path |
|------|------|
| Auth plugin | `server/plugins/auth.ts` |
| Discord/LinkedIn providers | `server/lib/better-auth-social-providers.ts` |
| Sign-in page extras | `server/lib/render-sign-in-page.ts` |
| Public landing | `app/components/landing/*`, `app/routes/_index.tsx` |
| Public path helper | `app/lib/public-routes.ts` |
| Root shell / ClientOnly | `app/root.tsx` |
| Authenticated home | `app/components/home/HomePage.tsx`, `app/routes/home.tsx` |
| Sidebar | `app/components/layout/Sidebar.tsx` |
| Env docs | `.env.example` |
| Product rules | `AGENTS.md` |

## Not done (next concrete steps)

1. Set Neon `DATABASE_URL` in deploy env when hosting.
2. Wire real OAuth client IDs/secrets; confirm provider callback URLs under `/_agent-native/auth/ba/callback/<provider>`.
3. Install Excalidraw + `/board` route; set `homePath` to board when ready.
4. Lesson ops actions, LangGraph teaching pipeline, STT/TTS, interruption IDs.
5. Optional: `docs/super-acharya-feasibility.md` if still missing.

## Handoff for the next agent

- Prefer **Better Auth + public `/` + protected `/home`** over reintroducing Clerk or chat-as-home.
- Keep Discord/LinkedIn env reads behind `guard:allow-env-credential`.
- Do not remove `<ClientOnly>` around `DbSyncSetup` while `/` is public.
- Neon + Drizzle is the correct persistence path for lessons/board metadata.

## Git

- Work stays on **`main`**. Commits only when the user asks (this session: auth/landing commit authorized).
