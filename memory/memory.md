# Super Acharya — project memory

Last updated: 2026-11-07 (session notes).

## Project direction

- **Product:** Super Acharya — multimodal AI teaching on a shared Excalidraw whiteboard (hackathon: Builder.io Agent-Native 2026).
- **Framework decision (locked):** **Agent-Native standalone** (React 19 + React Router 8 + Vite + Nitro/h3 server). **Do not use Next.js** as the main app framework.
- **Stack in repo:** `@agent-native/core` / `toolkit` / `agentkit` **0.226.0**, Drizzle, Postgres/PGlite, Better Auth via toolkit plugin (not Clerk yet).

## Routing and why it feels “chat-first”

- `/` → `signInLandingLoader` → sign-in, then resume **`/home`** (`homePath` in `server/plugins/agent-native-email-branding.ts`).
- Chat lives at `/chat`; new chat redirects to `/chat/<threadId>` via `ChatHomeRedirect`.
- Home (`HomePage`) uses the same AgentKit composer as chat; submitting hands off to chat — **not** the final whiteboard product UX.
- To make the product whiteboard-first: add a domain route (e.g. `/board`), set `homePath`, optional Sidebar link; keep `/chat` for agent if needed for hackathon criteria.

## Feasibility (researched, not fully implemented)

| Piece | In repo today | Notes |
|--------|----------------|-------|
| React UI | Yes | Full component tree under `app/`; not Next.js |
| `defineAction` | Yes (`actions/hello.ts`, `navigate.ts`, etc.) | Extend with board/lesson actions |
| Excalidraw | No | **Can install** — `@excalidraw/excalidraw` peers React 19; browser-only `updateScene` |
| LangGraph.js | No | Server-side add-on; not in `defineAction` (deterministic actions) |
| Clerk | No | Prefer framework auth unless proven replacement |
| Gnani/Sarvam/voice | No | Custom streaming H3 route (actions skill exception) |
| Realtime | SSE `useDbSync` | Not millisecond draw/voice sync; queue + client executor |
| Neon | Via `DATABASE_URL` | No domain tables yet (`server/db/` not scaffolded) |

**Architecture rule:** UI or agent → validated action → DB/lesson ops → `useDbSync` → browser Excalidraw executor. LangGraph decides *what*; client controller decides *when* for draw/TTS.

## Design system work done (2026-11-07)

- **Neobrutalism** theme integrated at token level in `app/global.css`:
  - HSL palette compatible with toolkit (`hsl(var(--background))` pattern)
  - Hard shadows, `--radius: 0`
  - Fonts: **Archivo Black** (headings), **Space Grotesk** (body) via `@fontsource/*`
- **`components.json`:** Neobrutalism registries `@neobrutalism` / `@neobrutalism-base`; aliases point at `app/components` (shadcn CLI may still drop files in wrong path — verify after adds).
- **Replaced toolkit re-exports** with Neobrutalism/Radix source for:
  - `app/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`
- **Dependencies added:** `radix-ui`, `@fontsource/archivo-black`, `@fontsource/space-grotesk`
- **Still toolkit re-exports:** sheet, dropdown-menu, tooltip, separator, skeleton, item, hover-card, etc. — AgentKit chat UI largely unchanged visually at component level.

## Verification run

- `pnpm typecheck` — passed
- `pnpm agent-native:doctor` — clean

## Not done yet (backlog)

- Install `@excalidraw/excalidraw` + font self-host / `EXCALIDRAW_ASSET_PATH`
- Whiteboard route, board actions, client command executor
- LangGraph teaching pipeline, voice (STT/TTS), interruption/generation IDs
- Persisted lessons schema (Drizzle)
- Written report `docs/super-acharya-feasibility.md` (planned in research session; create if missing)

## Docs to read before building

- Repo `AGENTS.md`, `.agents/skills/build-an-app`, `actions`, `real-time-sync`, `client-side-routing`
- `pnpm action docs-search` for version-matched Agent-Native docs
