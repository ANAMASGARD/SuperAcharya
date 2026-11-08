import { appPath } from "@agent-native/core/client/api-path";
import { assetSchema, sceneFileIds, type Board } from "@shared/whiteboard";
function assetPath(boardId: string, fileId: string) {
  return appPath(
    `/api/whiteboard-assets/${encodeURIComponent(boardId)}/${encodeURIComponent(fileId)}`,
  );
}
export async function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read image"));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}
export async function loadBoardFiles(board: Board, signal?: AbortSignal) {
  const needed = new Set(sceneFileIds(board.scene));
  if (
    [...needed].some((id) => !board.assets.some((asset) => asset.fileId === id))
  )
    throw new Error(
      "A saved image reference is missing. Recover this drawing from an exported file.",
    );
  const entries = await Promise.all(
    board.assets
      .filter((asset) => needed.has(asset.fileId))
      .map(async (asset) => {
        const response = await fetch(assetPath(board.id, asset.fileId), {
          signal: signal ?? null,
        });
        if (!response.ok)
          throw new Error(
            "A saved image could not be loaded. Retry before editing this drawing.",
          );
        return [
          asset.fileId,
          {
            id: asset.fileId,
            mimeType: asset.mimeType,
            created: asset.created,
            dataURL: await blobDataUrl(await response.blob()),
          },
        ];
      }),
  );
  return Object.fromEntries(entries);
}
async function rasterizeSvg(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      !image.width ||
      !image.height ||
      image.width * image.height > 32_000_000
    )
      throw new Error("SVG dimensions are too large.");
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion unavailable.");
    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("SVG conversion failed.")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function uploadBoardFile(
  boardId: string,
  fileId: string,
  dataURL: string,
) {
  if (!dataURL.startsWith("data:image/"))
    throw new Error("Only embedded image data can be uploaded.");
  let blob = await (await fetch(dataURL)).blob();
  if (blob.type === "image/svg+xml") blob = await rasterizeSvg(blob);
  if (blob.size > 10 * 1024 * 1024)
    throw new Error("Images must be smaller than 10 MB.");
  const response = await fetch(assetPath(boardId, fileId), {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  if (!response.ok)
    throw new Error(
      response.status === 503
        ? "Private image storage is unavailable. Configure file storage in Settings, then retry."
        : `Image upload failed (${response.status}). Your drawing has not been saved.`,
    );
  return assetSchema.parse(await response.json());
}
