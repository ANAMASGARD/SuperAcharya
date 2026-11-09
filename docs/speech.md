> Teacher handoff update: successful finalized recordings now submit once to the classroom runtime; manual Send uses the same recording identity. OpenAI/Clocked/Sarvam and board teaching are documented in [teacher.md](teacher.md). Earlier statements below about the disabled Send button or absent LLM describe the previous STT-only milestone.

# Whiteboard speech

The voice control streams microphone audio through the authenticated server to Gnani Prisma `prisma-v3.0`. The realtime protocol uses `wss://api.vachana.ai/stt/v3/stream` with 1,024-byte mono 16 kHz PCM frames at 32 ms cadence. Release/Pause sends `commit` immediately. Sessions support up to 10 minutes of continuous speech on one connection. Audio is never held for 30-second uploads. Finalized phrases append to the live transcript; the panel follows new text unless the user scrolls upward. REST is retained only for explicit recovery of clips up to 29 seconds.

The provider's realtime documentation lists new and legacy headers. Live verification rejected the newer comma-separated language example; the working request uses `x-model: prisma-v3.0`, `lang_code: indic-auto`, `x-format: codemix`, and `x-min-silence-ms: 300`, and `x-max-speech-s: 5`. The five-second setting bounds provider utterance segmentation, not the recording duration or a guaranteed response deadline. The key is attached only by the server. No browser receives it. See [Gnani realtime documentation](https://docs.gnani.ai/api/STT/stt-websocket.md).

## Setup

Set `GNANI_API_KEY` in the local ignored `.env` or `.env.local`, then restart `pnpm dev`. Use a key with STT permission and available Gnani credits. Never prefix it with `VITE_`. Alternatively configure the registered Gnani API key in Settings → Secrets. Scoped keys take precedence over the explicitly requested deployment-owned environment fallback. A credential-store failure does not silently fall back.

The fallback is shared by authenticated users of the deployment; use scoped keys for separate accounts. The app does not provision services or change provider billing.

## Interaction and data

Click/tap the idle voice button once to record hands-free; Pause stops and finalizes. The expanded bar replaces the voice logo with a white Close button on the left, with Pause/Play and Send on the right. Close cancels the session. Space anywhere on the active whiteboard holds to speak; key release stops capture and finalizes. A capture-phase listener replaces Excalidraw’s Space-to-pan shortcut. Text fields, contenteditable text, IME composition, modified shortcuts, menus, dialogs and other focused buttons retain their normal keyboard behavior. The hand tool remains available in the toolbar. Enter and Play also offer toggle activation; Pause finalizes the clip. The hover/focus hint says “Hold Space bar to speak.” A visible up-arrow Send button is disabled with an explanation until an LLM is connected; it does not send or clear the transcript. Waveform height follows microphone volume. A red light segment travels around the full pill border while opening the mic or awaiting transcription; reduced motion uses a static red outline. The invitation reads “Ask Acharya a question.”

Close/Escape, window blur, a hidden tab, app-dialog suspension or unmount cancels the current capture/request and ignores stale results. Release before permission resolves cancels that capture and stops late-granted tracks. Each recording is bounded to 10 minutes, below the provider’s documented 15-minute streaming cap. One realtime session or REST request per user per Node process may run at a time; this is not a distributed quota or provider billing cap. REST requests time out after 20 seconds. Realtime has a 10-second upstream handshake timeout, 620-second relay lifetime and 10-second final-transcript deadline. The client also bounds connection/finalization waits. The provider has no documented commit acknowledgement: pending utterances are tracked, final events are deduplicated/ordered, and the server waits 250 ms after the final pending segment (1.5 seconds if no speech was detected) for late event delivery. This settling policy needs further real-network testing. No automatic retry incurs duplicate transcription costs; an explicit Retry reuses the in-memory clip after a failure only when capture lasted at most 29 seconds. Longer recordings discard the short-clip buffer while continuing to stream; they cannot use REST retry. Already received text remains visible if the stream fails, but unsent/untranscribed audio cannot be recovered.

Audio is never written to SQL/file storage by this app. Transcripts and bounded short-clip retry audio stay in component memory and are cleared on Close or route unmount. Review text is rendered as text, not HTML. Truncated output is identified. STT is not mathematical validation.

The transcript result has `{ transcript, model, detectedLanguage?, truncated }`. This is the future tutor input boundary, not an existing LLM invocation. Nothing is sent to an LLM, no teacher answer is invented, and transcripts are not silently written to the board or agent context.

## Interfaces

- Shared `get-speech-status({ boardId })` action authorizes ownership and returns `ready`, `setup-required`, or `unavailable` plus `model`. Both manual action callers and agents can inspect setup without receiving a credential. `ready` means a key exists, not that the provider has accepted it.
- `WS /api/whiteboard-speech-stream/:boardId` checks session, origin and drawing ownership before upgrade, resolves the server-side key and forwards bounded PCM. Agent-Native’s Nitro `features.websocket` is enabled. Backpressure, malformed frames, duration/byte caps, timeouts, competing tabs and cancellation close the upstream connection.
- `POST /api/whiteboard-speech/:boardId` is the authenticated binary-audio upload exception, not a CRUD API. It requires the existing session, same-origin request, owned board and canonical PCM WAV of 0.1–29 seconds. The named browser helper is `transcribeClip`. Provider authentication, invalid replies, timeout and credit/rate errors are redacted into safe messages.
- Agents cannot start a user's microphone or capture audio remotely. No transcript action/persistence or LLM handoff is implemented in this slice.

