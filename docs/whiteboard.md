# Private Excalidraw drawings

`/whiteboard` reopens the latest saved drawing, or creates the first blank drawing. `/whiteboard/:boardId` loads one private drawing. The editor occupies `100dvh`; the app shell and agent sidebar are hidden on these routes. Chat, Settings, and agent infrastructure remain available elsewhere and through the editor menu.

## Shared action contract

All actions require the existing authenticated context. No action accepts an owner identifier. UI and agent invocations use the same Zod schemas and server authorization.

| Action | Input | Output and behavior |
| --- | --- | --- |
| `list-boards` | `{}` | `{ boards: [{ id, title, updatedAt }], latestBoardId }`, scoped to the current owner |
| `create-board` | `{ requestId, title? }` | A blank board; `requestId` is a 21-character Nano ID. Reuse it on retries. |
| `get-board` | `{ id }` | `{ id, title, scene, revision, updatedAt, assets }`; assets contain metadata, never private storage handles or bytes |
| `save-board` | `{ id, title, scene, expectedRevision }` | The saved board. Requires the last read revision; an identical retry succeeds. A competing different write produces a conflict. |
| `get-board-library` | `{}` | `{ items, revision }` for the current owner's native library |
| `save-board-library` | `{ items, revision }` | The saved library, with independent revision checks |

`navigate` accepts `{ view: "whiteboard", boardId? }`. Tab-scoped navigation publishes the board ID. Tab-scoped selection publishes board revision and up to 200 selected element IDs. `view-screen` reads the authorized saved drawing and selected elements (or the first 200 elements); unsaved browser edits are not represented as persisted content.

## Persistence and recovery

The app uses the framework Drizzle client and named additive migrations in `server/db/migrations.ts`, tracked in `super_acharya_migrations`. Neon uses the existing PostgreSQL configuration; local PGlite remains supported. The startup migration plugin follows the framework migration lifecycle. Do not run the production migration command without authorization.

Profiles, boards, assets, and libraries receive Nano IDs. Existing auth IDs and Excalidraw element/file IDs are unchanged. Ownership uses the framework's authenticated email identity, with registered email-change rekey policies and personal-data retention on organization offboarding. Libraries have created/updated timestamps. Scenes keep native elements, bindings, groups, and JSON custom metadata, with an allowlist of durable app-state fields; transient dialogs, selection, dragging, and collaborators are excluded.

Saves are debounced by 750 ms and serialized. Edits arriving during a save remain pending until acknowledged. Saved scenes and their images load before the editor can autosave. Clean scenes refresh through action-query invalidation; dirty scenes are preserved. Conflicts offer an explicit copy or reload, without array merging. Navigation saves first; failure retains the local work with retry and file export. Closing a dirty browser tab prompts the browser's unsaved-work protection. There is no offline durable draft store: retain the tab or export a file after a failed save.

## Private image storage

Images use authenticated binary POST/GET routes at `/api/whiteboard-assets/:boardId/:fileId`, the documented upload exception to action-based CRUD. Every request checks session and drawing ownership; POST also checks origin. Uploads accept PNG, JPEG, GIF, and WebP signatures up to 10 MiB. The browser rasterizes imported SVGs into PNG before uploading. Original native file IDs remain stable. Scenes and libraries reject embedded base64 bodies; SQL stores only metadata and opaque framework AttachmentRefs.

Configure the existing framework private file-storage integration in Settings before verifying image persistence. Missing storage returns HTTP 503 with setup guidance, and an image-containing scene is not acknowledged as saved until all referenced image uploads succeed. No storage service is provisioned by this implementation. The test suite's in-memory provider is test-only.

## Assets and development

`@excalidraw/excalidraw` is pinned to 0.18.1. `predev` and `prebuild` copy the package's fonts to the ignored `public/excalidraw-assets/fonts` directory; `EXCALIDRAW_ASSET_PATH` uses the app base path. Vite explicitly pre-bundles Excalidraw so its CommonJS transitive dependencies, including `es6-promise-pool`, receive ESM interop. Restart Vite after dependency/config changes if a browser has cached the old module graph.

Native tools, keyboard shortcuts, undo/redo, library, theme, `.excalidraw` import/export, and PNG/SVG export are supplied by Excalidraw. App-owned drawing dialogs use existing UI primitives. Multiplayer, public sharing, Excalidraw Plus, teaching, and audio are outside this implementation.

## Browser file-transfer fallback

The app menu's **Import / export files** dialog uses a standard file input and browser downloads for editable `.excalidraw`, PNG, and SVG files. It supplements the native OS-picker menu. Import validates through Excalidraw and the scene schema, saves existing work first, and then replaces the current canvas with an undoable scene update. Imports are limited to 20 MiB; scene and image persistence limits still apply. Image imports can be exported locally while private persistence is unavailable.
