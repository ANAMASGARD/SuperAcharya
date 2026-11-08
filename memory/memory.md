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
