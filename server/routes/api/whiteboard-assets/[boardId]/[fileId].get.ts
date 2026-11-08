// Binary download exception: authorization is checked before resolving private storage.
import { defineEventHandler, getRouterParam } from "h3";

import { boardIdSchema, fileIdSchema } from "../../../../../shared/whiteboard";
import { withBoardAssetSession } from "../../../../lib/board-asset-route";
import { readBoardAsset } from "../../../../lib/board-assets";
export default defineEventHandler((event) =>
  withBoardAssetSession(event, async (owner) => {
    const file = await readBoardAsset(
      owner,
      boardIdSchema.parse(getRouterParam(event, "boardId")),
      fileIdSchema.parse(getRouterParam(event, "fileId")),
    );
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType ?? "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }),
);
