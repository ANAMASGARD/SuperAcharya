# Teacher execution plan — revision review

Status: implementation delivered in the working tree; see `teacher.md` and the latest memory entry for verified results and remaining limits. This document preserves the reviewed design and its delivery order. It does not authorize staging, commits, pushes, deployment, production migrations, billing changes, or competition submission.

## Recommendation

Accept the attached review's simpler execution order, with three qualifications:

1. Defer the background worker, job scheduling, automatic restart recovery, and distributed leases. Keep authenticated admission, duplicate-turn protection, immediate Stop, generation checks, and overlap rejection in the first working teacher turn.
2. Keep the previously selected PostgreSQL checkpointer for durable teacher sessions. An in-memory checkpointer is useful for tests; it must not silently replace PostgreSQL in the running application. An interactive, explicitly labelled non-durable development mode is a separate optional decision.
3. Date new progress entries according to AGENTS.md and the user's latest explicit instruction; do not invent dates for historical undated entries. Repository documentation uses relative paths; clickable chat links may use absolute local paths.

The attached review is advisory material. It does not establish model access, live provider success, eligibility for either competition, or authorization to start application implementation.

See [the primary-source research](teacher-contract-research.md) for evidence and unresolved contracts. No glossary or architecture decision records were found in this checkout; this review does not create them speculatively.

## Current implementation

- Authenticated request-owned teaching turns, owned session/context actions, stable identities, generation guards and native HTTP/AgentKit streaming are implemented.
- Finalized Gnani dictation has a distinct completion boundary; automatic and manual submission share its identity. Partial updates do not invoke the teacher.
- OpenAI Responses, Clocked Fill and Sarvam WebSocket narration are connected through server-only scoped credentials and explicit env fallbacks.
- The same graph now includes optional fresh board interpretation and sequential semantic text operations through authorized shared actions, the existing SaveQueue and browser acknowledgement.
- Generic Chat remains separate. No autonomous worker, automatic restart execution, distributed playback, formal math verification, LaTeX renderer or pen-stroke animation is implemented.
- See [teacher.md](teacher.md) for the actual contracts and setup. Live verification and limits are recorded in [memory](../memory/memory.md).

## Keep the approved stack

Gnani STT → one LangGraph workflow using OpenAI → Sarvam TTS. Clocked is a tool inside the Orchestrator. Input/Vision, Subject Tutor, and Drawing Planner remain logical roles in that graph; only necessary roles execute for a turn.

Use the installed Agent-Native bring-your-own HTTP runtime with its supported conversation presentation. Keep generic Chat separate from teacher execution while retaining one authoritative teacher conversation and one drawing-to-teacher-thread mapping. Do not put the entire graph inside a native model-round-trip adapter or add Agent Teams as a second teacher orchestrator.

The installed public `executeAgentToolCall` export provides a candidate path for graph tools to invoke shared actions with authenticated context and framework checks. Verify that path's ownership and approval behavior in the compatibility probe; do not invoke action `run` functions directly or derive ownership from model arguments.

Retain `gpt-6-luna`, `bulbul:v4-flash`, and the proposed configurable Sarvam speaker pending real access and protocol checks. Installed model-name types do not establish account entitlement. Preserve Gnani's verified transport; do not rebuild working audio capture.

## Simplified execution model

The authenticated streaming request owns the first milestone's graph execution. The request stays open while its work runs; there is no accepted background queue and no detached promise after the response ends.

- Shared actions own session creation, read-only retrieval, learner-context updates, turn admission/cancellation, and persisted outcomes. Model work stays outside deterministic data actions and database transactions.
- Admit one turn per lesson. Bind it to the authenticated owner, conversation, client turn identity, generation, and controlling tab. Record an idempotent receipt before provider work.
- In the initial single-Node execution model, the active request owns the abort controller. Durable conditional admission and generation checks prevent another tab from beginning a competing turn. Persisted state must never be interpreted as proof that a process is still executing it.
- Stop playback and invalidate the local generation immediately. Abort supported upstream work, cancel the matching server turn, and release only that turn's admission. Old cleanup must not release a newer turn.
- Disconnect, route change, timeout, and server termination interrupt execution. Retain accepted conversation/context data. On reconnect, present the outcome or an explicit interrupted state; do not silently restart speech, replay board output, or promise automatic recovery.
- Admission without an attached request must expire or be explicitly cancelled. Requests started before a process restart must be identifiable as interrupted; ordinary reads must not create or resume work. This minimal status reconciliation is distinct from a worker that re-executes abandoned jobs.
- The implementation must either enforce its single-executor deployment assumption or add a verified coordination mechanism before running multiple server processes. A process-local map alone is not a distributed lock.

