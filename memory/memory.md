# Super Acharya — project memory

## Project and authentication

- Super Acharya is an Agent-Native standalone React, React Router, Vite and Nitro application. It uses the existing framework authentication and Drizzle database client with Neon PostgreSQL or local PGlite; it does not use Next.js or a second authentication system.
- Email/password sign-in and the existing Google, Microsoft and Facebook provider integrations are implemented. Full social sign-in requires correctly configured provider credentials and callback URLs; email-dependent flows require configured outbound mail.
- The public landing is `/`; authenticated users can stay on it. Get started and the default post-auth route lead to `/whiteboard`. Chat remains at `/chat`, and `/board` redirects to the whiteboard. The landing bootstrap preserves this behavior without the previously observed hydration mismatch.

## Whiteboard

- `/whiteboard` opens the latest saved drawing or creates the first one; `/whiteboard/:boardId` opens a private drawing. The full-screen editor hides app chrome while preserving Chat, Settings and agent infrastructure elsewhere.
- The embedded Excalidraw package supports its native tools, undo/redo, library, theme and menus. App controls provide new/open/rename/save and standard browser import/export of editable drawings, PNG and SVG. Fonts are self-hosted. Vite pre-bundling fixes the `es6-promise-pool` default-export issue and accounts for the installed Markdown style dependency.
- Authenticated, owner-scoped shared actions handle board creation, reads, saves, listing and personal libraries. Nano IDs identify app-owned records; framework identities and Excalidraw element/file IDs are retained. Scene elements, bindings, groups and custom metadata are stored along with durable app-state fields. Selection and revision are exposed to agent context.
- Named additive Drizzle migrations provide profile, drawing, asset and library tables. The user's local development log showed both migrations applied to its configured PostgreSQL database; the agent did not run production migrations. The action contract and implementation details are in `docs/whiteboard.md`.
- Autosave is debounced and serialized, with revision checks and safe retries. Conflicts preserve local work and offer a copy or loading the saved version. Navigation attempts to save first. Failed saves retain edits and offer retry or file export; browser memory is not an offline durable draft store.
- Image bytes use authenticated private-storage upload/download routes; SQL stores references and metadata rather than base64. Supported raster formats are validated and SVG imports are converted to PNG. Private storage is not configured, and the user chose to defer it. Image-containing drawings cannot be confirmed saved until their assets are durable. Configure the existing private storage integration before verifying real image upload and reopen; do not provision services without authorization.

## Verification and remaining work

- Typecheck, focused tests (31 passed), Agent-Native doctor, production build and diff whitespace checks passed. No lint script is configured.
- Local browser verification covered authentication landing, full-screen desktop and mobile editor, drawing, undo/redo, board selection and renaming, save/reload, personal library, actual editable/PNG/SVG downloads and editable-file reimport. Fresh uncached whiteboard load showed Saved and no console errors.
- In an isolated local PGlite environment, competing tabs produced a conflict and successfully saved the losing work as a copy. A server connection failure retained unsaved work; retry after restart saved it. Row readback confirmed scene contents. The tests include ownership, validation, idempotence, revision conflicts, queued edits and image reference handling with a test-only in-memory provider.
- Real private storage image persistence and reopening remain unverified. Automatic online-event recovery and all possible network failures were not exhaustively tested. Framework dependency source-map, route-rule and build directive warnings remain. Full social OAuth browser flows depend on provider configuration.
- Teaching workflows, audio, multiplayer and public sharing are not implemented in this slice. Preserve existing authentication and agent infrastructure. Consult `AGENTS.md` for architecture and Git rules and verify current source before assuming historical results remain current.

## Whiteboard control design

