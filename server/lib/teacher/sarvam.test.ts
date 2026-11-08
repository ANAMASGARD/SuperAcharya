import { EventEmitter } from "node:events";

import { afterEach, expect, it, vi } from "vitest";
const sockets = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("ws", () => ({
  default: class extends EventEmitter {
    static CONNECTING = 0;
    readyState = 1;
    sent: string[] = [];
    constructor(public url: string) {
      super();
      sockets.current = this;
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.emit("close");
    }
    terminate() {
      this.close();
    }
  },
}));
import { SarvamNarrator } from "./providers/sarvam";
function socket() {
  return sockets.current as EventEmitter & { url: string; sent: string[] };
}
afterEach(() => vi.restoreAllMocks());
it("uses the selected voice and waits for final before exposing a complete audio unit", async () => {
  const narrator = new SarvamNarrator(
    "synthetic",
    "kalpit_en_edtech",
    "en-IN",
    new AbortController().signal,
  );
  socket().emit("open");
  expect(socket().url).toContain("model=bulbul:v4-flash");
  expect(JSON.parse(socket().sent[0]!)).toMatchObject({
    type: "config",
    data: {
      speaker: "kalpit_en_edtech",
      pace: 1.15,
      speech_sample_rate: 24000,
    },
  });
  const result = narrator.speak("A synthetic test.");
  await Promise.resolve();
  const send = (value: unknown) =>
    socket().emit("message", Buffer.from(JSON.stringify(value)));
  send({
    type: "audio",
    data: {
      audio: Buffer.from("first").toString("base64"),
      content_type: "audio/mpeg",
    },
  });
  send({
    type: "audio",
    data: {
      audio: Buffer.from("second").toString("base64"),
      content_type: "audio/mpeg",
    },
  });
  send({ type: "event", data: { event_type: "final" } });
  expect(Buffer.from(await result, "base64").toString()).toBe("firstsecond");
  narrator.close();
});
it("aborts a pending narration and rejects late audio", async () => {
  const abort = new AbortController();
  const narrator = new SarvamNarrator(
    "synthetic",
    "kalpit_en_edtech",
    "en-IN",
    abort.signal,
  );
  socket().emit("open");
  const result = narrator.speak("A synthetic test.");
  await Promise.resolve();
  abort.abort();
  await expect(result).rejects.toThrow("unavailable");
  await expect(narrator.speak("late")).rejects.toThrow();
});
