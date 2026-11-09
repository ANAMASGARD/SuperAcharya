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
SARVAM_TTS_PACE=1.25
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

The tutor streams an array of validated teaching lines. Each new item contains one complete English statement or textbook formula and its own explanatory narration (up to 600 characters); continuation items can omit the heading. The first complete item can enter playback before the remaining lesson has finished generating. The browser writes and explains one line at a time, advancing only after actual playback and saved-scene acknowledgement. One following item's narration is prepared ahead to reduce gaps. Incomplete JSON and partial formulas never reach the canvas; failed or truncated generations preserve already written work and report an incomplete lesson. Lessons are bounded to 12 line operations.

This is progressive line rendering, **not pen-stroke or character-by-character handwriting animation**. Formula lines use the source-backed MathJax typesetter described below. Structured diagrams, semantic undo actions, formal symbolic verification, and comprehensive subject/curriculum correctness remain future work. The model is prompted for mathematics, physics and chemistry; that does not establish universal accuracy.

Sarvam uses `bulbul:v4-flash`, `kalpit_en_edtech`, default pace 1.25, 24 kHz MP3. Browser playback volume is **1.0 (100%)**. This model ignores the provider loudness parameter. One complete short narration unit is assembled from WebSocket audio frames and its final event before playback; arbitrary MP3 fragments are not treated as independently decodable. Text-only conversation queues coherent narration units. Board teaching waits for actual playback completion and saved-scene acknowledgement before advancing. Autoplay blocking exposes a Play button and visible text. Stop clears buffered audio and rejects old-generation output.

## Ownership and recovery limits

Execution belongs to one authenticated streaming request and controlling tab. Database generation/expiry checks and SQL acknowledgement reads allow related requests to reach different instances; local abort/ack maps are only fast paths. Active requests observe remote cancellation through a one-second SQL check. No worker, background scheduling, automatic restart, or seamless audio resume is implemented. An unexpired active database admission cannot be stolen by another process. Expired receipts are presented as interrupted; cancelled/failed work preserves accepted input and completed board elements. The stream has a bounded execution deadline, and each step has a bounded acknowledgement wait. Reopening does not automatically replay old audio or queued drawing.

Clocked Fill is called only for detected explicit preference changes on finalized input. Source evidence, confidence and Unicode offsets are validated. Missing values preserve previous preferences; uncertain/contradictory extraction asks for confirmation. The three-second cutoff is an application budget, not a latency guarantee. Provider failures preserve the question and expose manual preferences. Clocked Decide is not implemented.

## Verification scope

Controlled tests cover shared-action ownership/approval parity, duplicate and changed submissions, overlap rejection, cancellation and stale cleanup, final-versus-partial STT, native streaming completion, official Postgres checkpoint round trips, board-operation ordering/readback, and Sarvam framing/full-volume playback. Live provider and browser results are recorded in `memory/memory.md`; fixtures are not evidence of live provider success.

Private image storage remains deferred. Uploaded images must already be durable under the existing storage rules before saving/capturing a board. This slice does not provision storage, expose arbitrary browser controls, or add raw audio retention.

### Whiteboard-first classroom and textbook notation

Each classroom visit/reload attempts a short OpenAI/Sarvam greeting in the saved spoken language. It uses known class/subject, asks only for missing information, and uses respectful आप in Hindi/Hinglish. One request identity per mounted visit prevents duplicate effect submissions; an already active lesson blocks another greeting, including competing tabs. It does not run Clocked extraction on the internal welcome prompt. Browser autoplay restrictions surface a Play teacher voice control. Student questions always capture the board. The compact question composer closes on submission; the classroom no longer displays the right-hand conversation transcript. Clarification questions also become narrated board operations. Completed conversation history is supplied to input understanding and teaching so answers to clarification can continue the lesson.

