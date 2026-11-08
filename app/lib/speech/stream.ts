import { appPath } from "@agent-native/core/client/api-path";
import { speechResultSchema, type SpeechResult } from "@shared/speech";
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
    let finishResolve: ((result: SpeechResult) => void) | undefined;
    let finishReject: ((error: Error) => void) | undefined;
    const cancel = () => {
      completed = true;
      clearTimeout(timer);
      clearTimeout(finalTimer);
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
            if (
              socket.readyState !== WebSocket.OPEN ||
              socket.bufferedAmount > 65536
            )
              throw new Error("Speech connection is too slow. Try again.");
            socket.send(new Uint8Array(pcm));
          },
          finish() {
            return new Promise((done, failed) => {
              if (failure) {
                failed(failure);
                return;
              }
              finishResolve = done;
              finishReject = failed;
              finalTimer = setTimeout(
                () =>
                  fail(
                    new Error(
                      "Final transcription timed out. Retry your clip.",
                    ),
                  ),
                12000,
              );
              socket.send('{"type":"commit"}');
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
