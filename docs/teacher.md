# Classroom teacher

The whiteboard's **Ask Acharya** panel uses Agent-Native 0.226.0's public HTTP runtime and AgentKit conversation components. Generic Chat stays separate. One LangGraph workflow executes Orchestrator and Tutor for conversation, with optional Input/Vision and deterministic Drawing Planner for board-enabled turns.

## Setup

Add server-only keys to ignored `.env.local` or scoped Settings secrets. Scoped values win; credential-store failures never fall through to deployment credentials.

```dotenv
OPENAI_API_KEY=
CLOCKED_API_KEY=
SARVAM_API_KEY=
TEACHER_OPENAI_MODEL=gpt-6-luna
SARVAM_TTS_SPEAKER=kalpit_en_edtech
SARVAM_TTS_PACE=1.15
```

Keep existing `GNANI_API_KEY` and database configuration. `pnpm dev` now uses the same framework env loader as production, loading `.env` and `.env.local` before Nitro starts. Explicit shell/deployment values take precedence. No provider key belongs in a `VITE_` variable.

Teacher execution requires PostgreSQL. Existing boards still support local PGlite. The additive app migrations create teacher lessons, turns and semantic operations through the existing migration mechanism. The official LangGraph Postgres checkpointer uses the `teacher_graph` schema; initialize it explicitly against an approved database with:

```bash
pnpm exec tsx --env-file=.env.local scripts/setup-teacher-checkpoints.ts
```

This command changes the configured database; it is not part of server startup. Hosted/production initialization has **not** been performed. Use the existing approved production migration procedure separately. No in-memory fallback exists in the application; `MemorySaver` is used only in tests.

## Input and tools

Successful, nonempty finalized Gnani recordings submit once with a stable recording ID. Partial phrases, truncated recordings and failures do not automatically submit. Manual Send uses the same identity. A changed typed correction receives a new identity. Stop invalidates browser audio/events immediately and conditionally cancels the server generation.

The checked **Read my board and write teaching steps** option saves current edits, captures selected elements (or the whole drawing), and submits bounded PNG/text context. Capture bytes are sent only through the authenticated streaming request to OpenAI; SQL and graph checkpoints retain no PNG/base64 bodies. Admission binds the capture fingerprint to the submission identity. Uncheck this option for text-only conversation.

The teacher has bounded application tools, not unrestricted browser execution:

| Action | Contract |
| --- | --- |
| `get-teacher-session` | Read owned lesson/context and recent accepted turns; never creates a session. |
| `ensure-teacher-session` | Idempotently create the drawing's authoritative teacher session. |
| `start-teacher-turn` | Admit a stable request ID, text and optional capture metadata. Identical retries reuse the receipt; changed payloads and competing turns fail. |
| `cancel-teacher-turn` | Cancel only the named generation; old cleanup cannot clear a newer run. |
| `update-teacher-context` | Apply an explicit preference patch with expected revision and optional active-generation guard. |
| `enqueue-teaching-step` | Authorize and persist a validated heading, editable board lines and matching narration. Requires an active board-enabled turn. |
| `list-teaching-steps` | Read durable ordered operations for an owned drawing/turn. |
| `ack-teaching-step` | Controlling tab acknowledges only after saved scene elements match stable IDs and original text. |

Graph tools invoke the public `executeAgentToolCall` authorization pipeline. Manual preference edits use the same action. Generic Chat's supported action surface excludes turn admission and step execution, and it rejects the teacher thread namespace. The full action registry remains registered for normal browser HTTP calls.

## Rendering and playback

The drawing controller appends editable Excalidraw text below existing content, using the handwriting font where glyphs are supported. It preserves original equation text and turn/step metadata, updates the existing SaveQueue, then reads/acknowledges saved results. Duplicate delivery does not add duplicate elements; modified existing teacher text is preserved and reported as a conflict. Native undo works for each applied step.

This is progressive step rendering, **not pen-stroke animation or a LaTeX renderer**. Equations and chemical notation currently use plain Unicode text. Structured diagrams, semantic undo actions, formal symbolic verification, and comprehensive subject/curriculum correctness remain future work. The model is prompted for mathematics, physics and chemistry; that does not establish universal accuracy.

Sarvam uses `bulbul:v4-flash`, `kalpit_en_edtech`, pace 1.15, 24 kHz MP3. Browser playback volume is **1.0 (100%)**. This model ignores the provider loudness parameter. One complete short narration unit is assembled from WebSocket audio frames and its final event before playback; arbitrary MP3 fragments are not treated as independently decodable. Text-only conversation queues coherent narration units. Board teaching waits for actual playback completion and saved-scene acknowledgement before advancing. Autoplay blocking exposes a Play button and visible text. Stop clears buffered audio and rejects old-generation output.

## Ownership and recovery limits

Execution belongs to one authenticated streaming request and controlling tab. Database generation/expiry checks and SQL acknowledgement reads allow related requests to reach different instances; local abort/ack maps are only fast paths. Active requests observe remote cancellation through a one-second SQL check. No worker, background scheduling, automatic restart, or seamless audio resume is implemented. An unexpired active database admission cannot be stolen by another process. Expired receipts are presented as interrupted; cancelled/failed work preserves accepted input and completed board elements. The stream has a bounded execution deadline, and each step has a bounded acknowledgement wait. Reopening does not automatically replay old audio or queued drawing.

Clocked Fill is called only for detected explicit preference changes on finalized input. Source evidence, confidence and Unicode offsets are validated. Missing values preserve previous preferences; uncertain/contradictory extraction asks for confirmation. The three-second cutoff is an application budget, not a latency guarantee. Provider failures preserve the question and expose manual preferences. Clocked Decide is not implemented.

## Verification scope

Controlled tests cover shared-action ownership/approval parity, duplicate and changed submissions, overlap rejection, cancellation and stale cleanup, final-versus-partial STT, native streaming completion, official Postgres checkpoint round trips, board-operation ordering/readback, and Sarvam framing/full-volume playback. Live provider and browser results are recorded in `memory/memory.md`; fixtures are not evidence of live provider success.

Private image storage remains deferred. Uploaded images must already be durable under the existing storage rules before saving/capturing a board. This slice does not provision storage, expose arbitrary browser controls, or add raw audio retention.
