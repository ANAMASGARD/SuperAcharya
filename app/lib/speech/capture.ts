import { appPath } from "@agent-native/core/client/api-path";
import {
  MAX_SPEECH_SECONDS,
  MAX_STREAM_SECONDS,
  SPEECH_SAMPLE_RATE,
} from "@shared/speech";

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const count = Math.floor((samples.length * SPEECH_SAMPLE_RATE) / sampleRate);
  if (count > SPEECH_SAMPLE_RATE * MAX_SPEECH_SECONDS)
    throw new Error("Long recordings cannot use short-clip REST recovery.");
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) =>
    [...text].forEach((char, index) =>
      view.setUint8(offset + index, char.charCodeAt(0)),
    );
  write(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SPEECH_SAMPLE_RATE, true);
  view.setUint32(28, SPEECH_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    // Average each source interval when the device cannot supply 16 kHz.
    const start = Math.floor((i * sampleRate) / SPEECH_SAMPLE_RATE);
    const end = Math.min(
      samples.length,
      Math.max(
        start + 1,
        Math.floor(((i + 1) * sampleRate) / SPEECH_SAMPLE_RATE),
      ),
    );
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j] ?? 0;
    const value = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, value * (value < 0 ? 32768 : 32767), true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export type Capture = {
  finish: () => Promise<Blob | null>;
  cancel: () => void;
};
export async function startCapture(
  signal: AbortSignal,
  onLevel: (level: number) => void,
  onLimit: () => void,
  onPcm?: (pcm: Uint8Array) => void,
): Promise<Capture> {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext)
    throw new Error(
      "Microphone capture requires HTTPS (or localhost) and a supported browser.",
    );
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const stopTracks = () => stream.getTracks().forEach((track) => track.stop());
  if (signal.aborted) {
    stopTracks();
    throw new DOMException("Cancelled", "AbortError");
  }
  let context: AudioContext | undefined;
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chunks: Float32Array[] = [];
  let sampleCount = 0;
  let finished = false;
  let flush: (() => void) | undefined;
  const cancel = () => {
    finished = true;
    clearTimeout(timer);
    stopTracks();
    source?.disconnect();
    node?.disconnect();
    node?.port.close();
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
    signal.removeEventListener("abort", cancel);
    flush?.();
    chunks = [];
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    context = new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE });
    if (context.sampleRate !== SPEECH_SAMPLE_RATE)
      throw new Error("This browser cannot capture 16 kHz speech.");
    await context.resume();
    await context.audioWorklet.addModule(appPath("/speech-capture.worklet.js"));
    signal.throwIfAborted();
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, "speech-capture", {
      processorOptions: { maxSeconds: MAX_STREAM_SECONDS },
    });
    node.port.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (finished) return;
      if (data === "stopped") {
        flush?.();
        return;
      }
      if (data === "limit") {
        onLimit();
        return;
      }
      if (data instanceof Float32Array) {
        sampleCount += data.length;
        // Retain short clips only. Never silently truncate a long recording for retry.
        if (sampleCount <= SPEECH_SAMPLE_RATE * MAX_SPEECH_SECONDS)
          chunks.push(data);
        else chunks = [];
        if (onPcm) {
          const frame = new Uint8Array(1024);
          const view = new DataView(frame.buffer);
          for (let i = 0; i < data.length; i++) {
            const value = Math.max(-1, Math.min(1, data[i] ?? 0));
            view.setInt16(i * 2, value * (value < 0 ? 32768 : 32767), true);
          }
          onPcm(frame);
        }
        const rms = Math.sqrt(
          data.reduce((sum, sample) => sum + sample * sample, 0) / data.length,
        );
        onLevel(Math.min(1, rms * 8));
      }
    };
    source.connect(node);
    node.connect(context.destination);
    timer = setTimeout(onLimit, MAX_STREAM_SECONDS * 1000);
    const rate = context.sampleRate;
    return {
      cancel,
      finish: async () => {
        if (finished) throw new DOMException("Cancelled", "AbortError");
        clearTimeout(timer);
        stopTracks();
        await new Promise<void>((resolve) => {
          const fallback = setTimeout(resolve, 200);
          flush = () => {
            clearTimeout(fallback);
            resolve();
          };
          node?.port.postMessage("stop");
        });
        signal.throwIfAborted();
        if (sampleCount > SPEECH_SAMPLE_RATE * MAX_SPEECH_SECONDS) {
          cancel();
          return null;
        }
        const samples = new Float32Array(
          chunks.reduce((size, chunk) => size + chunk.length, 0),
        );
        let offset = 0;
        for (const chunk of chunks) {
          samples.set(chunk, offset);
          offset += chunk.length;
        }
        const wav = encodeWav(samples, rate);
        cancel();
        if (samples.length < rate / 10)
          throw new Error("Hold a little longer and speak before releasing.");
        return wav;
      },
    };
  } catch (error) {
    cancel();
    throw error;
  }
}
