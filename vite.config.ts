import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { agentNative } from "@agent-native/core/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const reactRouterPlugins = reactRouter as unknown as () => any[];
const agentNativePlugins = agentNative as unknown as (
  options?: Parameters<typeof agentNative>[0],
) => any[];
export default defineConfig({
  optimizeDeps: {
    include: [
      "@excalidraw/excalidraw",
      "mathjax-full/js/adaptors/lite/Element.js",
      "mathjax-full/js/adaptors/liteAdaptor.js",
      "mathjax-full/js/handlers/html.js",
      "mathjax-full/js/input/tex.js",
      "mathjax-full/js/mathjax.js",
      "mathjax-full/js/input/tex/ams/AmsConfiguration.js",
      "mathjax-full/js/output/svg.js",
    ],
    entries: [
      "app/entry.client.tsx",
      "app/root.tsx",
      "app/components/layout/{Layout,Sidebar}.tsx",
      "app/components/chat/ChatRouteContent.tsx",
      "app/routes/{home,chat.$threadId}.tsx",
    ],
  },

  plugins: [
    {
      name: "acharya-pwa-worker",
      apply: "build",
      generateBundle(_options, bundle) {
        if (
          !Object.keys(bundle).some(
            (name) => name.startsWith("assets/") && name.endsWith(".js"),
          )
        )
          return;
        const version = createHash("sha256")
          .update(Object.keys(bundle).sort().join("\n"))
          .update(readFileSync("scripts/pwa-worker.js"))
          .update(readFileSync("public/offline.html"))
          .update(readFileSync("public/manifest.json"))
          .update(readFileSync("public/pwa/icon-512.png"))
          .digest("hex")
          .slice(0, 16);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: readFileSync("scripts/pwa-worker.js", "utf8").replace(
            "__BUILD_ID__",
            version,
          ),
        });
      },
    },
    ...reactRouterPlugins(),
    ...agentNativePlugins({
      ssrStubs: ["shiki"],
      nitro: {
        features: { websocket: true },
      },
    }),
    {
      name: "current-markdown-style-dependency",
      configResolved(config) {
        // Core 0.226.0 names the old dependency; the installed hast runtime
        // now imports style-to-object. Keep prebundling on the actual package.
        config.optimizeDeps.include = (config.optimizeDeps.include ?? []).map(
          (id) =>
            id ===
            "@agent-native/toolkit > react-markdown > hast-util-to-jsx-runtime > style-to-js"
              ? "@agent-native/toolkit > react-markdown > hast-util-to-jsx-runtime > style-to-object"
              : id,
        );
      },
    },
  ],
});
