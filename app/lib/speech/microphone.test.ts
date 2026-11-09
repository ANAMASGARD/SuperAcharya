import { afterEach, expect, it, vi } from "vitest";

import { ReadyMicrophone } from "./microphone";

function fixture() {
  const track = {
    enabled: true,
    readyState: "live",
    stop: vi.fn(),
    addEventListener: vi.fn(),
  };
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const addModule = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const resume = vi.fn().mockResolvedValue(undefined);
  const AudioContext = vi.fn(
    class {
      state = "suspended";
      sampleRate = 16000;
      audioWorklet = { addModule };
      close = close;
      resume = resume;
    },
  );
  vi.stubGlobal("AudioContext", AudioContext);
  return {
    track,
    stream,
    getUserMedia,
    addModule,
    close,
    resume,
    AudioContext,
  };
}
afterEach(() => vi.unstubAllGlobals());
it("warms device and worklet once, keeps hardware ready between holds and closes on exit", async () => {
  const { track, getUserMedia, addModule, close, AudioContext } = fixture();
  const device = new ReadyMicrophone();
  await device.warm();
  expect(track.enabled).toBe(true);
  const first = await device.acquire(new AbortController().signal);
  expect(track.enabled).toBe(true);
  first.release();
  first.release();
  expect(track.enabled).toBe(true);
  expect(track.stop).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  const second = await device.acquire(new AbortController().signal);
  expect(track.enabled).toBe(true);
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(AudioContext).toHaveBeenCalledTimes(1);
  expect(addModule).toHaveBeenCalledTimes(1);
  second.release();
  device.dispose();
  expect(track.stop).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
it("closes permission results arriving after unmount and never enables them", async () => {
  const { track, stream, getUserMedia } = fixture();
  let grant!: (stream: MediaStream) => void;
  getUserMedia.mockReturnValue(
    new Promise<MediaStream>((resolve) => {
      grant = resolve;
    }),
  );
  const device = new ReadyMicrophone();
  const warming = device.prepare();
  device.dispose();
  grant(stream);
  await expect(warming).rejects.toMatchObject({ name: "AbortError" });
  expect(track.stop).toHaveBeenCalledOnce();
});
it("does not activate a cancelled hold and retries explicit permission failures", async () => {
  const { track, getUserMedia } = fixture();
  getUserMedia.mockRejectedValueOnce(
    new DOMException("Denied", "NotAllowedError"),
  );
  const device = new ReadyMicrophone();
  await expect(device.prepare()).rejects.toMatchObject({
    name: "NotAllowedError",
  });
  const aborted = new AbortController();
  aborted.abort();
  await expect(device.acquire(aborted.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  const lease = await device.acquire(new AbortController().signal);
  lease.release();
  expect(track.enabled).toBe(true);
  expect(getUserMedia).toHaveBeenCalledTimes(2);
  device.dispose();
});
it("rejects overlapping captures without muting the active one", async () => {
  const { track } = fixture();
  const device = new ReadyMicrophone();
  const first = await device.acquire(new AbortController().signal);
  await expect(device.acquire(new AbortController().signal)).rejects.toThrow(
    "already in use",
  );
  expect(track.enabled).toBe(true);
  first.release();
  device.dispose();
});
