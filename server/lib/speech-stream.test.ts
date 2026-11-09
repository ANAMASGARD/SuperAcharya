import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createSpeechHooks } from "../routes/api/whiteboard-speech-stream/[boardId]";
const { instances } = vi.hoisted(() => ({
  instances: [] as Array<{
    emit: (name: string, ...args: unknown[]) => boolean;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    bufferedAmount: number;
  }>,
}));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class Socket extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    send = vi.fn();
    close = vi.fn();
    terminate = vi.fn();
    constructor() {
      super();
      instances.push(this);
    }
  }
  return { default: Socket };
});
const makePeer = () => ({
  send: vi.fn(),
  close: vi.fn(),
  context: {} as Record<string, unknown>,
});
const emit = (type: string, extra: Record<string, unknown> = {}) =>
  instances
    .slice(-1)[0]!
    .emit("message", Buffer.from(JSON.stringify({ type, ...extra })));
const commit = {
  rawData: '{"type":"commit"}',
  text: () => '{"type":"commit"}',
  uint8Array: () => new Uint8Array(),
};
beforeEach(() => {
  vi.useFakeTimers();
  instances.length = 0;
});
afterEach(() => vi.useRealTimers());
it("still rejects excessive audio rate and releases a provider queue that never drains", () => {
  const flood = createSpeechHooks("rate-bound", "key"),
    p1 = makePeer();
  flood.open(p1);
  emit("connected");
  const frame = new Uint8Array(1024);
  for (let i = 0; i < 64; i++)
    flood.message(p1, {
      rawData: frame,
      text: () => "",
      uint8Array: () => frame,
    });
  expect(p1.close).toHaveBeenCalledWith(1008, "Invalid audio stream");
  const blocked = createSpeechHooks("rate-bound", "key"),
    p2 = makePeer();
  blocked.open(p2);
  emit("connected");
  instances.slice(-1)[0]!.bufferedAmount = 70000;
  blocked.message(p2, {
    rawData: frame,
    text: () => "",
    uint8Array: () => frame,
  });
  vi.advanceTimersByTime(12016);
  expect(JSON.parse(p2.send.mock.calls.slice(-1)[0]![0])).toMatchObject({
    type: "error",
    message: expect.stringContaining("too slow"),
  });
  expect(p2.close).toHaveBeenCalled();
  const next = createSpeechHooks("rate-bound", "key"),
    p3 = makePeer();
  next.open(p3);
  expect(p3.close).not.toHaveBeenCalled();
  next.close();
  expect(vi.getTimerCount()).toBe(0);
});
it("holds startup audio during provider backpressure and sends commit only after all frames", () => {
  const hooks = createSpeechHooks("buffered-provider", "key"),
    peer = makePeer();
  hooks.open(peer);
  emit("connected");
  instances[0]!.bufferedAmount = 70000;
  const frame = new Uint8Array(1024);
  hooks.message(peer, {
    rawData: frame,
    text: () => "",
    uint8Array: () => frame,
  });
  hooks.message(peer, commit);
  expect(peer.close).not.toHaveBeenCalled();
  expect(instances[0]!.send).not.toHaveBeenCalled();
  instances[0]!.bufferedAmount = 0;
  vi.advanceTimersByTime(16);
  expect(instances[0]!.send.mock.calls).toEqual([
    [frame],
    ['{"type":"commit"}'],
  ]);
  hooks.close();
});
it("accepts speech captured during authentication and provider startup without resetting the rate clock", () => {
  const receivedAt = Date.now();
  vi.advanceTimersByTime(3000); // Simulated owned-board / credential lookup.
  const hooks = createSpeechHooks("early-stream", "key", receivedAt),
    peer = makePeer();
  hooks.open(peer);
  vi.advanceTimersByTime(2000); // Simulated provider handshake.
  emit("connected");
  const frame = new Uint8Array(1024);
  for (let i = 0; i < 156; i++)
    hooks.message(peer, {
      rawData: frame,
      text: () => "",
      uint8Array: () => frame,
    });
  expect(peer.close).not.toHaveBeenCalled();
  expect(instances[0]!.send).toHaveBeenCalledTimes(156);
  hooks.message(peer, commit);
  expect(instances[0]!.send).toHaveBeenLastCalledWith('{"type":"commit"}');
  hooks.close();
});
it("streams PCM, commits on release, deduplicates and settles final transcripts", () => {
  const hooks = createSpeechHooks("stream-a", "test-key"),
    peer = makePeer();
  hooks.open(peer);
  emit("connected");
  hooks.message(peer, {
    rawData: new Uint8Array(1024),
    text: () => "",
    uint8Array: () => new Uint8Array(1024),
  });
  expect(instances[0]!.send).toHaveBeenCalledTimes(1);
  emit("speech_start", { utterance_id: "u1" });
  hooks.message(peer, commit);
  expect(instances[0]!.send).toHaveBeenLastCalledWith('{"type":"commit"}');
  emit("transcript", {
    text: "one",
    utterance_id: "u1",
    segment_id: "s1",
    segment_index: 1,
  });
  emit("transcript", {
    text: "one",
    utterance_id: "u1",
    segment_id: "s1",
    segment_index: 1,
  });
  vi.advanceTimersByTime(250);
  const output = JSON.parse(peer.send.mock.calls.slice(-1)[0]![0]);
  expect(output).toMatchObject({ type: "done", result: { transcript: "one" } });
  expect(peer.close).toHaveBeenCalled();
});
it("rejects overlapping tabs and releases the slot on cancellation", () => {
  const first = createSpeechHooks("stream-b", "key"),
    p1 = makePeer();
  first.open(p1);
  const second = createSpeechHooks("stream-b", "key"),
    p2 = makePeer();
  second.open(p2);
  expect(p2.close).toHaveBeenCalled();
  expect(instances).toHaveLength(1);
  first.close();
  const third = createSpeechHooks("stream-b", "key"),
    p3 = makePeer();
  third.open(p3);
  expect(instances).toHaveLength(2);
  third.close();
});
it("rejects bad audio sizes and safely bounds silence and provider timeout", () => {
  const bad = createSpeechHooks("stream-c", "key"),
    peer = makePeer();
  bad.open(peer);
  emit("connected");
  bad.message(peer, {
    rawData: new Uint8Array(7),
    text: () => "",
    uint8Array: () => new Uint8Array(7),
  });
  expect(peer.close).toHaveBeenCalledWith(1008, "Invalid audio stream");
  const silent = createSpeechHooks("stream-c", "key"),
    p2 = makePeer();
  silent.open(p2);
  emit("connected");
  silent.message(p2, commit);
  vi.advanceTimersByTime(1500);
  expect(JSON.parse(p2.send.mock.calls.slice(-1)[0]![0])).toMatchObject({
    type: "done",
    result: { transcript: "" },
  });
  const timeout = createSpeechHooks("stream-c", "key"),
    p3 = makePeer();
  timeout.open(p3);
  vi.advanceTimersByTime(620000);
  expect(JSON.parse(p3.send.mock.calls.slice(-1)[0]![0]).type).toBe("error");
});

