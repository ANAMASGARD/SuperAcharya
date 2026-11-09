# Installable Super Acharya

The manifest opens `/whiteboard` in a standalone window after existing authentication. Browser support determines whether an install prompt is available. Use **Install Acharya** in the drawing menu or command menu. Safari on iPhone/iPad uses Share → Add to Home Screen. HTTPS is required outside localhost.

The existing Acharya mascot and favicon were copied from `AcharyaAI-publish/assets/images` (that checkout has no `public` folder). PNG icons cover 192px, 512px, Apple 180px and a separately padded maskable icon. The canvas keeps its existing backgrounds and theme. The viewport follows browser chrome/keyboard, supports zoom and safe areas, and the mobile tool row scrolls with 44px targets. The microphone stays above the mobile footer.

## Offline and updates

The production-only worker caches public JS/CSS/fonts, icons and a standalone offline page. It never caches authenticated documents, actions, sessions, private files, microphone audio or transcripts. Runtime asset storage is bounded. The offline page works at deep URLs and under a base path. Cloud saving, sign-in and teaching require connectivity. Keep an open unsaved drawing open until it saves; reopening an authenticated lesson offline is not supported.

A new build generates a new worker cache identity. Updates wait for a user action; save the drawing before selecting Reload app. There is no automatic reload of an active lesson. The install dialog suspends speech through the existing board suspension interface.

Development/HMR does not register a worker. Test service-worker behavior against a production build. Browsers may suppress installation in embedded browsers or when the app is already installed. Native installation and physical device testing remain separate acceptance checks.

## Deployment

See [Vercel setup](./vercel-deployment.md). `nitro.config.ts` configures the production build; Vite's Nitro options alone do not configure `agent-native build`. Keep `/sw.js` and the manifest revalidating, with the JavaScript/manifest MIME types shown in the configuration.
