import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";

let saver: PostgresSaver | undefined;
export async function teacherCheckpointer() {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(?:ql)?:\/\//.test(url))
    throw new Error(
      "The teacher requires PostgreSQL checkpoints. Your local whiteboard remains available.",
    );
  // The official adapter needs a pg pool; application records still use Drizzle.
  saver ??= new PostgresSaver(
    new Pool({
      connectionString: url,
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      idleTimeoutMillis: 30000,
    }),
    undefined,
    { schema: "teacher_graph" },
  );
  try {
    await saver.getTuple({ configurable: { thread_id: "__readiness__" } });
  } catch {
    throw new Error(
      "Teacher checkpoint storage is not ready. Run the documented checkpoint setup against your development PostgreSQL database.",
    );
  }
  return saver;
}
