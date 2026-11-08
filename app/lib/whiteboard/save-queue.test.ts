import { describe, expect, it, vi } from "vitest";

import { SaveQueue } from "./save-queue";
describe("serialized autosave", () => {
  it("never starts with an empty overwrite", async () => {
    const write = vi.fn();
    const queue = new SaveQueue({ text: "saved" }, "r1", write, () => {});
    await queue.flush();
    expect(write).not.toHaveBeenCalled();
    queue.dispose();
  });
  it("keeps edits arriving during a request and saves them with the new revision", async () => {
    let release: (revision: string) => void = () => {};
    const first = new Promise<string>((resolve) => {
      release = resolve;
    });
    const write = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce("r3");
    const queue = new SaveQueue<string>("initial", "r1", write, () => {});
    queue.update("first");
    const flushing = queue.flush();
    await Promise.resolve();
    queue.update("second");
    release("r2");
    await flushing;
    expect(write.mock.calls).toEqual([
      ["first", "r1"],
      ["second", "r2"],
    ]);
    expect(queue.dirty).toBe(false);
    queue.dispose();
  });
  it("keeps dirty work on failure, stops background retries and allows explicit retry", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("r2");
    const queue = new SaveQueue<string>("initial", "r1", write, () => {});
    queue.update("edit");
    await expect(queue.flush()).rejects.toThrow("offline");
    expect(queue.dirty).toBe(true);
    expect(queue.adopt("remote", "r3")).toBe(false);
    await queue.flush();
    expect(queue.dirty).toBe(false);
    queue.dispose();
  });
  it("coalesces quick changes", async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValue("r2");
    const queue = new SaveQueue<string>("initial", "r1", write, () => {});
    queue.update("a");
    queue.update("b");
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledExactlyOnceWith("b", "r1");
    queue.dispose();
    vi.useRealTimers();
  });
});
