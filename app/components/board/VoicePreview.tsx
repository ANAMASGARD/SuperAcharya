import { useT } from "@agent-native/core/client/i18n";
import { ArrowUp, Pause, Play, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import enUS from "@/i18n/en-US";
import { useSpeech } from "@/lib/speech/use-speech";

import "./voice-preview.css";

/** Microphone clips are transcribed on release; the tutor handoff is deferred. */
export default function VoicePreview({
  boardId,
  suspended = false,
}: {
  boardId: string;
  suspended?: boolean;
}) {
  const t = useT();
  const label = (key: keyof typeof enUS.speech) =>
    t(`speech.${key}`, { defaultValue: enUS.speech[key] });
  const { phase, result, error, level, start, pause, cancel, retry, canRetry } =
    useSpeech(boardId);
  const held = useRef<"keyboard" | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const transcriptPanel = useRef<HTMLElement>(null);
  const followTranscript = useRef(true);
  useEffect(() => {
    if (phase === "idle") followTranscript.current = true;
    const panel = transcriptPanel.current;
    if (panel && followTranscript.current) panel.scrollTop = panel.scrollHeight;
  }, [result?.transcript, phase]);
  const close = () => {
    cancel();
    primary.current?.focus();
  };
  const busy = phase === "loading" || phase === "requesting";

  useEffect(() => {
    // Capture before Excalidraw's document handlers turn Space into panning.
    const pressKey = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        suspended
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
        )
      )
        return;
      if (
        (target !== primary.current || phase !== "idle") &&
        target?.closest(
          'button, a, [role="button"], [role="menuitem"], [role="slider"]',
        )
      )
        return;
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], .excalidraw .dropdown-menu',
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (
        !event.repeat &&
        held.current === null &&
        !busy &&
        phase !== "active"
      ) {
        held.current = "keyboard";
        void start();
      }
    };
    const releaseKey = (event: KeyboardEvent) => {
      if (event.code === "Space" && held.current === "keyboard") {
        event.preventDefault();
        event.stopImmediatePropagation();
        held.current = null;
        void pause();
      }
    };
    const blur = () => {
      held.current = null;
      cancel();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", pressKey, true);
    window.addEventListener("keyup", releaseKey, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", pressKey, true);
      window.removeEventListener("keyup", releaseKey, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", escape);
    };
  }, [pause, cancel, start, busy, phase, suspended]);
  useEffect(() => {
    if (suspended) cancel();
  }, [suspended, cancel]);

  const expanded = phase !== "idle";
  const status =
    phase === "active"
      ? label("listening")
      : phase === "requesting"
        ? label("opening")
        : phase === "loading"
          ? label("loading")
          : phase === "paused"
            ? label("again")
            : phase === "error"
              ? label("error")
              : label("idle");
  return (
    <div
      className="board-voice"
      data-phase={phase}
      hidden={suspended}
      aria-busy={busy}
    >
      <span className="board-voice-label" role="status" aria-live="polite">
        {status}
      </span>
      <div className="board-voice-bar">
        {busy && (
          <svg className="board-voice-loading-border" aria-hidden="true">
            <rect x="2" y="2" rx="26" pathLength="100" />
          </svg>
        )}
        <Button
          ref={primary}
          type="button"
          className={
            expanded
              ? "board-voice-action board-voice-close"
              : "board-voice-primary"
          }
          aria-label={label(expanded ? "close" : "hold")}
          aria-pressed={phase === "active"}
          aria-disabled={expanded ? undefined : busy}
          title={label(expanded ? "close" : "hint")}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.stopPropagation();
          }}
          onClick={() => {
            if (expanded) {
              close();
              return;
            }
            if (held.current === null && !suspended && !busy) void start();
          }}
        >
          {expanded ? (
            <X aria-hidden="true" />
          ) : (
            <span className="board-voice-emblem" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M8 9v6M12 6v12M16 10v4" />
              </svg>
            </span>
          )}
        </Button>
        {expanded && (
          <>
            <div className="board-voice-wave" aria-hidden="true">
              {[12, 22, 16, 30, 24, 36, 20, 28, 16, 24, 12].map(
                (height, index) => (
                  <span
                    key={index}
                    style={{
                      height:
                        phase === "active"
                          ? Math.max(4, height * level)
                          : height * 0.4,
                    }}
                  />
                ),
              )}
            </div>
            <Button
              type="button"
              className={`board-voice-action ${phase === "active" ? "board-voice-pause" : "board-voice-play"}`}
              aria-label={phase === "active" ? label("pause") : label("start")}
              onPointerDown={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter")
                  event.stopPropagation();
              }}
              disabled={busy}
              onClick={() => {
                void (phase === "active" ? pause() : start());
              }}
            >
              {phase === "active" ? (
                <Pause aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
            </Button>
            <span title={label("sendUnavailable")}>
              <Button
                type="button"
                className="board-voice-action board-voice-send"
                aria-label={label("send")}
                aria-describedby="speech-send-unavailable"
                disabled
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <span id="speech-send-unavailable" className="sr-only">
                {label("sendUnavailable")}
              </span>
            </span>
          </>
        )}
      </div>
      {(result || error) && (
        <section
          className="board-voice-result"
          ref={transcriptPanel}
          onScroll={(event) => {
            const panel = event.currentTarget;
            followTranscript.current =
              panel.scrollHeight - panel.scrollTop - panel.clientHeight < 32;
          }}
          aria-label={label("transcript")}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {error && <p role="alert">{error}</p>}
          {result && (
            <>
              <p>{result?.transcript || label("empty")}</p>
              {result?.truncated && <p role="alert">{label("truncated")}</p>}
              {result?.transcript && (
                <small>{label(phase === "active" ? "live" : "ready")}</small>
              )}
            </>
          )}
          {canRetry && (
            <Button type="button" className="board-voice-retry" onClick={retry}>
              {label("retry")}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
