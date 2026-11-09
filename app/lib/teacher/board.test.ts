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
  const operation = {} as TeachingOperation;
  let active = true;
  const result = applyTeachingStep(editor, operation, () => active);
  active = false;
  release();
  await expect(result).rejects.toThrow("Teacher turn stopped.");
  expect(updateScene).not.toHaveBeenCalled();
});