- Added a scoped Excalidraw 0.18.1 presentation stylesheet: white controls, black outlines and hard shadows, yellow selected tools, matching Library/zoom/undo/redo/help controls and outlined panels. Explicit dark mode and saved canvas backgrounds remain available.
- The circular yellow hamburger changes to a red circle with a white cross using the native menu state. The trigger receives an accessible name and expanded state without adding React state updates for pointer movements.
- Added short fine-pointer hover and touch press feedback, visible keyboard focus and reduced-motion overrides. Native tool behavior and responsive toolbar dimensions are retained.
- Verification: `pnpm run typecheck`, `pnpm exec vitest run app/lib/whiteboard/save-queue.test.ts` (4 passed), `pnpm agent-native:doctor` (clean), and `pnpm run build` passed. No lint script exists. Existing dependency build warnings remain.
- Browser verification reached the sign-in screen on the local app; no authenticated session was available in the browser. Desktop/mobile editor interaction, appearance, dark mode, menu dismissal, save/reopen and import/export checks for this styling change remain unverified. A temporary preview attempt could not be loaded and was removed.
- Image storage remains deferred. Changes are left unstaged on main; no commit or push for this design task.

## Circular whiteboard buttons

- Changed drawing-tool, hamburger, help and footer icon controls to circular outlines. Library and zoom-percentage text controls use pill shapes. Footer controls have spacing between individual buttons.
- Fixed the grouped control selector's specificity, which had overridden the hamburger's circular yellow appearance. Scoped overrides also account for Excalidraw's important square footer corner rules.
- Typecheck and Agent-Native doctor passed; no lint script exists. This CSS-only follow-up adds no new tests. Authenticated browser visual verification remains pending because the available browser has no signed-in session.
- Production build and diff whitespace checks passed. Changes remain unstaged on main.

## Footer shape correction

- Restored zoom and undo/redo controls to their previous joined rectangular layout, removing the circular footer overrides and added gaps. Toolbar icons and the hamburger remain circular; Saved is unchanged.
- Typecheck, Agent-Native doctor, production build and diff whitespace checks passed. No lint script exists; this CSS-only correction adds no tests. Authenticated visual browser checks remain pending. Changes left unstaged on main.

## Drawing menu design

- Restyled the native drawing menu with a white panel, black outline and hard shadow, a yellow New drawing button, circular yellow icon badges, stronger text, shortcut badges, and outlined hover/focus feedback. App-owned items now use the existing Lucide icons through the supported MainMenu.Item icon prop.
- Scoped presentation to the drawing menu using app-owned action classes, preserving other Excalidraw popovers and the previous footer layout. Desktop menu width is 320px, bounded by the viewport; rows have at least 44px height. Existing theme and background actions remain available.
- Browser checks used a temporary isolated Excalidraw preview with the actual menu markup and stylesheet; no drawing CRUD callbacks were exercised. Verified desktop appearance, Escape dismissal, theme switching, scrolling to navigation actions and menu bounds at 390x844. Mobile screenshots initially failed but a later capture showed the light menu and lower actions. Preview logged transient Vite dependency chunk fetch errors during reoptimization, so a clean application-console result is not claimed. The preview files and server were removed.
- Typecheck, doctor and whitespace checks passed. No lint script exists; no new tests were added for this presentation-only change. Authenticated application actions were not retested. Changes remain unstaged on main.
- Final production build passed after the menu width adjustment; existing dependency build warnings remain.

## Menu hover contrast correction

- Replaced the drawing menu's theme-dependent accent reference with a dedicated pale-yellow highlight (#fff2b3). The global dark-theme accent was charcoal, causing black hover text on a dark background. Hover and keyboard-focus backgrounds now retain pale yellow with black text in both themes.
- Typecheck, doctor, production build and whitespace checks passed. No lint script exists. This token-only change adds no tests; browser hover verification was not rerun. Changes remain unstaged on main.

## Quick theme toggle

- Added an accessible sun/moon switch beside Library through Excalidraw's supported renderTopRightUI slot. It reads native theme state and updates that same state through updateScene; the existing menu toggle stays synchronized, and the existing scene autosave path includes theme changes.
- Styled the control as a circular neo-brutalist button with yellow light-mode fill, dark-mode contrast, hover/press feedback and reduced-motion support. Mobile uses a compact 36px control.
- Isolated browser preview verified clicking dark mode on, Enter activation and Space activation back to light, plus switching at 390x844 with the control within viewport bounds. Prevented Enter/Space propagation to canvas shortcuts. Preview console check returned no errors before mobile testing. No authenticated save/reload test was performed. Temporary preview server and files were removed.
- Final typecheck, doctor, production build and whitespace checks passed. No lint script exists. Browser interaction checks cover this UI change; no additional unit tests were added. Changes remain unstaged on main.

