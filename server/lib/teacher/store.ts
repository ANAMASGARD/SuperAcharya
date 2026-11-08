import { createHash, randomUUID } from "node:crypto";

import { fail } from "@agent-native/core/action";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import {
  teacherContextSchema,
  teacherSessionSchema,
  teacherTurnSchema,
  startTeacherSchema,
  updateTeacherContextSchema,
} from "../../../shared/teacher";
import { getDb } from "../../db";
import {
  teacherLessons,
  teacherTurns,
  teacherOperations,
} from "../../db/schema";
import { ownedBoard } from "../whiteboards";
import { abortTeacherRun, teacherProcessId } from "./active";
import { teacherLifecycle } from "./lifecycle";

type TurnRow = typeof teacherTurns.$inferSelect;
export function visibleTurn(row: TurnRow) {
  const status = teacherLifecycle.parseState(row.status);
  return teacherTurnSchema.parse({
    ...row,
    status:
      !teacherLifecycle.isTerminal(status) &&
      (row.processId !== teacherProcessId || row.expiresAt < Date.now())
        ? "interrupted"
        : status,
  });
}
export async function getTeacherSession(owner: string, boardId: string) {
  await ownedBoard(owner, boardId);
  const db = getDb();
  const [lesson] = await db
    .select()
    .from(teacherLessons)
    .where(
      and(
        eq(teacherLessons.boardId, boardId),
        eq(teacherLessons.ownerEmail, owner),
      ),
    );
  if (!lesson) return null;
  const turns = await db
    .select()
    .from(teacherTurns)
    .where(
      and(
        eq(teacherTurns.boardId, boardId),
        eq(teacherTurns.ownerEmail, owner),
      ),
    )
    .orderBy(desc(teacherTurns.createdAt))
    .limit(50);
  return teacherSessionSchema.parse({
    ...lesson,
    turns: turns.reverse().map(visibleTurn),
  });
}
export async function ensureTeacherSession(owner: string, boardId: string) {
  await ownedBoard(owner, boardId);
  await getDb()
    .insert(teacherLessons)
    .values({
      boardId,
      ownerEmail: owner,
      // This namespace is owned by the BYO runtime, not the generic chat store.
      threadId: `teacher:${boardId}`,
      context: {},
      revision: 0,
    })
    .onConflictDoNothing();
  const session = await getTeacherSession(owner, boardId);
  if (!session) throw new Error("Could not open the teacher conversation.");
  return session;
}
export async function ownedTeacherTurn(
  owner: string,
  boardId: string,
  id: string,
) {
  const [turn] = await getDb()
    .select()
    .from(teacherTurns)
    .where(
      and(
        eq(teacherTurns.id, id),
        eq(teacherTurns.boardId, boardId),
        eq(teacherTurns.ownerEmail, owner),
      ),
    );
  if (!turn)
    fail("Teacher turn not found.", {
      errorCode: "not_found",
      statusCode: 404,
    });
  return turn;
}
export async function admitTeacherTurn(
  owner: string,
  raw: z.infer<typeof startTeacherSchema>,
) {
  const input = startTeacherSchema.parse(raw);
  await ensureTeacherSession(owner, input.boardId);
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        text: input.text,
        extractContext: input.extractContext,
        boardCapture: input.boardCapture ?? null,
      }),
    )
    .digest("hex");
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
    if (!lesson) throw new Error("Teacher conversation not found.");
    const [existing] = await tx
      .select()
      .from(teacherTurns)
      .where(eq(teacherTurns.id, input.requestId));
    if (existing) {
      if (existing.ownerEmail !== owner || existing.boardId !== input.boardId)
        fail("Teacher turn not found.", {
          errorCode: "not_found",
          statusCode: 404,
        });
      if (existing.payloadHash !== payloadHash)
        fail("This turn ID was already used for different input.", {
          errorCode: "turn_conflict",
          statusCode: 409,
        });
      return visibleTurn(existing);
    }
    if (lesson.activeTurnId) {
      const [active] = await tx
        .select()
        .from(teacherTurns)
        .where(eq(teacherTurns.id, lesson.activeTurnId));
      if (
        active &&
        ["admitted", "running"].includes(active.status) &&
        active.expiresAt >= Date.now()
      )
        fail(
          "The teacher is already responding in this drawing. Stop that turn first.",
          { errorCode: "teacher_busy", statusCode: 409 },
        );
      if (
        active &&
        !teacherLifecycle.isTerminal(teacherLifecycle.parseState(active.status))
      ) {
        await tx
          .update(teacherTurns)
          .set({
            status: "interrupted",
            error: "The connection ended. Submit a new turn to continue.",
          })
          .where(eq(teacherTurns.id, active.id));
        abortTeacherRun(active.id, active.generation);
      }
    }
    const [created] = await tx
      .insert(teacherTurns)
      .values({
        id: input.requestId,
        boardId: input.boardId,
        ownerEmail: owner,
        generation: nanoid(),
        tabId: input.tabId,
        input: input.text,
        payloadHash,
        extractContext: Number(input.extractContext),
        clockedRequestId: randomUUID(),
        boardCapture: input.boardCapture ?? null,
        status: "admitted",
        processId: teacherProcessId,
        expiresAt: Date.now() + 30_000,
        createdAt: new Date().toISOString(),
      })
      .returning();
    if (!created) throw new Error("Teacher turn could not be admitted.");
    await tx
      .update(teacherLessons)
      .set({ activeTurnId: created.id })
      .where(eq(teacherLessons.boardId, input.boardId));
    return visibleTurn(created);
  });
}
export async function attachTeacherTurn(
  owner: string,
  boardId: string,
  turnId: string,
  generation: string,
  tabId: string,
) {
  return getDb().transaction(async (tx) => {
    const [lesson] = await tx
      .select()
      .from(teacherLessons)
      .where(
        and(
          eq(teacherLessons.boardId, boardId),
          eq(teacherLessons.ownerEmail, owner),
        ),
      )
      .for("update");
    const [turn] = await tx
      .select()
      .from(teacherTurns)
      .where(
        and(
          eq(teacherTurns.id, turnId),
          eq(teacherTurns.ownerEmail, owner),
          eq(teacherTurns.boardId, boardId),
        ),
      );
    if (!lesson || !turn)
      fail("Teacher turn not found.", {
        statusCode: 404,
        errorCode: "not_found",
      });
    if (
      lesson.activeTurnId !== turnId ||
      turn.generation !== generation ||
      turn.tabId !== tabId ||
      visibleTurn(turn).status !== "admitted"
    )
      fail("This turn is already attached or no longer active.", {
        statusCode: 409,
        errorCode: "turn_inactive",
      });
    const [attached] = await tx
      .update(teacherTurns)
      .set({
        status: teacherLifecycle.transition("admitted", "attach"),
        expiresAt: Date.now() + 120_000,
      })
      .where(
        and(eq(teacherTurns.id, turnId), eq(teacherTurns.status, "admitted")),
      )
      .returning();
    if (!attached) throw new Error("Teacher turn attachment lost a race.");
    return attached;
  });
}
export async function isTeacherTurnActive(
  owner: string,
  boardId: string,
  turnId: string,
  generation: string,
) {
  const turn = await ownedTeacherTurn(owner, boardId, turnId);
  return (
    turn.generation === generation && visibleTurn(turn).status === "running"
  );
}
export async function finishTeacherTurn(
  owner: string,
  boardId: string,
  turnId: string,
  generation: string,
  event: "complete" | "cancel" | "fail" | "interrupt",
  response = "",
  error: string | null = null,
) {
  return getDb().transaction(async (tx) => {
    const [lesson] = await tx
      .select()
      .from(teacherLessons)
      .where(
        and(
          eq(teacherLessons.boardId, boardId),
          eq(teacherLessons.ownerEmail, owner),
        ),
      )
      .for("update");
    const [turn] = await tx
      .select()
      .from(teacherTurns)
      .where(
        and(
          eq(teacherTurns.id, turnId),
          eq(teacherTurns.boardId, boardId),
          eq(teacherTurns.ownerEmail, owner),
        ),
      );
    if (!lesson || !turn)
      fail("Teacher turn not found.", {
        statusCode: 404,
        errorCode: "not_found",
      });
    if (turn.generation !== generation)
      fail("Teacher generation does not match.", {
        statusCode: 409,
        errorCode: "turn_conflict",
      });
    const state = teacherLifecycle.parseState(turn.status);
    if (!teacherLifecycle.can(state, event)) return visibleTurn(turn);
    if (
      event === "complete" &&
      (lesson.activeTurnId !== turnId || visibleTurn(turn).status !== "running")
    )
      fail("Teacher turn is no longer active.", {
        statusCode: 409,
        errorCode: "turn_inactive",
      });
    const [saved] = await tx
      .update(teacherTurns)
      .set({
        status: teacherLifecycle.transition(state, event),
        response,
        error,
      })
      .where(and(eq(teacherTurns.id, turnId), eq(teacherTurns.status, state)))
      .returning();
    if (lesson.activeTurnId === turnId)
      await tx
        .update(teacherLessons)
        .set({ activeTurnId: null })
        .where(
          and(
            eq(teacherLessons.boardId, boardId),
            eq(teacherLessons.activeTurnId, turnId),
          ),
        );
    if (event !== "complete") {
      await tx
        .update(teacherOperations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(teacherOperations.turnId, turnId),
            eq(teacherOperations.generation, generation),
            eq(teacherOperations.status, "queued"),
          ),
        );
      abortTeacherRun(turnId, generation);
    }
    return visibleTurn(saved ?? turn);
  });
}
export async function updateTeacherContext(
  owner: string,
  raw: z.infer<typeof updateTeacherContextSchema>,
) {
  const input = updateTeacherContextSchema.parse(raw);
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
    if (!lesson)
      fail("Open the teacher conversation first.", {
        statusCode: 404,
        errorCode: "not_found",
      });
    if (lesson.revision !== input.expectedRevision)
      fail("Learning preferences changed. Reload them before saving.", {
        statusCode: 409,
        errorCode: "context_conflict",
      });
    if (input.turnId) {
      const [turn] = await tx
        .select()
        .from(teacherTurns)
        .where(eq(teacherTurns.id, input.turnId));
      if (
        lesson.activeTurnId !== input.turnId ||
        !turn ||
        turn.generation !== input.generation ||
        visibleTurn(turn).status !== "running"
      )
        fail("Teacher turn is no longer active.", {
          statusCode: 409,
          errorCode: "turn_inactive",
        });
    }
    const context = teacherContextSchema.parse({
      ...lesson.context,
      ...input.patch,
    });
    const [saved] = await tx
      .update(teacherLessons)
      .set({ context, revision: lesson.revision + 1 })
      .where(
        and(
          eq(teacherLessons.boardId, input.boardId),
          eq(teacherLessons.revision, input.expectedRevision),
        ),
      )
      .returning();
    if (!saved) throw new Error("Learning preferences could not be saved.");
    return { context: saved.context, revision: saved.revision };
  });
}
