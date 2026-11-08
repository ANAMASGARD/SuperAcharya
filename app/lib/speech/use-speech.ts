import type { SpeechResult } from "@shared/speech";
import { useCallback, useEffect, useRef, useState } from "react";

import { startCapture, type Capture } from "./capture";
import { openSpeechStream, type SpeechStream } from "./stream";
import { transcribeClip } from "./transcribe";

export type SpeechPhase =
  | "idle"
  | "requesting"
  | "active"
  | "loading"
  | "paused"
  | "error";
export function useSpeech(boardId: string) {
  const [phase, setPhase] = useState<SpeechPhase>("idle");
  const phaseRef = useRef<SpeechPhase>("idle");
  const [result, setResult] = useState<SpeechResult | null>(null);
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const session = useRef<AbortController | null>(null);
  const capture = useRef<Capture | null>(null);
  const stream = useRef<SpeechStream | null>(null);
  const retryAudio = useRef<Blob | null>(null);
  const transition = useCallback((next: SpeechPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const cancel = useCallback(() => {
    session.current?.abort();
    session.current = null;
    stream.current?.cancel();
    stream.current = null;
    capture.current?.cancel();
    capture.current = null;
    retryAudio.current = null;
    setLevel(0);
    transition("idle");
    setError("");
    setResult(null);
  }, [transition]);
  const submit = useCallback(
    async (audio: Blob, controller: AbortController) => {
      retryAudio.current = audio;
      transition("loading");
      try {
        const transcript = await transcribeClip(
          boardId,
          audio,
          controller.signal,
        );
        if (session.current !== controller || controller.signal.aborted) return;
        setResult(transcript);
        retryAudio.current = null;
        transition("paused");
      } catch (err) {
        if (session.current !== controller || controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Could not transcribe speech.",
        );
        transition("error");
      }
    },
    [boardId, transition],
  );
  const pause = useCallback(async () => {
    if (phaseRef.current === "requesting") {
      cancel();
      return;
    }
    if (phaseRef.current !== "active" || !capture.current || !session.current)
      return;
    const controller = session.current;
    const current = capture.current;
    capture.current = null;
    transition("loading");
    setLevel(0);
    try {
      const audio = await current.finish();
      if (session.current === controller && !controller.signal.aborted) {
        retryAudio.current = audio;
        if (!stream.current)
          throw new Error("Speech connection lost. Retry the clip.");
        const transcript = await stream.current.finish();
        if (session.current !== controller || controller.signal.aborted) return;
        setResult(transcript);
        retryAudio.current = null;
        transition("paused");
      }
    } catch (err) {
      current.cancel();
      stream.current?.cancel();
      if (session.current !== controller || controller.signal.aborted) return;
      setError(
        err instanceof Error ? err.message : "Could not read microphone audio.",
      );
      transition("error");
    }
  }, [cancel, transition]);
  const start = useCallback(async () => {
    if (["active", "requesting", "loading"].includes(phaseRef.current)) return;
    session.current?.abort();
    const controller = new AbortController();
    session.current = controller;
    retryAudio.current = null;
    setError("");
    setResult(null);
    transition("requesting");
    try {
      const live = await openSpeechStream(
        boardId,
        controller.signal,
        (transcript) => {
          if (session.current === controller && !controller.signal.aborted)
            setResult(transcript);
        },
        (failure) => {
          if (session.current !== controller || controller.signal.aborted)
            return;
          capture.current?.cancel();
          capture.current = null;
          // Loading retains its WAV for explicit REST retry; the finish promise
          // rejects separately. Pending permission must never start a late mic.
          if (phaseRef.current === "requesting") controller.abort();
          setError(failure.message);
          transition("error");
        },
      );
      if (session.current !== controller || controller.signal.aborted) {
        live.cancel();
        return;
      }
      stream.current = live;
      const current = await startCapture(
        controller.signal,
        setLevel,
        () => {
          void pause();
        },
        (pcm) => {
          try {
            live.send(pcm);
          } catch (err) {
            capture.current?.cancel();
            capture.current = null;
            live.cancel();
            setError(
              err instanceof Error ? err.message : "Speech connection lost.",
            );
            transition("error");
          }
        },
      );
      if (session.current !== controller || controller.signal.aborted) {
        current.cancel();
        return;
      }
      capture.current = current;
      transition("active");
    } catch (err) {
      if (session.current !== controller || controller.signal.aborted) return;
      stream.current?.cancel();
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it in your browser and try again."
          : err instanceof Error
            ? err.message
            : "Could not open microphone.",
      );
      transition("error");
    }
  }, [boardId, pause, transition]);
  const retry = useCallback(() => {
    if (phaseRef.current !== "error" || !retryAudio.current) return;
    session.current?.abort();
    const controller = new AbortController();
    session.current = controller;
    setError("");
    void submit(retryAudio.current, controller);
  }, [submit]);
  useEffect(
    () => () => {
      session.current?.abort();
      stream.current?.cancel();
      capture.current?.cancel();
      retryAudio.current = null;
    },
    [boardId],
  );
  return {
    phase,
    result,
    error,
    level,
    start,
    pause,
    cancel,
    retry,
    canRetry: phase === "error" && !!retryAudio.current,
  };
}