it("streams three minutes on one connection and appends phrases before stopping", () => {
  const hooks = createSpeechHooks("long-stream", "key"),
    peer = makePeer();
  hooks.open(peer);
  emit("connected");
  const frame = new Uint8Array(1024);
  for (let i = 0; i < 5625; i++) {
    vi.advanceTimersByTime(32);
    hooks.message(peer, {
      rawData: frame,
      text: () => "",
      uint8Array: () => frame,
    });
    if (i % 156 === 0) {
      const id = String(i);
      emit("speech_start", { utterance_id: id });
      emit("transcript", {
        text: `phrase${id}`,
        utterance_id: id,
        segment_id: id,
        segment_index: i,
      });
    }
  }
  expect(instances).toHaveLength(1);
  expect(instances[0]!.send).toHaveBeenCalledTimes(5625);
  expect(peer.close).not.toHaveBeenCalled();
  const live = JSON.parse(peer.send.mock.calls.slice(-1)[0]![0]);
  expect(live.type).toBe("transcript");
  expect(live.result.transcript).toContain("phrase0 phrase156");
  hooks.message(peer, commit);
  vi.advanceTimersByTime(250);
  expect(
    JSON.parse(peer.send.mock.calls.slice(-1)[0]![0]).result.transcript,
  ).toBe(live.result.transcript);
});
