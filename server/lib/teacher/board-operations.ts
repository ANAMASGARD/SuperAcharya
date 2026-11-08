import { fail } from "@agent-native/core/action";
import { isSameRecord } from "@agent-native/core/save-conflict";
import { defineMachine } from "@agent-native/core/state-machine";
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";

import {
  acknowledgeTeachingStepSchema,
  enqueueTeachingStepSchema,
  teachingOperationSchema,
} from "../../../shared/teacher-board";
import { getDb } from "../../db";
import {
  teacherLessons,
  teacherOperations,
  teacherTurns,
} from "../../db/schema";
import { getBoard, ownedBoard } from "../whiteboards";
import { visibleTurn } from "./store";

export const operationLifecycle = defineMachine({
  id: "teacher-board-operation",
  states: ["queued", "applied", "failed", "cancelled"],
  initial: "queued",
  terminal: ["applied", "failed", "cancelled"],
  transitions: {
    apply: { from: ["queued"], to: "applied" },
    fail: { from: ["queued"], to: "failed" },
    cancel: { from: ["queued"], to: "cancelled" },
  },
});
const waiting = new Map<string, (applied: boolean) => void>();
export function waitForTeachingStep(id: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const done = (applied: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      waiting.delete(id);
      applied
        ? resolve()
        : reject(new Error("Teaching step was not acknowledged."));
    };
    const abort = () => done(false);
    const timer = setTimeout(abort, 45_000);
    waiting.set(id, done);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function enqueueTeachingStep(
  owner: string,
  raw: z.infer<typeof enqueueTeachingStepSchema>,
) {
  const input = enqueueTeachingStepSchema.parse(raw);
  await ownedBoard(owner, input.boardId);
  return getDb().transaction(async (tx) => {
    const [lesson] = await tx
      .select()
      .from(teacherLessons)
      .where(
        and(
          eq(teacherLessons.boardId, input.boardId),
          eq(teacherLessons.ownerEmail, owner),
        ),
      )
      .for("update");
    const [turn] = await tx
      .select()
      .from(teacherTurns)
      .where(
        and(
          eq(teacherTurns.id, input.turnId),
          eq(teacherTurns.ownerEmail, owner),
        ),
      );
    if (
      !lesson ||
      !turn ||
      lesson.activeTurnId !== turn.id ||
      turn.boardId !== input.boardId ||
      turn.generation !== input.generation ||
      visibleTurn(turn).status !== "running" ||
      !turn.boardCapture
    )
      fail("This turn is not authorized to write teaching steps.", {
        statusCode: 409,
        errorCode: "turn_inactive",
      });
    const id = `${turn.id}-${input.sequence}`;
    const [existing] = await tx
      .select()
      .from(teacherOperations)
      .where(eq(teacherOperations.id, id));
    if (existing) {
      if (!isSameRecord(existing.step, input.step))
        fail("Teaching step payload changed.", {
          statusCode: 409,
          errorCode: "step_conflict",
        });
      return teachingOperationSchema.parse(existing);
    }
    const previous = await tx
      .select()
      .from(teacherOperations)
      .where(eq(teacherOperations.turnId, turn.id))
      .orderBy(asc(teacherOperations.sequence));
    if (
      previous.length !== input.sequence ||
      previous.some((step) => step.status !== "applied")
    )
      fail("Apply the previous step first.", {
        statusCode: 409,
        errorCode: "step_order",
      });
    const [created] = await tx
      .insert(teacherOperations)
      .values({
        ...input,
        id,
        ownerEmail: owner,
        tabId: turn.tabId,
        elementIds: [input.step.heading, ...input.step.lines].map(
          (_, index) => `teacher-${id}-${index}`,
        ),
        status: "queued",
      })
      .returning();
    return teachingOperationSchema.parse(created);
  });
}
export async function listTeachingSteps(
  owner: string,
  boardId: string,
  turnId: string,
) {
  await ownedBoard(owner, boardId);
  return (
    await getDb()
      .select()
      .from(teacherOperations)
      .where(
        and(
          eq(teacherOperations.boardId, boardId),
          eq(teacherOperations.turnId, turnId),
          eq(teacherOperations.ownerEmail, owner),
        ),
      )
      .orderBy(asc(teacherOperations.sequence))
  ).map((row) => teachingOperationSchema.parse(row));
}
export async function acknowledgeTeachingStep(
  owner: string,
  raw: z.infer<typeof acknowledgeTeachingStepSchema>,
) {
  const input = acknowledgeTeachingStepSchema.parse(raw);
  const board = await getBoard(owner, input.boardId);
  const operation = await getDb().transaction(async (tx) => {
    const [lesson] = await tx
      .select()
      .from(teacherLessons)
      .where(
        and(
          eq(teacherLessons.boardId, input.boardId),
          eq(teacherLessons.ownerEmail, owner),
        ),
      )
      .for("update");
    const [turn] = await tx
      .select()
      .from(teacherTurns)
      .where(
        and(
          eq(teacherTurns.id, input.turnId),
          eq(teacherTurns.ownerEmail, owner),
        ),
      );
    const [op] = await tx
      .select()
      .from(teacherOperations)
      .where(
        and(
          eq(teacherOperations.id, input.operationId),
          eq(teacherOperations.ownerEmail, owner),
          eq(teacherOperations.boardId, input.boardId),
        ),
      );
    if (
      !op ||
      !lesson ||
      !turn ||
      turn.boardId !== input.boardId ||
      turn.generation !== input.generation ||
      op.turnId !== turn.id ||
      op.generation !== input.generation ||
      op.tabId !== input.tabId
    )
      fail("Teaching step not found.", {
        statusCode: 404,
        errorCode: "not_found",
      });
    if (op.status === input.result) return teachingOperationSchema.parse(op);
    if (
      lesson.activeTurnId !== turn.id ||
      visibleTurn(turn).status !== "running" ||
      op.status !== "queued"
    )
      fail("Teaching step is no longer active.", {
        statusCode: 409,
        errorCode: "turn_inactive",
      });
    if (input.result === "applied") {
      const texts = [op.step.heading, ...op.step.lines];
      if (
        board.revision !== input.savedRevision ||
        !op.elementIds.every((id, index) =>
          board.scene.elements.some(
            (element) =>
              element.id === id &&
              !element.isDeleted &&
              element.type === "text" &&
              element.originalText === texts[index],
          ),
        )
      )
        fail(
          "Save and verify the actual drawing before acknowledging this step.",
          { statusCode: 409, errorCode: "step_not_saved" },
        );
    }
    const [saved] = await tx
      .update(teacherOperations)
      .set({
        status: operationLifecycle.transition(
          "queued",
          input.result === "applied" ? "apply" : "fail",
        ),
      })
      .where(eq(teacherOperations.id, op.id))
      .returning();
    return teachingOperationSchema.parse(saved);
  });
  waiting.get(operation.id)?.(operation.status === "applied");
  return operation;
}
