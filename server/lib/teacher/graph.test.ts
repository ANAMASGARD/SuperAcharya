import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it, vi } from "vitest";

import { buildTeachingGraph } from "./graph";
import { normalizeClocked, fillLearningContext } from "./providers/clocked";
describe("teacher graph (explicit synthetic provider fixtures)", () => {
  it("routes accepted preferences into the Tutor and persists the accepted response", async () => {
    const emitText = vi.fn(),
      saver = new MemorySaver();
    const graph = buildTeachingGraph(saver, {
      assertActive: async () => {},
      orchestrate: async () => ({
        context: { responseLanguage: "hi", teachingMode: "practice" },
        clarification: "",
      }),
      tutor: async function* (_, context) {
        expect(context.teachingMode).toBe("practice");
        yield "Fixture question";
      },
      emitText,
    });
    const config = { configurable: { thread_id: "synthetic-turn" } };
    expect((await graph.invoke({ input: "practice" }, config)).response).toBe(
      "Fixture question",
    );
    expect((await graph.getState(config)).values.response).toBe(
      "Fixture question",
    );
  });
  it("clarifies without calling the Tutor and rejects cancellation before output", async () => {
    const tutor = vi.fn(async function* () {
        yield "must not execute";
      }),
      emitText = vi.fn();
    const graph = buildTeachingGraph(new MemorySaver(), {
      assertActive: async () => {},
      orchestrate: async () => ({
        context: {},
        clarification: "Confirm your language",
      }),
      tutor,
      emitText,
    });
    await graph.invoke(
      { input: "ambiguous" },
      { configurable: { thread_id: "clarify" } },
    );
    expect(tutor).not.toHaveBeenCalled();
    expect(emitText).toHaveBeenCalledWith("Confirm your language");
    const stopped = buildTeachingGraph(new MemorySaver(), {
      assertActive: async () => {
        throw new Error("stopped");
      },
      orchestrate: async () => ({ context: {}, clarification: "" }),
      tutor,
      emitText,
    });
    await expect(
      stopped.invoke({ input: "x" }, { configurable: { thread_id: "cancel" } }),
    ).rejects.toThrow("stopped");
  });
});
describe("Clocked evidence boundary", () => {
  it("uses Unicode codepoint evidence, preserves absent values, and rejects invented or conflicting spans", () => {
    const text = "😀 Hindi";
    expect(
      normalizeClocked(text, {
        fields: {
          responseLanguage: {
            value: "Hindi",
            start: 2,
            end: 7,
            confidence: 0.95,
          },
        },
      }),
    ).toEqual({ status: "accepted", patch: { responseLanguage: "hi" } });
    expect(
      normalizeClocked(text, { fields: { subject: { value: null } } }),
    ).toEqual({ status: "unchanged" });
    expect(
      normalizeClocked(text, {
        fields: {
          subject: { value: "Math", start: 2, end: 6, confidence: 0.99 },
        },
      }).status,
    ).toBe("clarify");
    expect(
      normalizeClocked(text, {
        fields: {
          responseLanguage: {
            value: "Hindi",
            start: 2,
            end: 7,
            confidence: 0.95,
            alternatives: ["English"],
          },
        },
      }).status,
    ).toBe("clarify");
  });
  it("retains UUID request identity and distinguishes provider failure from success", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 429 }));
    const input = {
      text: "Class seven",
      requestId: "54e445bd-b60b-4f71-93f7-eabc9247ddc7",
      key: "synthetic-test-key",
      signal: new AbortController().signal,
    };
    expect((await fillLearningContext(input, request)).status).toBe(
      "unavailable",
    );
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": input.requestId,
    });
    expect(
      JSON.parse(String(request.mock.calls[0]?.[1]?.body)).fields.learnerLevel
        .infer,
    ).toBe(false);
  });
});

