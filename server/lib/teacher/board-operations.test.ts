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
import { beforeAll, afterAll, expect, it } from "vitest";

import { boardMigrations } from "../../db/migrations";
import { createBoard, getBoard, saveBoard } from "../whiteboards";
import {
  acknowledgeTeachingStep,
  enqueueTeachingStep,
  listTeachingSteps,
  waitForTeachingStep,
} from "./board-operations";
import {
  admitTeacherTurn,
  attachTeacherTurn,
  finishTeacherTurn,
} from "./store";
import { teacherTools } from "./tool";

const owner = "board-teacher@example.test";
const step = {
  heading: "A synthetic step",
  lines: ["x + 1 = 2", "x = 1"],
  narration: "Subtract one from both sides.",
};
beforeAll(async () =>
  withMigrationRuntime(async () => {
    for (const migration of boardMigrations)
      if (typeof migration.sql === "string")
        for (const sql of migration.sql.split(";").filter((s) => s.trim()))
          await getDbExec().execute({ sql });
  }),
);
afterAll(() => closeDbExec());
async function setup() {
  const board = await createBoard(
    owner,
    nanoid(),
    "Synthetic board operation test",
  );
  const turn = await admitTeacherTurn(owner, {
    boardId: board.id,
    requestId: nanoid(),
    text: "Explain",
    tabId: "tab-a",
    extractContext: false,
    boardCapture: {
      fingerprint: "a".repeat(64),
      revision: board.revision,
      selectedElementIds: [],
    },
  });
  await attachTeacherTurn(owner, board.id, turn.id, turn.generation, "tab-a");
  return {
    board,
    turn,
    input: {
      boardId: board.id,
      turnId: turn.id,
      generation: turn.generation,
      sequence: 0,
      step,
    },
  };
}
it("uses authenticated agent actions, rejects another owner, and does not confuse queued with applied", async () => {
  const { input, turn, board } = await setup();
  const invoke = (email: string) =>
    runWithRequestContext({ userEmail: email, orgScope: "personal" }, () =>
      executeAgentToolCall({
        actions: teacherTools,
        name: "enqueue-teaching-step",
        input,
        ownerEmail: email,
        caller: "tool",
        callId: nanoid(),
        requireWriteApproval: false,
      }),
    );
  expect((await invoke("other@example.test")).status).toBe("failed");
  expect((await invoke(owner)).status).toBe("completed");
  const op = await enqueueTeachingStep(owner, input);
  expect(op.status).toBe("queued");
  expect(await enqueueTeachingStep(owner, input)).toEqual(op);
  await expect(
    enqueueTeachingStep(owner, {
      ...input,
      step: { ...step, heading: "Changed" },
    }),
  ).rejects.toMatchObject({ errorCode: "step_conflict" });
  await expect(
    enqueueTeachingStep(owner, { ...input, sequence: 1 }),
  ).rejects.toMatchObject({ errorCode: "step_order" });
  const ack = {
    boardId: board.id,
    turnId: turn.id,
    generation: turn.generation,
    operationId: op.id,
    tabId: "tab-a",
    result: "applied" as const,
    savedRevision: board.revision,
  };
  await expect(acknowledgeTeachingStep(owner, ack)).rejects.toMatchObject({
    errorCode: "step_not_saved",
  });
  await expect(
    acknowledgeTeachingStep(owner, { ...ack, tabId: "tab-b" }),
  ).rejects.toMatchObject({ statusCode: 404 });
  const saved = await saveBoard(owner, {
    id: board.id,
    title: board.title,
    expectedRevision: board.revision,
    scene: {
      ...board.scene,
      elements: [step.heading, ...step.lines].map((text, index) => ({
        id: op.elementIds[index]!,
        type: "text",
        x: 0,
        y: index * 40,
        width: 200,
        height: 30,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        text,
        originalText: text,
      })),
    },
  });
  const waiting = waitForTeachingStep(
    owner,
    op.id,
    new AbortController().signal,
  );
  expect(
    (
      await acknowledgeTeachingStep(owner, {
        ...ack,
        savedRevision: saved.revision,
      })
    ).status,
  ).toBe("applied");
  await waiting;
  expect((await getBoard(owner, board.id)).scene.elements).toHaveLength(3);
  expect((await listTeachingSteps(owner, board.id, turn.id))[0]?.status).toBe(
    "applied",
  );
  expect(
    (await enqueueTeachingStep(owner, { ...input, sequence: 1 })).status,
  ).toBe("queued");
});
it("cancels pending commands and rejects stale acknowledgements while preserving completed work", async () => {
  const { input, turn, board } = await setup();
  const op = await enqueueTeachingStep(owner, input);
  await finishTeacherTurn(owner, board.id, turn.id, turn.generation, "cancel");
  expect((await listTeachingSteps(owner, board.id, turn.id))[0]?.status).toBe(
    "cancelled",
  );
  await expect(
    acknowledgeTeachingStep(owner, {
      boardId: board.id,
      turnId: turn.id,
      generation: turn.generation,
      operationId: op.id,
      tabId: "tab-a",
      result: "applied",
      savedRevision: board.revision,
    }),
  ).rejects.toMatchObject({ errorCode: "turn_inactive" });
  const abort = new AbortController(),
    waiting = waitForTeachingStep(owner, "test-cancel", abort.signal);
  abort.abort();
  await expect(waiting).rejects.toThrow("not acknowledged");
});

it("observes an acknowledgement persisted by another executor without a local notification", async () => {
  const { input } = await setup();
  const op = await enqueueTeachingStep(owner, input);
  const promise = waitForTeachingStep(
    owner,
    op.id,
    new AbortController().signal,
  );
  await getDbExec().execute({
    sql: "UPDATE teacher_operations SET status = $1 WHERE id = $2",
    args: ["applied", op.id],
  });
  await expect(promise).resolves.toBeUndefined();
});

it("saves source-backed typeset mathematics without private image storage and verifies its source on acknowledgement", async () => {
  const { input, turn, board } = await setup();
  const latex = String.raw`\sin\theta=\frac{1}{2}`;
  const mathStep = {
    heading: "Equation",
    lines: [`$$${latex}$$`],
    narration: "Sine theta equals one half.",
  };
  const op = await enqueueTeachingStep(owner, { ...input, step: mathStep });
  const saved = await saveBoard(owner, {
    id: board.id,
    title: board.title,
    expectedRevision: board.revision,
    scene: {
      ...board.scene,
      elements: [
        {
          id: op.elementIds[0]!,
          type: "text",
          x: 0,
          y: 0,
          width: 100,
          height: 30,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
          text: "Equation",
          originalText: "Equation",
        },
        {
          id: op.elementIds[1]!,
          type: "image",
          x: 0,
          y: 50,
          width: 200,
          height: 70,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
          fileId: `math_${op.elementIds[1]}`,
          customData: { equation: { version: 1, latex } },
        },
      ],
    },
  });
  expect(saved.assets).toEqual([]);
  expect(
    (
      await acknowledgeTeachingStep(owner, {
        boardId: board.id,
        turnId: turn.id,
        generation: turn.generation,
        operationId: op.id,
        tabId: "tab-a",
        result: "applied",
        savedRevision: saved.revision,
      })
    ).status,
  ).toBe("applied");
  expect(
    (await getBoard(owner, board.id)).scene.elements[1]?.customData,
  ).toEqual({ equation: { version: 1, latex } });
});
