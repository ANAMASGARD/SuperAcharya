# Vercel handoff — Super Acharya

The checkout is linked to `anamasgards-projects/super-acharya`. `.vercel/` is ignored. Source commit `72ab78e` was committed and pushed, then deployed to production after the user explicitly requested deployment. Future uploads and promotions still require user authorization.

## Already prepared

- Vercel project created with explicit user approval. Preview and production server-only environment variables were copied securely from the existing local configuration; keys were not printed or added to source.
- The configured Neon app already had the board and teacher application tables. With explicit approval, `scripts/setup-teacher-checkpoints.ts` created the official `teacher_graph` checkpoint schema and performed a successful readiness readback. No destructive migrations or resets were run.
- `vercel.json` uses pnpm and the Nitro Vercel preset. `nitro.config.ts` enables production WebSockets, streaming, a 300-second function duration and revalidating PWA files.
- Teacher turn visibility uses database generation/expiry, rather than assuming related requests reach the same process. Board-step acknowledgements are read from SQL across instances, with an in-process fast path. Active streams check cancellation in SQL once per second; browser Stop remains immediate. No worker or automatic restart was introduced.
- Authentication uses public framework mounting APIs and Toolkit renderers. It no longer resolves a private package module dynamically at deployed runtime.

## Before your production deploy

Preview and production variables are separate. Both have now been populated from the existing local configuration. Before deploying, review **production** in Vercel Settings → Environment Variables; retain these server-only values:

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`.
- `GNANI_API_KEY`, `OPENAI_API_KEY`, `CLOCKED_API_KEY`, `SARVAM_API_KEY`.
- OAuth client IDs/secrets for the providers you actually enable.
- `CRON_SECRET` (a stable random secret) and `AGENT_NATIVE_VERCEL_CRON_SCHEDULE=0 9 * * *` on Hobby.
- Optional `TEACHER_OPENAI_MODEL=gpt-6-luna`, `SARVAM_TTS_SPEAKER=kalpit_en_edtech`, `SARVAM_TTS_PACE=1.15`.

Keep `BETTER_AUTH_SECRET` stable. Leave `BETTER_AUTH_URL` unset for request-origin inference, or set a real public HTTPS canonical origin. Do not set localhost or copy a preview URL into production. Update OAuth provider callback allowlists to the new domain using `.env.example`; merely copying client secrets does not authorize a new callback. Do not deploy `AUTH_DISABLED`, local test database URLs or development identity overrides.

Use the current Node 24 runtime and pinned pnpm lockfile. Do not add `VITE_` prefixes to provider keys. Private image storage remains deferred, so durable image saving is not claimed.

## Manual commands

From this checkout after configuring production secrets:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm agent-native:doctor
NITRO_PRESET=vercel AGENT_NATIVE_VERCEL_CRON_SCHEDULE='0 9 * * *' pnpm run build
vercel deploy --prebuilt --prod --scope anamasgards-projects
```

For a preview, replace `--prod` with `--target preview`. Vercel assigned the first test upload to production automatically despite omitting `--prod`; use an explicit target for future tests. Test uploads made before the handoff are not a verified release: static PWA files returned 200, but dynamic routes failed because the previous auth plugin resolved `@agent-native/core/server` at runtime. That code was corrected locally after the user asked to perform deployment themselves. The corrected code must be rebuilt and uploaded to replace those test artifacts.

Application migrations use `pnpm migrate:production` only when a release actually changes the schema and the target database has been approved. Checkpoints have their own explicit setup command; neither setup nor migrations belong in a Vercel build command. Read configuration/error output even when a bundler reports success.

## Boundaries and acceptance checks

The existing account is Hobby. Current Vercel documentation limits its functions and WebSockets to 300 seconds. This configuration supports the 110-second teacher deadline, but cannot guarantee uninterrupted ten-minute microphone sessions on that plan. Longer speech needs connection rotation or a compatible longer-running host/plan; no paid upgrade was enabled. Received transcript text is retained by the existing failure path when a stream disconnects.

After uploading, inspect actual runtime logs, not just build status. Verify sign-in → whiteboard, saved drawing reopen, teacher reply, Stop → next turn, real Gnani WebSocket upgrade, narration and two-tab isolation. Check `/manifest.json`, `/sw.js`, icons and offline page, then browser installation/update/offline behavior. A protected preview requires Vercel access and is not a public student launch.

No lint script/configuration exists. Do not describe build/typecheck as lint checks.

Sources: [Vercel function limits](https://vercel.com/docs/functions/limitations), [WebSockets](https://vercel.com/docs/functions/websockets), and the installed Agent-Native `vercel` deployment guide.


## Verified production release

Production URL: https://super-acharya.vercel.app/

- Deployment: `dpl_6mycko6Ejink1VNqZnDxzEwaAiXU`, built locally from source commit `72ab78e` with the Nitro Vercel preset, uploaded using `--prod --skip-domain`, checked, then promoted onto the public domain.
- Project settings now explicitly select Node 24.x, pnpm frozen-lockfile installation and the Nitro Vercel build command. No paid plan or extra service was enabled.
- Root, whiteboard shell, auth session endpoint, manifest and worker returned 200; unauthenticated teacher POST returned 401. Manifest/worker MIME and revalidation headers were correct. All 185 SSR asset references checked existed in the paired client artifact.
- A synthetic test account signed in on the public site and opened an owned drawing. Real teacher text completed. An authenticated WebSocket reached Gnani and returned its ready event; no physical microphone audio was used in that probe.
- A live mathematics turn wrote three editable elements for x + 1 = 2. Neon readback confirmed saved elements, completed turns and an applied teaching operation. Local Stop was exercised and a subsequent real turn completed. Saved drawing reload was checked in the browser.
- The older deployments' package-resolution failure is superseded by this release. The server still emits a pg SSL-mode compatibility warning; that warning is not a function invocation failure. A raw unauthenticated WebSocket probe opened an idle transport without an authorized ready/transcript event; it was terminated and is not counted as a 401 handshake test.

Physical microphone recognition, physical-device install/offline/update behavior, two-tab live speech, external OAuth callbacks and private image storage remain separate verification/configuration boundaries. The Hobby duration limit above still applies.
