import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { loadEnv } from "@agent-native/core/scripts";

loadEnv();

const entry = path.resolve(".output/server/index.mjs");
if (!fs.existsSync(entry)) {
  console.error('No production build found. Run "pnpm build" first.');
  process.exit(1);
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
