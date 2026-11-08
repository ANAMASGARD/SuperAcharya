import { Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import "./voice-preview.css";

type Phase = "idle" | "active" | "paused";

/** UI-only interaction preview. No microphone, audio, or network APIs. */
export default function VoicePreview({
  suspended = false,
}: {
  suspended?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const held = useRef<"keyboard" | number | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const pause = () =>
    setPhase((current) => (current === "active" ? "paused" : current));
  const close = () => {
    setPhase("idle");
    primary.current?.focus();
  };

  useEffect(() => {
    const releaseKey = (event: KeyboardEvent) => {
      if (event.code === "Space" && held.current === "keyboard") {
        held.current = null;
        pause();
      }
    };
    const releasePointer = (event: PointerEvent) => {
      if (held.current === event.pointerId) {
        held.current = null;
        pause();
      }
    };
    const blur = () => {
      held.current = null;
      pause();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhase("idle");
    };
    window.addEventListener("keyup", releaseKey);
    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keyup", releaseKey);
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (suspended) pause();
  }, [suspended]);

  const expanded = phase !== "idle";
  const status =
    phase === "active"
      ? "Voice preview"
      : phase === "paused"
        ? "Paused — hold to resume"
        : "Hold to preview";
  return (
    <div className="board-voice" data-phase={phase} hidden={suspended}>
      <span className="board-voice-label" role="status" aria-live="polite">
        {status}
      </span>
      <div className="board-voice-bar">
        <Button
          ref={primary}
          type="button"
          className="board-voice-primary"
          aria-label={
            phase === "paused"
              ? "Hold to resume voice preview"
              : "Hold to preview voice"
          }
          aria-pressed={phase === "active"}
          title="UI preview only · Hold Space while focused, or press and hold"
          onPointerDown={(event) => {
            if (
              suspended ||
              !event.isPrimary ||
              event.button !== 0 ||
              held.current !== null
            )
              return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            held.current = event.pointerId;
            setPhase("active");
          }}
          onLostPointerCapture={(event) => {
            if (held.current === event.pointerId) {
              held.current = null;
              pause();
            }
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.code === "Space") {
              event.preventDefault();
              event.stopPropagation();
              if (!event.repeat && held.current === null && !suspended) {
                held.current = "keyboard";
                setPhase("active");
              }
            } else if (event.key === "Enter") event.stopPropagation();
          }}
          onKeyUp={(event) => {
            if (event.code === "Space") {
              event.preventDefault();
              event.stopPropagation();
              if (held.current === "keyboard") {
                held.current = null;
                pause();
              }
            }
          }}
          onBlur={pause}
          onClick={(event) => {
            // Pointer holds already activate on down; only assistive/keyboard
            // clicks toggle. This also suppresses the click following release.
            if (event.detail === 0 && held.current === null && !suspended)
              setPhase((current) =>
                current === "active" ? "paused" : "active",
              );
          }}
        >
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
        </Button>
        {expanded && (
          <>
            <div className="board-voice-wave" aria-hidden="true">
              {[12, 22, 16, 30, 24, 36, 20, 28, 16, 24, 12].map(
                (height, index) => (
                  <span
                    key={index}
                    style={{ height, animationDelay: `${index * -85}ms` }}
                  />
                ),
              )}
            </div>
            <Button
              type="button"
              className={`board-voice-action ${phase === "active" ? "board-voice-pause" : "board-voice-play"}`}
              aria-label={
                phase === "active"
                  ? "Pause voice preview"
                  : "Resume voice preview"
              }
              onPointerDown={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter")
                  event.stopPropagation();
              }}
              onClick={() =>
                setPhase((current) =>
                  current === "active" ? "paused" : "active",
                )
              }
            >
              {phase === "active" ? (
                <Pause aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
            </Button>
            <Button
              type="button"
              className="board-voice-action board-voice-close"
              aria-label="Close voice preview"
              onClick={close}
            >
              <X aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
