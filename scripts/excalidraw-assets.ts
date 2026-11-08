import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url);
const packageDirectory = dirname(require.resolve("@excalidraw/excalidraw"));
const destination = resolve("public/excalidraw-assets/fonts");
await mkdir(destination, { recursive: true });
await cp(resolve(packageDirectory, "fonts"), destination, { recursive: true });