The official Postgres checkpointer saves graph state. It does not claim jobs, revive a process, enforce application ownership, or prove that speech or drawing reached the browser. Keep its setup separate from application Drizzle migrations and verify schema compatibility before touching any configured shared database.

## Clocked scope and latency

Start with Fill for explicit learner-level, subject, topic, response-language, and teaching-mode changes. Normalize provider output into application-owned validated data. Missing values preserve saved context; contradictions and inadequate evidence require clarification. Do not infer grade from problem difficulty. Apply accepted changes through the same authorized action as manual edits.

Call Fill only when a finalized turn needs context extraction. Never call it for each PCM frame, partial phrase, waveform update, Pause, or Stop. Keep provider-specific request shapes, evidence handling, retry rules, and error normalization inside one private Clocked adapter; avoid a generic provider abstraction without a second concrete use.

Verify the raw HTTP response, extraction evidence, Unicode offsets, idempotency replay, and failure behavior before using a real result to change teaching. Preserve request identity and payload identity on uncertain retries. Never claim a timeout proves the provider stopped. A three-second total interactive budget is an initial policy to measure, not a vendor latency guarantee. On failure preserve the transcript and offer manual preferences, clarification, or explicit retry.

Add Decide only when solve/hint/practice/explain/check routing is demonstrated. Once an accepted Clocked decision exists, do not pay OpenAI to repeat the same classification. Distinguish successful Clocked results from fallback behavior in both state and observability.

Inspect the workspace connection catalog first. Reuse scoped credential resolution and the existing Settings registration. Any deployment-owned environment fallback must remain explicit, server-only, and subordinate to scoped credentials; a credential-store error must not fall through. Commit only empty placeholders. A pasted account balance is not a configured key or successful request.

## Delivery order

### Batch 1 — One working, context-aware voice conversation

Outcome: an authenticated student finishes one recording, sees one teacher turn, and hears one real reply. Clocked-assisted or manually supplied learning preferences visibly affect that reply. Stop works immediately. The existing board remains editable.

The first gate within this batch is a small compatibility probe, not a separate infrastructure project: verify the supported native runtime/action invocation and conversation ownership, Postgres checkpointer setup on an authorized disposable database, and synthetic-input provider contracts using available credentials. Do not bypass a failed gate with a mock labelled as live functionality.

Proposed changes, using repository-relative paths:

| Files | Work in this batch |
| --- | --- |
| `shared/teacher.ts`, `shared/teacher-context.ts` | Validated teacher state, turn/event identities, and accepted learning context. Exact interface design follows selection of the teaching-turn module. |
| `server/db/schema.ts`, `server/db/migrations.ts`, `server/db/index.ts` | Minimal owned session/context/turn-receipt persistence, conversation mapping, uniqueness/revision controls, and identity lifecycle registration. No job queue. |
| `actions/ensure-teacher-session.ts`, `actions/get-teacher-session.ts`, `actions/update-teacher-context.ts`, `actions/start-teacher-turn.ts`, `actions/cancel-teacher-turn.ts` | Shared deterministic session/context/admission operations with ownership, schema validation, and retry rules. The read does not create a session. Starting admits work; it does not hide the graph in a data action. |
| `server/lib/teacher/turn.ts`, `server/lib/teacher/orchestrator.ts` | Request-owned execution and the smallest working graph. Keep lifetime, cancellation, and generation knowledge in one module. Do not create empty vision/drawing nodes. |
| `server/lib/teacher/providers/clocked.ts`, `server/lib/teacher/providers/openai.ts`, `server/lib/teacher/providers/sarvam.ts` | Narrow, server-only provider adapters with validated outputs, time limits, scoped credentials, and cancellation. No general-purpose provider framework. |
| `server/lib/teacher/checkpoints.ts`, `server/plugins/teacher.ts` | Official Postgres checkpointer configuration and provider setup registration. No automatic production checkpoint migration or implicit memory fallback. |
| `server/routes/api/teacher/[sessionId].post.ts` | Documented streaming-agent exception: authorize, attach to the admitted turn, run the graph for this request, and stream normalized events. Ordinary reads/writes remain actions. |
| `app/lib/teacher/runtime.ts`, `app/lib/teacher/playback.ts` | Native HTTP runtime adapter, transcript projection from the canonical teacher history, one controlling tab, generation-aware speech playback and immediate stop. |
| `app/lib/speech/use-speech.ts`, `app/components/board/VoicePreview.tsx` | Explicit completed-recording handoff and stable retry identity. Live phrases stay preview-only. Auto-submit and manual Send converge on one admission path. |
| `app/components/board/BoardEditor.tsx`, `app/components/board/TeacherConversation.tsx` | Compact native conversation presentation, editable learning context, provider/error state, and autoplay fallback using existing UI primitives. |
| `server/plugins/agent-chat.ts` and teacher/runtime admission integration as required by compatibility probe | Prevent generic Chat submit/retry/continuation paths from executing teacher-owned turns. A client-only check or `prepareRequest` alone is insufficient proof. |
| `package.json`, `pnpm-lock.yaml`, `.env.example` | Only compatible LangGraph/Postgres dependencies actually required; retain existing React/OpenAI integration. Empty provider placeholders only. |
| Focused tests beside affected modules; `docs/speech.md`, this plan, `memory/memory.md` | Test the real module interfaces, document implementation and exact proof limits, and update undated progress. |

