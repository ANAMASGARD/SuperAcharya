import { expect, it, vi } from "vitest";
import { NarrationBuffer } from "./narration-buffer";
it("prepares the next utterance before acknowledgement without overlapping provider requests", async () => {
  let finish: (value: string) => void = () => {};
  const synthesize = vi.fn((text: string) => text === "first" ? new Promise<string>(resolve => { finish = resolve; }) : Promise.resolve("second audio"));
  const buffer = new NarrationBuffer(synthesize, new AbortController().signal);
  buffer.prepare(0, "first"); buffer.prepare(1, "second");
  await Promise.resolve();
  expect(synthesize).toHaveBeenCalledTimes(1);
  finish("first audio");
  expect(await buffer.take(0, "first")).toBe("first audio");
  expect(await buffer.take(1, "second")).toBe("second audio");
  expect(synthesize.mock.calls.map(call => call[0])).toEqual(["first", "second"]);
});
it("does not start prefetched audio after cancellation", async () => {
  const controller = new AbortController();
  const synthesize = vi.fn(async () => "audio");
  const buffer = new NarrationBuffer(synthesize, controller.signal);
  buffer.prepare(0, "first"); controller.abort();
  await expect(buffer.take(0, "first")).rejects.toThrow();
  expect(synthesize).not.toHaveBeenCalled();
});
