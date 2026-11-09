import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
  getCommonBounds,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
  CapturedQuestion,
  TeachingOperation,
} from "@shared/teacher-board";
import { teachingStepTexts } from "@shared/teacher-board";
import {
  equationLatex,
  matchesTeachingLine,
  generatedEquation,
} from "@shared/teacher-math";

import { equationFile } from "./math";

export interface BrowserTeachingTools {
  capture: () => Promise<CapturedQuestion>;
  apply: (
    operation: TeachingOperation,
    isActive: () => boolean,
    onRendered?: () => void,
  ) => Promise<string>;
}
export async function captureQuestion(
  editor: ExcalidrawImperativeAPI,
  revision: string,
): Promise<CapturedQuestion> {
  const state = editor.getAppState();
  const selectedElementIds = Object.keys(state.selectedElementIds)
    .filter((id) => state.selectedElementIds[id])
    .slice(0, 200);
  const elements = editor
    .getSceneElements()
    .filter(
      (element) =>
        !element.isDeleted &&
        (!selectedElementIds.length || selectedElementIds.includes(element.id)),
    );
  const text = elements
    .flatMap((element) =>
      element.type === "text"
        ? [element.originalText]
        : generatedEquation(element)
          ? [`Equation: ${generatedEquation(element)!.latex}`]
          : [],
    )
    .join("\n")
    .slice(0, 12000);
  let image: string | null = null;
  if (elements.length) {
    const blob = await exportToBlob({
      elements,
      appState: { ...state, exportBackground: true, exportWithDarkMode: false },
      files: editor.getFiles(),
      mimeType: "image/png",
      maxWidthOrHeight: 1280,
    });
    image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Cannot capture the board."));
      reader.onerror = () => reject(new Error("Cannot capture the board."));
      reader.readAsDataURL(blob);
    });
    if (image.length > 1_500_000)
      throw new Error("Select a smaller question before asking Acharya.");
  }
  const payload = { image, text, revision, selectedElementIds };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return { ...payload, fingerprint };
}
function wrapBoardText(text: string, fontSize: number, width: number) {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return text;
  context.font = `${fontSize}px Excalifont`;
  return text
    .split("\n")
    .map((paragraph) => {
      const lines: string[] = [];
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > width) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
      return lines.join("\n");
    })
    .join("\n");
}
/** Append editable prose and source-backed typeset equations without erasing student work. */
export async function applyTeachingStep(
  editor: ExcalidrawImperativeAPI,
  operation: TeachingOperation,
  isActive: () => boolean,
) {
  // Load the handwriting font before measuring newly generated equations.
  await document.fonts.load('24px "Excalifont"');
  await document.fonts.load('28px "Excalifont"');
  if (!isActive()) throw new Error("Teacher turn stopped.");
  const current = editor.getSceneElementsIncludingDeleted();
  const existing = current.filter((element) =>
    operation.elementIds.includes(element.id),
  );
  const lines = teachingStepTexts(operation.step);
  if (existing.length) {
    if (
      existing.length !== lines.length ||
      !operation.elementIds.every((id, index) =>
        existing.some(
          (element) =>
            element.id === id &&
            !element.isDeleted &&
            matchesTeachingLine(element, lines[index]!),
        ),
      )
    )
      throw new Error(
        "A teaching step was edited. Student changes were preserved.",
      );
    return;
  }
  const visible = current.filter((element) => !element.isDeleted);
  const bounds = visible.length ? getCommonBounds(visible) : [40, 40, 40, 40];
  let y = visible.length ? bounds[3] + (operation.step.heading ? 64 : 24) : 40;
  const elements = [];
  for (const [index, text] of lines.entries()) {
    const isHeading = index === 0 && Boolean(operation.step.heading);
    const id = operation.elementIds[index];
    if (!id) throw new Error("Invalid teaching step element IDs.");
    const latex = equationLatex(text);
    if (latex) {
      const { file, width, height } = await equationFile(latex, `math_${id}`);
      if (!isActive()) throw new Error("Teacher turn stopped.");
      const scale = Math.min(
        1,
        Math.max(240, editor.getAppState().width - 80) / width,
      );
      editor.addFiles([file]);
      elements.push(
        ...convertToExcalidrawElements(
          [
            {
              type: "image",
              id,
              x: bounds[0],
              y,
              width: width * scale,
              height: height * scale,
              fileId: file.id,
              status: "saved",
              scale: [1, 1],
              customData: {
                equation: { version: 1, latex },
                teacherTurnId: operation.turnId,
                teachingStepId: operation.id,
              },
            },
          ],
          { regenerateIds: false },
        ),
      );
      y += height * scale + 24;
      continue;
    }
    const element = convertToExcalidrawElements(
      [
        {
          type: "text",
          id,
          x: bounds[0],
          y,
          text: wrapBoardText(
            text,
            isHeading ? 28 : 24,
            Math.min(600, Math.max(240, editor.getAppState().width - 80)),
          ),
          originalText: text,
          fontSize: isHeading ? 28 : 24,
          fontFamily: 5,
          strokeColor: "#1e1e1e",
          customData: {
            teacherTurnId: operation.turnId,
            teacherGeneration: operation.generation,
            teachingStepId: operation.id,
            equationSource: text,
          },
        },
      ],
      { regenerateIds: false },
    );
    y += (element[0]?.height ?? 40) + 20;
    elements.push(...element);
  }
  editor.updateScene({
    elements: [...editor.getSceneElementsIncludingDeleted(), ...elements],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  editor.scrollToContent(elements, { fitToContent: true, animate: false });
}