## Bottom-center voice preview

- Added VoicePreview as a separate, local UI-only component inside the whiteboard. A yellow circle opens a charcoal waveform pill with pause/close controls and explicit Voice preview labeling. Release pauses and keeps the bar open; hold resumes; close/Escape returns to idle. No microphone, audio, STT, transcript, provider, upload or database functionality was introduced.
- Supports captured pointer holds, focused Space holds, Enter/assistive click toggling, repeat suppression, trailing pointer-click suppression, cancellation, window blur, hidden-tab pause and app-dialog suspension. BoardEditor is keyed by drawing ID, so switching drawings resets the component. Space handlers are scoped to its primary button.
- Added safe-area-aware placement above the footer, 44px controls, live status, focus styling, paused waveform animation, short transitions and reduced-motion CSS.
- Five focused happy-dom interaction tests passed: keyboard hold/release/resume/close, repeat suppression, explicit pause, blur/dialog suspension, unhandled Space outside the control, and pointer cancellation/trailing click suppression. Typecheck and doctor passed; no lint script exists.
- Isolated Excalidraw browser preview verified Enter/Space activation and paused state, desktop appearance, 390x844 mobile placement without footer overlap, close returning to idle, and no console errors. Preview was removed after checks. Actual mobile touch hardware, reduced-motion browser emulation, authenticated app integration, text entry and canvas panning were not exercised end to end; scoped-key unit coverage confirms outside Space remains unprevented.
- Changes remain unstaged on main; image storage and future STT stay deferred.
- Final production build and diff whitespace checks passed. Existing dependency build warnings remain.

## Compact voice button placement

- Reduced the idle voice control from the padded 56px assembly to a 44px yellow circular button with a black inner ring and custom three-bar waveform emblem. Moved it to bottom center, 16px plus the safe-area inset from the viewport bottom, beside the zoom-control baseline.
- Expanded preview uses smaller padding; below 900px it rises above footer navigation to avoid overlap. Hold/pause/close behavior is retained.
- Isolated browser preview visually confirmed the inner circle, 44x44 dimensions and bottom-center alignment with zoom. Temporary preview was removed. Typecheck, five interaction tests, doctor, build and whitespace checks passed. No lint script exists. Mobile placement was not rechecked in this follow-up. Changes remain unstaged on main.

## Voice pause/play styling

- Pause is now a red circular button with a white icon. Pausing replaces it with a yellow Play button with a black icon; Play resumes the active UI preview. Close uses a white background with a black cross. Fixed generic hover specificity so these colors stay visible on hover.
- Waveform bars animate only in the active preview and freeze when paused; reduced-motion preferences still disable animation. This remains UI-only, without microphone/STT integration.
- Six focused interaction tests passed, including the new pause-to-play-to-resume flow. Typecheck and doctor passed; no lint script exists. Isolated browser preview confirmed running waveform animation, pause/resume transitions and red/yellow/white button appearance. Temporary preview files/server removed. Authenticated application and real audio were not tested. Changes remain unstaged on main.
- Final production build after the hover correction and whitespace checks passed; existing dependency warnings remain.

## Whiteboard UI delivery summary

