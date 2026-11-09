import type { ModelMessage } from "ai";
import type { z } from "zod";

import type { teacherStreamEventSchema } from "../../../shared/teacher";
import type { CapturedQuestion } from "../../../shared/teacher-board";
import { listTeachingSteps, waitForTeachingStep } from "./board-operations";
import { teacherCheckpointer } from "./checkpoints";
import { teacherCredential, teacherSettings } from "./config";
import {
  buildTeachingGraph,
  openAITutor,
  understandBoard,
  prepareTeachingSteps,
} from "./graph";
import { fillLearningContext } from "./providers/clocked";
import { SarvamNarrator } from "./providers/sarvam";
import {
  getTeacherSession,
  isTeacherTurnActive,
  ownedTeacherTurn,
} from "./store";
import { applyLearningContext, publishTeachingStep } from "./tool";

type StreamEvent = z.infer<typeof teacherStreamEventSchema>;
export async function executeTeachingTurn(
  owner: string,
  turn: Awaited<ReturnType<typeof ownedTeacherTurn>>,
  signal: AbortSignal,
  emit: (event: StreamEvent) => void,
  capture?: CapturedQuestion,
) {
  const assertActive = async () => {
    signal.throwIfAborted();
    if (
      !(await isTeacherTurnActive(
        owner,
        turn.boardId,
        turn.id,
        turn.generation,
      ))
    )
      throw new Error("Teacher turn stopped.");
  };
  await assertActive();
  const checkpointer = await teacherCheckpointer();
  const key = await teacherCredential("OPENAI_API_KEY");
  if (!key)
    throw new Error(
      "Add an OpenAI API key in Settings or the server environment to ask Acharya.",
    );
  const session = await getTeacherSession(owner, turn.boardId);
  if (!session) throw new Error("Teacher conversation not found.");
  const identity = { turnId: turn.id, generation: turn.generation };
  const notice = (message: string) =>
    emit({ type: "teacher-notice", ...identity, message });
  let narrator: SarvamNarrator | undefined;
  let narration = Promise.resolve();
  let pendingText = "",
    sequence = 0,
    narrationFailed = false;
  const settings = teacherSettings();
  const narrate = (text: string) => {
    if (!narrator || narrationFailed || !text.trim()) return;
    const speaker = narrator;
    narration = narration.then(async () => {
      if (narrationFailed) return;
      await assertActive();
      try {
        const audio = await speaker.speak(text);
        await assertActive();
        emit({
          type: "teacher-audio",
          ...identity,
          sequence: sequence++,
          audio,
          mimeType: "audio/mpeg",
        });
      } catch {
        signal.throwIfAborted();
        narrationFailed = true;
        speaker.close();
        notice(
          "Teacher voice is unavailable. Your written reply is preserved.",
        );
      }
    });
    // Handle early cancellation before graph.invoke reaches the final await.
    void narration.catch(() => {});
  };
  const graph = buildTeachingGraph(checkpointer, {
    assertActive,
    orchestrate: async () => {
      let context = session.context;
      if (turn.extractContext) {
        const clockedKey = await teacherCredential("CLOCKED_API_KEY");
        const extraction = clockedKey
          ? await fillLearningContext({
              text: turn.input,
              requestId: turn.clockedRequestId,
              key: clockedKey,
              signal,
            })
          : {
              status: "unavailable" as const,
              message:
                "Clocked is not configured. Edit Learning preferences manually or retry after setup.",
            };
        await assertActive();
        if (extraction.status === "accepted") {
          const applied = await applyLearningContext(
            owner,
            {
              boardId: turn.boardId,
              expectedRevision: session.revision,
              patch: extraction.patch,
              turnId: turn.id,
              generation: turn.generation,
            },
            signal,
          );
          if (applied.status !== "completed")
            return {
              context,
              clarification:
                "Your learning preferences need confirmation. Please edit Learning preferences and send your question again.",
            };
          // Read the authorized write back; do not trust an opaque tool-output string.
          context =
            (await getTeacherSession(owner, turn.boardId))?.context ?? context;
          notice("Learning preferences updated from your explicit request.");
        } else if (extraction.status !== "unchanged") {
          return {
            context,
            clarification:
              extraction.message || "Please confirm your learning preferences.",
          };
        }
      }
      const voiceKey = await teacherCredential("SARVAM_API_KEY");
      if (voiceKey)
        narrator = new SarvamNarrator(
          voiceKey,
          settings.speaker,
          context.responseLanguage === "hi" ||
            context.responseLanguage === "hinglish"
            ? "hi-IN"
            : "en-IN",
          signal,
          settings.pace,
        );
      else
        notice(
          "Teacher voice is not configured. The written reply is available.",
        );
      return { context, clarification: "" };
    },
    ...(capture
      ? {
          understand: (input: string) =>
            capture.image || capture.text
              ? understandBoard({
                  key,
                  model: settings.model,
                  capture,
                  question: input,
                  signal,
                })
              : Promise.resolve({ input, clarification: "" }),
          teach: (input: string, context: typeof session.context) =>
            prepareTeachingSteps({
              key,
              model: settings.model,
              input,
              context,
              signal,
            }),
          drawStep: async (
            step: import("../../../shared/teacher-board").TeachingStep,
            stepSequence: number,
          ) => {
            await assertActive();
            const result = await publishTeachingStep(
              owner,
              {
                boardId: turn.boardId,
                turnId: turn.id,
                generation: turn.generation,
                sequence: stepSequence,
                step,
              },
              signal,
            );
            if (result.status !== "completed")
              throw new Error("Teaching step could not be authorized.");
            const operation = (
              await listTeachingSteps(owner, turn.boardId, turn.id)
            ).find((item) => item.sequence === stepSequence);
            if (!operation || operation.status !== "queued")
              throw new Error("Teaching step could not be queued.");
            let audio: string | null = null;
            if (narrator && !narrationFailed)
              try {
                audio = await narrator.speak(step.narration);
              } catch {
                signal.throwIfAborted();
                narrationFailed = true;
                narrator.close();
                notice(
                  "Teacher voice is unavailable. Written steps remain available.",
                );
              }
            await assertActive();
            const acknowledgement = waitForTeachingStep(
              owner,
              operation.id,
              signal,
            );
            emit({
              type: "teacher-board-op",
              ...identity,
              operationId: operation.id,
              audio,
            });
            await acknowledgement;
          },
        }
      : {}),
    tutor: (input, context) => {
      const history: ModelMessage[] = session.turns
        .filter((t) => t.status === "completed" && t.id !== turn.id)
        .slice(-8)
        .flatMap((t): ModelMessage[] => [
          { role: "user", content: t.input },
          { role: "assistant", content: t.response },
        ]);
      return openAITutor({
        key,
        model: settings.model,
        input,
        context,
        history,
        signal,
      });
    },
    emitText: (text) => {
      signal.throwIfAborted();
      emit({
        type: "message-delta",
        ...identity,
        messageId: `answer-${turn.id}`,
        delta: { type: "text", text },
      });
      if (capture) return;
      pendingText += text;
      // Complete short sentences, not individual tokens, go to speech synthesis.
      const boundary = pendingText.match(
        /^([\s\S]{30,450}?[.!?।](?:\s|$))/u,
      )?.[0];
      if (boundary) {
        narrate(boundary);
        pendingText = pendingText.slice(boundary.length);
      }
      if (pendingText.length > 500) {
        const cut = pendingText.lastIndexOf(" ", 450);
        const end = cut > 0 ? cut : 450;
        narrate(pendingText.slice(0, end));
        pendingText = pendingText.slice(end);
      }
    },
  });
  try {
    const result = await graph.invoke(
      {
        input: turn.input,
        context: session.context,
        clarification: "",
        response: "",
      },
      {
        configurable: { thread_id: `teacher:${turn.boardId}:${turn.id}` },
        signal,
        recursionLimit: 8,
      },
    );
    if (!result.response.trim())
      throw new Error(
        "The teacher returned an empty reply. Please try a new turn.",
      );
    narrate(pendingText);
    await narration;
    return result.response;
  } finally {
    narrator?.close();
  }
}
