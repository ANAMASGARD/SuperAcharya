// Authenticated BYO agent streaming protocol. CRUD remains in shared actions.
import { createHash } from "node:crypto";

import { isActionContractError } from "@agent-native/core/action";
import { getSession, runWithRequestContext } from "@agent-native/core/server";
import { assertBodySize, createError, defineEventHandler } from "h3";

import { teacherStreamRequestSchema } from "../../../shared/teacher";
import { registerTeacherRun } from "../../lib/teacher/active";
import { executeTeachingTurn } from "../../lib/teacher/execute";
import {
  attachTeacherTurn,
  finishTeacherTurn,
  ownedTeacherTurn,
  isTeacherTurnActive,
} from "../../lib/teacher/store";

export default defineEventHandler(async (event) => {
  const session = await getSession(event);
  if (!session?.email)
    throw createError({ statusCode: 401, message: "Sign in to ask Acharya." });
  if (event.req.headers.get("origin") !== new URL(event.req.url).origin)
    throw createError({
      statusCode: 403,
      message: "Invalid teacher request origin.",
    });
  await assertBodySize(event, 1_600_000);
  const parsed = teacherStreamRequestSchema.safeParse(await event.req.json());
  if (!parsed.success)
    throw createError({ statusCode: 400, message: "Invalid teacher request." });
  const input = parsed.data,
    owner = session.email.toLowerCase();
  return runWithRequestContext(
    {
      userEmail: owner,
      orgScope: "personal",
      ...(session.authUserId ? { authUserId: session.authUserId } : {}),
    },
    async () => {
      let turn;
      try {
        const admitted = await ownedTeacherTurn(
          owner,
          input.boardId,
          input.turnId,
        );
        if (Boolean(admitted.boardCapture) !== Boolean(input.capture))
          throw createError({
            statusCode: 409,
            message: "Board capture changed since admission.",
          });
        if (input.capture) {
          const { image, text, revision, selectedElementIds, fingerprint } =
            input.capture;
          const digest = createHash("sha256")
            .update(
              JSON.stringify({ image, text, revision, selectedElementIds }),
            )
            .digest("hex");
          if (
            digest !== fingerprint ||
            fingerprint !== admitted.boardCapture?.fingerprint
          )
            throw createError({
              statusCode: 409,
              message: "Board capture changed since admission.",
            });
          if (
            image &&
            !Buffer.from(image.slice("data:image/png;base64,".length), "base64")
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          )
            throw createError({
              statusCode: 400,
              message: "Invalid board capture image.",
            });
        }
        turn = await attachTeacherTurn(
          owner,
          input.boardId,
          input.turnId,
          input.generation,
          input.tabId,
        );
      } catch (error) {
        if (isActionContractError(error))
          throw createError({
            statusCode: error.statusCode,
            message: error.message,
          });
        throw error;
      }
      const controller = new AbortController();
      const disconnect = () => controller.abort();
      event.req.signal.addEventListener("abort", disconnect, { once: true });
      if (event.req.signal.aborted) disconnect();
      const release = registerTeacherRun(turn.id, turn.generation, controller);
      let monitorStopped = false;
      let monitorTimer: ReturnType<typeof setTimeout> | undefined;
      const monitor = async () => {
        try {
          const active = await isTeacherTurnActive(
            owner,
            turn.boardId,
            turn.id,
            turn.generation,
          );
          if (!monitorStopped && !active) controller.abort();
        } catch {
          if (!monitorStopped) controller.abort();
        }
        if (!monitorStopped && !controller.signal.aborted)
          monitorTimer = setTimeout(() => {
            void monitor();
          }, 1000);
      };
      monitorTimer = setTimeout(() => {
        void monitor();
      }, 1000);
      const timeout = setTimeout(
        () => controller.abort(new Error("Teacher turn timed out.")),
        270_000,
      );
      const identity = { turnId: turn.id, generation: turn.generation };
      const message = (text: string, status: "streaming" | "complete") => ({
        id: `answer-${turn.id}`,
        role: "assistant" as const,
        content: [{ type: "text" as const, text }],
        status,
      });
      let response = "",
        closed = false;
      const stream = new ReadableStream<Uint8Array>({
        async start(sink) {
          const send = (value: unknown) => {
            if (!closed && !controller.signal.aborted)
              sink.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`),
              );
          };
          try {
            send({
              type: "message-start",
              ...identity,
              message: message("", "streaming"),
            });
            response = await executeTeachingTurn(
              owner,
              turn,
              controller.signal,
              (value) => {
                if (value.type === "message-delta")
                  response += value.delta.text;
                send(value);
              },
              input.capture,
            );
            controller.signal.throwIfAborted();
            const saved = await finishTeacherTurn(
              owner,
              turn.boardId,
              turn.id,
              turn.generation,
              "complete",
              response,
            );
            if (saved.status === "completed") {
              send({
                type: "message-done",
                ...identity,
                message: message(saved.response, "complete"),
              });
              send({ type: "done", ...identity, reason: "complete" });
            }
          } catch (error) {
            const stopped = controller.signal.aborted;
            const safeError =
              error instanceof Error &&
              /^(Add an OpenAI|The teacher requires|Teacher checkpoint|OpenAI could not|The teacher returned)/.test(
                error.message,
              )
                ? error.message
                : "Teacher response interrupted. Your question is preserved; submit a new turn to continue.";
            send({ type: "error", ...identity, error: safeError });
            await finishTeacherTurn(
              owner,
              turn.boardId,
              turn.id,
              turn.generation,
              stopped ? "interrupt" : "fail",
              response,
              safeError,
            );
          } finally {
            clearTimeout(timeout);
            monitorStopped = true;
            clearTimeout(monitorTimer);
            release();
            event.req.signal.removeEventListener("abort", disconnect);
            if (!closed) {
              closed = true;
              sink.close();
            }
          }
        },
        cancel() {
          closed = true;
          controller.abort();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
          "X-Turn-Id": turn.id,
          "X-Run-Id": turn.generation,
        },
      });
    },
  );
});
