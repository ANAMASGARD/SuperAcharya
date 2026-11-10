# Super Acharya

**An AI teacher that listens, explains, and writes beside you on a shared whiteboard.**

[![Watch the Super Acharya demo on YouTube](https://img.youtube.com/vi/xcTYN5GWVvM/hqdefault.jpg)](https://youtu.be/xcTYN5GWVvM)

**[▶ Watch the video demo](https://youtu.be/xcTYN5GWVvM)** · [Open the classroom](https://super-acharya.vercel.app/) · [Local setup](#run-locally) · [How we use Agent-Native](#how-we-use-agent-native)

Super Acharya turns a student's question into a lesson on an editable Excalidraw canvas. Draw an equation, type a question, or ask aloud. The teacher reads the current work, writes formulas and relevant diagrams progressively, and explains each step through speech. Students can interrupt, change their work, and ask about what is already on the board.

The classroom combines a calm writing surface with bold borders, yellow controls, and a compact voice interface. English board notation and Hindi, Hinglish, or English narration can coexist in the same lesson.

Built with the **Agent-Native standalone framework**, React, TypeScript, Vite, and LangGraph.js. The initial focus is a useful mathematics teaching workflow; broader subject coverage is an ongoing goal.

## A lesson with Acharya

1. **Open a drawing.** Create a named board or reopen your saved work at `/whiteboard`.
2. **Ask your question.** Write on the canvas, select relevant elements, type, or use the microphone. Board-enabled questions include a fresh capture of the selected work or current drawing.
3. **Work through the explanation.** Complete formulas and short explanations appear progressively, paired with spoken narration. Relevant static diagrams are editable board elements.
4. **Interrupt and follow up.** Stop clears local playback immediately. Ask for clarification or an explanation of existing work; completed elements remain on the board.
5. **Save and revisit.** Autosave retains the editable scene. Formula source is preserved so equations can be regenerated when the drawing reopens.

Hold **Space** in the classroom to speak, then release to finalize and submit a successful transcript. Click or tap the microphone for toggle recording. Text fields, IME composition, menus, and dialogs retain their normal keyboard behavior; use Excalidraw's hand tool to pan the canvas.

## Classroom screenshots

### Visual explanations

A tangent lesson connects the side names, the angle, and the ratio on the same canvas.

![Super Acharya whiteboard showing a labeled right triangle and the tangent ratio, with voice transcription controls](docs/images/tangent-triangle.png)

### Step-by-step mathematics

Typeset fractions and trigonometric identities sit alongside explanatory text and teacher playback controls.

![A progressive derivation of tan theta plus cot theta with mathematical restrictions and a Stop control](docs/images/trigonometric-derivation.png)

### Spoken follow-ups

The transcript panel keeps recognized speech visible while the student asks about a worked solution.

![A trigonometric solution on the board with an active spoken follow-up transcript](docs/images/spoken-follow-up.png)

### Editable graphs and student control

The board retains student edits and reports when an older teaching step conflicts with the current scene.

![Editable sine and cosine curves with a message confirming that student changes were preserved](docs/images/editable-trigonometric-graph.png)

These are unmodified screenshots of development sessions, including transcription and conflict feedback. Speech recognition and generated explanations can contain mistakes; the screenshots are not a guarantee of mathematical correctness. The current sine/cosine template uses radians, even if surrounding generated text suggests a different unit.

## What the project implements

| Capability                   | Current behavior                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Private drawings             | Named boards, latest-board reopening, revision-aware autosave, personal libraries, native undo/redo, and Excalidraw import/export.                                                         |
| Board understanding          | Fresh selected-element or full-board captures, current scene context, and clarification when notation or the requested problem is ambiguous.                                               |
| Progressive lessons          | Validated complete lines paired with narration; playback and saved-scene acknowledgement govern progression.                                                                               |
| Textbook formulas            | MathJax-rendered fractions, roots, exponents, and symbols; equation source persists with the movable visual object.                                                                        |
| Static visual templates      | Right triangles, unit circles, sine/cosine curves, parabolas, ellipses, and hyperbolas rendered as editable Excalidraw elements.                                                           |
| Explain existing work        | Narration-only steps can explain an existing diagram or solution without adding duplicate board content.                                                                                   |
| Voice input and output       | Gnani streaming transcription and Sarvam speech synthesis, with language-aware voice selection, samples, and per-drawing favorites.                                                        |
| Lesson context               | Owned conversation history, recent-turn context, and saved learning preferences; Clocked Fill extracts explicitly supplied preferences.                                                    |
| Interruption and concurrency | Immediate local Stop, server cancellation, generation checks, duplicate-safe submissions, and controlling-tab ownership.                                                                   |
| Authentication               | Agent-Native sessions and Google sign-in; the current source also implements Brevo signup verification and password-plus-email-code sign-in. Hosted email-auth rollout is a separate step. |
| Installable app              | PWA manifest, app icons, public-asset caching, and an offline fallback. AI lessons and cloud persistence require connectivity.                                                             |

## How we use Agent-Native

Agent-Native provides the application's identity, capability, data, and agent-runtime infrastructure. The classroom builds on those contracts rather than maintaining a separate set of privileged agent mutations.

### 1. Shared actions for UI and agent capabilities

Application operations live in [`actions/`](actions/), using `defineAction` with Zod input/output schemas and server-derived ownership. For example, [`save-board`](actions/save-board.ts) checks the drawing revision, and [`enqueue-teaching-step`](actions/enqueue-teaching-step.ts) persists a validated operation for an active generation.

The teacher publishes steps and updates learning context through **`executeAgentToolCall`**, reusing the framework's action authorization path. The browser uses action calls to read, save, and acknowledge the same durable records. See [`server/lib/teacher/tool.ts`](server/lib/teacher/tool.ts).

| Shared action                                   | Role in the classroom                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `get-board`, `save-board`                       | Read owned scene data and save with revision conflict checks.                     |
| `ensure-teacher-session`, `get-teacher-session` | Create or read the drawing's authoritative teacher session.                       |
| `start-teacher-turn`                            | Admit a stable request identity and reject competing or inconsistent submissions. |
| `update-teacher-context`                        | Apply validated learning preferences with revision protection.                    |
| `enqueue-teaching-step`, `list-teaching-steps`  | Persist and retrieve ordered teaching operations.                                 |
| `ack-teaching-step`                             | Record completion after playback, successful saving, and scene verification.      |
| `cancel-teacher-turn`                           | Cancel the specified generation without clearing a newer run.                     |
| `get-speech-status`                             | Check speech configuration for an owned board without exposing credentials.       |

A queued operation is not reported as a finished drawing. The browser must apply and verify it before acknowledging completion.

### 2. A supported runtime bridge to LangGraph

The classroom uses **`createHttpAgentChatRuntime`** and **`createAgentKitProtocolAdapter`** from Agent-Native to connect the teaching workflow to the browser. The adapter owns submission, streamed events, audio cleanup, and stale-generation rejection. See [`app/lib/teacher/runtime.ts`](app/lib/teacher/runtime.ts).

LangGraph provides four logical roles: **Orchestrator → Input/Vision → Tutor → Drawing Planner**. Routing skips unnecessary work, and layout/rendering use deterministic code. These roles do not imply four independent assistants or four model calls on every request. See [`server/lib/teacher/graph.ts`](server/lib/teacher/graph.ts).

Generic Chat remains available at `/chat`, but does not control the classroom teacher's turn-admission and step-execution tools. The teacher has its own guarded thread namespace and one authoritative session per drawing.

### 3. Authentication, persistence, and live updates

- **Identity:** the existing Agent-Native auth/session layer supplies ownership. Public Better Auth plugins add email verification and second-factor codes without introducing a second identity system. See [`server/plugins/auth.ts`](server/plugins/auth.ts) and [email authentication](docs/email-auth.md).
- **Structured state:** Drizzle application tables store boards, lesson turns, preferences, and operation records. Teacher checkpoints use the official LangGraph PostgreSQL saver. See [`server/db/schema.ts`](server/db/schema.ts) and [`server/lib/teacher/checkpoints.ts`](server/lib/teacher/checkpoints.ts).
- **Live synchronization:** [`app/root.tsx`](app/root.tsx) uses `useDbSync` to invalidate data after database changes. Durable action reads and operation records remain authoritative; notifications do not replace the operation queue.
- **Provider credentials:** the teacher and speech integrations resolve scoped Settings credentials server-side, with explicit deployment-owned fallbacks. Pre-login Brevo delivery uses deployment-owned credentials because no authenticated workspace exists yet.
- **Framework tooling:** `pnpm action` exposes shared actions and installed documentation. `pnpm agent-native:doctor` checks framework guards such as authorization scoping, migrations, and credential boundaries.

Custom authenticated streaming routes carry microphone audio and teacher events. Ordinary board CRUD stays in shared actions. Database synchronization is not used as a per-frame animation clock or audio transport.

## Architecture

```mermaid
flowchart TD
    A[Student: draw, select, type, or speak] --> B[Browser: current board and question]
    B --> C[Agent-Native session and turn admission]
    C --> D[LangGraph teaching workflow]
    D --> E[Validated step and matching narration]
    E --> F[Agent-Native authorized shared actions]
    F --> G[(SQL: lesson and board operations)]
    G --> H[Browser reads pending steps]
    E --> I[Sarvam narration]
    H --> J[Excalidraw rendering and audio playback]
    I --> J
    J --> K[Save scene, verify, acknowledge]
    K --> D
```

Gnani handles speech-to-text before question submission. OpenAI supplies input understanding and tutoring, Clocked Fill handles selected preference extraction, and Sarvam supplies teacher speech. Cancellation IDs and operation sequencing connect these services to the accepted lesson state.

## Technology stack

| Layer              | Technology                                                        |
| ------------------ | ----------------------------------------------------------------- |
| Application        | Agent-Native Core, Toolkit, and AgentKit `0.226.0`                |
| Interface          | React, TypeScript, Vite, React Router, Tailwind CSS               |
| Whiteboard         | Excalidraw `0.18.1`, MathJax `3.2.2`                              |
| Teaching workflow  | LangGraph.js `1.7.2`, AI SDK, OpenAI Responses                    |
| Speech             | Gnani Prisma `prisma-v3.0`, Sarvam `bulbul:v4-flash`              |
| Identity and email | Agent-Native auth, Better Auth `1.7.6`, Brevo                     |
| Data               | Drizzle, PostgreSQL/Neon, PGlite for local board-only development |
| Server and hosting | Nitro; Node server build or configured Vercel preset              |

See [`package.json`](package.json) and [`pnpm-lock.yaml`](pnpm-lock.yaml) for the complete dependency set. Provider access, credits, and model availability depend on your accounts.

## Run locally

### Prerequisites

- **Node.js 22.22.0 or newer**; the deployment setup uses Node 24.
- **pnpm 10.29.1**, pinned in `package.json`.
- **PostgreSQL** for AI teaching and durable graph checkpoints. Neon is supported. Without PostgreSQL, PGlite supports local board development, but the teacher does not execute.
- Provider credentials for the features you want to exercise. The full voice lesson uses OpenAI, Gnani, Sarvam, and Clocked.

### 1. Install

```bash
git clone https://github.com/ANAMASGARD/SuperAcharya.git
cd SuperAcharya
corepack enable
pnpm install --frozen-lockfile

# On a fresh clone; do not replace an existing local configuration.
cp .env.example .env.local
```

### 2. Configure the server

Edit the ignored `.env.local`. Use values from your own development services:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_URL_UNPOOLED=postgresql://USER:PASSWORD@DIRECT_HOST:5432/DATABASE
BETTER_AUTH_SECRET=replace-with-a-stable-random-secret-of-at-least-32-characters

OPENAI_API_KEY=
GNANI_API_KEY=
SARVAM_API_KEY=
CLOCKED_API_KEY=

TEACHER_OPENAI_MODEL=gpt-6-luna
SARVAM_TTS_SPEAKER=kalpit_en_edtech
SARVAM_TTS_PACE=1.25
```

The placeholders must be replaced before using those services. The pooled database URL serves runtime queries; the direct URL is used for migrations/checkpoint setup. Use a development database, not your production database.

Leave `BETTER_AUTH_URL` unset locally so the framework can infer the request origin. Scoped credentials configured in Settings take precedence for supported teaching/speech providers. Never prefix secrets with `VITE_` or commit real values. Restart the server after changing configuration.

For **real email signup and sign-in**, also configure:

```dotenv
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_API_KEY=

# Alternatively, use BREVO_CLIENT_ID and BREVO_CLIENT_SECRET
# for a private Brevo M2M app scoped to transactional.email:write.
```

Missing Brevo delivery configuration blocks email authentication. Google sign-in is configured independently using the client credentials and callback paths in [`.env.example`](.env.example). See [email authentication](docs/email-auth.md) for verification, resend, expiry, and deployment requirements.

### 3. Initialize teacher checkpoints and start

After confirming the URLs point to the intended development PostgreSQL database:

```bash
pnpm exec tsx --env-file=.env.local scripts/setup-teacher-checkpoints.ts
pnpm dev
```

Checkpoint setup creates the `teacher_graph` schema and verifies it with a readback. Application tables use the existing named migration lifecycle; checkpoint setup is a separate explicit step. For a board-only PGlite trial, omit the PostgreSQL variables and skip the checkpoint command.

Open the URL printed by the development server and navigate to `/whiteboard`. Excalidraw fonts/assets are copied automatically by `predev` and `prebuild`.

The framework can use an automatic development account locally. Set `AGENT_NATIVE_DISABLE_AUTO_DEV_ACCOUNT=1` to exercise actual sign-in and email codes. Keep authentication enabled in production. Microphone use requires browser permission and a secure context such as HTTPS or localhost.

### 4. Try a lesson

Write `x² + 5x + 6 = 0` and ask Acharya to explain the factorization. Watch each accepted line appear with narration, then use **Stop** and ask a follow-up about one step. Reopen the drawing to check saved work. Try a right-triangle question to exercise an editable visual template.

## Development and verification

```bash
pnpm run typecheck
pnpm test
pnpm agent-native:doctor
pnpm run build
```

For focused teacher verification:

```bash
pnpm exec vitest run server/lib/teacher app/lib/teacher \
  app/components/board/VoicePreview.test.tsx \
  app/lib/whiteboard/save-queue.test.ts
```

Database integration tests require `TEACHER_TEST_POSTGRES_URL` pointing to a **dedicated disposable PostgreSQL database**; they skip when it is absent. There is no configured lint script. A successful build does not establish physical-microphone accuracy, inbox delivery, or a verified production release. Test evidence and known gaps are recorded in [`memory/memory.md`](memory/memory.md).

## Deployment

For a persistent Node server:

```bash
pnpm run build
pnpm start
```

For Vercel, use the repository's Nitro preset and [deployment guide](docs/vercel-deployment.md). Configure server secrets, database migrations, checkpoint tables, and OAuth callbacks for the target environment. The email-auth change also requires the additive rate-limit migration and Brevo configuration before promotion; pushing Git commits alone does not establish that those release steps ran.

Long speech sessions depend on the host's connection lifetime. The current teacher request cutoff is 270 seconds within a configured 300-second function budget. Verify actual streaming and WebSocket behavior on your selected host.

The PWA caches public assets and an offline fallback, not private drawings, sessions, audio, or transcripts. Cloud saving, sign-in, and AI teaching require a network connection. See [PWA behavior](docs/pwa.md).

## Boundaries and next steps

- **Mathematical correctness:** there is no connected formal symbolic verifier. STT can mishear expressions, and generated reasoning or diagram labels can be wrong. Check units, domains, and intermediate steps.
- **Visuals:** current diagrams are static editable templates for specific equations. Arbitrary-function plotting, interactive JSXGraph widgets, parameter revision controls, and physics simulations remain future work.
- **Progression:** lessons are bounded to 12 line operations. Rendering is progressive typeset output, not character-by-character handwriting animation.
- **Recovery:** completed work is preserved, but page closure, reload, or broken connections do not provide automatic audio resumption or offline lesson recovery. Dedicated semantic AI-step undo remains pending; native editor undo is available.
- **Images:** durable storage of ordinary imported images needs the configured private storage integration. Generated equations and native visual templates do not require uploaded-image storage.
- **Context and devices:** model context uses the latest 50 turns plus saved preferences. Unlimited memory, broad curriculum verification, multiplayer, and comprehensive physical-device testing are not claimed.
- **Microphone privacy:** the classroom keeps a prepared microphone handle, so the browser indicator may remain on while idle. Idle input is not captured or uploaded; raw microphone recordings are not persisted by this app.

## Project map and documentation

| Location                                         | Purpose                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| [`actions/`](actions/)                           | Shared capabilities for authorized reads and mutations                 |
| [`app/components/board/`](app/components/board/) | Classroom, canvas, transcript, and voice controls                      |
| [`app/lib/teacher/`](app/lib/teacher/)           | Runtime adapter, scene rendering, audio, and playback coordination     |
| [`server/lib/teacher/`](server/lib/teacher/)     | Workflow, providers, lifecycle, checkpoints, and operation persistence |
| [`shared/`](shared/)                             | Zod contracts for boards, turns, events, and visual specifications     |
| [`server/db/`](server/db/)                       | Application schema and migrations                                      |

Read more: [Whiteboards](docs/whiteboard.md) · [Teacher workflow](docs/teacher.md) · [Speech](docs/speech.md) · [Email authentication](docs/email-auth.md) · [Deployment](docs/vercel-deployment.md) · [Contributor rules](AGENTS.md).

## Origins and acknowledgements

Super Acharya builds on the **Agent-Native Chat starter**, retaining its shared authentication, Chat, Settings, action infrastructure, and agent integration. Project-specific work adds the whiteboard classroom, owned drawing persistence, teacher workflow, speech adapters, progressive rendering/narration, visual templates, interruption handling, learning preferences, and email-code authentication.

Excalidraw supplies the drawing editor, MathJax supplies mathematical typesetting, LangGraph supplies workflow orchestration/checkpoint integration, and the named model/speech/email providers supply their respective services. Third-party components remain subject to their own licenses and terms. The screenshots above are supplied project captures; the linked video demonstrates the application.
