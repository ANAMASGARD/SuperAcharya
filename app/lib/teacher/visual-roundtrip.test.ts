// @vitest-environment happy-dom
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  teachingElementCount,
  type TeachingOperation,
} from "@shared/teacher-board";
import { type VisualSpec } from "@shared/teacher-visual";
import { expect, it, vi } from "vitest";

import { TeacherAudio } from "./audio";
import { applyTeachingStep } from "./board";
import { renderAndNarrateStep } from "./step-playback";

// Only canvas text measurement is unavailable in happy-dom. Use the installed
// Excalidraw converter and real application renderer/verification/playback path.
vi.hoisted(() => {
  vi.stubGlobal(
    "FontFace",
    class {
      status = "loaded";
      constructor(public family: string) {}
    },
  );
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ({
      measureText: (text: string) => ({ width: text.length * 10 }),
      filter: "none",
    }),
  });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: async () => [] },
  });
});

it.each([
  "right-triangle",
  "sine-cosine",
  "unit-circle",
  "parabola",
  "ellipse",
  "hyperbola",
] as const)(
  "narrates an unchanged %s after early rendering and scene roundtrip",
  async (kind) => {
    const visual: VisualSpec = { version: 1, kind, angleDegrees: 30 };
    const step = {
      heading: "",
      lines: ["Compare the sides."],
      narration: "Observe the diagram.",
      visual,
    };
    const operation: TeachingOperation = {
      id: "fixture-op",
      boardId: "fixture-board",
      turnId: "fixture-turn",
      generation: "fixture-generation",
      tabId: "fixture-tab",
      sequence: 0,
      status: "queued",
      step,
      elementIds: Array.from(
        { length: teachingElementCount(step) },
        (_, i) => `component-${i}`,
      ),
    };
    let scene: ReturnType<
      ExcalidrawImperativeAPI["getSceneElementsIncludingDeleted"]
    > = [];
    const editor = {
      getSceneElementsIncludingDeleted: () => scene,
      getAppState: () => ({ width: 1000 }),
      updateScene: (
        update: Parameters<ExcalidrawImperativeAPI["updateScene"]>[0],
      ) => {
        if (update.elements)
          scene = JSON.parse(JSON.stringify(update.elements));
      },
      scrollToContent: vi.fn(),
    } as unknown as ExcalidrawImperativeAPI;
    const apply = async (
      _: TeachingOperation,
      active: () => boolean,
      rendered?: () => void,
    ) => {
      await applyTeachingStep(editor, operation, active);
      rendered?.();
      return "saved-revision";
    };
    await apply(operation, () => true); // teacher-visual-ready arrives first
    const audio = new TeacherAudio(vi.fn());
    const play = vi.spyOn(audio, "playStep").mockResolvedValue(true);
    await expect(
      renderAndNarrateStep(
        { apply, capture: vi.fn() },
        audio,
        operation,
        "synthetic-audio",
        () => true,
      ),
    ).resolves.toBe("saved-revision");
    expect(play).toHaveBeenCalledExactlyOnceWith(
      operation.generation,
      "synthetic-audio",
    );
    expect(scene).toHaveLength(teachingElementCount(step));
    // Actual student geometry edits must still stop old-state narration.
    scene = scene.map((element) =>
      element.type === "line"
        ? { ...element, width: element.width + 5 }
        : element,
    );
    await expect(apply(operation, () => true)).rejects.toThrow(
      "A teaching step was edited",
    );
  },
);

it("speaks an explanation without writing or moving the existing diagram", async () => {
  const updateScene = vi.fn(),
    scrollToContent = vi.fn();
  const editor = {
    updateScene,
    scrollToContent,
  } as unknown as ExcalidrawImperativeAPI;
  const operation: TeachingOperation = {
    id: "explain-op",
    boardId: "board",
    turnId: "turn",
    generation: "generation",
    tabId: "tab",
    sequence: 0,
    status: "queued",
    step: {
      heading: "",
      lines: [],
      narration: "Let us understand the existing sine curve.",
      visual: null,
    },
    elementIds: [],
  };
  const audio = new TeacherAudio(vi.fn());
  const play = vi.spyOn(audio, "playStep").mockResolvedValue(true);
  const apply = async (
    op: TeachingOperation,
    active: () => boolean,
    rendered?: () => void,
  ) => {
    await applyTeachingStep(editor, op, active);
    rendered?.();
    return "unchanged-revision";
  };
  await expect(
    renderAndNarrateStep(
      { apply, capture: vi.fn() },
      audio,
      operation,
      "synthetic-audio",
      () => true,
    ),
  ).resolves.toBe("unchanged-revision");
  expect(play).toHaveBeenCalledOnce();
  expect(updateScene).not.toHaveBeenCalled();
  expect(scrollToContent).not.toHaveBeenCalled();
});
