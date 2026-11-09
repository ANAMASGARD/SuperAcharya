import { APICallError } from "ai";
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
  visual: null,
  line: "$$x+2-2=5-2$$",
  narration: "Subtract two from both sides.",
};
const second = {
  heading: "",
  visual: null,
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
function fixture(
  firstLine: Omit<typeof first, "visual"> & { visual: unknown } = first,
) {
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
              delta: `{"elements":[${JSON.stringify(firstLine)},{`,
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
    visual: null,
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  source.finish();
  expect((await lines.next()).value).toEqual({
    heading: "",
    lines: [second.line],
    narration: second.narration,
    visual: null,
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

it("reports provider request rejection without leaking provider payloads", async () => {
  model = new MockLanguageModelV3({
    doStream: async () => {
      throw new APICallError({
        message: "private synthetic request details",
        url: "https://example.test",
        requestBodyValues: {},
        statusCode: 400,
        responseBody: "private synthetic response details",
      });
    },
  });
  const lines = streamTeachingSteps(options());
  await expect(lines.next()).rejects.toThrow(
    "OpenAI could not accept the teaching request. Check the model output schema and server configuration.",
  );
});

it("explains existing work through narration without granting new board mutations", async () => {
  const source = fixture({
    ...first,
    visual: { version: 1, kind: "sine-cosine", angleDegrees: 30 },
  });
  const lines = streamTeachingSteps({ ...options(), explainExisting: true });
  expect((await lines.next()).value).toEqual({
    heading: "",
    lines: [],
    narration: first.narration,
    visual: null,
  });
  source.finish();
  expect((await lines.next()).value).toEqual({
    heading: "",
    lines: [],
    narration: second.narration,
    visual: null,
  });
  expect((await lines.next()).done).toBe(true);
});
