// Binary upload exception: drawing CRUD uses shared actions.
import { assertBodySize, defineEventHandler, getRouterParam } from "h3";

import {
  boardIdSchema,
  fileIdSchema,
  assetSchema,
} from "../../../../../shared/whiteboard";
import { withBoardAssetSession } from "../../../../lib/board-asset-route";
import { MAX_IMAGE_BYTES, storeBoardAsset } from "../../../../lib/board-assets";
export default defineEventHandler((event) =>
  withBoardAssetSession(event, async (owner) => {
    assertBodySize(event, MAX_IMAGE_BYTES);
    const boardId = boardIdSchema.parse(getRouterParam(event, "boardId"));
    const fileId = fileIdSchema.parse(getRouterParam(event, "fileId"));
    const data = new Uint8Array(await event.req.arrayBuffer());
    const asset = await storeBoardAsset(
      owner,
      boardId,
      fileId,
      data,
      event.req.headers.get("content-type") ?? "",
    );
    return assetSchema.parse(asset);
  }),
);
