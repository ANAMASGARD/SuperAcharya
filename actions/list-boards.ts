import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { boardOwner, listBoards } from "../server/lib/whiteboards";
import { boardListSchema } from "../shared/whiteboard";
export default defineAction({
  description: "List your private Excalidraw drawings and latest drawing.",
  schema: z.object({}),
  outputSchema: boardListSchema,
  http: { method: "GET" },
  run: (_, ctx) => listBoards(boardOwner(ctx ?? {})),
});