it("writes clarification on the board and waits for acknowledgement instead of ending in chat", async () => {
  const drawStep = vi.fn(async () => {});
  const teach = vi.fn(async function* () {});
  const graph = buildTeachingGraph(new MemorySaver(), {
    assertActive: async () => {},
    orchestrate: async () => ({ context: {}, clarification: "" }),
    understand: async (input) => ({
      input,
      clarification: "Which angle interval should we use?",
    }),
    teach,
    tutor: async function* () {
      throw new Error("Unexpected text-only response");
    },
    emitText: vi.fn(),
    drawStep,
  });
  const result = await graph.invoke(
    { input: "Solve this" },
    { configurable: { thread_id: "board-clarification" } },
  );
  expect(teach).not.toHaveBeenCalled();
  expect(drawStep).toHaveBeenCalledWith(
    {
      heading: "Before we continue",
      lines: ["Which angle interval should we use?"],
      narration: "Which angle interval should we use?",
    },
    0,
  );
  expect(result.response).toBe("Which angle interval should we use?");
});

it("preserves evidenced class and subject when an introduction has no supported teaching mode", () => {
  const text = "Class twelve maths ask which topic";
  const field = (value: string) => ({
    value,
    start: text.indexOf(value),
    end: text.indexOf(value) + value.length,
    confidence: 0.99,
  });
  expect(
    normalizeClocked(text, {
      fields: {
        learnerLevel: field("twelve"),
        subject: field("maths"),
        teachingMode: field("ask which topic"),
      },
    }),
  ).toEqual({
    status: "accepted",
    patch: { learnerLevel: "twelve", subject: "maths" },
  });
});

it("draws an English clarification with separate spoken narration before waiting for the student", async () => {
  const drawStep = vi.fn(async () => {});
  const clarify = vi.fn(
    async () =>
      "Synthetic Hindi spoken clarification with theta read naturally",
  );
  const graph = buildTeachingGraph(new MemorySaver(), {
    assertActive: async () => {},
    orchestrate: async () => ({
      context: { responseLanguage: "hi" },
      clarification: "Should theta be between zero and 360 degrees?",
    }),
    tutor: async function* () {
      throw new Error("Must not solve before clarification");
    },
    emitText: vi.fn(),
    clarify,
    drawStep,
  });
  await graph.invoke(
    { input: "Solve this" },
    { configurable: { thread_id: "spoken-clarification" } },
  );
  expect(clarify).toHaveBeenCalledWith(
    "Should theta be between zero and 360 degrees?",
    { responseLanguage: "hi" },
  );
  expect(drawStep).toHaveBeenCalledWith(
    {
      heading: "Before we continue",
      lines: ["Should theta be between zero and 360 degrees?"],
      narration:
        "Synthetic Hindi spoken clarification with theta read naturally",
    },
    0,
  );
});

it("draws the first streamed line before later generation finishes and waits for its acknowledgement", async () => {
  let generated!: () => void, acknowledged!: () => void, drew!: () => void;
  const later = new Promise<void>((resolve) => {
    generated = resolve;
  });
  const ack = new Promise<void>((resolve) => {
    acknowledged = resolve;
  });
  const firstDrawn = new Promise<void>((resolve) => {
    drew = resolve;
  });
  const drawStep = vi.fn(async (_step, sequence: number) => {
    if (sequence === 0) {
      drew();
      await ack;
    }
  });
  const graph = buildTeachingGraph(new MemorySaver(), {
    assertActive: async () => {},
    orchestrate: async () => ({ context: {}, clarification: "" }),
    tutor: async function* () {
      throw new Error("Unexpected text-only path");
    },
    teach: async function* () {
      yield {
        heading: "Subtract",
        lines: ["x + 2 - 2 = 5 - 2"],
        narration: "Subtract two.",
      };
      await later;
      yield { heading: "", lines: ["x = 3"], narration: "Simplify." };
    },
    emitText: vi.fn(),
    drawStep,
  });
  const run = graph.invoke(
    { input: "Solve" },
    { configurable: { thread_id: "streaming-lines" } },
  );
  await firstDrawn;
  generated();
  await Promise.resolve();
  expect(drawStep).toHaveBeenCalledTimes(1);
  acknowledged();
  const result = await run;
  expect(drawStep).toHaveBeenCalledTimes(2);
  expect(result.response).toContain("x = 3");
});
