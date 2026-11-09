# Super Acharya

Super Acharya is a whiteboard-first AI teacher. Students draw, type, or speak a
question on an editable Excalidraw board, and Acharya writes textbook-style
mathematics one line at a time while explaining aloud.

Built on the Agent-Native standalone application with React, TypeScript, Vite,
and Nitro. The classroom is `/whiteboard`; the original Chat and Settings
interfaces remain available.

## What works today

- **Private whiteboards:** multiple named drawings, latest-drawing reopening,
  serialized autosave, revision conflicts, personal libraries, native drawing
  tools, undo/redo, `.excalidraw` import/export, and PNG/SVG export controls.
- **Spoken questions:** Gnani Prisma `prisma-v3.0` streams live transcription.
  Hold Space in the classroom to speak and release to submit a successful final
  transcript. Click/tap the microphone for hands-free capture; Pause or Send
  finalizes it. Text editing, menus, and dialogs keep their normal keyboard use.
  Partial, failed, and truncated transcripts do not automatically start lessons.
- **Board understanding:** a question can include a fresh capture of the current
  board or selected elements. The teacher asks about important ambiguity before
  solving and preserves student work.
- **Progressive teaching:** complete, validated lines stream from the tutor.
  Each formula or explanation is written and narrated individually, with the
  next line waiting for playback and saved-scene acknowledgement. The first
  line can start before the whole lesson finishes generating.
- **Textbook notation:** MathJax renders fractions, roots, powers, and Greek
  symbols as movable formula objects. Formula source is saved and regenerated
  on reload. Board writing is English; narration can be Hindi, Hinglish, or
  English, independently of the written notation.
- **Conversation context:** owned teacher sessions retain conversation history
  and learning preferences. The model receives the latest 50 turns plus current
  preferences and board context. Clocked Fill extracts explicitly supplied
  preferences such as class, subject, topic, and spoken language.
- **Teacher voice:** Sarvam `bulbul:v4-flash` narration, a searchable 222-entry
  speaker catalog, language filtering, audio samples, and favorites. Voice and
  favorites are saved per drawing. The teacher uses a respectful, conversational
  tone and attempts a context-aware greeting on each classroom visit.
- **Interruption:** Stop immediately clears local playback and cancels the active
  generation. Completed board work remains. Ordinary clicks, screenshots, and
  tab focus changes do not cancel a submitted lesson.
- **Compact classroom controls:** neo-brutalist buttons, light/dark switching,
  visible processing feedback, and a collapsible transcript panel that preserves
  its text while making more room for the board.
- **Installable PWA:** Acharya icons, standalone launch, responsive controls,
  safe-area support, public asset caching, and an offline fallback page.

## How teaching works

```text
Voice (Gnani STT) / typed question / current board capture
                         ↓
Authenticated, duplicate-safe teaching turn
                         ↓
LangGraph: Orchestrator → Input/Vision → Tutor → Drawing Planner
              │                           │
         Clocked Fill              OpenAI Responses
                         ↓
Validated line + matching narration
                         ↓
Owned shared action → durable board operation
                         ↓
Excalidraw renders + Sarvam speaks + scene saves
                         ↓
Verified acknowledgement → next line
```

The four roles form one workflow, not four mandatory model calls per turn.
Rendering and layout are deterministic. Agent-Native shared actions enforce
ownership and validation for both UI and agent operations. Stable request IDs,
generation checks, and controlling-tab ownership prevent duplicate submissions
and stale output from overwriting newer work.

## Stack

| Area | Implementation |
| --- | --- |
| App and authentication | Agent-Native / Toolkit / AgentKit 0.226.0 |
| Frontend | React, TypeScript, Vite, React Router, neo-brutalist UI |
| Board and formulas | Excalidraw 0.18.1, MathJax 3.2.2 |
| Teaching | LangGraph.js, OpenAI Responses through the AI SDK |
| Learning preferences | Clocked Fill, validated against application schemas |
| Speech | Gnani streaming STT, Sarvam TTS |
| Persistence | Drizzle, PostgreSQL/Neon, official LangGraph Postgres checkpointer |
| Local board storage | PGlite when PostgreSQL is not configured |
| Hosting | Nitro Node build or the configured Vercel preset |

## Run locally

Use Node **22.22 or newer** and the pinned **pnpm 10.29.1**. Node 24 is used for
the deployment setup.

```bash
git clone https://github.com/ANAMASGARD/SuperAcharya.git
cd SuperAcharya
corepack enable
pnpm install --frozen-lockfile
```

Create an ignored `.env.local` using [.env.example](./.env.example) as the
template. Do not overwrite an existing local configuration. Configure the
following server-only values for the full voice-teaching flow:

```dotenv
DATABASE_URL=
DATABASE_URL_UNPOOLED=
BETTER_AUTH_SECRET=
GNANI_API_KEY=
OPENAI_API_KEY=
CLOCKED_API_KEY=
SARVAM_API_KEY=

TEACHER_OPENAI_MODEL=gpt-6-luna
SARVAM_TTS_SPEAKER=kalpit_en_edtech
SARVAM_TTS_PACE=1.25
```

