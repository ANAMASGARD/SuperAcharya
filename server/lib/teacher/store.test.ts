import {
  closeDbExec,
  getDbExec,
  withMigrationRuntime,
} from "@agent-native/core/db";
import {
  executeAgentToolCall,
  runWithRequestContext,
} from "@agent-native/core/server";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  startTeacherSchema,
  updateTeacherContextSchema,
} from "../../../shared/teacher";
import { boardMigrations } from "../../db/migrations";
import { createBoard } from "../whiteboards";
import { registerTeacherRun } from "./active";
import {
  admitTeacherTurn,
  attachTeacherTurn,
  ensureTeacherSession,
  finishTeacherTurn,
  getTeacherSession,
  updateTeacherContext,
} from "./store";
import { teacherTools } from "./tool";

const alice = "teacher-alice@example.test",
  bob = "teacher-bob@example.test";
beforeAll(async () => {
  await withMigrationRuntime(async () => {
    for (const migration of boardMigrations)
      if (typeof migration.sql === "string")
        for (const sql of migration.sql.split(";").filter((s) => s.trim()))
          await getDbExec().execute({ sql });
  });
});
afterAll(() => closeDbExec());
const create = async () =>
  (await createBoard(alice, nanoid(), "Teacher test")).id;
const question = (boardId: string, text = "Explain fractions") => ({
  boardId,
  requestId: nanoid(),
  text,
  tabId: "tab-a",
  extractContext: false,
});
describe("owned teaching turns", () => {
  it("reads without creating and rejects cross-user operations", async () => {
    const id = await create();
    expect(await getTeacherSession(alice, id)).toBeNull();
    await expect(ensureTeacherSession(bob, id)).rejects.toThrow("not found");
    expect((await ensureTeacherSession(alice, id)).revision).toBe(0);
    await expect(admitTeacherTurn(bob, question(id))).rejects.toThrow(
      "not found",
    );
    await expect(
      updateTeacherContext(bob, {
        boardId: id,
        expectedRevision: 0,
        patch: { topic: "fractions" },
      }),
    ).rejects.toThrow("not found");
  });
  it("reuses identical IDs, rejects changed payloads and competing tabs before attachment", async () => {
    const id = await create(),
      input = question(id);
    const first = await admitTeacherTurn(alice, input);
    expect(await admitTeacherTurn(alice, input)).toEqual(first);
    await expect(
      admitTeacherTurn(alice, { ...input, text: "Changed" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      admitTeacherTurn(alice, { ...question(id), tabId: "tab-b" }),
    ).rejects.toMatchObject({ errorCode: "teacher_busy" });
    await expect(
      attachTeacherTurn(alice, id, first.id, first.generation, "tab-b"),
    ).rejects.toMatchObject({ statusCode: 409 });
    await attachTeacherTurn(alice, id, first.id, first.generation, "tab-a");
    await expect(
      attachTeacherTurn(alice, id, first.id, first.generation, "tab-a"),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      finishTeacherTurn(bob, id, first.id, first.generation, "cancel"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it("cancels provider waits, frees the slot, and fences old completion and cleanup", async () => {
    const id = await create();
    const old = await admitTeacherTurn(alice, question(id));
    await attachTeacherTurn(alice, id, old.id, old.generation, "tab-a");
    const oldController = new AbortController();
    const releaseOld = registerTeacherRun(
      old.id,
      old.generation,
      oldController,
    );
    await finishTeacherTurn(alice, id, old.id, old.generation, "cancel");
    expect(oldController.signal.aborted).toBe(true);
    const next = await admitTeacherTurn(alice, question(id, "Give a hint"));
    await attachTeacherTurn(alice, id, next.id, next.generation, "tab-a");
    const nextController = new AbortController(),
      releaseNext = registerTeacherRun(
        next.id,
        next.generation,
        nextController,
      );
    releaseOld();
    expect(
      (
        await finishTeacherTurn(
          alice,
          id,
          old.id,
          old.generation,
          "complete",
          "STALE",
        )
      ).response,
    ).toBe("");
    await finishTeacherTurn(alice, id, old.id, old.generation, "cancel");
    expect(nextController.signal.aborted).toBe(false);
    await expect(admitTeacherTurn(alice, question(id))).rejects.toMatchObject({
      errorCode: "teacher_busy",
    });
    await finishTeacherTurn(
      alice,
      id,
      next.id,
      next.generation,
      "complete",
      "A preserved answer",
    );
    expect(
      (await getTeacherSession(alice, id))?.turns.slice(-1)[0]?.response,
    ).toBe("A preserved answer");
    releaseNext();
  });
  it("validates schemas and fences preference updates", async () => {
    expect(
      startTeacherSchema.safeParse({ ...question(nanoid()), text: " " })
        .success,
    ).toBe(false);
    expect(
      updateTeacherContextSchema.safeParse({
        boardId: nanoid(),
        expectedRevision: 0,
        patch: {},
        generation: nanoid(),
      }).success,
    ).toBe(false);
    const id = await create();
    await ensureTeacherSession(alice, id);
    await updateTeacherContext(alice, {
      boardId: id,
      expectedRevision: 0,
      patch: { learnerLevel: "Class 7", responseLanguage: "hi" },
    });
    const saved = await updateTeacherContext(alice, {
      boardId: id,
      expectedRevision: 1,
      patch: { topic: "fractions" },
    });
    expect(saved.context).toEqual({
      learnerLevel: "Class 7",
      responseLanguage: "hi",
      topic: "fractions",
    });
    await expect(
      updateTeacherContext(alice, {
        boardId: id,
        expectedRevision: 0,
        patch: { topic: "stale" },
      }),
    ).rejects.toMatchObject({ errorCode: "context_conflict" });
  });
  it("executes the same action through the installed authenticated agent-tool pipeline", async () => {
    const id = await create();
    await ensureTeacherSession(alice, id);
    const invoke = (owner: string, requireWriteApproval: boolean) =>
      runWithRequestContext({ userEmail: owner, orgScope: "personal" }, () =>
        executeAgentToolCall({
          actions: teacherTools,
          name: "update-teacher-context",
          input: {
            boardId: id,
            expectedRevision: 0,
            patch: { subject: "Math" },
          },
          callId: nanoid(),
          ownerEmail: owner,
          caller: "tool",
          requireWriteApproval,
        }),
      );
    expect((await invoke(bob, false)).status).toBe("failed");
    expect((await invoke(alice, true)).status).toBe("approval_required");
    expect((await getTeacherSession(alice, id))?.context).toEqual({});
    const result = await invoke(alice, false);
    expect(result.status, result.output).toBe("completed");
    expect((await getTeacherSession(alice, id))?.context.subject).toBe("Math");
  });
});
