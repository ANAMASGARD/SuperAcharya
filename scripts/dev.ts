import { spawn } from "node:child_process";
import path from "node:path";

import { loadEnv } from "@agent-native/core/scripts";

// Load server-only .env/.env.local keys before Nitro starts, just like production.
// The framework loader preserves explicit deployment environment overrides.
loadEnv();
const child = spawn(
  process.execPath,
  [
    path.resolve("node_modules/@agent-native/core/bin/agent-native.js"),
    "dev",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", () => {
  console.error("Could not start the development server.");
  process.exit(1);
});
