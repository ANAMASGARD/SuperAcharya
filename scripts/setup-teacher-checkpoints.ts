import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// Explicit setup command, never invoked by app startup or the production migration plugin.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url || !/^postgres(?:ql)?:\/\//.test(url))
  throw new Error(
    "Provide a PostgreSQL DATABASE_URL for the database you intend to initialize.",
  );
const saver = PostgresSaver.fromConnString(url, { schema: "teacher_graph" });
try {
  await saver.setup();
  await saver.getTuple({ configurable: { thread_id: "__readiness__" } });
  console.info("Teacher checkpoint schema initialized and read back.");
} finally {
  await saver.end();
}
