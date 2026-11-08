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

export interface BrowserTeachingTools {
  capture: () => Promise<CapturedQuestion>;
  apply: (
    operation: TeachingOperation,
    isActive: () => boolean,
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
      element.type === "text" ? [element.originalText] : [],
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
/** Append editable handwritten-font text. No claim of animated pen strokes or LaTeX rendering. */
export function applyTeachingStep(
  editor: ExcalidrawImperativeAPI,
  operation: TeachingOperation,
) {
  const current = editor.getSceneElementsIncludingDeleted();
  const existing = current.filter((element) =>
    operation.elementIds.includes(element.id),
  );
  const lines = [operation.step.heading, ...operation.step.lines];
  if (existing.length) {
    if (
      existing.length !== lines.length ||
      !operation.elementIds.every((id, index) =>
        existing.some(
          (element) =>
            element.id === id &&
            !element.isDeleted &&
            element.type === "text" &&
            element.originalText === lines[index],
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
  let y = visible.length ? bounds[3] + 64 : 40;
  const elements = lines.flatMap((text, index) => {
    const id = operation.elementIds[index];
    if (!id) throw new Error("Invalid teaching step element IDs.");
    const element = convertToExcalidrawElements(
      [
        {
          type: "text",
          id,
          x: bounds[0],
          y,
          text,
          fontSize: index === 0 ? 28 : 24,
          fontFamily: 5,
          strokeColor: "#1e1e1e",
          width: 650,
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
    return element;
  });
  editor.updateScene({
    elements: [...current, ...elements],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  editor.scrollToContent(elements, { fitToContent: true, animate: false });
}