Equation-only board lines use `$$...$$` with bounded TeX. A lazy MathJax 3.2.2 SVG renderer bundles its own glyph outlines, enables only base/AMS notation, and rejects external-content/HTML commands and invalid equations. Fractions, roots, Greek symbols and exponents are typeset rather than displayed as code. Each formula is a movable/resizable Excalidraw image with `customData.equation = { version: 1, latex }` and an element-bound generated file ID. Formula source is saved in the scene; SVG bytes are generated locally and regenerated on reopen, never stored in SQL. Normal uploads still require private storage. Save acknowledgement validates the corresponding formula source. This is typesetting, not animated cursor handwriting or a geometry-diagram planner. Existing historic text elements are not rewritten automatically.

Finalized Space-release recordings submit automatically. Mobile Send can finish an active recording and submit only its successful final transcript; partial updates never launch turns. A new utterance waits for interrupted-turn cleanup rather than being silently dropped. The teacher prompt acknowledges known class/subject, asks one useful follow-up, defaults to natural Hindi/Hinglish, and gives a worked solution when requested even after a prior practice preference. Specific browser drawing failures remain visible instead of being replaced by a generic stream error. Vite prebundles the MathJax CommonJS entry points used by the lazy renderer.

Board language is English independently of narration language: generated headings, prose, clarification text and word labels within formulas use English and standard textbook notation. Accepted responseLanguage controls narration only (Hindi/Hinglish/English). Historical board elements and the student's own writing are not translated or rewritten. Mixed English prose plus double-dollar formula spans are typeset as a single source-backed formula, with escaped text labels, instead of leaking raw delimiters onto the board.

## Question-aware static visual templates

Teaching steps optionally include `visual: { version: 1, kind, angleDegrees }`.
Kinds currently implemented are `right-triangle`, `unit-circle`, `sine-cosine`,
`parabola`, `ellipse`, and `hyperbola`. The angle is bounded to 5–85 degrees.
The existing enqueue/list/ack actions carry this validated specification; no
separate write API is introduced. Element IDs include deterministic visual
components, and acknowledgement verifies saved geometry and specification fields.

The tutor selects a visual only when relevant and uses null for ordinary algebra
and conversational turns. These are static native Excalidraw elements, with
semantic component metadata included in question capture. They export and save
as ordinary editable scene elements; no external image storage is required.
Current graph templates are the standard equations y=x², x²/4+y²=1,
x²−y²=1, and sine/cosine in radians. They do not represent arbitrary functions.
Interactive JSXGraph widgets, simulations, parameter revision controls and the
full Follow teacher policy remain pending. The current camera preserves zoom
but still scrolls to new steps.

## Explaining existing work without redrawing

Input understanding returns an `explainExisting` decision for requests to explain
an already visible diagram/solution rather than create new work. It uses the
current capture and conversation, including actual graph labels and units. The
existing workflow then emits narration-only steps: empty heading/lines and no
visual. The server discards model-proposed board writes in this mode. These steps
retain generation/ownership checks and ordered operation acknowledgements against
the saved board revision, but the renderer does not mutate or reposition the scene.
No second conversation or audio pipeline is introduced.

The teacher prompt asks for connected explanations, the reason behind each step,
a recap from question to conclusion, and a useful check-for-understanding question.
Brief greetings, clarifications, requested short replies, hint-only requests and
practice questions remain appropriate exceptions. Spoken language follows the
accepted preference; board writing remains English. Each spoken section is bounded
to 600 characters, with the existing one-section audio lookahead. Acknowledgement
allows 120 seconds for playback/save/autoplay recovery; Stop still cancels locally
immediately. This is prompt guidance, not model fine-tuning or guaranteed pedagogy.

Native diagram lines explicitly carry dimensions derived from their points.
Excalidraw 0.18.1 otherwise defaults their dimensions to 100, causing the unchanged
scene to fail the student-edit guard before narration. Genuine edits still reject
old scene verification. Already interrupted historical turns are not auto-replayed.
