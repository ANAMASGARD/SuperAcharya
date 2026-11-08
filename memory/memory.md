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
