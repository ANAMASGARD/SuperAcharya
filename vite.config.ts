import { agentNative } from "@agent-native/core/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const reactRouterPlugins = reactRouter as unknown as () => any[];
const agentNativePlugins = agentNative as unknown as (
  options?: Parameters<typeof agentNative>[0],
) => any[];
export default defineConfig({
  optimizeDeps: {
    include: ["@excalidraw/excalidraw"],
    entries: [
      "app/entry.client.tsx",
      "app/root.tsx",
      "app/components/layout/{Layout,Sidebar}.tsx",
      "app/components/chat/ChatRouteContent.tsx",
      "app/routes/{home,chat.$threadId}.tsx",
    ],
  },

  plugins: [
    ...reactRouterPlugins(),
    ...agentNativePlugins({
      ssrStubs: ["shiki"],
      nitro: { features: { websocket: true } },
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