Use the PostgreSQL pooled URL for runtime access and the direct URL for
migrations/checkpoint setup. Teacher execution requires PostgreSQL; PGlite
supports the board without the teacher. Use a stable authentication secret of
at least 32 characters and configure the sign-in providers you intend to use.
OAuth variables and callback paths are documented in `.env.example`.

Scoped provider credentials in Settings take precedence over the configured
server environment. Never prefix provider secrets with `VITE_` or commit real
keys. Restart the server after changing environment values. Locally, leave
`BETTER_AUTH_URL` unset for origin inference.

Initialize the official teacher checkpoint tables once, **only after confirming
that `.env.local` points to the intended development database**:

```bash
pnpm exec tsx --env-file=.env.local scripts/setup-teacher-checkpoints.ts
pnpm dev
```

Open the URL printed by the development server. The development environment can
use the framework's automatic development account; set
`AGENT_NATIVE_DISABLE_AUTO_DEV_ACCOUNT=1` when testing real sign-in. Production
must retain authentication. Excalidraw fonts are copied automatically by the
`predev` and `prebuild` scripts.

Application tables use the existing named Drizzle migration lifecycle.
Production migrations and checkpoint initialization are explicit operations,
not deployment build steps. See [teacher setup](./docs/teacher.md) and
[deployment instructions](./docs/vercel-deployment.md).

## Verification

```bash
pnpm run typecheck
pnpm exec vitest run server/lib/teacher app/lib/teacher \
  app/components/board/VoicePreview.test.tsx shared/teacher-welcome.test.ts \
  app/lib/whiteboard/save-queue.test.ts
pnpm agent-native:doctor
pnpm run build
git diff --check
```

Set `TEACHER_TEST_POSTGRES_URL` to a **dedicated disposable PostgreSQL database**
to include the teacher database integration tests. Without it, those tests skip;
never point this test variable at a production database. No lint script is
currently configured: typecheck and build are not lint checks.

The latest local verification passed 70 focused tests, typecheck, doctor, and
the production build. Live local checks verified ordered formula rendering,
saved operations, Stop followed by a successful new turn, and transcript
collapse at desktop and mobile viewport sizes. Existing nonfatal dependency and
bundle warnings remain. Detailed evidence and boundaries are recorded in
[project memory](./memory/memory.md).

## Deployment and PWA behavior

For a conventional Node server:

```bash
pnpm run build
pnpm start
```

For Vercel, follow the existing [Vercel setup](./docs/vercel-deployment.md),
including the Nitro preset, environment variables, OAuth callbacks, and
streaming checks. A successful local build does not prove that the latest
changes are deployed or that hosted voice sessions work. Current configuration
allows a 270-second teacher request within a 300-second function budget;
longer microphone sessions need a compatible hosting lifetime.

The production service worker caches public assets and an offline fallback,
not authenticated pages, private drawings, audio, or transcripts. Sign-in,
cloud saving, and AI teaching require a connection. Installation and greeting
autoplay depend on browser support; blocked autoplay exposes a playback control.
See [PWA details](./docs/pwa.md).

## Current limits

- **Private image storage is deferred.** Upload routes and reference validation
  exist, but durable saving of ordinary imported images needs the existing
  private storage integration configured in Settings. Generated formula objects
  regenerate from source and do not depend on that storage.
- **No offline lesson recovery or background worker.** Keep an unsaved drawing
  open or export it. Reloading, closing the page, or losing the connection can
  interrupt teaching; completed work remains, but audio does not resume
  automatically.
- **Line-level progression, not simulated handwriting.** Each formula is a
  complete typeset object. New lessons are bounded to 12 line operations;
  character/stroke animation and structured geometry diagrams are not implemented.
- **No formal symbolic verifier.** Mathematical output remains model-generated.
  The reliable target is a focused school-mathematics lesson, not verified
  universal coverage across Mathematics, Physics, Chemistry, and Biology.
- **Bounded conversation context.** Durable history exists, but older-history
  summarization/retrieval and unlimited model memory are not implemented.
- **Provider and device limits remain.** STT can mishear equations, latency varies,
  and not every catalog voice or physical mobile device has been tested.
  Clocked Decide, multiplayer, and public board sharing are outside this slice.

## Project documentation

- [Whiteboards, autosave, images, and action contracts](./docs/whiteboard.md)
- [Speech controls and provider behavior](./docs/speech.md)
- [Teacher execution, ownership, and recovery](./docs/teacher.md)
- [PWA installation and offline boundaries](./docs/pwa.md)
- [Vercel deployment](./docs/vercel-deployment.md)
- [Implementation history and test evidence](./memory/memory.md)
- [Product vision and contributor rules](./AGENTS.md)

Super Acharya builds on the Agent-Native Chat starter. The original generic
Chat interface remains available at `/chat`; the classroom is the primary
authenticated workflow.
