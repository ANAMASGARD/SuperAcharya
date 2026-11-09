// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";

import { startCapture } from "./capture";
import { ReadyMicrophone } from "./microphone";

function audioFixture() {
  const track = {
    enabled: true,
    readyState: "live",
    stop: vi.fn(),
    addEventListener: vi.fn(),
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const addModule = vi.fn().mockResolvedValue(undefined);
  const resume = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const createSource = vi.fn(() => source);
  const AudioContext = vi.fn(
    class {
      state = "suspended";
      sampleRate = 16000;
      audioWorklet = { addModule };
      destination = {};
      resume = resume;
      close = close;
      createMediaStreamSource = createSource;
    },
  );
  class Worklet {
    static nodes: Worklet[] = [];
    constructor() {
      Worklet.nodes.push(this);
    }
    port = {
      onmessage: (_event: { data: unknown }) => {},
      close: vi.fn(),
      postMessage: vi.fn((data: string) => {
        if (data === "stop") this.port.onmessage({ data: "stopped" });
      }),
    };
    connect = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("AudioContext", AudioContext);
  vi.stubGlobal("AudioWorkletNode", Worklet);
  return {
    track,
    getUserMedia,
    source,
    addModule,
    close,
    createSource,
    AudioContext,
    Worklet,
    resume,
  };
}
afterEach(() => vi.unstubAllGlobals());

it("connects no idle input, cuts capture on release and reuses context/module for the next hold", async () => {
  const f = audioFixture();
  const device = new ReadyMicrophone();
  const pcm = vi.fn();
  await device.warm();
  expect(f.createSource).not.toHaveBeenCalled();
  expect(f.Worklet.nodes).toHaveLength(0);
  for (let turn = 0; turn < 2; turn++) {
    const capture = await startCapture(
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
      pcm,
      device,
    );
    const node = f.Worklet.nodes.slice(-1)[0]!;
    for (let i = 0; i < 4; i++)
      node.port.onmessage({ data: new Float32Array(512).fill(0.1) });
    const disconnects = f.source.disconnect.mock.calls.length;
    const finish = capture.finish();
    expect(f.source.disconnect.mock.calls.length).toBeGreaterThan(disconnects);
    expect((await finish)?.size).toBeGreaterThan(44);
    const calls = pcm.mock.calls.length;
    node.port.onmessage({ data: new Float32Array(512) });
    expect(pcm).toHaveBeenCalledTimes(calls);
    expect(f.track.enabled).toBe(true);
    expect(f.track.stop).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  }
  expect(f.getUserMedia).toHaveBeenCalledOnce();
  expect(f.addModule).toHaveBeenCalledOnce();
  expect(f.AudioContext).toHaveBeenCalledOnce();
  device.dispose();
  expect(f.track.stop).toHaveBeenCalledOnce();
  expect(f.close).toHaveBeenCalledOnce();
});

it("resumes in the key gesture but never connects a capture cancelled during resume", async () => {
  const f = audioFixture();
  const device = new ReadyMicrophone();
  await device.warm();
  let resumed!: () => void;
  f.resume.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resumed = resolve;
      }),
  );
  const controller = new AbortController();
  const pending = startCapture(
    controller.signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    device,
  );
  expect(f.resume).toHaveBeenCalledOnce();
  controller.abort();
  resumed();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(f.createSource).not.toHaveBeenCalled();
  device.dispose();
});

it("recovers from worklet preload failure on the next explicit capture", async () => {
  const f = audioFixture();
  f.addModule.mockRejectedValueOnce(new Error("Offline"));
  const device = new ReadyMicrophone();
  await expect(device.warm()).rejects.toThrow("Offline");
  const capture = await startCapture(
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    device,
  );
  expect(f.addModule).toHaveBeenCalledTimes(2);
  expect(f.getUserMedia).toHaveBeenCalledOnce();
  capture.cancel();
  device.dispose();
});
