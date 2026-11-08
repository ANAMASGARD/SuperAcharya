import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { boardOwner, getBoard } from "../server/lib/whiteboards";
import { boardIdSchema, boardSchema } from "../shared/whiteboard";
export default defineAction({
  description:
    "Read a private drawing, editable Excalidraw scene and save revision. Files are authenticated asset references.",
  schema: z.object({ id: boardIdSchema }),
  outputSchema: boardSchema,
  http: { method: "GET" },
  run: (args, ctx) => getBoard(boardOwner(ctx ?? {}), args.id),
});
