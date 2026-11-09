import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { TeachingOperation } from "@shared/teacher-board";
// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

import { applyTeachingStep } from "./board";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY" },
  convertToExcalidrawElements: (elements: unknown[]) => elements,
  getCommonBounds: () => [40, 40, 100, 100],
  exportToBlob: vi.fn(),
}));

it("does not write a stale step when cancellation arrives while its font loads", async () => {
  let release!: () => void;
  const font = new Promise<void>((resolve) => {
    release = resolve;
  });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: () => font },
  });
  const updateScene = vi.fn();
  const editor = { updateScene } as unknown as ExcalidrawImperativeAPI;
  const operation: TeachingOperation = {
    id: "font-step",
    boardId: "board",
    turnId: "turn",
    generation: "generation",
    tabId: "tab",
    sequence: 0,
    status: "queued",
    elementIds: ["line"],
    step: { heading: "", lines: ["x = 3"], narration: "Simplify." },
  };
  let active = true;
  const result = applyTeachingStep(editor, operation, () => active);
  active = false;
  release();
  await expect(result).rejects.toThrow("Teacher turn stopped.");
  expect(updateScene).not.toHaveBeenCalled();
});

it("appends only the single continuation line without a blank heading or replacing student work", async () => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: async () => [] },
  });
  const measure = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(null);
  const student = {
    id: "student",
    type: "text",
    text: "My question",
    isDeleted: false,
  };
  const updateScene = vi.fn(),
    scrollToContent = vi.fn();
  const editor = {
    getSceneElementsIncludingDeleted: () => [student],
    getAppState: () => ({ width: 1000 }),
    updateScene,
    scrollToContent,
  } as unknown as ExcalidrawImperativeAPI;
  const operation: TeachingOperation = {
    id: "step",
    boardId: "board",
    turnId: "turn",
    generation: "generation",
    tabId: "tab",
    sequence: 1,
    status: "queued",
    step: { heading: "", lines: ["x = 3"], narration: "Simplify." },
    elementIds: ["line"],
  };
  await applyTeachingStep(editor, operation, () => true);
  expect(updateScene.mock.calls[0]?.[0].elements).toEqual([
    student,
    expect.objectContaining({
      id: "line",
      text: "x = 3",
      fontSize: 24,
      y: 124,
    }),
  ]);
  measure.mockRestore();
});