- Current design includes circular drawing controls, a yellow/red menu trigger, a styled drawing menu with readable pale-yellow hover states, the restored grouped footer controls, and a native-theme sun/moon switch beside Library.
- The compact bottom-center voice control has a yellow background, black inner ring and three-bar emblem. Holding previews an animated waveform; release pauses, red Pause switches to yellow Play, and the white Close button returns to idle. Keyboard, pointer cancellation and lifecycle recovery are covered by six focused tests.
- Latest application checks passed: `pnpm run typecheck`, `pnpm exec vitest run app/components/board/VoicePreview.test.tsx`, `pnpm agent-native:doctor`, `pnpm run build`, and `git diff --check`. No lint script exists. Browser verification used isolated previews; authenticated end-to-end verification and physical touch-device tests remain outstanding.
- Voice is UI-only. Private image storage remains deferred. No services, deployments or production migrations were performed for these UI changes.
- The user authorized staging, committing and pushing this accumulated UI work and memory update on main. Earlier unstaged-status notes describe intermediate checkpoints before this delivery.

## Gnani Prisma realtime speech-to-text

- Replaced the UI-only voice preview with real microphone capture and live Gnani Prisma v3.0 transcription. No OpenAI, LLM, tutor workflow, generated answer or transcript-to-agent dispatch is implemented; the user explicitly reserved those for another change.
- AudioWorklet sends mono 16 kHz signed PCM in 1,024-byte frames at 32 ms cadence through an authenticated, same-origin, drawing-owner-checked WebSocket relay. Text appears as each finalized utterance arrives. Release/Pause sends commit immediately; Prisma v3.0 does not document token-by-token output. Capture is capped at 29 seconds. Worklet output remains silent and waveform height follows actual microphone energy.
- Live protocol verification found that the current realtime service rejected the newer comma-separated language header example. Documented legacy headers x-model=prisma-v3.0, lang_code=indic-auto and x-format=codemix succeeded. Configured 300 ms silence detection. Final events are ordered/deduplicated and pending utterances tracked; a 250 ms final settling window allows late events, with 1.5 seconds for empty speech and bounded error timeouts. This policy is documented for further real-network validation.
- Added red rotating loading arc around the yellow button, static red ring for reduced motion, transcript display, safe errors, and explicit REST retry for a retained failed clip. Retained focused-Space and pointer holds, red Pause/yellow Play/white Close, keyboard isolation, and immediate cancellation on Close/Escape/blur/hidden tab/dialog/unmount. Late permission results stop their tracks, stale transcripts are ignored, and short-clip failures release the provider slot.
- Registered GNANI_API_KEY in Settings and added .env.example documentation. The user explicitly requested env configuration; the ignored local .env placeholder was added, and the user's actual key was found in .env.local. Server-only scoped credentials take precedence over the authorized deployment fallback. The narrow doctor exception explains that authorization; credential-store failures do not fall back. No key was printed, committed, sent to the client or included in these notes.
- Added get-speech-status for authorized setup inspection, bounded REST PCM validation, shared per-user process-local request/session exclusion, timeouts/backpressure, and privacy-preserving provider errors. Raw audio and transcripts remain in memory, not SQL/storage. The future input boundary is a validated SpeechResult; sending it to an LLM remains deferred.
- Added ws 8.22.1 and @types/ws through pnpm, enabled Nitro features.websocket, and documented the interfaces and limitations in docs/speech.md. Existing React/auth/board persistence remain intact; private image storage is still deferred.
- Verification: pnpm run typecheck passed; pnpm exec vitest run app/components/board/VoicePreview.test.tsx server/lib/gnani-speech.test.ts server/lib/speech-route.test.ts server/lib/speech-stream.test.ts passed (20 tests); pnpm agent-native:doctor clean; pnpm run build passed; git diff --check passed. No lint script exists. Existing dependency/build warnings remain.
- Real provider verification used a generated synthetic English math utterance and the configured key: REST responded in 1,443 ms; direct realtime returned text 261 ms after release; the actual server relay returned its finalized result 517 ms after release including settling. These are individual measurements, not general latency guarantees. Both transcriptions misheard part of the equation; STT is not mathematical verification.
- Browser verification: the real app routed to sign-in because the available browser had no authenticated session. An isolated fixture verified the red rotating arc on a 44px control, keyboard activation and cancelling the opening state. The fixture lacked the application's i18n provider and logged its expected missing-provider warning; it is not evidence of a clean full-app console. Temporary fixtures, probes and their server were removed.
- Not verified: authenticated browser microphone-to-transcript flow, physical desktop/mobile mic quality, Hindi/Hinglish accuracy, deployment WebSocket proxy behavior, exhaustive reconnect/late-event races, and end-to-end latency distribution. No production migrations, deployment, staging, commit or push performed. Work remains unstaged on main.

