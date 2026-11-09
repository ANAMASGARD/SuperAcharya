import { getSession, runWithRequestContext } from "@agent-native/core/server";
import { createError, defineWebSocketHandler, getRouterParam } from "h3";
import WebSocket from "ws";
import { z } from "zod";

import {
  SPEECH_MODEL,
  MAX_STREAM_SECONDS,
  MAX_UTTERANCE_SECONDS,
} from "../../../../shared/speech";
import { boardIdSchema } from "../../../../shared/whiteboard";
import { gnaniKey } from "../../../lib/gnani-speech";
import { activeSpeechUsers as active } from "../../../lib/speech-slots";
import { ownedBoard } from "../../../lib/whiteboards";

const providerEvent = z.object({
  type: z.string(),
  text: z.string().max(20000).optional(),
  utterance_id: z.string().max(200).optional(),
  segment_id: z.string().max(200).optional(),
  segment_index: z.number().optional(),
  detected_language_code: z.string().max(32).optional(),
});
export default defineWebSocketHandler(async (event) => {
  const receivedAt = Date.now();
  const session = await getSession(event);
  if (!session?.email)
    throw createError({ statusCode: 401, message: "Sign in to use speech." });
  if (event.req.headers.get("origin") !== new URL(event.req.url).origin)
    throw createError({ statusCode: 403, message: "Invalid speech origin." });
  const owner = session.email.toLowerCase();
  const boardId = boardIdSchema.safeParse(getRouterParam(event, "boardId"));
  if (!boardId.success)
    throw createError({ statusCode: 400, message: "Invalid drawing ID." });
  const key = await runWithRequestContext(
    {
      userEmail: owner,
      orgScope: "personal",
      ...(session.authUserId ? { authUserId: session.authUserId } : {}),
    },
    async () => {
      await ownedBoard(owner, boardId.data);
      return gnaniKey();
    },
  );
  return createSpeechHooks(owner, key, receivedAt);
});