Live synthetic English speech succeeded with both REST and realtime using the configured key. A single realtime probe returned its transcript 261 ms after release; this excludes the application proxy/settling time and is not a general latency promise. Both synthetic math transcripts misheard part of the equation. Hindi/Hinglish recognition, physical microphone quality and authenticated browser end-to-end behavior still require validation. Private image storage remains unrelated and deferred.

### Teacher voice selection

The bottom-right whiteboard control opens a searchable Sarvam Bulbul v4 Flash
voice picker. Its checked-in catalog is sourced from Sarvam's published voices
guide and contains 222 speaker IDs, including language/style variants.
The choice is stored per drawing in teacher context through the owned
`update-teacher-context` action, and applies to the next response. An unset
choice uses the server-configured speaker. Typed questions remain accessible
through the picker. No provider credentials are exposed.

The supplied playground list additionally names Kangkana and Mouchumi, whose
speaker IDs were not present in the published catalog checked during this work.
They are not selectable until their actual provider IDs are verified; names
alone must not be guessed into API identifiers. The catalog is not a live
availability guarantee, and each voice has not been individually synthesized.

The picker uses selectable voice cards, full language labels, a language filter,
and a Favorites view. Favorites also belong to the current drawing and use the
same revision-protected context action (`favoriteVoices`).

Each Sample button plays a short fixed phrase using the chosen speaker through
`POST /api/teacher-voice-preview`. This binary MP3 route requires authentication,
same-origin requests, a supported speaker, and drawing ownership. It resolves
existing scoped Sarvam credentials, limits each process to one pending preview
per user, and has a 25-second cutoff. It stores no sample audio in SQL. Samples
use Hindi for Hindi/Hinglish personas and English otherwise. This is synthesis,
not Sarvam's prerecorded demo library. Play/Stop and dialog cleanup abort pending
requests and release browser audio/object URLs; samples do not change selection.

### Conversational clarification

Teacher requests use the owned lesson's latest 50 stored turns rather than an
additional eight-turn cutoff. Interrupted/cancelled replies are marked unfinished;
current and running turns are excluded. This is bounded recent context, not
unlimited cross-lesson memory. Learning preferences persist independently and
board-enabled turns capture current board context.

Clarifications keep English board text but generate separate natural narration
in the accepted spoken language before the normal draw-and-speak step. Short
answers and requests to explain a term are interpreted against conversation
history. The microphone remains push-to-talk/toggle controlled; it is not
silently left recording. Browser autoplay and provider errors remain possible.

Ordinary window blur, hidden-tab transitions and app-dialog opening no longer
cancel a submitted teacher turn or finalizing transcription. They still stop
active microphone capture safely. Explicit Stop/Escape/new recording and leaving
the classroom retain cancellation behavior. Progress has a red moving border
(static with reduced motion). This does not guarantee execution after page close,
reload, browser/OS suspension or a broken streaming connection.

### Teacher pacing and step delivery

The teacher uses short connected explanations in everyday Hindi/Hinglish, with
respectful आप/हैं/बताइए, and natural English when requested. Board writing stays
English. These are prompt instructions, not a model fine-tuning job. The default
Sarvam pace is 1.25; an explicit server environment value overrides it.

For accepted board steps, current speech synthesis overlaps authorized operation
publication. One next narration is prepared while the current step is rendered,
spoken and saved; the provider socket still handles one synthesis request at a
time. Audio begins after the browser renders the step, concurrently with saving.
Acknowledgement still waits for playback, successful saving and scene verification.
Cancellation rejects stale output and clears buffered audio. No partial or
unvalidated model step is sent to the board early.

Board lessons now stream complete validated lines rather than waiting for a
full lesson array. Each formula or short explanation has matching narration;
the following line waits for playback and saved-scene acknowledgement. A
continuation uses an empty heading and tighter spacing instead of inserting
blank title elements. This removes the full-response generation barrier, but
provider first-line latency remains variable.

The transcript panel has a top-right Collapse/Expand button with a 44px target
and an announced expanded state. Collapsing keeps the transcript in memory and
leaves recording, submission and teaching unchanged. The compact strip fits
narrow viewports; starting a new recording expands it again. Errors and
truncation warnings remain visible rather than being hidden with the text.

Each new classroom visit/reload attempts a short context-aware greeting through
the model and Sarvam. Duplicate effects share the visit identity; active lessons
retain exclusive ownership. Saved class/subject are not asked again. Autoplay
blocking still requires the visible playback control.

The attached teacher stream has a 270-second cutoff and a 280-second running
lease, within the configured 300-second Vercel function limit. This avoids the
previous 110-second application cutoff for longer lessons; it does not guarantee
that network connections, browser background execution or all providers last
that long. Provider and database latency remain variable.