## Click-to-record and future Send control

- Changed pointer activation to click/tap toggle: one click starts hands-free recording, another click or Pause finalizes it. Releasing the pointer or moving focus within the page no longer stops click-started recording. Focused Space remains hold-to-speak and releases to finalize; window blur, hidden tab, app dialogs and Close still cancel safely.
- Added a yellow up-arrow Send button to the expanded controls. It is disabled and explains that sending is unavailable until an LLM is connected. No LLM call, fake send acknowledgment or transcript clearing was added. Updated the hover/focus hint to “Hold Space bar to speak” and clarified click-mode status text.
- Verification: typecheck, nine focused VoicePreview tests, doctor and production build passed. No lint script exists; existing dependency build warnings remain. An isolated browser fixture with explicitly simulated audio verified that a single click remains active after release, a second click finalizes and displays the fixture transcript, and Send stays disabled. No real provider or mic retest was performed for this input/UI-only change. Temporary fixture and server removed.
- Updated docs/speech.md. Changes remain unstaged on main, alongside the existing STT implementation; no commit or push performed.

## Continuous long-query speech streaming

- Removed the 29-second recording cap from realtime capture. A single session now supports up to 10 minutes, streaming 32 ms PCM frames continuously without 30-second upload batches or microphone restarts. The original cap matched short REST recovery, not a streaming latency requirement.
- Requested 300 ms silence detection and five-second maximum provider utterances. Final phrases append while recording; transcript scrolling follows new text unless the user scrolls upward. These settings do not guarantee token-level output or fixed response latency. No LLM integration was added.
- Separated long streaming limits from the existing 29-second REST recovery limit. Browser memory retains audio only for short clips; longer sessions discard that buffer and cannot retry via REST. Already received transcript text stays visible on stream failure. WAV encoding rejects long input instead of silently truncating it.
- Verification: pnpm run typecheck passed; pnpm exec vitest run app/lib/speech/capture.test.ts app/components/board/VoicePreview.test.tsx server/lib/speech-stream.test.ts server/lib/gnani-speech.test.ts server/lib/speech-route.test.ts passed all 26 tests; pnpm agent-native:doctor clean; pnpm run build and git diff --check passed. No lint script exists. Existing dependency build warnings remain.
- Actual provider test streamed 180 seconds of generated synthetic speech through createSpeechHooks on one connection: 50 live updates, first text at 3,564 ms, final result 473 ms after release, 1,184 transcript characters. These are single-run observations, not latency or accuracy guarantees. Worklet tests separately verify continuous three-minute capture and the ten-minute cap. Temporary live probe removed.
- Browser smoke reached the shared sign-in page; no authenticated browser session was available. Physical microphone capture, authenticated browser WebSocket upgrade, long-transcript scrolling and mobile long-session behavior remain unverified end to end. The live relay test does not cover these browser boundaries.
- Updated docs/speech.md. Changes remain unstaged on main; no commit, push, deployment or production migration. Private image storage remains deferred.

## Whiteboard-wide Space speech shortcut

- User explicitly replaced Excalidraw Space-to-pan with Space hold-to-speak across the whiteboard, including after reload without first focusing the microphone. Added a window capture-phase keyboard listener in VoicePreview so canvas Space is consumed before Excalidraw's document handler. Releasing Space finalizes speech; repeated keydowns cannot start duplicate captures.
- Kept normal spaces in inputs, textareas, contenteditable elements and textbox roles; IME composition, modified shortcuts, dialogs, menus and other focused buttons retain their native behavior. Click-to-record is unchanged. The toolbar hand tool remains available for panning. Listener cleanup follows component unmount; blur and suspension retain existing cancellation.
- Updated docs/speech.md. Verification: 13 VoicePreview interaction tests passed, including canvas-to-document propagation rejection, release outside the voice button, repeat suppression and editing/dialog exemptions. pnpm run typecheck, pnpm agent-native:doctor, pnpm run build and git diff --check passed. No lint script exists; dependency build warnings remain.
- Authenticated browser microphone verification remains blocked by the unavailable signed-in browser session observed in the preceding check. This change has automated event-level coverage, not a new physical-microphone/browser verification claim. Changes remain unstaged on main; no commit or push.

