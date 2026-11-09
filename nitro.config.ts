// agent-native build creates a separate Nitro production build. Vite's Nitro
// options configure development only; keep production transport settings here.
export default {
  features: { websocket: true },
  vercel: { functions: { maxDuration: 300 } },
  routeRules: {
    "/sw.js": {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "service-worker-allowed": "/",
      },
    },
    "/manifest.json": {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "content-type": "application/manifest+json",
      },
    },
  },
};
