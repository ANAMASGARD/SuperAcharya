import { appPath } from "@agent-native/core/client/api-path";
import {
  SPEECH_SAMPLE_RATE,
  speechResultSchema,
  type SpeechResult,
} from "@shared/speech";
import { z } from "zod";
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("error"), message: z.string().max(300) }),
  z.object({
    type: z.enum(["transcript", "done"]),
    result: speechResultSchema,
  }),
]);
export type SpeechStream = {
  send: (pcm: Uint8Array) => void;
  finish: () => Promise<SpeechResult>;
  cancel: () => void;
};
// Match the connection timeout: bounded, memory-only PCM, never idle audio.
const MAX_PENDING_BYTES = SPEECH_SAMPLE_RATE * 2 * 12;

export function bufferSpeechUntilReady(
  pending: Promise<SpeechStream>,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
): SpeechStream {
  let live: SpeechStream | undefined;
  let frames: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  let closed = false;
  let failure: Error | undefined;
  const cancel = () => {
    closed = true;
    frames = [];
    bytes = 0;
    live?.cancel();
    signal.removeEventListener("abort", cancel);
  };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const ready = pending.then((connection) => {
    if (closed) {
      connection.cancel();
      throw new DOMException("Cancelled", "AbortError");
    }
    live = connection;
    for (const frame of frames) connection.send(frame);
    frames = [];
    bytes = 0;
    return connection;
  });
  // Handle rejection even when the student has not released yet.
  void ready.catch((error: unknown) => {
    if (closed) return;
    failure =
      error instanceof Error ? error : new Error("Speech connection failed.");
    cancel();
    onFailure(failure);
  });
  return {
    cancel,
    send(pcm) {
      if (failure) throw failure;
      if (closed) throw new DOMException("Cancelled", "AbortError");
      if (live) {
        live.send(pcm);
        return;
      }
      if (bytes + pcm.byteLength > MAX_PENDING_BYTES)
        throw new Error(
          "Speech connection is taking too long. Please try again.",
        );
      frames.push(new Uint8Array(pcm));
      bytes += pcm.byteLength;
    },
    async finish() {
      const connection = await ready;
      if (closed) throw failure ?? new DOMException("Cancelled", "AbortError");
      try {
        return await connection.finish();
      } finally {
        cancel();
      }
    },
  };
}

export function openSpeechStream(
  boardId: string,
  signal: AbortSignal,
  onTranscript: (result: SpeechResult) => void,
  onFailure?: (error: Error) => void,
): Promise<SpeechStream> {
  return new Promise((resolve, reject) => {
    const url = new URL(
      appPath(`/api/whiteboard-speech-stream/${encodeURIComponent(boardId)}`),
      window.location.href,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    let completed = false,
      failure: Error | undefined;
    let finalTimer: ReturnType<typeof setTimeout> | undefined;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    let frames: Uint8Array<ArrayBuffer>[] = [];
    let queuedBytes = 0;
    let committing = false;
    let drainStarted = 0;
    let finishResolve: ((result: SpeechResult) => void) | undefined;
    let finishReject: ((error: Error) => void) | undefined;
    const cancel = () => {
      completed = true;
      const cancelled = new DOMException("Cancelled", "AbortError");
      reject(cancelled);
      finishReject?.(cancelled);
      clearTimeout(timer);
      clearTimeout(finalTimer);
      clearTimeout(drainTimer);
      frames = [];
      queuedBytes = 0;
      socket.close();
      signal.removeEventListener("abort", abort);
    };
    const fail = (error: Error) => {
      if (completed) return;
      failure = error;
      reject(error);
      finishReject?.(error);
      cancel();
      onFailure?.(error);
    };
    const abort = () => fail(new DOMException("Cancelled", "AbortError"));
    const drain = () => {
      clearTimeout(drainTimer);
      if (completed) return;
      try {
        if (socket.readyState !== WebSocket.OPEN)
          throw new Error("Speech connection lost. Retry your clip.");
        while (frames.length && socket.bufferedAmount < 32768) {
          const frame = frames.shift()!;
          queuedBytes -= frame.byteLength;
          socket.send(frame);
        }
        if (frames.length) {
          if (!drainStarted) drainStarted = Date.now();
          if (Date.now() - drainStarted > 12000)
            throw new Error("Speech connection is too slow. Try again.");
          drainTimer = setTimeout(drain, 16);
        } else {
          drainStarted = 0;
          if (committing) {
            committing = false;
            finalTimer = setTimeout(
              () =>
                fail(
                  new Error("Final transcription timed out. Retry your clip."),
                ),
              12000,
            );
            // WebSocket preserves order, including any frames in its own buffer.
            socket.send('{"type":"commit"}');
          }
        }
      } catch (error) {
        fail(
          error instanceof Error ? error : new Error("Speech connection lost."),
        );
      }
    };
    const timer = setTimeout(
      () =>
        fail(
          new Error(
            "Realtime speech connection timed out. Check your connection and Gnani key.",
          ),
        ),
      12000,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    socket.onerror = () =>
      fail(
        new Error(
          "Realtime speech unavailable. Check GNANI_API_KEY and restart the server.",
        ),
      );
    socket.onclose = () => {
      if (!completed)
        fail(new Error("Speech connection lost. Retry your clip."));
    };
    socket.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (completed) return;
      let parsed: ReturnType<typeof eventSchema.safeParse>;
      try {
        parsed = eventSchema.safeParse(JSON.parse(String(data)));
      } catch {
        fail(new Error("Invalid speech response."));
        return;
      }
      if (!parsed.success) {
        fail(new Error("Invalid speech response."));
        return;
      }
      const event = parsed.data;
      if (event.type === "error") {
        fail(new Error(event.message));
        return;
      }
      if (event.type === "ready") {
        clearTimeout(timer);
        resolve({
          cancel,
          send(pcm) {
            if (failure) throw failure;
            if (completed || finishResolve)
              throw new Error("Speech session has ended.");
            if (queuedBytes + pcm.byteLength > MAX_PENDING_BYTES)
              throw new Error("Speech connection is too slow. Try again.");
            frames.push(new Uint8Array(pcm));
            queuedBytes += pcm.byteLength;
            drain();
            if (failure) throw failure;
          },
          finish() {
            return new Promise((done, failed) => {
              if (failure) {
                failed(failure);
                return;
              }
              if (completed || finishResolve) {
                failed(new Error("Speech session has already ended."));
                return;
              }
              finishResolve = done;
              finishReject = failed;
              committing = true;
              drain();
            });
          },
        });
      } else {
        onTranscript(event.result);
        if (event.type === "done") {
          finishResolve?.(event.result);
          cancel();
        }
      }
    };
  });
}