Batch 1 is accepted only when:

1. A real, authenticated finalized transcript produces exactly one accepted turn. Partial phrases produce none. Repeated Send and uncertain retries do not create a second turn; changed text has a distinct identity.
2. A real synthetic Clocked request is recorded as real, or missing configuration is an explicit blocker. Manual context works through the same authorized update action. Corrections preserve unrelated fields; uncertain extraction asks for clarification.
3. OpenAI returns a real reply using accepted context. Sarvam returns playable audio with tested framing/completion; unavailable keys, denied model access, and autoplay rejection remain truthful visible states.
4. The UI acknowledges locally before network work. Stop, request disconnect, empty speech, and provider failure release the matching admission. Late text/audio from the cancelled generation cannot reappear. A second tab cannot start a competing teacher turn or duplicate playback.
5. Reopening reads the canonical saved conversation/context. Restarting the server reports interruption honestly; no automatic voice restart or untested recovery claim.
6. Cross-user access is rejected. Manual and agent callers share action validation and ownership checks. Existing whiteboard saves and Gnani capture continue working.
7. Typecheck, focused tests, doctor, production build, whitespace check, and authenticated browser smoke pass, or exact blocked verification is reported. No lint script currently exists.

There is no `worker.ts`, background claim loop, scheduler, advanced lease renewal, distributed queue, or automatic resume worker in this batch. Ordinary turn ownership and stale-generation protection are still required.

### Batch 2 — The essential whiteboard demonstration

Immediately follow the first conversation with one supported mathematics lesson: capture the current unsaved question, clarify important ambiguity, produce accepted equation/narration pairs, and progressively write and speak them. Preserve student work and the existing save queue. Use stable operation/step/element identities, authorized persisted commands, readback before acknowledgment, and generation rejection from the start. Do not postpone these safeguards until a later hardening batch.

Include selection-aware explanation and semantic undo for the demonstrated step. Use supported text/shapes initially where appropriate; private asset storage remains deferred, so persistent equation images cannot be claimed to work without it. Do not advertise instant text placement as handwriting. Math verification and stated assumptions must be explicit.

### Batch 3 — Practice and demonstrated recovery

Add practice → attempt → hint/feedback, selective Clocked Decide, step-level resume without duplicate elements, and measured reconnect/restart behavior. Add a recoverable executor only if a turn must outlive its initiating request or the tested product flow requires it. At that point specify claims, execution ownership, generation-fenced cleanup, and deployment topology; checkpoints alone still do not supply those guarantees.

## Verification and limits of this review

This task reads source and documentation and produces review artifacts only. It does not execute the proposed teacher workflow or make a paid provider request. Existing historical test results are not new verification.

After implementation run the configured commands: `pnpm run typecheck`, focused `pnpm exec vitest run ...`, `pnpm agent-native:doctor`, `pnpm run build`, and `git diff --check`. There is no lint script in the inspected package manifest.

Measure end-to-end latency separately from provider processing time: final recording to accepted turn, context extraction, first text, first playable audio, and stop-to-silence. Use synthetic inputs in retained research evidence and redact private content. Do not promise the fastest provider or a particular latency from an unmeasured timeout policy.

Do not claim dual competition eligibility or repeat the attachment's deadlines as freshly verified facts. Public release, entry, and organizer contact remain separate authorized tasks. Keep implementation on `main`, unstaged by default.
