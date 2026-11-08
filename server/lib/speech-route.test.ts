import { getSession } from "@agent-native/core/server";
import { H3Event } from "h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeWav } from "../../app/lib/speech/capture";
import { MAX_SPEECH_BYTES } from "../../shared/speech";
import streamHandler from "../routes/api/whiteboard-speech-stream/[boardId]";
import handler from "../routes/api/whiteboard-speech/[boardId].post";
import { gnaniKey, transcribeWithGnani } from "./gnani-speech";
import { ownedBoard } from "./whiteboards";
vi.mock("@agent-native/core/server", () => ({
  getSession: vi.fn(),
  runWithRequestContext: (_: unknown, run: () => unknown) => run(),
}));
vi.mock("./whiteboards", () => ({ ownedBoard: vi.fn() }));
vi.mock("./gnani-speech", () => ({
  gnaniKey: vi.fn(),
  transcribeWithGnani: vi.fn(),
}));
const id = "123456789012345678901";
async function event(origin = "http://localhost", size?: number) {
  const audio = size
    ? new Blob([new Uint8Array(size)])
    : encodeWav(new Float32Array(16000), 16000);
  const request = new Request(`http://localhost/api/whiteboard-speech/${id}`, {
    method: "POST",
    headers: { origin, "content-type": "audio/wav" },
    body: audio,
  });
  const result = new H3Event(request);
  result.context.params = { boardId: id };
  return result;
}
beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue({ email: "alice@example.test" });
  vi.mocked(gnaniKey).mockResolvedValue("test-key");
  vi.mocked(transcribeWithGnani).mockResolvedValue({
    transcript: "hello",
    model: "prisma-v3.0",
    truncated: false,
  });
});
afterEach(() => vi.resetAllMocks());
describe("speech upload boundary", () => {
  it("rejects unsigned and cross-origin requests before provider work", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(handler(await event())).rejects.toMatchObject({ status: 401 });
    vi.mocked(getSession).mockResolvedValue({ email: "alice@example.test" });
    await expect(
      handler(await event("https://other.test")),
    ).rejects.toMatchObject({ status: 403 });
    expect(transcribeWithGnani).not.toHaveBeenCalled();
  });
  it("enforces drawing ownership before resolving credentials", async () => {
    vi.mocked(ownedBoard).mockRejectedValue(new Error("Drawing not found"));
    await expect(handler(await event())).rejects.toThrow("Drawing not found");
    expect(ownedBoard).toHaveBeenCalledWith("alice@example.test", id);
    expect(gnaniKey).not.toHaveBeenCalled();
  });
  it("rejects large and malformed clips", async () => {
    await expect(
      handler(await event("http://localhost", MAX_SPEECH_BYTES + 2)),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      handler(await event("http://localhost", 10)),
    ).rejects.toMatchObject({ status: 400 });
    expect(transcribeWithGnani).not.toHaveBeenCalled();
  });
  it("rejects overlapping requests and frees the slot after completion", async () => {
    let done!: (value: Awaited<ReturnType<typeof transcribeWithGnani>>) => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(transcribeWithGnani).mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        done = resolve;
      });
    });
    const first = handler(await event());
    await began;
    await expect(handler(await event())).rejects.toMatchObject({ status: 429 });
    done({ transcript: "hi", model: "prisma-v3.0", truncated: false });
    await first;
    await expect(handler(await event())).resolves.toMatchObject({
      transcript: "hello",
    });
  });
});

it("authorizes realtime upgrades before granting a provider session", async () => {
  vi.mocked(getSession).mockResolvedValue(null);
  await expect(streamHandler(await event())).rejects.toMatchObject({
    status: 401,
  });
  vi.mocked(getSession).mockResolvedValue({ email: "alice@example.test" });
  await expect(
    streamHandler(await event("https://other.test")),
  ).rejects.toMatchObject({ status: 403 });
  vi.mocked(ownedBoard).mockRejectedValue(new Error("Drawing not found"));
  await expect(streamHandler(await event())).rejects.toThrow(
    "Drawing not found",
  );
  expect(gnaniKey).not.toHaveBeenCalled();
});
