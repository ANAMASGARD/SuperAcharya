// @vitest-environment happy-dom
import { createAgentKitClient } from "@agent-native/agentkit/client";
import { nanoid } from "nanoid";
import { afterEach, expect, it, vi } from "vitest";

import { TeacherAudio } from "./audio";
import { createTeacherTransport } from "./runtime";
const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@agent-native/core/client/hooks", () => ({
  callAction: action,
  getBrowserTabId: () => "fixture-tab",
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("uses the native AgentKit lifecycle, preserves submission identity, and reads history with GET", async () => {
  const boardId = nanoid(),
    requestId = nanoid(),
    generation = nanoid();
  action.mockImplementation(
    async (name: string, input: { requestId?: string; text?: string }) =>
      name === "get-teacher-session"
        ? null
        : {
            id: input.requestId,
            boardId,
            generation,
            tabId: "fixture-tab",
            status: "admitted",
            input: input.text,
            response: "",
            error: null,
            createdAt: new Date().toISOString(),
          },
  );
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_, options) => {
      expect(JSON.parse(String(options?.body))).toMatchObject({
        turnId: requestId,
        generation,
        boardId,
      });
      const events = [
        {
          type: "message-start",
          turnId: requestId,
          generation,
          message: {
            id: "fixture-answer",
            role: "assistant",
            content: [],
            status: "streaming",
          },
        },
        {
          type: "message-delta",
          turnId: requestId,
          generation,
          messageId: "fixture-answer",
          delta: { type: "text", text: "Synthetic teacher reply" },
        },
        {
          type: "message-done",
          turnId: requestId,
          generation,
          message: {
            id: "fixture-answer",
            role: "assistant",
            content: [{ type: "text", text: "Synthetic teacher reply" }],
            status: "complete",
          },
        },
        { type: "done", turnId: requestId, generation, reason: "complete" },
      ];
      return new Response(
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "X-Run-Id": generation,
            "X-Turn-Id": requestId,
          },
        },
      );
    });
  vi.stubGlobal("fetch", fetcher);
  const bridge = createTeacherTransport(
    boardId,
    vi.fn(),
    new TeacherAudio(vi.fn()),
    vi.fn(),
  );
  const client = createAgentKitClient({
    transport: bridge.transport,
    aiSetupReadiness: "not-applicable",
    reconnect: { attempts: 0 },
  });
  const threadId = `teacher:${boardId}`;
  await client.loadThread(threadId);
  expect(action).toHaveBeenCalledWith(
    "get-teacher-session",
    { boardId },
    { method: "GET" },
  );
  const handle = await client.sendMessage({
    threadId,
    text: "A fixture question",
    metadata: { teacherRequestId: requestId },
    queueWhileRunning: false,
  });
  await handle.completed;
  expect(
    Object.values(client.getThread(threadId).runs).map((run) => run.status),
  ).toEqual(["completed"]);
  expect(action).toHaveBeenCalledWith(
    "start-teacher-turn",
    expect.objectContaining({ requestId, text: "A fixture question" }),
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(client.getThread(threadId).messages)).toContain(
    "Synthetic teacher reply",
  );
  client.dispose();
  await bridge.transport.dispose();
});

it("renders a deduplicated visual-ready event before audio without acknowledging explanation", async () => {
  const boardId = nanoid(), requestId = nanoid(), generation = nanoid();
  const { TAB_ID } = await import("@/lib/tab-id");
  const apply = vi.fn(async () => "revision");
  action.mockImplementation(async (name: string) => {
    if (name === "get-teacher-session") return null;
    if (name === "list-teaching-steps") return [{ id: "visual", status: "queued", tabId: TAB_ID, generation }];
    return { id: requestId, boardId, generation, tabId: TAB_ID, status: "admitted", input: "fixture", response: "", error: null, createdAt: new Date().toISOString() };
  });
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }), { headers: { "Content-Type": "text/event-stream", "X-Run-Id": generation, "X-Turn-Id": requestId } })));
  const bridge = createTeacherTransport(boardId, vi.fn(), new TeacherAudio(vi.fn()), vi.fn(), () => ({ apply, capture: vi.fn() }));
  const client = createAgentKitClient({ transport: bridge.transport, aiSetupReadiness: "not-applicable", reconnect: { attempts: 0 } });
  const threadId = `teacher:${boardId}`;
  await client.loadThread(threadId);
  const handle = await client.sendMessage({ threadId, text: "fixture", metadata: { teacherRequestId: requestId }, queueWhileRunning: false });
  const emit = (event: object) => stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
  emit({ type: "teacher-visual-ready", turnId: requestId, generation, operationId: "visual" });
  emit({ type: "teacher-visual-ready", turnId: requestId, generation, operationId: "visual" });
  await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
  expect(action.mock.calls.some(([name]) => name === "ack-teaching-step")).toBe(false);
  emit({ type: "done", turnId: requestId, generation, reason: "complete" });
  stream.close();
  await handle.completed;
  client.dispose();
  await bridge.transport.dispose();
});