type SpeechPeer = {
  send: (message: string) => unknown;
  close: (code?: number, reason?: string) => unknown;
  context: Record<string, unknown>;
};
export function createSpeechHooks(
  owner: string,
  key: string,
  receivedAt = Date.now(),
) {
  let upstream: WebSocket | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  let frames: Uint8Array[] = [];
  let queuedBytes = 0;
  let blockedSince: number | undefined;
  let drain = () => {};
  let claimed = false,
    closed = false,
    ready = false,
    commitRequested = false,
    committed = false;
  let bytes = 0;
  const pending = new Set<string>();
  const segments = new Map<string, { text: string; index: number }>();
  let language: string | undefined;
  const result = () => ({
    transcript: [...segments.values()]
      .sort((a, b) => a.index - b.index)
      .map((s) => s.text)
      .join(" "),
    model: SPEECH_MODEL,
    detectedLanguage: language,
    truncated: false,
  });
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    clearTimeout(settle);
    clearTimeout(drainTimer);
    frames = [];
    queuedBytes = 0;
    if (claimed) active.delete(owner);
    if (upstream?.readyState === WebSocket.OPEN) upstream.close();
    else upstream?.terminate();
  };
  return {
    open(peer: SpeechPeer) {
      if (active.has(owner)) {
        peer.send(
          JSON.stringify({
            type: "error",
            message:
              "A speech session is already active. Close it in the other tab.",
          }),
        );
        peer.close();
        return;
      }
      claimed = true;
      active.add(owner);
      const fail = (message: string) => {
        if (!closed) peer.send(JSON.stringify({ type: "error", message }));
        cleanup();
        peer.close();
      };
      const complete = () => {
        if (closed) return;
        peer.send(JSON.stringify({ type: "done", result: result() }));
        cleanup();
        peer.close();
      };
      const settleResult = () => {
        clearTimeout(settle);
        if (committed && pending.size === 0)
          settle = setTimeout(complete, segments.size ? 250 : 1500);
      };
      drain = () => {
        clearTimeout(drainTimer);
        if (closed || !upstream || !ready) return;
        try {
          while (frames.length && upstream.bufferedAmount < 32768) {
            const frame = frames.shift()!;
            queuedBytes -= frame.byteLength;
            upstream.send(frame);
          }
          if (frames.length) {
            blockedSince ??= Date.now();
            if (Date.now() - blockedSince > 12000) {
              fail("Speech connection is too slow. Please try again.");
              return;
            }
            drainTimer = setTimeout(drain, 16);
          } else {
            blockedSince = undefined;
            if (commitRequested && !committed) {
              committed = true;
              upstream.send(JSON.stringify({ type: "commit" }));
              clearTimeout(timeout);
              timeout = setTimeout(
                () => fail("Final transcription timed out. Retry the clip."),
                10000,
              );
              settleResult();
            }
          }
        } catch {
          fail("Gnani speech disconnected. Please try again.");
        }
      };
      timeout = setTimeout(
        () => fail("Speech session timed out. Please try again."),
        (MAX_STREAM_SECONDS + 20) * 1000,
      );
      upstream = new WebSocket("wss://api.vachana.ai/stt/v3/stream", {
        headers: {
          "x-api-key-id": key,
          "x-model": SPEECH_MODEL,
          lang_code: "indic-auto",
          "x-format": "codemix",
          "x-sample-rate": "16000",
          "x-min-silence-ms": "300",
          "x-max-speech-s": String(MAX_UTTERANCE_SECONDS),
        },
        handshakeTimeout: 10000,
        maxPayload: 65536,
      });
      upstream.on("error", () =>
        fail(
          "Gnani realtime speech could not connect. Check your key and connection.",
        ),
      );
      upstream.on("close", () => {
        if (!closed) fail("Gnani speech disconnected. Please try again.");
      });
      upstream.on("message", (raw) => {
        if (closed) return;
        let input: unknown;
        try {
          input = JSON.parse(raw.toString());
        } catch {
          fail("Invalid speech response.");
          return;
        }
        const parsed = providerEvent.safeParse(input);
        if (!parsed.success) {
          fail("Invalid speech response.");
          return;
        }
        const message = parsed.data;
        if (message.type === "error") {
          fail(
            "Gnani could not process speech. Check STT access and try again.",
          );
          return;
        }
        if (message.type === "connected") {
          ready = true;
          peer.send(JSON.stringify({ type: "ready" }));
        }
        if (message.type === "speech_start") {
          pending.add(message.utterance_id ?? "speech");
          clearTimeout(settle);
        }
        if (message.type === "transcript") {
          pending.delete(message.utterance_id ?? "speech");
          segments.set(
            message.segment_id ?? message.utterance_id ?? String(segments.size),
            {
              text: message.text ?? "",
              index: message.segment_index ?? segments.size,
            },
          );
          if (result().transcript.length > 20000) {
            fail("Speech transcript exceeded its limit.");
            return;
          }
          language = message.detected_language_code;
          peer.send(JSON.stringify({ type: "transcript", result: result() }));
          settleResult();
        }
      });
      // No commit acknowledgement exists in this protocol. Allow late speech_start
      // frames to arrive before settling an otherwise completed/empty segment set.
      peer.context.commitSpeech = () => {
        if (!ready || commitRequested || closed) return;
        commitRequested = true;
        drain();
      };
    },
    message(
      peer: SpeechPeer,
      message: {
        rawData: unknown;
        text: () => string;
        uint8Array: () => Uint8Array;
      },
    ) {
      if (
        closed ||
        !ready ||
        !upstream ||
        upstream.readyState !== WebSocket.OPEN
      )
        return;
      if (typeof message.rawData === "string") {
        if (message.text() === '{"type":"commit"}') {
          const commit = peer.context.commitSpeech;
          if (typeof commit === "function") commit();
        } else {
          cleanup();
          peer.close(1008, "Invalid control frame");
        }
        return;
      }
      const pcm = message.uint8Array();
      bytes += pcm.length;
      if (
        commitRequested ||
        pcm.length !== 1024 ||
        bytes > 16000 * 2 * MAX_STREAM_SECONDS + 1024 ||
        // Capture starts with the request, while auth/provider setup runs.
        // Keep the original bounded rate budget for that legitimate backlog.
        bytes > ((Date.now() - receivedAt) / 1000 + 2) * 32000 ||
        queuedBytes + pcm.length > 32000 * 12
      ) {
        cleanup();
        peer.close(1008, "Invalid audio stream");
        return;
      }
      frames.push(new Uint8Array(pcm));
      queuedBytes += pcm.length;
      drain();
    },
    close() {
      cleanup();
    },
    error() {
      cleanup();
    },
  };
}
