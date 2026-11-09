import type { FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";

export async function equationFile(latex: string, fileId: string) {
  const { renderEquation } = await import("./math-renderer");
  const { markup, width, height } = renderEquation(latex);
  const dataURL = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Cannot read equation"));
    reader.onerror = () => reject(new Error("Cannot read equation"));
    reader.readAsDataURL(new Blob([markup], { type: "image/svg+xml" }));
  });
  const file: BinaryFileData = {
    id: fileId as FileId,
    dataURL: dataURL as DataURL,
    mimeType: "image/svg+xml",
    created: 0,
  };
  return { file, width, height };
}