## Vachar voice bar layout

- Updated the idle/listening/resume invitation to “Ask your question to Vachar”; microphone-opening, transcription and error statuses remain explicit. The idle button retains its Space shortcut tooltip.
- Expanded speech states replace the yellow logo with a white Close button on the left. Waveform, Pause/Play and disabled future Send follow it; the duplicate right-side Close was removed. Pause finalizes and Close cancels. The collapsed state keeps the yellow voice emblem.
- Replaced the circular loading arc with an SVG rounded-rectangle dash animated along the full pill perimeter, during microphone opening/transcription. Reduced motion renders a static red outline. Updated docs/speech.md.
- Verification: typecheck, 13 VoicePreview interaction tests, doctor, production build and git diff --check passed after correcting a TypeScript idle-state narrowing error. No lint script exists. An isolated static browser fixture verified the full-width animated border and control order; it used placeholder icons rather than microphone capture and was removed. Authenticated mic flow and physical mobile use were not retested. Existing dependency build warnings remain.
- Changes remain unstaged on main; no commit or push.

## Acharya voice prompt wording

- Replaced the voice invitation with “Ask Acharya a question” in the UI and speech documentation at the user’s request. Copy-only change; speech behavior is unchanged. Changes remain unstaged.

## Undo and Redo visibility

- Added specific history-control overrides so Excalidraw's disabled styles cannot remove the black 2px borders or fade the entire button. History buttons use white surfaces and black icons in both themes for visibility against light and dark canvases; disabled arrows alone are faded. Native undo/redo availability remains intact.
- Typecheck and doctor passed. No lint script exists; no interaction tests were added for this CSS-only change. An isolated browser fixture using installed Excalidraw CSS confirmed solid borders and full control opacity for enabled/disabled controls in both themes; the final white-surface adjustment followed that preview. Authenticated board behavior was not retested. Temporary preview server stopped.
- Changes remain unstaged on main.
- Final production build passed after the white-surface adjustment; git diff --check passed. Existing dependency build warnings remain.

## Speech integration delivery summary

- Implemented Gnani Prisma v3.0 STT through server-authenticated WebSocket streaming, browser AudioWorklet PCM capture and live transcript updates. Supports ten-minute sessions on one connection, 32 ms audio frames, 300 ms silence detection and five-second provider utterance segmentation. A real three-minute synthetic-audio relay test returned 50 updates; its timing is recorded above without a latency guarantee.
- Added click-to-record and whiteboard-wide Space hold-to-speak, with editing/IME/dialog exemptions and cleanup for cancellation, focus loss and route changes. Short clips support explicit REST recovery; long recordings retain received text but cannot retry buffered audio. Keys stay server-side; local env files are ignored.
- Final voice presentation says “Ask Acharya a question,” retains the compact yellow idle emblem, places white Close on the expanded bar's left and Pause/Play plus future Send on the right, and animates the red loading beam around the entire pill. Send remains disabled pending LLM integration. Undo/Redo have solid black outlines and white surfaces, including disabled states and dark mode.
- Current delivery verification: focused five-file speech suite passed all 28 tests. Latest typecheck, doctor, production build and whitespace checks passed. No lint script exists. Browser checks used isolated visual/interaction fixtures; authenticated browser microphone use, physical mobile audio and deployed WebSocket transport remain unverified. Private image storage and LLM/teacher integration remain deferred.
- User explicitly authorized git add, commit and push of this accumulated work on main. This delivery supersedes the earlier intermediate unstaged-status entries. No deployment or production migration is included.
