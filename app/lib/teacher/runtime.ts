import type {
  AgentThreadSnapshot,
  AgentMessage,
} from "@agent-native/agentkit/protocol";
import {
  createHttpAgentChatRuntime,
  createAgentKitProtocolAdapter,
  type AgentChatRuntime,
} from "@agent-native/core/client/agent-chat";
import { callAction } from "@agent-native/core/client/hooks";
import {
  teacherStreamEventSchema,
  teacherTurnSchema,
  type TeacherTurn,
} from "@shared/teacher";
import type { CapturedQuestion } from "@shared/teacher-board";
import { nanoid } from "nanoid";

import { TAB_ID } from "@/lib/tab-id";

import { TeacherAudio } from "./audio";
import type { BrowserTeachingTools } from "./board";

export function needsLearningContext(text: string) {
  return /\b(class|grade|teach me in|explain in|speak in|hinglish|practice question|my subject|my topic|in Hindi|in English)\b|क्लास|कक्षा|हिंदी में|अंग्रेजी में|अभ्यास/i.test(
    text,
  );
}
export function createTeacherTransport(
  boardId: string,
  notice: (text: string) => void,
  audio: TeacherAudio,
  activeChanged: (active: boolean) => void,
  boardTools: () => BrowserTeachingTools | undefined = () => undefined,
) {
  let active: TeacherTurn | null = null;
  let pending: AbortController | null = null;
  let epoch = 0;
  const attached = new Map<string, TeacherTurn>();
  const captures = new Map<string, CapturedQuestion>();
  const applied = new Set<string>();
  let capture: CapturedQuestion | undefined;
  let stepFailure = "";
  const applyStep = async (
    operationId: string,
    encodedAudio: string | null,
    turn: TeacherTurn,
  ) => {
    const isActive = () =>
      active?.id === turn.id && active.generation === turn.generation;
    const tools = boardTools();
    if (!tools || !isActive() || applied.has(operationId)) return;
    applied.add(operationId);
    try {
      const operations = await callAction(
        "list-teaching-steps",
        { boardId, turnId: turn.id },
        { method: "GET" },
      );
      const operation = operations.find((item) => item.id === operationId);
      if (
        !operation ||
        operation.status !== "queued" ||
        operation.tabId !== TAB_ID ||
        operation.generation !== turn.generation
      )
        throw new Error("Teaching step is no longer available.");
      let savedRevision = await tools.apply(operation, isActive);
      if (!isActive()) return;
      if (
        encodedAudio &&
        !(await audio.playStep(turn.generation, encodedAudio))
      )
        throw new Error("Teacher playback stopped. Written work is preserved.");
      if (!isActive()) return;
      savedRevision = await tools.apply(operation, isActive);
      await callAction("ack-teaching-step", {
        boardId,
        turnId: turn.id,
        generation: turn.generation,
        operationId,
        tabId: TAB_ID,
        result: "applied",
        savedRevision,
      });
    } catch (error) {
      if (!isActive()) return;
      stepFailure = error instanceof Error ? error.message : "Could not apply the teaching step.";
      notice(stepFailure);
      await callAction("ack-teaching-step", {
        boardId,
        turnId: turn.id,
        generation: turn.generation,
        operationId,
        tabId: TAB_ID,
        result: "failed",
      }).catch(() => {});
    }
  };
  const base = createHttpAgentChatRuntime({
    id: "acharya-teacher",
    label: "Acharya",
    endpoint: "/api/teacher-stream",
    credentials: "same-origin",
    requestTurnId: ({ turnId }) => attached.get(turnId)?.id ?? turnId,
    beforeStartTurn: async ({ turn, turnId }) => {
      if (active)
        throw new Error(
          "Stop the current teacher turn before asking another question.",
        );
      const localEpoch = epoch;
      const text = turn.prompt?.trim() || "";
      const requestId =
        typeof turn.metadata?.teacherRequestId === "string"
          ? turn.metadata.teacherRequestId
          : nanoid();
      activeChanged(true);
      stepFailure = "";
      notice("");
      try {
        const tools = boardTools();
        capture =
          turn.metadata?.teacherWelcome === true
            ? undefined
            : (captures.get(requestId) ??
              (tools ? await tools.capture() : undefined));
        if (localEpoch !== epoch) throw new Error("Teacher turn stopped.");
        if (capture) {
          captures.set(requestId, capture);
          if (captures.size > 3) captures.delete(captures.keys().next().value!);
        }
        const metadata = capture
          ? {
              fingerprint: capture.fingerprint,
              revision: capture.revision,
              selectedElementIds: capture.selectedElementIds,
            }
          : undefined;
        const accepted = teacherTurnSchema.parse(
          await callAction("start-teacher-turn", {
            boardId,
            requestId,
            tabId: TAB_ID,
            text,
            extractContext: needsLearningContext(text),
            ...(metadata ? { boardCapture: metadata } : {}),
          }),
        );
        if (localEpoch !== epoch) {
          await callAction("cancel-teacher-turn", {
            boardId,
            turnId: accepted.id,
            generation: accepted.generation,
          });
          throw new Error("Teacher turn stopped.");
        }
        if (accepted.status !== "admitted")
          throw new Error(
            `This question is already ${accepted.status}. Reopen the conversation or send a revised question.`,
          );
        if (accepted.tabId !== TAB_ID)
          throw new Error("This question belongs to another tab.");
        active = accepted;
        attached.set(turnId, accepted);
        audio.begin(accepted.generation);
      } catch (error) {
        activeChanged(false);
        throw error;
      }
    },
    mapRequest: ({ turnId }) => {
      const value = attached.get(turnId);
      if (!value) throw new Error("Teacher turn was not admitted.");
      return {
        boardId,
        turnId: value.id,
        generation: value.generation,
        tabId: TAB_ID,
        ...(capture ? { capture } : {}),
      };
    },
    mapEvent: (raw) => {
      const event = teacherStreamEventSchema.parse(raw);
      if (
        !active ||
        event.turnId !== active.id ||
        event.generation !== active.generation
      )
        return null;
      if (event.type === "teacher-board-op") {
        void applyStep(event.operationId, event.audio, active);
        return null;
      }
      if (event.type === "teacher-audio") {
        audio.enqueue(event.generation, event.sequence, event.audio);
        return null;
      }
      if (event.type === "teacher-notice") {
        notice(event.message);
        return null;
      }
      if (event.type === "error") notice(stepFailure || event.error);
      return event;
    },
  });
  const stop = async () => {
    epoch++;
    const previous = active;
    active = null;
    pending?.abort();
    pending = null;
    audio.stop();
    activeChanged(false);
    if (previous)
      await callAction("cancel-teacher-turn", {
        boardId,
        turnId: previous.id,
        generation: previous.generation,
      });
  };
  const runtime: AgentChatRuntime = {
    ...base,
    createSession: async (input) => {
      const session = await base.createSession(input);
      return {
        ...session,
        startTurn: async (input) => {
          const controller = new AbortController();
          pending = controller;
          let turn;
          try {
            turn = await session.startTurn({
              ...input,
              abortSignal: input.abortSignal
                ? AbortSignal.any([input.abortSignal, controller.signal])
                : controller.signal,
            });
          } catch (error) {
            if (pending === controller) {
              pending = null;
              audio.stop();
              activeChanged(false);
            }
            // Preserve the admitted ID: an uncertain fetch must be reconciled, not reissued as new work.
            throw error;
          }
          const accepted = active;
          return {
            ...turn,
            cancel: async () => {
              await stop();
              return { status: "cancelled" as const };
            },
            events: (async function* () {
              let finished = false;
              try {
                for await (const event of turn.events) {
                  if (event.type === "done" || event.type === "error")
                    finished = true;
                  yield event;
                }
              } finally {
                if (active === accepted) {
                  active = null;
                  pending = null;
                  activeChanged(false);
                  if (!finished) {
                    audio.stop();
                    notice(
                      "The teacher connection ended. Your question is preserved. Retry checks its original ID.",
                    );
                  }
                }
                if (turn.id) attached.delete(turn.id);
              }
            })(),
          };
        },
        cancelTurn: async () => {
          await stop();
          return { status: "cancelled" as const };
        },
      };
    },
  };
  const transport = createAgentKitProtocolAdapter(runtime, {
    textFormat: "markdown",
    operations: {
      getThreadSnapshot: async (): Promise<AgentThreadSnapshot> => {
        const lesson = await callAction(
          "get-teacher-session",
          { boardId },
          { method: "GET" },
        );
        const messages = (lesson?.turns ?? []).flatMap(
          (turn): AgentMessage[] => [
            {
              id: turn.id,
              role: "user",
              parts: [{ type: "text", text: turn.input }],
              status: "complete",
              createdAt: turn.createdAt,
            },
            ...(turn.response || turn.error
              ? [
                  {
                    id: `answer-${turn.id}`,
                    role: "assistant" as const,
                    parts: [
                      {
                        type: "text" as const,
                        text:
                          turn.response +
                          (turn.error ? `\n\n${turn.error}` : ""),
                      },
                    ],
                    status:
                      turn.status === "completed"
                        ? ("complete" as const)
                        : ("error" as const),
                    createdAt: turn.createdAt,
                  },
                ]
              : []),
          ],
        );
        const now = new Date().toISOString();
        return {
          id: lesson?.threadId ?? `teacher:${boardId}`,
          title: "Acharya",
          createdAt: messages[0]?.createdAt || now,
          updatedAt: now,
          messages,
        };
      },
    },
  });
  return { transport, stop };
}
