import { createHttpAgentChatRuntime } from "@agent-native/core/client/agent-chat";
import {
  closeDbExec,
  getDbExec,
  withMigrationRuntime,
} from "@agent-native/core/db";
import { getSession } from "@agent-native/core/server";
import { H3Event } from "h3";
import { nanoid } from "nanoid";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";

import { boardMigrations } from "../../db/migrations";
import handler from "../../routes/api/teacher-stream.post";
import { createBoard } from "../whiteboards";
import { executeTeachingTurn } from "./execute";
import {
  admitTeacherTurn,
  finishTeacherTurn,
  getTeacherSession,
} from "./store";

vi.mock("@agent-native/core/server", async (original) => ({
  ...(await original<typeof import("@agent-native/core/server")>()),
  getSession: vi.fn(),
}));
// Explicit protocol fixture: no real model or narration output is claimed here.
vi.mock("./execute", () => ({ executeTeachingTurn: vi.fn() }));
const owner = "runtime-test@example.test";
beforeAll(async () => {
  await withMigrationRuntime(async () => {
    for (const migration of boardMigrations)
      if (typeof migration.sql === "string")
        for (const sql of migration.sql.split(";").filter((s) => s.trim()))
          await getDbExec().execute({ sql });
  });
});
afterAll(() => closeDbExec());
beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue({ email: owner });
  vi.mocked(executeTeachingTurn).mockReset();
  vi.mocked(executeTeachingTurn).mockImplementation(
    async (_, turn, signal, emit) => {
      signal.throwIfAborted();
      emit({
        type: "message-delta",
        turnId: turn.id,
        generation: turn.generation,
        messageId: `answer-${turn.id}`,
        delta: { type: "text", text: "Synthetic fixture answer" },
      });
      return "Synthetic fixture answer";
    },
  );
});
async function admitted() {
  const board = await createBoard(owner, nanoid(), "Stream fixture");
  return admitTeacherTurn(owner, {
    boardId: board.id,
    requestId: nanoid(),
    text: "Fixture question",
    tabId: "fixture-tab",
    extractContext: false,
  });
}
function request(
  input: unknown,
  origin = "http://localhost",
  signal?: AbortSignal,
) {
  return new H3Event(
    new Request("http://localhost/api/teacher-stream", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    }),
  );
}
const payload = (turn: Awaited<ReturnType<typeof admitted>>) => ({
  boardId: turn.boardId,
  turnId: turn.id,
  generation: turn.generation,
  tabId: turn.tabId,
});
it("requires authentication, same-origin and ownership before provider work", async () => {
  const turn = await admitted();
  vi.mocked(getSession).mockResolvedValue(null);
  await expect(handler(request(payload(turn)))).rejects.toMatchObject({
    status: 401,
  });
  vi.mocked(getSession).mockResolvedValue({ email: owner });
  await expect(
    handler(request(payload(turn), "https://other.test")),
  ).rejects.toMatchObject({ status: 403 });
  vi.mocked(getSession).mockResolvedValue({ email: "other@example.test" });
  await expect(handler(request(payload(turn)))).rejects.toMatchObject({
    status: 404,
  });
  expect(executeTeachingTurn).not.toHaveBeenCalled();
});
it("streams normalized events through the installed native HTTP runtime and reads back the saved reply", async () => {
  const turn = await admitted();
  const runtime = createHttpAgentChatRuntime({
    endpoint: "http://localhost/api/teacher-stream",
    mapRequest: () => payload(turn),
    fetch: async (_, options) => {
      const response = await handler(
        request(JSON.parse(String(options?.body))),
      );
      if (!(response instanceof Response))
        throw new Error("Expected streaming response");
      return response;
    },
  });
  const session = await runtime.createSession({
    threadId: `teacher:${turn.boardId}`,
  });
  const stream = await session.startTurn({ prompt: turn.input });
  const types = [];
  for await (const event of stream.events) types.push(event.type);
  expect(types).toEqual([
    "message-start",
    "message-delta",
    "message-done",
    "done",
  ]);
  expect(
    (await getTeacherSession(owner, turn.boardId))?.turns[0],
  ).toMatchObject({
    status: "completed",
    response: "Synthetic fixture answer",
  });
});
it("explicit cancellation aborts a waiting provider and allows the next generation", async () => {
  const turn = await admitted();
  let observed: AbortSignal | undefined;
  vi.mocked(executeTeachingTurn).mockImplementationOnce(
    async (_, __, signal) => {
      observed = signal;
      return new Promise((_, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new Error("cancelled fixture")),
          { once: true },
        ),
      );
    },
  );
  const response = await handler(request(payload(turn)));
  expect(response).toBeInstanceOf(Response);
  await finishTeacherTurn(
    owner,
    turn.boardId,
    turn.id,
    turn.generation,
    "cancel",
  );
  expect(observed?.aborted).toBe(true);
  if (response instanceof Response) await response.text();
  const next = await admitTeacherTurn(owner, {
    boardId: turn.boardId,
    requestId: nanoid(),
    text: "Next fixture",
    tabId: "fixture-tab",
    extractContext: false,
  });
  const nextResponse = await handler(request(payload(next)));
  if (nextResponse instanceof Response) await nextResponse.text();
  expect(
    (await getTeacherSession(owner, turn.boardId))?.turns.slice(-1)[0]?.status,
  ).toBe("completed");
});
it("request disconnect interrupts provider work and preserves the accepted question", async () => {
  const turn = await admitted(),
    controller = new AbortController();
  vi.mocked(executeTeachingTurn).mockImplementationOnce(
    async (_, __, signal) =>
      new Promise((_, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new Error("disconnected fixture")),
          { once: true },
        ),
      ),
  );
  const response = await handler(
    request(payload(turn), "http://localhost", controller.signal),
  );
  controller.abort();
  if (response instanceof Response) await response.text();
  expect(
    (await getTeacherSession(owner, turn.boardId))?.turns[0],
  ).toMatchObject({ status: "interrupted", input: "Fixture question" });
});
