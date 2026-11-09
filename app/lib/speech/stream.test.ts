import { afterEach, expect, it, vi } from "vitest";

import {
  bufferSpeechUntilReady,
  openSpeechStream,
  type SpeechStream,
} from "./stream";

const result = {
  transcript: "First words",
  model: "prisma-v3.0" as const,
  truncated: false,
};
function pendingConnection() {
  let resolve!: (stream: SpeechStream) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<SpeechStream>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const live = {
    send: vi.fn(),
    cancel: vi.fn(),
    finish: vi.fn().mockResolvedValue(result),
  };
  const abort = new AbortController();
  const failure = vi.fn();
  const buffered = bufferSpeechUntilReady(pending, abort.signal, failure);
  return { resolve, reject, live, abort, failure, buffered };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("preserves early PCM in order, including release before the handshake completes", async () => {
  const { buffered, live, resolve } = pendingConnection();
  const frame = new Uint8Array([1, 2]);
  buffered.send(frame);
  frame[0] = 9;
  buffered.send(frame);
  const finished = buffered.finish();
  expect(live.send).not.toHaveBeenCalled();
  resolve(live);
  await expect(finished).resolves.toEqual(result);
  expect(live.send.mock.calls).toEqual([
    [new Uint8Array([1, 2])],
    [new Uint8Array([9, 2])],
  ]);
  expect(live.send.mock.invocationCallOrder[1]).toBeLessThan(
    live.finish.mock.invocationCallOrder[0]!,
  );
});
it("discards early audio when closed and never sends it on a late connection", async () => {
  const { buffered, live, resolve, abort, failure } = pendingConnection();
  buffered.send(new Uint8Array(1024));
  abort.abort();
  resolve(live);
  await expect(buffered.finish()).rejects.toMatchObject({ name: "AbortError" });
  expect(live.send).not.toHaveBeenCalled();
  expect(live.finish).not.toHaveBeenCalled();
  expect(live.cancel).toHaveBeenCalledOnce();
  expect(failure).not.toHaveBeenCalled();
});
it("bounds buffered speech to twelve seconds and reports a connection failure while held", async () => {
  const { buffered, reject, failure } = pendingConnection();
  buffered.send(new Uint8Array(16000 * 2 * 12));
  expect(() => buffered.send(new Uint8Array(2))).toThrow("taking too long");
  reject(new Error("Unavailable"));
  await expect(buffered.finish()).rejects.toThrow("Unavailable");
  expect(failure).toHaveBeenCalledOnce();
  expect(() => buffered.send(new Uint8Array(2))).toThrow("Unavailable");
});

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  bufferedAmount = 0;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  sent: (Uint8Array | string)[] = [];
  constructor() {
    Socket.instances.push(this);
  }
  close = vi.fn(() => {
    this.readyState = 3;
  });
  send(data: Uint8Array | string) {
    this.sent.push(data);
    if (typeof data !== "string") this.bufferedAmount += data.byteLength;
  }
  event(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
async function transport() {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    location: { href: "http://localhost/whiteboard/test" },
  });
  vi.stubGlobal("WebSocket", Socket);
  const abort = new AbortController();
  const failure = vi.fn();
  const connecting = openSpeechStream(
    "drawing",
    abort.signal,
    vi.fn(),
    failure,
  );
  const socket = Socket.instances.slice(-1)[0]!;
  socket.event({ type: "ready" });
  return { live: await connecting, socket, abort, failure };
}
it("drains first-word backlog under backpressure before committing, without dropping frames", async () => {
  const { live, socket } = await transport();
  for (let i = 0; i < 100; i++) live.send(new Uint8Array(1024).fill(i));
  expect(socket.sent).toHaveLength(32);
  const done = live.finish();
  expect(socket.sent).not.toContain('{"type":"commit"}');
  for (let i = 0; i < 3; i++) {
    socket.bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(16);
  }
  expect(socket.sent).toHaveLength(101);
  expect(socket.sent.slice(-1)[0]).toBe('{"type":"commit"}');
  expect(
    socket.sent.slice(0, -1).map((frame) => (frame as Uint8Array)[0]),
  ).toEqual(Array.from({ length: 100 }, (_, i) => i));
  socket.event({ type: "done", result });
  await expect(done).resolves.toEqual(result);
  expect(vi.getTimerCount()).toBe(0);
});
it("drops queued frames and rejects finalization when cancelled under backpressure", async () => {
  const { live, socket, abort } = await transport();
  socket.bufferedAmount = 65536;
  live.send(new Uint8Array(1024));
  const done = live.finish();
  const rejected = expect(done).rejects.toMatchObject({ name: "AbortError" });
  abort.abort();
  await rejected;
  socket.bufferedAmount = 0;
  await vi.advanceTimersByTimeAsync(100);
  expect(socket.sent).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
it("times out a stalled send instead of silently losing or accumulating audio", async () => {
  const { live, socket, failure } = await transport();
  socket.bufferedAmount = 65536;
  live.send(new Uint8Array(1024));
  const done = expect(live.finish()).rejects.toThrow("too slow");
  await vi.advanceTimersByTimeAsync(12016);
  await done;
  expect(failure).toHaveBeenCalledOnce();
  expect(socket.close).toHaveBeenCalledOnce();
});
