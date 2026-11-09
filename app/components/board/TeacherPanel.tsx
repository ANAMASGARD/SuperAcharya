import type { AgentRunHandle } from "@agent-native/agentkit/client";
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useAgentKitControl } from "@agent-native/toolkit/app/agentkit/react/context";
import { CoreAgentKitRoot } from "@agent-native/toolkit/app/chat/agentkit-chat/index";
import { teacherContextSchema } from "@shared/teacher";
import {
  TEACHER_WELCOME_PROMPT,
  TEACHER_WELCOME_TEXT,
  welcomeRequestId,
} from "@shared/teacher-welcome";
import { MessageCircle, Square, X, Volume2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FinalizedDictation } from "@/lib/speech/use-speech";
import { TeacherAudio } from "@/lib/teacher/audio";
import type { BrowserTeachingTools } from "@/lib/teacher/board";
import { createTeacherTransport } from "@/lib/teacher/runtime";

import "./teacher.css";
import VoicePreview from "./VoicePreview";

// This BYO runtime validates its own scoped providers in the authenticated stream.
// Native Chat's provider/engine readiness is a different execution path.
const teacherClientOptions = {
  aiSetupReadiness: "not-applicable" as const,
  reconnect: { attempts: 0 },
};

export default function TeacherPanel({
  boardId,
  suspended,
  boardTools,
}: {
  boardId: string;
  suspended: boolean;
  boardTools: BrowserTeachingTools;
}) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audio] = useState(() => new TeacherAudio(setAudioBlocked));
  const toolsRef = useRef(boardTools);
  toolsRef.current = boardTools;
  const [bridge] = useState(() =>
    createTeacherTransport(
      boardId,
      setNotice,
      audio,
      setBusy,
      () => toolsRef.current,
    ),
  );
  const lifecycle = useRef(0);
  useEffect(() => {
    const version = ++lifecycle.current;
    return () => {
      void bridge.stop().catch(() => {});
      // StrictMode/Fast Refresh can reconnect an effect to the same transport.
      queueMicrotask(() => {
        if (lifecycle.current === version) void bridge.transport.dispose();
      });
    };
  }, [bridge]);
  return (
    <CoreAgentKitRoot
      transport={bridge.transport}
      clientOptions={teacherClientOptions}
      threadId={`teacher:${boardId}`}
      load="auto"
    >
      <TeacherControls
        boardId={boardId}
        suspended={suspended}
        notice={notice}
        setNotice={setNotice}
        busy={busy}
        audio={audio}
        audioBlocked={audioBlocked}
        stop={bridge.stop}
      />
    </CoreAgentKitRoot>
  );
}
function TeacherControls({
  boardId,
  suspended,
  notice,
  setNotice,
  busy,
  audio,
  audioBlocked,
  stop,
}: {
  boardId: string;
  suspended: boolean;
  notice: string;
  setNotice: (value: string) => void;
  busy: boolean;
  audio: TeacherAudio;
  audioBlocked: boolean;
  stop: () => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [preferences, setPreferences] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const greetingStarted = useRef(false);
  const control = useAgentKitControl();
  const controlRef = useRef(control);
  controlRef.current = control;
  const handle = useRef<AgentRunHandle | null>(null);
  const submitted = useRef(new Set<string>());
  const submitting = useRef(false);
  const queuedDictation = useRef<FinalizedDictation | null>(null);
  const lastSubmission = useRef<FinalizedDictation | null>(null);
  const stopping = useRef(Promise.resolve());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; queuedDictation.current = null; };
  }, []);
  const interrupt = useCallback(() => {
    queuedDictation.current = null;
    const run = handle.current;
    handle.current = null;
    // stop() invalidates local events and audio synchronously, before its request.
    stopping.current = Promise.all([stop(), run?.cancel()])
      .then(() => {})
      .catch(() =>
        setNotice(
          "Stop could not be confirmed by the server. Local playback has stopped; retry Stop before sending.",
        ),
      );
  }, [stop, setNotice]);
  const submit = useCallback(
    function submitDictation(dictation: FinalizedDictation) {
      if (submitted.current.has(dictation.id)) return;
      if (submitting.current) {
        queuedDictation.current = dictation;
        return;
      }
      submitted.current.add(dictation.id);
      submitting.current = true;
      lastSubmission.current = dictation;
      setDraft("");
      setOpen(false);
      setWelcome(false);
      setNotice("");
      void (async () => {
        await stopping.current;
        if (!mounted.current) return;
        const run = await controlRef.current.sendMessage({
          text: dictation.text,
          queueWhileRunning: false,
          metadata: { teacherRequestId: dictation.id },
        });
        handle.current = run;
        await run.completed;
        if (handle.current === run) handle.current = null;
      })()
        .catch((error: unknown) => {
          submitted.current.delete(dictation.id);
          setDraft(dictation.text);
          setNotice(
            error instanceof Error
              ? error.message
              : "Could not ask Acharya. Your question is preserved.",
          );
        })
        .finally(() => {
          submitting.current = false;
          const queued = queuedDictation.current;
          queuedDictation.current = null;
          if (queued && mounted.current) submitDictation(queued);
        });
    },
    [setNotice],
  );
  useEffect(() => {
    if (suspended) interrupt();
  }, [suspended, interrupt]);
  useEffect(() => {
    if (suspended || greetingStarted.current) return;
    let cancelled = false;
    void (async () => {
      const lesson = await callAction(
        "get-teacher-session",
        { boardId },
        { method: "GET" },
      );
      if (
        cancelled ||
        greetingStarted.current ||
        submitting.current ||
        lesson?.turns.length
      )
        return;
      const requestId = await welcomeRequestId(boardId);
      if (cancelled || submitting.current) return;
      greetingStarted.current = true;
      setWelcome(true);
      const run = await controlRef.current.sendMessage({
        text: TEACHER_WELCOME_PROMPT,
        queueWhileRunning: false,
        metadata: { teacherRequestId: requestId, teacherWelcome: true },
      });
      handle.current = run;
      await run.completed;
      if (handle.current === run) handle.current = null;
    })().catch(() => {
      if (!cancelled)
        setNotice(
          "Acharya could not start the greeting. You can still ask a question.",
        );
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, suspended, setNotice]);

  return (
    <>
      <VoicePreview
        boardId={boardId}
        suspended={suspended}
        onFinalized={submit}
        onInterrupt={interrupt}
        teacherBusy={busy}
      />
      {!suspended && (welcome || busy || notice || audioBlocked) && (
        <aside className="board-teacher-feedback" aria-label="Teacher status">
          {welcome && <p>{TEACHER_WELCOME_TEXT}</p>}
          <p role="status">
            {notice ||
              (busy
                ? "Acharya is explaining…"
                : "Speak or write your question on the board.")}
          </p>
          {audioBlocked && (
            <Button onClick={() => void audio.play()}>
              <Volume2 aria-hidden="true" />
              Play teacher voice
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              interrupt();
              setWelcome(false);
              setNotice("");
            }}
          >
            <Square aria-hidden="true" />
            {busy ? "Stop" : "Dismiss"}
          </Button>
        </aside>
      )}
      <Button
        className="board-teacher-open"
        hidden={suspended || open}
        aria-label="Ask Acharya a question"
        onClick={() => setOpen(true)}
      >
        <MessageCircle aria-hidden="true" />
      </Button>
      <section
        className="board-teacher-panel"
        aria-label={t("teacher.title")}
        hidden={suspended || !open}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong>{t("teacher.title")}</strong>
          <span className="flex gap-2">
            <Button
              size="icon"
              variant="outline"
              aria-label={t("teacher.stop")}
              title={t("teacher.stop")}
              onClick={interrupt}
            >
              <Square aria-hidden="true" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label={t("teacher.close")}
              onClick={() => {
                interrupt();
                setOpen(false);
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </span>
        </header>
        <p className="board-teacher-status" role="status">
          {busy ? t("teacher.responding") : t("teacher.ready")}
        </p>
        {notice && (
          <p role="status" className="board-teacher-notice">
            {notice}
          </p>
        )}
        {audioBlocked && (
          <Button variant="outline" onClick={() => void audio.play()}>
            <Volume2 aria-hidden="true" />
            {t("teacher.play")}
          </Button>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            interrupt();
            const previous = lastSubmission.current;
            submit(
              previous?.text === draft.trim() &&
                !submitted.current.has(previous.id)
                ? previous
                : { id: nanoid(), text: draft.trim() },
            );
          }}
        >
          <label htmlFor="teacher-question">{t("teacher.question")}</label>
          <textarea
            id="teacher-question"
            value={draft}
            maxLength={12000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("teacher.placeholder")}
            rows={2}
          />
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              interrupt();
              submit({
                id: nanoid(),
                text: "Please explain the question I have written or selected on the whiteboard, one step at a time.",
              });
            }}
          >
            Explain my board
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!draft.trim() || busy}>
              {t("teacher.send")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreferences((value) => !value)}
              aria-expanded={preferences}
            >
              {t("teacher.preferences")}
            </Button>
          </div>
        </form>
        {preferences && (
          <LearningPreferences boardId={boardId} report={setNotice} />
        )}
      </section>
    </>
  );
}
function LearningPreferences({
  boardId,
  report,
}: {
  boardId: string;
  report: (text: string) => void;
}) {
  const t = useT();
  const query = useActionQuery("get-teacher-session", { boardId });
  const [saving, setSaving] = useState(false);
  return (
    <form
      key={query.data?.revision ?? "new"}
      className="board-teacher-preferences"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const patch = teacherContextSchema.parse(
          Object.fromEntries(
            Array.from(data.entries()).filter(([, value]) => value !== ""),
          ),
        );
        setSaving(true);
        void (async () => {
          const session =
            query.data ??
            (await callAction("ensure-teacher-session", { boardId }));
          if (!session) throw new Error("Could not open learning preferences.");
          await callAction("update-teacher-context", {
            boardId,
            expectedRevision: session.revision,
            patch,
          });
          await query.refetch();
          report(t("teacher.preferencesSaved"));
        })()
          .catch((error: unknown) =>
            report(
              error instanceof Error
                ? error.message
                : "Could not save preferences.",
            ),
          )
          .finally(() => setSaving(false));
      }}
    >
      {(["learnerLevel", "subject", "topic"] as const).map((name) => (
        <label key={name}>
          {t(`teacher.${name}`)}
          <Input
            name={name}
            defaultValue={query.data?.context[name] ?? ""}
            maxLength={name === "topic" ? 160 : 80}
          />
        </label>
      ))}
      <label>
        {t("teacher.language")}
        <select
          name="responseLanguage"
          defaultValue={query.data?.context.responseLanguage ?? ""}
        >
          <option value="">{t("teacher.unspecified")}</option>
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="hinglish">Hinglish</option>
        </select>
      </label>
      <label>
        {t("teacher.mode")}
        <select
          name="teachingMode"
          defaultValue={query.data?.context.teachingMode ?? ""}
        >
          <option value="">{t("teacher.unspecified")}</option>
          <option value="practice">{t("teacher.practice")}</option>
          <option value="student-question">
            {t("teacher.studentQuestion")}
          </option>
        </select>
      </label>
      <Button disabled={saving || query.isLoading}>
        {t("teacher.savePreferences")}
      </Button>
    </form>
  );
}
