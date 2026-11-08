import { defineAction } from "@agent-native/core/action";

import { boardOwner, saveBoard } from "../server/lib/whiteboards";
import { boardSchema, saveBoardSchema } from "../shared/whiteboard";
export default defineAction({
  description:
    "Save a drawing's title and editable scene using the revision from get-board. Stale writes fail; do not replace a scene without reading first.",
  schema: saveBoardSchema,
  outputSchema: boardSchema,
  retrySafe: true,
  run: (args, ctx) => saveBoard(boardOwner(ctx ?? {}), args),
});
