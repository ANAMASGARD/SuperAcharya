import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { nanoid } from "nanoid";
import { expect, it } from "vitest";

import { buildTeachingGraph } from "./graph";

// guard:allow-env-credential — test-only disposable localhost database; never an application/user credential.
const url = process.env.TEACHER_TEST_POSTGRES_URL;
it.skipIf(!url)(
  "round-trips graph checkpoints through the official Postgres adapter",
  async () => {
    if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
      throw new Error("Use a disposable local PostgreSQL database.");
    const saver = PostgresSaver.fromConnString(url, {
      schema: "teacher_graph",
    });
    const config = {
      configurable: { thread_id: `synthetic-checkpoint-${nanoid()}` },
    };
    try {
      const graph = buildTeachingGraph(saver, {
        assertActive: async () => {},
        orchestrate: async () => ({
          context: { subject: "Mathematics" },
          clarification: "",
        }),
        tutor: async function* () {
          yield "Synthetic persisted step";
        },
        emitText: () => {},
      });
      await graph.invoke({ input: "Synthetic test" }, config);
      const restored = PostgresSaver.fromConnString(url, {
        schema: "teacher_graph",
      });
      try {
        expect(
          (await restored.getTuple(config))?.checkpoint.channel_values.response,
        ).toBe("Synthetic persisted step");
      } finally {
        await restored.end();
      }
    } finally {
      await saver.end();
    }
  },
);
