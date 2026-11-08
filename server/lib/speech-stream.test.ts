import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createSpeechHooks } from "../routes/api/whiteboard-speech-stream/[boardId]";
const { instances } = vi.hoisted(() => ({
  instances: [] as Array<{
    emit: (name: string, ...args: unknown[]) => boolean;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
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
