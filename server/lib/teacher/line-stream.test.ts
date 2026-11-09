import { MockLanguageModelV3 } from "ai/test";
import { expect, it, vi } from "vitest";

import { streamTeachingSteps } from "./graph";

let model: MockLanguageModelV3;
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({ responses: () => model }),
}));
type ModelStream = Awaited<
  ReturnType<MockLanguageModelV3["doStream"]>
>["stream"];
type Part = ModelStream extends ReadableStream<infer T> ? T : never;
const first = {
  heading: "Subtract",
  line: "$$x+2-2=5-2$$",
  narration: "Subtract two from both sides.",
};
const second = {
  heading: "",
  line: "$$x=3$$",
  narration: "Now simplify to get three.",
};
const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
function fixture() {
  let channel!: ReadableStreamDefaultController<Part>;
  let signal: AbortSignal | undefined;
  model = new MockLanguageModelV3({
    doStream: async (options) => {
      signal = options.abortSignal;
      return {
        stream: new ReadableStream<Part>({
          start(controller) {
            channel = controller;
            signal?.addEventListener(
              "abort",
              () => {
                try {
                  controller.error(new Error("fixture aborted"));
                } catch {}
              },
              { once: true },
            );
            controller.enqueue({ type: "text-start", id: "fixture" });
            controller.enqueue({
              type: "text-delta",
              id: "fixture",
              delta: `{"elements":[${JSON.stringify(first)},{`,
            });
          },
        }),
      };
    },
  });
  return {
    finish: (reason: "stop" | "length" = "stop") => {
      channel.enqueue({
        type: "text-delta",
        id: "fixture",
        delta: JSON.stringify(second).slice(1) + "]}",
      });
      channel.enqueue({ type: "text-end", id: "fixture" });
      channel.enqueue({
        type: "finish",
        finishReason: { unified: reason, raw: reason },
        usage,
      });
      channel.close();
    },
    aborted: () => signal?.aborted,
  };
}
const options = () => ({
  key: "synthetic",
  model: "synthetic",
  input: "Solve",
  context: {},
  signal: new AbortController().signal,
});

it("emits one validated line before the complete model output exists, then the next line", async () => {
  const source = fixture(),
    prepare = vi.fn();
  const lines = streamTeachingSteps({ ...options(), prepare });
  expect((await lines.next()).value).toEqual({
    heading: first.heading,
    lines: [first.line],
    narration: first.narration,
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  source.finish();
  expect((await lines.next()).value).toEqual({
    heading: "",
    lines: [second.line],
    narration: second.narration,
  });
  expect((await lines.next()).done).toBe(true);
  expect(prepare.mock.calls.map((call) => call[1])).toEqual([0, 1]);
});
it("aborts pending lookahead when the consumer stops after a line", async () => {
  const source = fixture(),
    prepare = vi.fn();
  const lines = streamTeachingSteps({ ...options(), prepare });
  await lines.next();
  await lines.return();
  expect(source.aborted()).toBe(true);
  expect(prepare).toHaveBeenCalledTimes(1);
});
it("completes valid output when no audio preparation callback is configured", async () => {
  const source = fixture();
  const lines = streamTeachingSteps(options());
  await lines.next();
  source.finish();
  await lines.next();
  expect((await lines.next()).done).toBe(true);
});
it("does not report a token-limited lesson as complete", async () => {
  const source = fixture();
  const lines = streamTeachingSteps(options());
  await lines.next();
  source.finish("length");
  await lines.next();
  await expect(lines.next()).rejects.toThrow("incomplete lesson");
});
